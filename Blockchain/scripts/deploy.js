const hre = require("hardhat");
const BlockchainEnv = require("../config/env");

async function main() {
	// Validate environment before deployment
	const envValidation = BlockchainEnv.validateEnvironment();
	if (!envValidation.isValid) {
		console.error("Environment validation failed:");
		envValidation.errors.forEach((error) => console.error(`- ${error}`));
		process.exit(1);
	}

	const TradeChain = await hre.ethers.getContractFactory("TradeChain");

	console.log("Deploying TradeChain contract...");
	const tradeChain = await TradeChain.deploy();

	await tradeChain.waitForDeployment();

	const address = await tradeChain.getAddress();
	console.log("TradeChain deployed to:", address);

	// Save the contract address to frontend environment file
	try {
		const envPath = BlockchainEnv.createFrontendEnvFile(address);
		console.log(`Environment variables saved to ${envPath}`);
	} catch (error) {
		console.error("Failed to create frontend environment file:", error.message);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
