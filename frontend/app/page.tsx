"use client";

import { connectWallet } from "@/utils/connectWallet";
import { getLogicContract, getMoneyContract } from "@/utils/blockchainDetails";
import {
	getTradesForEntity,
	markTradeCancelled,
	markTradeCompleted,
	getTrustScore,
	type TradeEntity,
	type TradeRecord,
} from "@/utils/userTradeDetails";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";

type ActionName =
	| "createTrade"
	| "acknowledgeTrade"
	| "assignArbitrators"
	| "importerDeposited"
	| "exporterSent"
	| "exportCustomsReceived"
	| "exportCustomsApproved"
	| "shipmentSent"
	| "shipmentReceived"
	| "importCustomsReceived"
	| "importCustomsApproved"
	| "completeTrade"
	| "raiseDispute"
	| "dissolveDispute"
	| "cancelDispute"
	| "setShipperStake"
	| "setDisputeStake"
	| "withdraw";

type ToastType = "error" | "success" | "info";

const entityOptions: TradeEntity[] = [
	"importer",
	"exporter",
	"exportCustoms",
	"importCustoms",
	"shipper",
	"arbitrator",
	"owner",
];

const entityActions: Record<TradeEntity, ActionName[]> = {
	importer: ["createTrade", "importerDeposited", "completeTrade", "raiseDispute", "withdraw"],
	exporter: ["acknowledgeTrade", "assignArbitrators", "exporterSent", "raiseDispute", "withdraw"],
	exportCustoms: ["exportCustomsReceived", "exportCustomsApproved", "withdraw"],
	importCustoms: ["importCustomsReceived", "importCustomsApproved", "withdraw"],
	shipper: ["shipmentSent", "shipmentReceived", "withdraw"],
	arbitrator: ["dissolveDispute", "cancelDispute", "withdraw"],
	owner: ["setShipperStake", "setDisputeStake", "withdraw"],
};

const actionLabels: Record<ActionName, string> = {
	createTrade: "Create Trade",
	acknowledgeTrade: "Acknowledge Trade",
	assignArbitrators: "Assign Arbitrators",
	importerDeposited: "Importer Deposit",
	exporterSent: "Exporter Sent",
	exportCustomsReceived: "Export Customs Received",
	exportCustomsApproved: "Export Customs Approved",
	shipmentSent: "Shipment Sent",
	shipmentReceived: "Shipment Received",
	importCustomsReceived: "Import Customs Received",
	importCustomsApproved: "Import Customs Approved",
	completeTrade: "Complete Trade",
	raiseDispute: "Raise Dispute",
	dissolveDispute: "Dissolve Dispute",
	cancelDispute: "Cancel Dispute",
	setShipperStake: "Set Shipper Stake",
	setDisputeStake: "Set Dispute Stake",
	withdraw: "Withdraw",
};

const DEFAULT_IMPORTER_DEPOSIT = "1000";
const DEFAULT_SHIPMENT_STAKE = "10";
const DEFAULT_DISPUTE_STAKE = "20";

function extractHexDataFromError(error: unknown): string | null {
	if (typeof error !== "object" || error === null) {
		return null;
	}

	const candidate = error as {
		data?: unknown;
		info?: { error?: { data?: unknown } };
		message?: string;
	};

	if (typeof candidate.data === "string" && candidate.data.startsWith("0x")) {
		return candidate.data;
	}

	if (
		typeof candidate.info?.error?.data === "string" &&
		candidate.info.error.data.startsWith("0x")
	) {
		return candidate.info.error.data;
	}

	if (typeof candidate.message === "string") {
		const match = candidate.message.match(/data="(0x[a-fA-F0-9]+)"/);
		if (match?.[1]) {
			return match[1];
		}
	}

	return null;
}

function decodeRevertDataToString(dataHex: string): string | null {
	if (!ethers.isHexString(dataHex) || dataHex.length <= 10) {
		return null;
	}

	// Revert payload usually starts with 4-byte selector, followed by ABI-encoded args.
	const encodedArgs = `0x${dataHex.slice(10)}`;
	try {
		const [decodedReason] = ethers.AbiCoder.defaultAbiCoder().decode(["string"], encodedArgs);
		if (typeof decodedReason === "string" && decodedReason.trim().length > 0) {
			return decodedReason;
		}
	} catch {
		// Fallback below.
	}

	try {
		const text = ethers
			.toUtf8String(dataHex)
			.replace(/\u0000/g, "")
			.trim();
		return text.length > 0 ? text : null;
	} catch {
		return null;
	}
}

function getErrorMessage(error: unknown) {
	const revertData = extractHexDataFromError(error);
	if (revertData) {
		const decoded = decodeRevertDataToString(revertData);
		if (decoded) {
			return decoded;
		}
	}

	if (error instanceof Error) {
		return error.message;
	}

	return "Unknown transaction error.";
}

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
	toast: {
		position: "fixed",
		top: "18px",
		right: "18px",
		maxWidth: "420px",
		padding: "10px 12px",
		borderRadius: "8px",
		border: "1px solid #fecaca",
		background: "#fff1f2",
		color: "#9f1239",
		boxShadow: "0 8px 20px rgba(0, 0, 0, 0.08)",
		zIndex: 99,
	} as const,
	toastInfo: {
		border: "1px solid #bfdbfe",
		background: "#eff6ff",
		color: "#1d4ed8",
	} as const,
	toastSuccess: {
		border: "1px solid #bbf7d0",
		background: "#f0fdf4",
		color: "#166534",
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
	const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);
	const [statusMessage, setStatusMessage] = useState("Waiting for action.");

	const [createTradeIdInput, setCreateTradeIdInput] = useState("");
	const [createImporterAddress, setCreateImporterAddress] = useState("");
	const [createExporterAddress, setCreateExporterAddress] = useState("");
	const [createAmountWei, setCreateAmountWei] = useState(DEFAULT_IMPORTER_DEPOSIT);
	const [shipmentStakeWei, setShipmentStakeWei] = useState(DEFAULT_SHIPMENT_STAKE);
	const [disputeStakeWei, setDisputeStakeWei] = useState(DEFAULT_DISPUTE_STAKE);
	const [ownerShipperStakeInput, setOwnerShipperStakeInput] = useState(DEFAULT_SHIPMENT_STAKE);
	const [ownerDisputeStakeInput, setOwnerDisputeStakeInput] = useState(DEFAULT_DISPUTE_STAKE);
	const [cancelImporterWei, setCancelImporterWei] = useState("");
	const [cancelExporterWei, setCancelExporterWei] = useState("");
	const [cancelShipperWei, setCancelShipperWei] = useState("");
	const [counterpartyAddress, setCounterpartyAddress] = useState("");
	const [counterpartyTrustScore, setCounterpartyTrustScore] = useState<number | null>(null);

	const refreshInFlightRef = useRef<Promise<void> | null>(null);

	const showToast = useCallback((type: ToastType, message: string) => {
		setToast({ type, message });
	}, []);

	useEffect(() => {
		if (!toast) {
			return;
		}

		const timeout = setTimeout(() => {
			setToast(null);
		}, 4500);

		return () => clearTimeout(timeout);
	}, [toast]);

	useEffect(() => {
		connectWallet().then((connectedSigner) => {
			if (!connectedSigner) {
				showToast("error", "MetaMask connection failed.");
				return;
			}

			setSigner(connectedSigner);
			setWalletConnected(true);
			connectedSigner
				.getAddress()
				.then((address) => {
					setAccountAddress(address);
					setCreateImporterAddress(address);
				})
				.catch(() => setAccountAddress(""));
		});
	}, [showToast]);

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
			} catch (error: unknown) {
				setAvailableTrades([]);
				setSelectedTradeId("");
				showToast("error", getErrorMessage(error));
			}
		})();

		refreshInFlightRef.current = refreshPromise;
		try {
			await refreshPromise;
		} finally {
			refreshInFlightRef.current = null;
		}
	}, [walletConnected, selectedEntity, accountAddress, showToast]);

	useEffect(() => {
		if (!walletConnected || !accountAddress) {
			return;
		}

		refreshTrades();
	}, [walletConnected, accountAddress, refreshTrades]);

	const selectedTrade = useMemo(
		() => availableTrades.find((trade) => trade.tradeId === selectedTradeId) || null,
		[availableTrades, selectedTradeId],
	);

	useEffect(() => {
		if (selectedEntity !== "importer") {
			return;
		}

		const targetAddress = createExporterAddress.trim();
		setCounterpartyAddress(targetAddress);

		if (!ethers.isAddress(targetAddress)) {
			setCounterpartyTrustScore(null);
			return;
		}

		getTrustScore(targetAddress)
			.then((score) => setCounterpartyTrustScore(score))
			.catch(() => setCounterpartyTrustScore(null));
	}, [selectedEntity, createExporterAddress]);

	useEffect(() => {
		if (selectedEntity !== "exporter") {
			return;
		}

		const importerAddress = selectedTrade?.importer || "";
		setCounterpartyAddress(importerAddress);

		if (!ethers.isAddress(importerAddress)) {
			setCounterpartyTrustScore(null);
			return;
		}

		getTrustScore(importerAddress)
			.then((score) => setCounterpartyTrustScore(score))
			.catch(() => setCounterpartyTrustScore(null));
	}, [selectedEntity, selectedTrade]);

	function parseSelectedTradeId(): bigint | null {
		if (!selectedTradeId) {
			showToast("error", "Select one trade first.");
			return null;
		}

		try {
			return BigInt(selectedTradeId);
		} catch {
			showToast("error", "Selected trade ID is invalid.");
			return null;
		}
	}

	function parseBigIntInput(input: string, label: string): bigint | null {
		if (!input.trim()) {
			showToast("error", `${label} is required.`);
			return null;
		}

		try {
			return BigInt(input.trim());
		} catch {
			showToast("error", `${label} must be a valid integer.`);
			return null;
		}
	}

	async function submitAction(action: ActionName) {
		if (!signer) {
			showToast("error", "Wallet not connected.");
			return;
		}

		setIsSubmitting(true);
		setStatusMessage(`Submitting ${actionLabels[action]}...`);
		showToast("info", `Submitting ${actionLabels[action]}...`);

		try {
			const logicContract = getLogicContract(signer);
			const moneyContract = getMoneyContract(signer);
			let tx: ethers.ContractTransactionResponse;

			if (action === "createTrade") {
				const createTradeId = parseBigIntInput(createTradeIdInput, "Trade ID");
				const amountWei = parseBigIntInput(createAmountWei, "Trade amount (wei)");
				if (createTradeId === null || amountWei === null) {
					setIsSubmitting(false);
					return;
				}
				if (!ethers.isAddress(createImporterAddress)) {
					showToast("error", "Importer address is invalid.");
					setIsSubmitting(false);
					return;
				}
				if (!ethers.isAddress(createExporterAddress)) {
					showToast("error", "Exporter address is invalid.");
					setIsSubmitting(false);
					return;
				}

				tx = await logicContract.createTrade(
					createTradeId,
					createImporterAddress,
					createExporterAddress,
					amountWei,
				);
			} else if (action === "acknowledgeTrade") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.acknowledgeTrade(tradeId);
			} else if (action === "assignArbitrators") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.assignArbitrators(tradeId);
			} else if (action === "importerDeposited") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null || !selectedTrade || !selectedTrade.agreedAmount) {
					showToast("error", "Selected trade amount not found.");
					setIsSubmitting(false);
					return;
				}

				const amountWei = parseBigIntInput(
					selectedTrade.agreedAmount,
					"Selected trade amount (wei)",
				);
				if (amountWei === null) {
					setIsSubmitting(false);
					return;
				}

				tx = await logicContract.importerDeposited(tradeId, { value: amountWei });
			} else if (action === "exporterSent") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.exporterSent(tradeId);
			} else if (action === "exportCustomsReceived") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.exportCustomsReceived(tradeId);
			} else if (action === "exportCustomsApproved") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.exportCustomsApproved(tradeId);
			} else if (action === "shipmentSent") {
				const tradeId = parseSelectedTradeId();
				const shipperStake = parseBigIntInput(shipmentStakeWei, "Shipper stake (wei)");
				if (tradeId === null || shipperStake === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.shipmentSent(tradeId, { value: shipperStake });
			} else if (action === "shipmentReceived") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.shipmentReceived(tradeId);
			} else if (action === "importCustomsReceived") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.importCustomsReceived(tradeId);
			} else if (action === "importCustomsApproved") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.importCustomsApproved(tradeId);
			} else if (action === "completeTrade") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.completeTrade(tradeId);
			} else if (action === "raiseDispute") {
				const tradeId = parseSelectedTradeId();
				const stakeWei = parseBigIntInput(disputeStakeWei, "Dispute stake (wei)");
				if (tradeId === null || stakeWei === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.raiseDispute(tradeId, { value: stakeWei });
			} else if (action === "dissolveDispute") {
				const tradeId = parseSelectedTradeId();
				if (tradeId === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.dissolveDispute(tradeId);
			} else if (action === "cancelDispute") {
				const tradeId = parseSelectedTradeId();
				const importerFunds = parseBigIntInput(cancelImporterWei, "Importer funds (wei)");
				const exporterFunds = parseBigIntInput(cancelExporterWei, "Exporter funds (wei)");
				const shipperFunds = parseBigIntInput(cancelShipperWei, "Shipper funds (wei)");
				if (
					tradeId === null ||
					importerFunds === null ||
					exporterFunds === null ||
					shipperFunds === null
				) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.cancelDispute(
					tradeId,
					importerFunds,
					exporterFunds,
					shipperFunds,
				);
			} else if (action === "setShipperStake") {
				const shipperStake = parseBigIntInput(ownerShipperStakeInput, "Shipper stake");
				if (shipperStake === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.setShipperStake(shipperStake);
			} else if (action === "setDisputeStake") {
				const disputeStake = parseBigIntInput(ownerDisputeStakeInput, "Dispute stake");
				if (disputeStake === null) {
					setIsSubmitting(false);
					return;
				}
				tx = await logicContract.setDisputeStake(disputeStake);
			} else {
				tx = await moneyContract.withdraw();
			}

			setStatusMessage(`Transaction sent: ${tx.hash}`);
			await tx.wait();

			if (action === "completeTrade") {
				try {
					const completedTradeId = parseSelectedTradeId();
					if (completedTradeId !== null) {
						await markTradeCompleted(completedTradeId.toString(), tx.hash);
					}
				} catch (syncError) {
					showToast(
						"error",
						`Blockchain completed, but backend sync failed: ${getErrorMessage(syncError)}`,
					);
				}
			}

			if (action === "cancelDispute") {
				try {
					const cancelledTradeId = parseSelectedTradeId();
					if (cancelledTradeId !== null) {
						await markTradeCancelled(cancelledTradeId.toString(), tx.hash);
					}
				} catch (syncError) {
					showToast(
						"error",
						`Blockchain cancelled, but backend sync failed: ${getErrorMessage(syncError)}`,
					);
				}
			}

			setStatusMessage(`${actionLabels[action]} successful. Tx: ${tx.hash}`);
			showToast("success", `${actionLabels[action]} succeeded.`);

			await refreshTrades();
		} catch (error: unknown) {
			const message = getErrorMessage(error);
			setStatusMessage(`Failed: ${message}`);
			showToast("error", message);
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
						<label style={{ width: "100%" }}>
							<input
								type="radio"
								name="selectedTrade"
								value={trade.tradeId}
								checked={selectedTradeId === trade.tradeId}
								onChange={(event) => setSelectedTradeId(event.target.value)}
								style={{ marginRight: "8px" }}
							/>
							Trade #{trade.tradeId} ({trade.status || "UNKNOWN"})
							{Array.isArray(trade.arbitrators) && trade.arbitrators.length > 0 ? (
								<span> | Arbitrators: {trade.arbitrators.length}</span>
							) : null}
							{Array.isArray(trade.arbitrators) && trade.arbitrators.length > 0 ? (
								<div
									style={{ marginTop: "4px", fontSize: "12px", color: "#334155" }}
								>
									{trade.arbitrators.join(", ")}
								</div>
							) : null}
						</label>
					</div>
				))}
			</div>
		);
	}

	function needsTradeSelection(action: ActionName) {
		return (
			action !== "createTrade" &&
			action !== "setShipperStake" &&
			action !== "setDisputeStake" &&
			action !== "withdraw"
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
			return (
				selectedEntity !== "importer" ||
				!createTradeIdInput ||
				!createImporterAddress ||
				!createExporterAddress ||
				!createAmountWei
			);
		}

		if (action === "importerDeposited") {
			return selectedEntity !== "importer" || !selectedTrade?.agreedAmount;
		}

		if (action === "shipmentSent") {
			return selectedEntity !== "shipper" || !shipmentStakeWei;
		}

		if (action === "raiseDispute") {
			return !disputeStakeWei;
		}

		if (action === "cancelDispute") {
			return !cancelImporterWei || !cancelExporterWei || !cancelShipperWei;
		}

		if (action === "setShipperStake") {
			return selectedEntity !== "owner" || !ownerShipperStakeInput;
		}

		if (action === "setDisputeStake") {
			return selectedEntity !== "owner" || !ownerDisputeStakeInput;
		}

		return false;
	}

	if (!walletConnected) {
		return (
			<div style={styles.page}>
				<p>Connecting MetaMask wallet...</p>
				{toast ? <p style={styles.status}>{toast.message}</p> : null}
			</div>
		);
	}

	const showActionInputsPanel =
		selectedEntity === "importer" ||
		selectedEntity === "shipper" ||
		selectedEntity === "arbitrator" ||
		selectedEntity === "owner" ||
		selectedEntity === "exporter";

	const toastStyle = {
		...styles.toast,
		...(toast?.type === "info" ? styles.toastInfo : {}),
		...(toast?.type === "success" ? styles.toastSuccess : {}),
	};

	return (
		<div style={styles.page}>
			{toast ? <div style={toastStyle}>{toast.message}</div> : null}

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

			{(selectedEntity === "importer" || selectedEntity === "exporter") &&
			counterpartyAddress ? (
				<div style={styles.panel}>
					<h3>Counterparty Trust Score</h3>
					<p>Address: {counterpartyAddress}</p>
					<p>
						Trust Score:{" "}
						{counterpartyTrustScore === null ? "Unavailable" : counterpartyTrustScore}
					</p>
				</div>
			) : null}

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
								<label htmlFor="tradeIdCreate">Trade ID (for create trade):</label>
								<input
									id="tradeIdCreate"
									type="text"
									style={styles.control}
									placeholder="1"
									value={createTradeIdInput}
									onChange={(event) =>
										setCreateTradeIdInput(event.target.value.trim())
									}
								/>
							</div>
							<div style={styles.fieldColumn}>
								<label htmlFor="importerAddress">
									Importer address (for create trade):
								</label>
								<input
									id="importerAddress"
									type="text"
									style={styles.control}
									placeholder="0x..."
									value={createImporterAddress}
									onChange={(event) =>
										setCreateImporterAddress(event.target.value.trim())
									}
								/>
							</div>
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
								<label htmlFor="amountCreateWei">
									Trade amount in wei (for create trade):
								</label>
								<input
									id="amountCreateWei"
									type="text"
									style={styles.control}
									placeholder="1000"
									value={createAmountWei}
									onChange={(event) =>
										setCreateAmountWei(event.target.value.trim())
									}
								/>
							</div>
							<div style={styles.fieldColumn}>
								<label>Deposit amount for importer deposit:</label>
								<p style={styles.status}>
									{selectedTrade?.agreedAmount
										? `${selectedTrade.agreedAmount} wei (from selected trade)`
										: "Select a trade with agreed amount."}
								</p>
							</div>
							<div style={styles.fieldColumn}>
								<label htmlFor="disputeStakeWei">
									Dispute stake in wei (for raise dispute):
								</label>
								<input
									id="disputeStakeWei"
									type="text"
									style={styles.control}
									placeholder="20"
									value={disputeStakeWei}
									onChange={(event) =>
										setDisputeStakeWei(event.target.value.trim())
									}
								/>
							</div>
						</>
					) : null}

					{selectedEntity === "shipper" ? (
						<div style={styles.fieldColumn}>
							<label htmlFor="shipperStakeWei">Shipper stake in wei:</label>
							<input
								id="shipperStakeWei"
								type="text"
								style={styles.control}
								placeholder="10"
								value={shipmentStakeWei}
								onChange={(event) => setShipmentStakeWei(event.target.value.trim())}
							/>
						</div>
					) : null}

					{selectedEntity === "arbitrator" ? (
						<>
							<div style={styles.fieldColumn}>
								<label htmlFor="cancelImporterWei">
									Cancel dispute importer funds (wei):
								</label>
								<input
									id="cancelImporterWei"
									type="text"
									style={styles.control}
									placeholder="0"
									value={cancelImporterWei}
									onChange={(event) =>
										setCancelImporterWei(event.target.value.trim())
									}
								/>
							</div>
							<div style={styles.fieldColumn}>
								<label htmlFor="cancelExporterWei">
									Cancel dispute exporter funds (wei):
								</label>
								<input
									id="cancelExporterWei"
									type="text"
									style={styles.control}
									placeholder="0"
									value={cancelExporterWei}
									onChange={(event) =>
										setCancelExporterWei(event.target.value.trim())
									}
								/>
							</div>
							<div style={styles.fieldColumn}>
								<label htmlFor="cancelShipperWei">
									Cancel dispute shipper funds (wei):
								</label>
								<input
									id="cancelShipperWei"
									type="text"
									style={styles.control}
									placeholder="0"
									value={cancelShipperWei}
									onChange={(event) =>
										setCancelShipperWei(event.target.value.trim())
									}
								/>
							</div>
						</>
					) : null}

					{selectedEntity === "owner" ? (
						<>
							<div style={styles.fieldColumn}>
								<label htmlFor="ownerShipperStakeInput">Set shipper stake:</label>
								<input
									id="ownerShipperStakeInput"
									type="text"
									style={styles.control}
									placeholder="10"
									value={ownerShipperStakeInput}
									onChange={(event) =>
										setOwnerShipperStakeInput(event.target.value.trim())
									}
								/>
							</div>
							<div style={styles.fieldColumn}>
								<label htmlFor="ownerDisputeStakeInput">Set dispute stake:</label>
								<input
									id="ownerDisputeStakeInput"
									type="text"
									style={styles.control}
									placeholder="20"
									value={ownerDisputeStakeInput}
									onChange={(event) =>
										setOwnerDisputeStakeInput(event.target.value.trim())
									}
								/>
							</div>
						</>
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
