import { ethers } from "ethers";
import { getSafeEnvConfig } from "../config/env";

function isKnownSwitchError(error: unknown): error is { code: number } {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	return "code" in error && typeof (error as { code: unknown }).code === "number";
}

// Get network configuration from environment
function getNetworkConfig() {
	const config = getSafeEnvConfig();

	if (!config.isComplete) {
		console.warn("Environment config incomplete, using defaults");
	}

	return {
		chainId: config.chainId || "0x7A69",
		chainName: config.chainName || "Hardhat Local",
		rpcUrls: [config.rpcUrl || "http://127.0.0.1:8545"],
		nativeCurrency: config.nativeCurrency || {
			name: "Ethereum",
			symbol: "ETH",
			decimals: 18,
		},
	};
}

export async function connectWallet() {
	if (typeof window === "undefined" || !window.ethereum || !window.ethereum.isMetaMask) {
		alert("Please install MetaMask");
		return null;
	}

	try {
		// Request account access
		await window.ethereum.request({
			method: "eth_requestAccounts",
		});

		// Get network configuration
		const LOCALHOST_NETWORK = getNetworkConfig();

		// Check if we're on the correct network
		const chainId = await window.ethereum.request({
			method: "eth_chainId",
		});

		// Switch to localhost network if not already on it
		if (chainId !== LOCALHOST_NETWORK.chainId) {
			try {
				await window.ethereum.request({
					method: "wallet_switchEthereumChain",
					params: [{ chainId: LOCALHOST_NETWORK.chainId }],
				});
			} catch (switchError: unknown) {
				// Network not added, add it
				if (isKnownSwitchError(switchError) && switchError.code === 4902) {
					await window.ethereum.request({
						method: "wallet_addEthereumChain",
						params: [LOCALHOST_NETWORK],
					});
				} else {
					throw switchError;
				}
			}
		}

		const provider = new ethers.BrowserProvider(window.ethereum);
		const signer = await provider.getSigner();
		const address = await signer.getAddress();

		console.log("Connected wallet:", address);
		console.log("Network:", await provider.getNetwork());

		return signer;
	} catch (error) {
		console.error("Error connecting wallet:", error);
		return null;
	}
}

export async function getCurrentAccount(): Promise<string | null> {
	if (!window.ethereum) return null;

	try {
		const accounts = await window.ethereum.request({
			method: "eth_accounts",
		});
		return accounts[0] || null;
	} catch (error) {
		console.error("Error getting current account:", error);
		return null;
	}
}

export async function switchAccount(): Promise<string | null> {
	if (!window.ethereum) return null;

	try {
		const accounts = await window.ethereum.request({
			method: "eth_requestAccounts",
		});
		return accounts[0] || null;
	} catch (error) {
		console.error("Error switching account:", error);
		return null;
	}
}
