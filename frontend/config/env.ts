/**
 * Environment configuration and validation
 * Centralized place for all environment variable handling
 */

interface AppConfig {
	// Contract Configuration
	contractAddress: string;
	networkId: string;
	backendUrl: string;

	// Network Configuration
	rpcUrl: string;
	chainId: string;
	chainName: string;

	// Currency Configuration
	nativeCurrency: {
		name: string;
		symbol: string;
		decimals: number;
	};

	// Application Configuration
	isDevelopment: boolean;
	isProduction: boolean;
}

class EnvironmentValidator {
	private static instance: AppConfig | null = null;
	private static isClient: boolean = typeof window !== "undefined";

	static getConfig(): AppConfig {
		if (this.instance) {
			return this.instance;
		}

		this.instance = this.validateAndLoadConfig();
		return this.instance;
	}

	private static validateAndLoadConfig(): AppConfig {
		// Required environment variables
		const requiredEnvVars = [
			process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || null,
			process.env.NEXT_PUBLIC_NETWORK_ID || null,
			process.env.NEXT_PUBLIC_RPC_URL || null,
			process.env.NEXT_PUBLIC_CHAIN_ID || null,
			process.env.NEXT_PUBLIC_CHAIN_NAME || null,
		];

		// Check for missing required environment variables
		const missingVars = requiredEnvVars.filter((varName) => !varName);

		// If we're on the client side and variables are missing,
		// it might be a timing issue - provide more helpful error
		if (missingVars.length > 0) {
			if (this.isClient) {
				console.error("Environment variables missing on client:", missingVars);
				console.error(
					"Current process.env:",
					Object.keys(process.env).filter((key) => key.startsWith("NEXT_PUBLIC_")),
				);
				throw new Error(
					`Client-side environment configuration error.\n` +
						`Missing variables: ${missingVars.join(", ")}\n` +
						`This usually means the Next.js app needs to be restarted after adding environment variables.\n` +
						`Try: npm run dev (restart the development server)`,
				);
			} else {
				throw new Error(
					`Missing required environment variables: ${missingVars.join(", ")}\n` +
						"Please check your .env.local file and ensure all variables are set.",
				);
			}
		}

		// Validate chain ID format (should be hex)
		const chainId = process.env.NEXT_PUBLIC_CHAIN_ID!;
		if (!chainId.startsWith("0x")) {
			throw new Error(
				`NEXT_PUBLIC_CHAIN_ID must be in hexadecimal format (e.g., 0x7A69), got: ${chainId}`,
			);
		}

		// Validate network ID (should be numeric)
		const networkId = process.env.NEXT_PUBLIC_NETWORK_ID!;
		if (!/^\d+$/.test(networkId)) {
			throw new Error(`NEXT_PUBLIC_NETWORK_ID must be a number, got: ${networkId}`);
		}

		// Validate RPC URL
		const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL!;
		try {
			new URL(rpcUrl);
		} catch {
			throw new Error(`NEXT_PUBLIC_RPC_URL must be a valid URL, got: ${rpcUrl}`);
		}

		const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
		try {
			new URL(backendUrl);
		} catch {
			throw new Error(`NEXT_PUBLIC_BACKEND_URL must be a valid URL, got: ${backendUrl}`);
		}

		// Validate contract address format
		const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
		if (!contractAddress.startsWith("0x") || contractAddress.length !== 42) {
			throw new Error(
				`NEXT_PUBLIC_CONTRACT_ADDRESS must be a valid Ethereum address, got: ${contractAddress}`,
			);
		}

		return {
			// Contract Configuration
			contractAddress,
			networkId,
			backendUrl,

			// Network Configuration
			rpcUrl,
			chainId,
			chainName: process.env.NEXT_PUBLIC_CHAIN_NAME!,

			// Currency Configuration (with defaults)
			nativeCurrency: {
				name: process.env.NEXT_PUBLIC_CURRENCY_NAME || "Ethereum",
				symbol: process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "ETH",
				decimals: parseInt(process.env.NEXT_PUBLIC_CURRENCY_DECIMALS || "18"),
			},

			// Application Configuration
			isDevelopment: process.env.NODE_ENV === "development",
			isProduction: process.env.NODE_ENV === "production",
		};
	}

	/**
	 * Get network configuration for MetaMask
	 */
	static getNetworkConfig() {
		const config = this.getConfig();
		return {
			chainId: config.chainId,
			chainName: config.chainName,
			rpcUrls: [config.rpcUrl],
			nativeCurrency: config.nativeCurrency,
		};
	}

	/**
	 * Validate if current environment is properly configured
	 */
	static validateEnvironment(): { isValid: boolean; errors: string[] } {
		try {
			this.getConfig();
			return { isValid: true, errors: [] };
		} catch {
			return {
				isValid: false,
				errors: [error instanceof Error ? error.message : "Unknown validation error"],
			};
		}
	}

	/**
	 * Safe environment loading - returns partial config even if some vars are missing
	 * Useful for development where env vars might not be loaded yet
	 */
	static getSafeConfig(): Partial<AppConfig> & { isComplete: boolean } {
		try {
			const config = this.getConfig();
			return { ...config, isComplete: true };
		} catch {
			// Return partial config with available variables
			return {
				contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "",
				networkId: process.env.NEXT_PUBLIC_NETWORK_ID || "",
				backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000",
				rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "",
				chainId: process.env.NEXT_PUBLIC_CHAIN_ID || "",
				chainName: process.env.NEXT_PUBLIC_CHAIN_NAME || "",
				nativeCurrency: {
					name: process.env.NEXT_PUBLIC_CURRENCY_NAME || "Ethereum",
					symbol: process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "ETH",
					decimals: parseInt(process.env.NEXT_PUBLIC_CURRENCY_DECIMALS || "18"),
				},
				isDevelopment: process.env.NODE_ENV === "development",
				isProduction: process.env.NODE_ENV === "production",
				isComplete: false,
			};
		}
	}
}

// Export lazy-loaded environment config
export const getEnvConfig = () => EnvironmentValidator.getConfig();
export const getSafeEnvConfig = () => EnvironmentValidator.getSafeConfig();

// For compatibility, but prefer getEnvConfig() for safety
export const env = (() => {
	try {
		return EnvironmentValidator.getConfig();
	} catch {
		console.warn("Environment not fully loaded yet, using safe config");
		return EnvironmentValidator.getSafeConfig() as AppConfig;
	}
})();
export const getNetworkConfig = () => EnvironmentValidator.getNetworkConfig();
export const validateEnvironment = () => EnvironmentValidator.validateEnvironment();

export default EnvironmentValidator;
