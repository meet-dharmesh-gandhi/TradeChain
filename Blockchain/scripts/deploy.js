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
	const artifact = await hre.artifacts.readArtifact("TradeChain");

	// Save runtime files so frontend and backend share the same contract identity and ABI.
	try {
		const envPath = BlockchainEnv.createFrontendEnvFile(address);
		const abiPath = BlockchainEnv.createFrontendAbiFile(artifact.abi);
		const runtimeOutput = BlockchainEnv.createRuntimeConfigFiles({
			contractAddress: address,
			abi: artifact.abi,
		});

		console.log(`Environment variables saved to ${envPath}`);
		console.log(`Frontend ABI synced to ${abiPath}`);
		console.log(`Frontend runtime config saved to ${runtimeOutput.frontendRuntimePath}`);
		console.log(`Backend runtime config saved to ${runtimeOutput.backendRuntimePath}`);
		console.log(`Runtime ABI hash: ${runtimeOutput.runtimeConfig.abiHash}`);
	} catch (error) {
		console.error("Failed to create frontend environment file:", error.message);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
