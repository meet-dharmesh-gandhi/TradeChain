/**
 * Blockchain environment configuration and validation
 * Centralized place for all blockchain-related environment variable handling
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

class BlockchainEnvironmentValidator {
	static config = null;

	static getConfig() {
		if (this.config) {
			return this.config;
		}

		this.config = this.validateAndLoadConfig();
		return this.config;
	}

	static validateAndLoadConfig() {
		// Load environment variables with defaults for development
		const config = {
			// Network Configuration
			rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
			chainId: parseInt(process.env.CHAIN_ID || "31337"),

			// Account Configuration
			mnemonic:
				process.env.MNEMONIC ||
				"test test test test test test test test test test test junk",

			// Deployment Configuration
			frontendPath: process.env.FRONTEND_PATH || "../frontend",
			backendPath: process.env.BACKEND_PATH || "../backend",
			envFileName: process.env.ENV_FILE_NAME || ".env.local",

			// Development Configuration
			isDevelopment: process.env.NODE_ENV !== "production",
			deploymentTimeout: parseInt(process.env.DEPLOYMENT_TIMEOUT || "60000"),
		};

		// Validation
		this.validateConfig(config);

		return config;
	}

	static validateConfig(config) {
		// Validate chain ID
		if (!Number.isInteger(config.chainId) || config.chainId <= 0) {
			throw new Error(`Invalid CHAIN_ID: ${config.chainId}. Must be a positive integer.`);
		}

		// Validate RPC URL
		try {
			new URL(config.rpcUrl);
		} catch {
			throw new Error(`Invalid RPC_URL: ${config.rpcUrl}. Must be a valid URL.`);
		}

		// Validate mnemonic (basic check)
		if (!config.mnemonic || config.mnemonic.split(" ").length < 12) {
			if (!config.isDevelopment) {
				throw new Error("Invalid MNEMONIC. Must be at least 12 words for production.");
			}
		}

		// Validate frontend path
		const frontendFullPath = path.resolve(__dirname, "..", config.frontendPath);
		if (!fs.existsSync(frontendFullPath)) {
			console.warn(`Warning: Frontend path does not exist: ${frontendFullPath}`);
		}
	}

	/**
	 * Get Hardhat network configuration
	 */
	static getNetworkConfig() {
		const config = this.getConfig();
		return {
			url: config.rpcUrl,
			chainId: config.chainId,
			accounts: {
				mnemonic: config.mnemonic,
			},
			timeout: config.deploymentTimeout,
		};
	}

	/**
	 * Get deployment configuration
	 */
	static getDeploymentConfig() {
		const config = this.getConfig();
		return {
			frontendPath: config.frontendPath,
			backendPath: config.backendPath,
			envFileName: config.envFileName,
			chainId: config.chainId,
		};
	}

	static writeJsonFile(filePath, data) {
		const directory = path.dirname(filePath);
		if (!fs.existsSync(directory)) {
			fs.mkdirSync(directory, { recursive: true });
		}

		fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
	}

	static getContractRuntimeConfig({ contractAddress, abi }) {
		const deploymentConfig = this.getDeploymentConfig();
		const networkConfig = this.getNetworkConfig();
		const abiHash = crypto
			.createHash("sha256")
			.update(JSON.stringify(abi))
			.digest("hex");

		return {
			contractName: "TradeChain",
			contractAddress,
			chainId: deploymentConfig.chainId,
			rpcUrl: networkConfig.url,
			abiHash,
			abi,
			generatedAt: new Date().toISOString(),
		};
	}

	static createRuntimeConfigFiles({ contractAddress, abi }) {
		const deploymentConfig = this.getDeploymentConfig();
		const runtimeConfig = this.getContractRuntimeConfig({ contractAddress, abi });

		const frontendRuntimePath = path.resolve(
			__dirname,
			"..",
			deploymentConfig.frontendPath,
			"config",
			"contract-runtime.json",
		);

		const backendRuntimePath = path.resolve(
			__dirname,
			"..",
			deploymentConfig.backendPath,
			"config",
			"contract-runtime.json",
		);

		this.writeJsonFile(frontendRuntimePath, runtimeConfig);
		this.writeJsonFile(backendRuntimePath, runtimeConfig);

		return {
			frontendRuntimePath,
			backendRuntimePath,
			runtimeConfig,
		};
	}

	static createFrontendAbiFile(abi) {
		const deploymentConfig = this.getDeploymentConfig();
		const abiPath = path.resolve(
			__dirname,
			"..",
			deploymentConfig.frontendPath,
			"utils",
			"abi",
			"TradeChain.json",
		);

		this.writeJsonFile(abiPath, abi);
		return abiPath;
	}

	/**
	 * Create environment file for frontend
	 */
	static createFrontendEnvFile(contractAddress) {
		const deploymentConfig = this.getDeploymentConfig();
		const networkConfig = this.getNetworkConfig();

		// Convert chain ID to hex format for frontend
		const chainIdHex = "0x" + deploymentConfig.chainId.toString(16);

		const envContent = [
			`NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`,
			`NEXT_PUBLIC_NETWORK_ID=${deploymentConfig.chainId}`,
			`NEXT_PUBLIC_RPC_URL=${networkConfig.url}`,
			`NEXT_PUBLIC_CHAIN_ID=${chainIdHex}`,
			`NEXT_PUBLIC_CHAIN_NAME=${process.env.CHAIN_NAME || "Hardhat Local"}`,
			`NEXT_PUBLIC_CURRENCY_NAME=${process.env.CURRENCY_NAME || "Ethereum"}`,
			`NEXT_PUBLIC_CURRENCY_SYMBOL=${process.env.CURRENCY_SYMBOL || "ETH"}`,
			`NEXT_PUBLIC_CURRENCY_DECIMALS=${process.env.CURRENCY_DECIMALS || "18"}`,
		].join("\n");

		const envPath = path.resolve(
			__dirname,
			"..",
			deploymentConfig.frontendPath,
			deploymentConfig.envFileName,
		);

		try {
			fs.writeFileSync(envPath, envContent);
			console.log(`Environment file created: ${envPath}`);
			return envPath;
		} catch (error) {
			throw new Error(`Failed to create environment file: ${error.message}`);
		}
	}

	/**
	 * Validate environment setup
	 */
	static validateEnvironment() {
		try {
			this.getConfig();
			return { isValid: true, errors: [] };
		} catch (error) {
			return {
				isValid: false,
				errors: [error.message],
			};
		}
	}
}

module.exports = BlockchainEnvironmentValidator;
