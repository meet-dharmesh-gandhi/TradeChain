const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

/*
Simple owner operations queue.
Each item: [commandType, optionalParam]

Command types:
1 = addArbitrator(address)
2 = removeArbitrator(address)
3 = addImportCustoms(address)
4 = removeImportCustoms(address)
5 = addExportCustoms(address)
6 = removeExportCustoms(address)
7 = setShipperStake(uint64)
8 = setDisputeStake(uint64)
9 = setEthDollarValue(uint256)
10 = linkLogic (data.addTradeLogic + money.addTradeLogic if available)
*/
const COMMANDS = [
	// Example:
	// [5, "0x90F79bf6EB2c4f870365E785982E1f101E93b906"],
	[3, "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"],
	[5, "0x90F79bf6EB2c4f870365E785982E1f101E93b906"],
	[1, "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"],
	[1, "0x976EA74026E726554dB657fA54763abd0C3a0aa9"],
];

// If your runtime config doesn't have dataAddress yet, paste TradeData address here.
const DATA_ADDRESS_OVERRIDE = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

const RUNTIME_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"backend",
	"config",
	"contract-runtime.json",
);

const COMMAND_MAP = {
	1: { name: "addArbitrator", target: "data", method: "addArbitrator", argType: "address" },
	2: {
		name: "removeArbitrator",
		target: "data",
		method: "removeArbitrator",
		argType: "address",
	},
	3: {
		name: "addImportCustoms",
		target: "data",
		method: "addImportCustoms",
		argType: "address",
	},
	4: {
		name: "removeImportCustoms",
		target: "data",
		method: "removeImportCustoms",
		argType: "address",
	},
	5: {
		name: "addExportCustoms",
		target: "data",
		method: "addExportCustoms",
		argType: "address",
	},
	6: {
		name: "removeExportCustoms",
		target: "data",
		method: "removeExportCustoms",
		argType: "address",
	},
	7: {
		name: "setShipperStake",
		target: "logic",
		method: "setShipperStake",
		argType: "uint",
	},
	8: {
		name: "setDisputeStake",
		target: "logic",
		method: "setDisputeStake",
		argType: "uint",
	},
	9: {
		name: "setEthDollarValue",
		target: "data",
		method: "setEthDollarValue",
		argType: "uint",
	},
	10: { name: "linkLogic", target: "mixed", method: "linkLogic", argType: "none" },
};

function loadRuntimeConfig() {
	if (!fs.existsSync(RUNTIME_PATH)) {
		throw new Error(`Runtime config not found at ${RUNTIME_PATH}`);
	}

	return JSON.parse(fs.readFileSync(RUNTIME_PATH, "utf8"));
}

function assertAddress(value, label) {
	if (!hre.ethers.isAddress(value || "")) {
		throw new Error(`${label} is missing or invalid: ${value || ""}`);
	}
}

function normalizeArg(rawArg, argType) {
	if (argType === "none") {
		return undefined;
	}

	if (rawArg === undefined || rawArg === null || rawArg === "") {
		throw new Error("Required command parameter is missing.");
	}

	if (argType === "address") {
		assertAddress(rawArg, "Command address");
		return rawArg;
	}

	if (argType === "uint") {
		try {
			return BigInt(rawArg);
		} catch {
			throw new Error(`Invalid numeric parameter: ${rawArg}`);
		}
	}

	throw new Error(`Unsupported arg type: ${argType}`);
}

async function main() {
	if (!Array.isArray(COMMANDS) || COMMANDS.length === 0) {
		console.log("No commands found. Edit COMMANDS in scripts/ownerOps.js and run again.");
		return;
	}

	const runtime = loadRuntimeConfig();
	const dataAddress = DATA_ADDRESS_OVERRIDE || runtime.dataAddress;
	const logicAddress = runtime.logicAddress;
	const moneyAddress = runtime.moneyAddress;

	assertAddress(logicAddress, "TradeLogic address");
	assertAddress(moneyAddress, "TradeMoney address");
	assertAddress(dataAddress, "TradeData address");

	const [owner] = await hre.ethers.getSigners();
	console.log(`Using owner account: ${owner.address}`);

	const dataArtifact = await hre.artifacts.readArtifact("TradeData");
	const logicArtifact = await hre.artifacts.readArtifact("TradeLogic");
	const moneyArtifact = await hre.artifacts.readArtifact("TradeMoney");

	const dataContract = new hre.ethers.Contract(dataAddress, dataArtifact.abi, owner);
	const logicContract = new hre.ethers.Contract(logicAddress, logicArtifact.abi, owner);
	const moneyContract = new hre.ethers.Contract(moneyAddress, moneyArtifact.abi, owner);

	for (const item of COMMANDS) {
		if (!Array.isArray(item) || item.length === 0) {
			throw new Error(`Invalid command item: ${JSON.stringify(item)}`);
		}

		const [commandType, rawParam] = item;
		const command = COMMAND_MAP[commandType];
		if (!command) {
			throw new Error(`Unknown command type: ${commandType}`);
		}

		console.log(`Executing command ${commandType}: ${command.name}`);

		if (commandType === 10) {
			const dataTx = await dataContract.addTradeLogic(logicAddress);
			await dataTx.wait();
			console.log(`  TradeData linked to logic. Tx: ${dataTx.hash}`);

			if (typeof moneyContract.addTradeLogic === "function") {
				const moneyTx = await moneyContract.addTradeLogic(logicAddress);
				await moneyTx.wait();
				console.log(`  TradeMoney linked to logic. Tx: ${moneyTx.hash}`);
			} else {
				console.log("  TradeMoney.addTradeLogic() not found in ABI. Skipped.");
			}
			continue;
		}

		const contract = command.target === "data" ? dataContract : logicContract;
		const arg = normalizeArg(rawParam, command.argType);
		const tx = await contract[command.method](arg);
		await tx.wait();
		console.log(`  Success. Tx: ${tx.hash}`);
	}

	console.log("All queued owner commands completed.");
}

main().catch((error) => {
	console.error("ownerOps failed:", error.message || error);
	process.exitCode = 1;
});
