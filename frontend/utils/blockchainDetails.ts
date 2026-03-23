import { ethers } from "ethers";
import runtimeConfig from "@/config/contract-runtime.json";

export const CONTRACT_ADDRESS = () => runtimeConfig.contractAddress;
export const NETWORK_ID = () => runtimeConfig.chainId.toString();

export const TradeChainABI = runtimeConfig.abi;

export function getContract(signer: ethers.Signer) {
	const contractAddress = CONTRACT_ADDRESS();
	if (!contractAddress) {
		throw new Error("Contract address not found. Please deploy the contract first.");
	}

	if (!Array.isArray(TradeChainABI) || TradeChainABI.length === 0) {
		throw new Error("Contract ABI not found. Run deploy script to sync runtime config.");
	}

	return new ethers.Contract(contractAddress, TradeChainABI, signer);
}

export async function checkNetwork(provider: ethers.Provider) {
	const network = await provider.getNetwork();
	if (network.chainId.toString() !== NETWORK_ID()) {
		throw new Error(
			`Wrong network. Expected chain ID: ${NETWORK_ID()}, Current: ${network.chainId}`,
		);
	}
	return network;
}
