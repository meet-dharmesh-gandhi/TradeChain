const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function writeJsonFile(filePath, payload) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

async function deployContract(contractName, constructorArgs = []) {
	const factory = await hre.ethers.getContractFactory(contractName);
	const contract = await factory.deploy(...constructorArgs);
	await contract.waitForDeployment();
	const address = await contract.getAddress();
	console.log(`${contractName} deployed at ${address}`);
	return { contract, address };
}

async function main() {
	console.log("Deploying TradeData...");
	const { contract: tradeData, address: dataAddress } = await deployContract("TradeData");

	console.log("Deploying TradeMoney...");
	const { contract: tradeMoney, address: moneyAddress } = await deployContract("TradeMoney");

	console.log("Deploying TradeLogic...");
	const { contract: tradeLogic, address: logicAddress } = await deployContract("TradeLogic", [
		dataAddress,
		moneyAddress,
	]);

	if (typeof tradeData.addTradeLogic === "function") {
		const tx = await tradeData.addTradeLogic(logicAddress);
		await tx.wait();
		console.log(`TradeData linked with TradeLogic (${logicAddress})`);
	}

	if (typeof tradeMoney.addTradeLogic === "function") {
		const tx = await tradeMoney.addTradeLogic(logicAddress);
		await tx.wait();
		console.log(`TradeMoney linked with TradeLogic (${logicAddress})`);
	} else {
		console.warn("TradeMoney.addTradeLogic() not found in ABI; skipping logic linkage.");
	}

	const logicArtifact = await hre.artifacts.readArtifact("TradeLogic");
	const moneyArtifact = await hre.artifacts.readArtifact("TradeMoney");

	const network = await hre.ethers.provider.getNetwork();
	const chainId = Number(network.chainId);
	const runtimeConfig = {
		dataAddress,
		logicAddress,
		moneyAddress,
		logicAbi: logicArtifact.abi,
		moneyAbi: moneyArtifact.abi,
		chainId,
		rpcUrl: process.env.RPC_URL || hre.network.config.url || "http://127.0.0.1:8545",
		generatedAt: new Date().toISOString(),
	};

	const frontendRuntimePath = path.resolve(
		__dirname,
		"..",
		"..",
		"frontend",
		"src",
		"config",
		"contract-runtime.json",
	);
	const backendRuntimePath = path.resolve(
		__dirname,
		"..",
		"..",
		"backend",
		"config",
		"contract-runtime.json",
	);

	writeJsonFile(frontendRuntimePath, runtimeConfig);
	writeJsonFile(backendRuntimePath, runtimeConfig);

	console.log(`Frontend runtime config written to ${frontendRuntimePath}`);
	console.log(`Backend runtime config written to ${backendRuntimePath}`);
}

main().catch((error) => {
	console.error("Deployment failed:", error.message || error);
	process.exitCode = 1;
});
