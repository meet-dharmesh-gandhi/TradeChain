"use client";

import { connectWallet } from "@/utils/connectWallet";
import { getContract } from "@/utils/blockchainDetails";
import { getOngoingTransactions } from "@/utils/userTradeDetails";
import { useEffect, useState } from "react";
import { ethers } from "ethers";

export default function Home() {
	const [walletConnected, setWalletConnected] = useState(false);
	const [signer, setSigner] = useState<ethers.Signer | null>(null);
	const [ongoingTrades, setongoingTrades] = useState<string[]>([]);
	const [isCreatingTrade, setIsCreatingTrade] = useState(false);
	const [createTradeStatus, setCreateTradeStatus] = useState("");

	useEffect(() => {
		connectWallet().then((connectedSigner) => {
			if (!connectedSigner) {
				setCreateTradeStatus("Failed to connect MetaMask.");
				return;
			}

			setSigner(connectedSigner);
			setWalletConnected(true);
			getOngoingTransactions().then((data) => setongoingTrades(data));
		});
	}, []);

	async function handleCreateTrade() {
		if (!signer) {
			setCreateTradeStatus("Wallet not connected.");
			return;
		}

		setIsCreatingTrade(true);
		setCreateTradeStatus("Submitting createTrade transaction...");

		try {
			const contract = getContract(signer);
			// Hardhat account #1 as default exporter, simple test amount.
			const tx = await contract.createTrade(
				"0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
				1000,
			);

			setCreateTradeStatus(`Transaction sent: ${tx.hash}`);
			await tx.wait();
			setCreateTradeStatus(`Trade created successfully. Tx: ${tx.hash}`);

			const data = await getOngoingTransactions();
			setongoingTrades(data);
		} catch (error) {
			setCreateTradeStatus("Failed to create trade.");
		} finally {
			setIsCreatingTrade(false);
		}
	}

	if (!walletConnected) {
		return (
			<div>
				<p>Connecting your metamask wallet...</p>
			</div>
		);
	}

	return (
		<div className="grid grid-rows-[1fr_3fr] gap-4">
			<div className="flex flex-col gap-2">
				<button
					type="button"
					onClick={handleCreateTrade}
					disabled={isCreatingTrade}
					className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
				>
					{isCreatingTrade ? "Creating Trade..." : "Create Test Trade"}
				</button>
				{createTradeStatus ? <p>{createTradeStatus}</p> : null}
			</div>

			<p>Your ongoing trades:</p>
			<div className="flex flex-col gap-2">
				{ongoingTrades.length < 1 ? (
					<div>
						<p>No ongoing trades yet...</p>
					</div>
				) : (
					ongoingTrades.map((ele) => (
						<div key={ele}>
							<p>{ele}</p>
						</div>
					))
				)}
			</div>
		</div>
	);
}
