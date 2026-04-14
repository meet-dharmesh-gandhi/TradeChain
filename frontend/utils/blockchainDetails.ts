import { ethers } from "ethers";
import runtimeConfig from "@/src/config/contract-runtime.json";

type RuntimeConfig = {
	logicAddress: string;
	moneyAddress: string;
	logicAbi: ethers.InterfaceAbi;
	moneyAbi: ethers.InterfaceAbi;
	chainId?: number;
};

const config = runtimeConfig as RuntimeConfig;

export const LOGIC_ADDRESS = () => config.logicAddress;
export const MONEY_ADDRESS = () => config.moneyAddress;
export const NETWORK_ID = () => String(config.chainId || 31337);

export const TradeLogicABI = config.logicAbi;
export const TradeMoneyABI = config.moneyAbi;

export function getLogicContract(signer: ethers.Signer) {
	const contractAddress = LOGIC_ADDRESS();
	if (!contractAddress) {
		throw new Error("TradeLogic address not found. Run the deploy script again.");
	}

	if (!Array.isArray(TradeLogicABI) || TradeLogicABI.length === 0) {
		throw new Error("TradeLogic ABI missing. Run the deploy script again.");
	}

	return new ethers.Contract(contractAddress, TradeLogicABI, signer);
}

export function getMoneyContract(signer: ethers.Signer) {
	const contractAddress = MONEY_ADDRESS();
	if (!contractAddress) {
		throw new Error("TradeMoney address not found. Run the deploy script again.");
	}

	if (!Array.isArray(TradeMoneyABI) || TradeMoneyABI.length === 0) {
		throw new Error("TradeMoney ABI missing. Run the deploy script again.");
	}

	return new ethers.Contract(contractAddress, TradeMoneyABI, signer);
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
