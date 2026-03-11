"use client";

import { connectWallet } from "@/utils/connectWallet";
import { getOngoingTransactions } from "@/utils/userTradeDetails";
import { useEffect, useState } from "react";

export default function Home() {
	const [walletConnected, setWalletConnected] = useState(false);
	const [ongoingTrades, setongoingTrades] = useState<string[]>([]);

	useEffect(() => {
		connectWallet()
			.then(() => setWalletConnected(true))
			.then(() => getOngoingTransactions().then((data) => setongoingTrades(data)));
	}, []);

	if (!walletConnected) {
		return (
			<div>
				<p>Connecting your metamask wallet...</p>
			</div>
		);
	}

	return (
		<div className="grid grid-rows-[1fr_3fr] gap-4">
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
