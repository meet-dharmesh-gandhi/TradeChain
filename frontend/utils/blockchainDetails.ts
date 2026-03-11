import TradeChainJSON from "./abi/TradeChain.json";
import { ethers } from "ethers";
import { getEnvConfig } from "../config/env";

// Lazy load environment configuration
let _config: ReturnType<typeof getEnvConfig> | null = null;
function getConfig() {
	if (!_config) {
		_config = getEnvConfig();
	}
	return _config;
}

export const CONTRACT_ADDRESS = () => getConfig().contractAddress;
export const NETWORK_ID = () => getConfig().networkId;

export const TradeChainABI = TradeChainJSON;

export function getContract(signer: ethers.Signer) {
	const contractAddress = CONTRACT_ADDRESS();
	if (!contractAddress) {
		throw new Error("Contract address not found. Please deploy the contract first.");
	}

	return new ethers.Contract(contractAddress, TradeChainABI, signer);
}

export async function checkNetwork(provider: ethers.Provider) {
	const config = getConfig();
	const network = await provider.getNetwork();
	if (network.chainId.toString() !== config.networkId) {
		throw new Error(
			`Wrong network. Expected chain ID: ${config.networkId}, Current: ${network.chainId}`,
		);
	}
	return network;
}
