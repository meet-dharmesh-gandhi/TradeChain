import { ethers } from "ethers";
import { NETWORK_ID } from "./blockchainDetails";

function isKnownSwitchError(error: unknown): error is { code: number } {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	return "code" in error && typeof (error as { code: unknown }).code === "number";
}

function getNetworkConfig() {
	const numericChainId = Number(NETWORK_ID());
	const chainHex = `0x${numericChainId.toString(16)}`;

	return {
		chainId: chainHex,
		chainName: process.env.NEXT_PUBLIC_CHAIN_NAME || "Hardhat Local",
		rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545"],
		nativeCurrency: {
			name: "Ethereum",
			symbol: "ETH",
			decimals: 18,
		},
	};
}

export async function connectWallet() {
	if (typeof window === "undefined" || !window.ethereum || !window.ethereum.isMetaMask) {
		console.error("MetaMask not detected");
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
