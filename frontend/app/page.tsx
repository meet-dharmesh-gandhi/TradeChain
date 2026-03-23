"use client";

import { connectWallet } from "@/utils/connectWallet";
import { getContract } from "@/utils/blockchainDetails";
import { getTradesForEntity, type TradeEntity, type TradeRecord } from "@/utils/userTradeDetails";
import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";

type ActionName =
	| "createTrade"
	| "deposit"
	| "received"
	| "dispute"
	| "acknowledgeTrade"
	| "export"
	| "customsReceived"
	| "customsApproved"
	| "sendShipment"
	| "receiveShipment"
	| "addExportCustoms"
	| "addImportCustoms"
	| "addShipper"
	| "removeRole";

const entityOptions: TradeEntity[] = [
	"importer",
	"exporter",
	"exportCustoms",
	"importCustoms",
	"shipper",
	"owner",
];

const entityActions: Record<TradeEntity, ActionName[]> = {
	importer: ["createTrade", "deposit", "received", "dispute"],
	exporter: ["acknowledgeTrade", "export", "dispute"],
	exportCustoms: ["customsReceived", "customsApproved", "dispute"],
	importCustoms: ["customsReceived", "customsApproved", "dispute"],
	shipper: ["sendShipment", "receiveShipment", "dispute"],
	owner: ["addExportCustoms", "addImportCustoms", "addShipper", "removeRole"],
};

const actionLabels: Record<ActionName, string> = {
	createTrade: "Create Trade",
	deposit: "Deposit",
	received: "Confirm Received",
	dispute: "Raise Dispute",
	acknowledgeTrade: "Acknowledge Trade",
	export: "Mark Exported",
	customsReceived: "Customs Received",
	customsApproved: "Customs Approved",
	sendShipment: "Send Shipment",
	receiveShipment: "Receive Shipment",
	addExportCustoms: "Add Export Customs",
	addImportCustoms: "Add Import Customs",
	addShipper: "Add Shipper",
	removeRole: "Remove Role",
};

const DEFAULT_CREATE_TRADE_PRICE_WEI = 1000n;

const styles = {
	page: {
		maxWidth: "900px",
		margin: "0 auto",
		padding: "16px",
		fontFamily: "sans-serif",
		lineHeight: 1.4,
	} as const,
	panel: {
		border: "1px solid #d1d5db",
		borderRadius: "8px",
		padding: "12px",
		marginBottom: "12px",
		background: "#ffffff",
	} as const,
	row: {
		display: "flex",
		gap: "8px",
		alignItems: "center",
		flexWrap: "wrap",
		marginBottom: "8px",
	} as const,
	fieldColumn: {
		display: "flex",
		flexDirection: "column",
		gap: "4px",
		marginBottom: "10px",
	} as const,
	control: {
		border: "1px solid #9ca3af",
		borderRadius: "6px",
		padding: "8px",
		minWidth: "260px",
		fontSize: "14px",
	} as const,
	button: {
		border: "1px solid #6b7280",
		borderRadius: "6px",
		padding: "8px 12px",
		background: "#f3f4f6",
		cursor: "pointer",
		fontSize: "14px",
	} as const,
	disabledButton: {
		opacity: 0.55,
		cursor: "not-allowed",
	} as const,
	radioRow: {
		display: "flex",
		alignItems: "center",
		gap: "8px",
		padding: "6px 8px",
		border: "1px solid #e5e7eb",
		borderRadius: "6px",
		marginBottom: "6px",
	} as const,
	status: {
		border: "1px solid #cbd5e1",
		borderRadius: "6px",
		padding: "10px",
		background: "#f8fafc",
		marginTop: "12px",
		wordBreak: "break-word",
	} as const,
};

export default function Home() {
	const [walletConnected, setWalletConnected] = useState(false);
	const [signer, setSigner] = useState<ethers.Signer | null>(null);
	const [accountAddress, setAccountAddress] = useState("");
	const [selectedEntity, setSelectedEntity] = useState<TradeEntity>("importer");
	const [availableTrades, setAvailableTrades] = useState<TradeRecord[]>([]);
	const [selectedTradeId, setSelectedTradeId] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [statusMessage, setStatusMessage] = useState("");

	const [createExporterAddress, setCreateExporterAddress] = useState("");
	const [depositAmountWei, setDepositAmountWei] = useState("");
	const [roleAddressInput, setRoleAddressInput] = useState("");
	const refreshInFlightRef = useRef<Promise<void> | null>(null);

	useEffect(() => {
		connectWallet().then((connectedSigner) => {
			if (!connectedSigner) {
				setStatusMessage("Failed to connect MetaMask.");
				return;
			}

			setSigner(connectedSigner);
			setWalletConnected(true);
			connectedSigner
				.getAddress()
				.then((address) => setAccountAddress(address))
				.catch(() => setAccountAddress(""));
		});
	}, []);

	const refreshTrades = useCallback(async () => {
		if (refreshInFlightRef.current) {
			await refreshInFlightRef.current;
			return;
		}

		const refreshPromise = (async () => {
			if (!walletConnected || !accountAddress) {
				return;
			}

			try {
				const trades = await getTradesForEntity(selectedEntity, accountAddress);
				setAvailableTrades(trades);
				setSelectedTradeId((currentSelection) =>
					trades.some((trade) => trade.tradeId === currentSelection)
						? currentSelection
						: "",
				);
			} catch {
				setAvailableTrades([]);
				setSelectedTradeId("");
			}
		})();

		refreshInFlightRef.current = refreshPromise;
		try {
			await refreshPromise;
		} finally {
			refreshInFlightRef.current = null;
		}
	}, [walletConnected, selectedEntity, accountAddress]);

	useEffect(() => {
		if (!walletConnected || !accountAddress) {
			return;
		}

		refreshTrades();
	}, [walletConnected, accountAddress, refreshTrades]);

	function parseSelectedTradeId(): bigint | null {
		if (!selectedTradeId) {
			setStatusMessage("Select one trade first.");
			return null;
		}

		try {
			return BigInt(selectedTradeId);
		} catch {
			setStatusMessage("Selected trade ID is invalid.");
			return null;
		}
	}

	async function submitAction(action: ActionName) {
		if (!signer) {
			setStatusMessage("Wallet not connected.");
			return;
		}

		setIsSubmitting(true);
		setStatusMessage(`Submitting ${actionLabels[action]} transaction...`);

		try {
			const contract = getContract(signer);
			let tx: ethers.ContractTransactionResponse;

			if (action === "createTrade") {
				if (!createExporterAddress) {
					setStatusMessage("Enter exporter address.");
					setIsSubmitting(false);
					return;
				}

				tx = await contract.createTrade(
					createExporterAddress,
					DEFAULT_CREATE_TRADE_PRICE_WEI,
				);
			} else if (action === "deposit") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				if (!depositAmountWei) {
					setStatusMessage("Enter deposit amount in wei.");
					setIsSubmitting(false);
					return;
				}

				tx = await contract.deposit(tradeId, { value: BigInt(depositAmountWei) });
			} else if (action === "received") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await contract.received(tradeId);
			} else if (action === "dispute") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await contract.dispute(tradeId);
			} else if (action === "acknowledgeTrade") {
				const tradeId = parseSelectedTradeId();
				console.log("tradeId:", tradeId);
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await contract.acknowledgeTrade(tradeId);
			} else if (action === "export") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await contract.export(tradeId);
			} else if (action === "customsReceived") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await contract.customsReceived(tradeId);
			} else if (action === "customsApproved") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await contract.customsApproved(tradeId);
			} else if (action === "sendShipment") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await contract.sendShipment(tradeId);
			} else if (action === "receiveShipment") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await contract.receiveShipment(tradeId);
			} else if (action === "addExportCustoms") {
				if (!roleAddressInput) {
					setStatusMessage("Enter an address for role assignment.");
					setIsSubmitting(false);
					return;
				}
				tx = await contract.addExportCustoms(roleAddressInput);
			} else if (action === "addImportCustoms") {
				if (!roleAddressInput) {
					setStatusMessage("Enter an address for role assignment.");
					setIsSubmitting(false);
					return;
				}
				tx = await contract.addImportCustoms(roleAddressInput);
			} else if (action === "addShipper") {
				if (!roleAddressInput) {
					setStatusMessage("Enter an address for role assignment.");
					setIsSubmitting(false);
					return;
				}
				tx = await contract.addShipper(roleAddressInput);
			} else {
				if (!roleAddressInput) {
					setStatusMessage("Enter an address whose role should be removed.");
					setIsSubmitting(false);
					return;
				}
				tx = await contract.removeRole(roleAddressInput);
			}

			setStatusMessage(`Transaction sent: ${tx.hash}`);
			await tx.wait();
			setStatusMessage(`${actionLabels[action]} successful. Tx: ${tx.hash}`);

			await refreshTrades();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Unknown transaction error.";
			setStatusMessage(`Failed: ${message}`);
		} finally {
			setIsSubmitting(false);
		}
	}

	function renderTradeList() {
		if (selectedEntity === "owner") {
			return <p>Trade list is not scoped for owner role.</p>;
		}

		if (availableTrades.length === 0) {
			return <p>No trades available for selected entity.</p>;
		}

		return (
			<div>
				{availableTrades.map((trade) => (
					<div key={trade.tradeId} style={styles.radioRow}>
						<label>
							<input
								type="radio"
								name="selectedTrade"
								value={trade.tradeId}
								checked={selectedTradeId === trade.tradeId}
								onChange={(event) => setSelectedTradeId(event.target.value)}
								style={{ marginRight: "8px" }}
							/>
							Trade #{trade.tradeId} ({trade.status || "UNKNOWN"})
						</label>
					</div>
				))}
			</div>
		);
	}

	function needsTradeSelection(action: ActionName) {
		return (
			action !== "createTrade" &&
			action !== "addExportCustoms" &&
			action !== "addImportCustoms" &&
			action !== "addShipper" &&
			action !== "removeRole"
		);
	}

	function actionDisabled(action: ActionName) {
		if (isSubmitting) {
			return true;
		}

		if (needsTradeSelection(action) && !selectedTradeId) {
			return true;
		}

		if (action === "createTrade") {
			return selectedEntity !== "importer" || !createExporterAddress;
		}

		if (action === "deposit") {
			return selectedEntity !== "importer" || !depositAmountWei;
		}

		if (
			action === "addExportCustoms" ||
			action === "addImportCustoms" ||
			action === "addShipper" ||
			action === "removeRole"
		) {
			return selectedEntity !== "owner" || !roleAddressInput;
		}

		return false;
	}

	if (!walletConnected) {
		return (
			<div style={styles.page}>
				<p>Connecting MetaMask wallet...</p>
				{statusMessage ? <p style={styles.status}>{statusMessage}</p> : null}
			</div>
		);
	}

	const showActionInputsPanel = selectedEntity === "importer" || selectedEntity === "owner";

	return (
		<div style={styles.page}>
			<h2>TradeChain Frontend Controls</h2>
			<p>Connected Account: {accountAddress || "Unknown"}</p>

			<div style={styles.panel}>
				<label htmlFor="entitySelect">Select entity:</label>
				<div style={styles.row}>
					<select
						id="entitySelect"
						style={styles.control}
						value={selectedEntity}
						onChange={(event) => setSelectedEntity(event.target.value as TradeEntity)}
					>
						{entityOptions.map((entity) => (
							<option key={entity} value={entity}>
								{entity}
							</option>
						))}
					</select>
					<button
						type="button"
						style={{
							...styles.button,
							...(isSubmitting ? styles.disabledButton : {}),
						}}
						onClick={refreshTrades}
						disabled={isSubmitting}
					>
						Refresh trades
					</button>
				</div>
			</div>

			<div style={styles.panel}>
				<h3>Trades (single selection)</h3>
				{renderTradeList()}
			</div>

			{showActionInputsPanel ? (
				<div style={styles.panel}>
					<h3>Action Inputs</h3>
					{selectedEntity === "importer" ? (
						<>
							<div style={styles.fieldColumn}>
								<label htmlFor="exporterAddress">
									Exporter address (for create trade):
								</label>
								<input
									id="exporterAddress"
									type="text"
									style={styles.control}
									placeholder="0x..."
									value={createExporterAddress}
									onChange={(event) =>
										setCreateExporterAddress(event.target.value.trim())
									}
								/>
							</div>
							<div style={styles.fieldColumn}>
								<label htmlFor="depositWei">
									Deposit amount in wei (for deposit):
								</label>
								<input
									id="depositWei"
									type="text"
									style={styles.control}
									placeholder="1000000000000000000"
									value={depositAmountWei}
									onChange={(event) =>
										setDepositAmountWei(event.target.value.trim())
									}
								/>
							</div>
						</>
					) : null}
					{selectedEntity === "owner" ? (
						<div style={styles.fieldColumn}>
							<label htmlFor="roleAddress">Address for owner role actions:</label>
							<input
								id="roleAddress"
								type="text"
								style={styles.control}
								placeholder="0x..."
								value={roleAddressInput}
								onChange={(event) => setRoleAddressInput(event.target.value.trim())}
							/>
						</div>
					) : null}
				</div>
			) : null}

			<div style={styles.panel}>
				<h3>Available Actions For Selected Entity</h3>
				<div style={styles.row}>
					{entityActions[selectedEntity].map((action) => (
						<button
							type="button"
							key={action}
							style={{
								...styles.button,
								...(actionDisabled(action) ? styles.disabledButton : {}),
							}}
							onClick={() => submitAction(action)}
							disabled={actionDisabled(action)}
						>
							{isSubmitting ? "Submitting..." : actionLabels[action]}
						</button>
					))}
				</div>
			</div>

			{statusMessage ? <p style={styles.status}>{statusMessage}</p> : null}
		</div>
	);
}
