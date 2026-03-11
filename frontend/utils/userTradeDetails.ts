import { ethers } from "ethers";
import { CONTRACT_ADDRESS, TradeChainABI } from "./blockchainDetails";

export async function getOngoingTransactions(): Promise<Array<string>> {
	const provider = new ethers.BrowserProvider(window.ethereum);

	console.log(CONTRACT_ADDRESS());
	const contract = new ethers.Contract(CONTRACT_ADDRESS(), TradeChainABI, provider);

	console.log(await provider.getCode(CONTRACT_ADDRESS()));
	console.log(await provider.getNetwork());
	console.log("all contracts:", contract.interface.fragments);

	const tx = await contract.getTradesAsImporter();

	// await tx.wait();

	console.log("Your ongoing transactions:", tx);

	return [];
}

export async function switchToHardhat() {
	const params = {
		chainId: "0x7a69",
		chainName: "Hardhat Local",
		nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
		rpcUrls: ["http://127.0.0.1:8545"],
		blockExplorerUrls: [],
	};
	try {
		await window.ethereum.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId: params.chainId }],
		});
	} catch (switchError) {
		// 4902 = unknown chain, ask to add it
		if (switchError.code === 4902) {
			await window.ethereum.request({ method: "wallet_addEthereumChain", params: [params] });
		} else {
			throw switchError;
		}
	}
	console.log("Switched/added Hardhat network");
}
