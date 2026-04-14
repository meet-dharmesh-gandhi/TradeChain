const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load backend-local env first.
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

function parseEnvFile(filePath) {
	if (!fs.existsSync(filePath)) {
		return {};
	}

	const content = fs.readFileSync(filePath, "utf8");
	return dotenv.parse(content);
}

function parseJsonFile(filePath) {
	if (!fs.existsSync(filePath)) {
		return null;
	}

	try {
		const content = fs.readFileSync(filePath, "utf8");
		return JSON.parse(content);
	} catch {
		return null;
	}
}

function loadConfig() {
	const runtimeConfigPath = path.resolve(
		__dirname,
		"..",
		process.env.RUNTIME_CONFIG_PATH || "../backend/config/contract-runtime.json",
	);
	const runtimeConfig = parseJsonFile(runtimeConfigPath) || {};

	const rpcUrl = process.env.RPC_URL || runtimeConfig.rpcUrl;
	const logicAddress =
		process.env.LOGIC_CONTRACT_ADDRESS ||
		process.env.CONTRACT_ADDRESS ||
		runtimeConfig.logicAddress ||
		runtimeConfig.contractAddress;
	const logicAbi = runtimeConfig.logicAbi || runtimeConfig.abi;

	const config = {
		port: Number.parseInt(process.env.PORT || "4000", 10),
		pollingInterval: Number.parseInt(process.env.POLLING_INTERVAL || "1000", 10),
		rpcUrl,
		logicAddress,
		logicAbi,
		runtimeConfigPath,
		mongoUri: process.env.MONGODB_URI,
		mongoDbName: process.env.MONGODB_DB_NAME || "tradechain",
	};

	const errors = [];

	if (!config.rpcUrl) {
		errors.push(
			"Missing RPC URL. Set RPC_URL in backend/.env or ensure frontend/.env.local has NEXT_PUBLIC_RPC_URL.",
		);
	}

	if (!config.logicAddress) {
		errors.push(
			"Missing Logic contract address. Set LOGIC_CONTRACT_ADDRESS in backend/.env or run deploy script to generate backend/config/contract-runtime.json.",
		);
	}

	if (config.logicAddress && !/^0x[a-fA-F0-9]{40}$/.test(config.logicAddress)) {
		errors.push(`Invalid Logic contract address format: ${config.logicAddress}`);
	}

	if (!Array.isArray(config.logicAbi) || config.logicAbi.length === 0) {
		errors.push(
			`Missing Logic ABI. Run deploy script to generate runtime config at ${runtimeConfigPath}.`,
		);
	}

	if (!config.mongoUri) {
		errors.push("Missing MONGODB_URI. Set it in backend/.env to enable MongoDB connection.");
	}

	if (config.mongoUri) {
		try {
			new URL(config.mongoUri);
		} catch {
			errors.push("Invalid MONGODB_URI. Must be a valid mongodb:// or mongodb+srv:// URL.");
		}
	}

	if (errors.length > 0) {
		const message = ["Backend configuration is invalid:", ...errors]
			.map((line) => `- ${line}`)
			.join("\n");

		throw new Error(message);
	}

	return config;
}

module.exports = {
	loadConfig,
};
