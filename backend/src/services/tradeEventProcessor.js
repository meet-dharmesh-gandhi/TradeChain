const Trade = require("../models/Trade");
const ParticipantTrust = require("../models/ParticipantTrust");

const TRADE_STATE_LABELS = [
	"NOT_STARTED",
	"CREATED",
	"EXPORTER_ACKNOWLEDGED",
	"ARBITRATORS_ASSIGNED",
	"IMPORTER_DEPOSITED",
	"EXPORTER_SENT",
	"EXPORT_CUSTOMS_RECEIVED",
	"EXPORT_CUSTOMS_APPROVED",
	"SHIPMENT_SENT",
	"SHIPMENT_RECEIVED",
	"IMPORT_CUSTOMS_RECEIVED",
	"IMPORT_CUSTOMS_APPROVED",
	"COMPLETED",
	"CANCELLED",
];

const COMPLETED_STATE_INDEX = 12;

function normalizeAddress(address) {
	return typeof address === "string" ? address.toLowerCase() : "";
}

function getCommonEventMetadata(eventPayload) {
	const txHash = eventPayload.log.transactionHash;
	const blockNumber = eventPayload.log.blockNumber;

	return {
		lastTxHash: txHash,
		lastBlockNumber: blockNumber,
	};
}

function buildEventHistoryItem(eventName, eventPayload) {
	return {
		eventName,
		txHash: eventPayload.log.transactionHash,
		blockNumber: eventPayload.log.blockNumber,
		timestamp: new Date(),
	};
}

async function updateExistingTrade(tradeId, setFields, eventName, eventPayload, extraUpdate = {}) {
	const result = await Trade.updateOne(
		{ tradeId },
		{
			$set: {
				...setFields,
				...getCommonEventMetadata(eventPayload),
				lastEventName: eventName,
			},
			$push: {
				eventHistory: buildEventHistoryItem(eventName, eventPayload),
			},
			...extraUpdate,
		},
	);

	if (result.matchedCount === 0) {
		console.warn(
			`[DB] Missing trade document for tradeId=${tradeId} while handling ${eventName}`,
		);
	}
}

async function incrementTrustScore(address) {
	const normalized = normalizeAddress(address);
	if (!normalized) {
		return;
	}

	await ParticipantTrust.updateOne(
		{ address: normalized },
		{ $inc: { trustScore: 1 } },
		{ upsert: true },
	);
}

async function incrementTradeTrustScores(tradeId, importer, exporter) {
	if (!importer || !exporter) {
		return;
	}

	const result = await Trade.updateOne(
		{ tradeId, trustCounted: { $ne: true } },
		{ $set: { trustCounted: true } },
	);

	if (result.matchedCount === 0 || result.modifiedCount === 0) {
		return;
	}

	await Promise.all([incrementTrustScore(importer), incrementTrustScore(exporter)]);
}

async function processTradeCreated(args, eventPayload) {
	const tradeId = args[0].toString();
	const importer = args[1];
	const exporter = args[2];
	const amount = args[3] !== undefined ? args[3].toString() : null;

	await Trade.create({
		tradeId,
		importer,
		exporter,
		arbitrators: [],
		agreedAmount: amount,
		status: "CREATED",
		trustCounted: false,
		...getCommonEventMetadata(eventPayload),
		lastEventName: "TradeCreated",
		eventHistory: [buildEventHistoryItem("TradeCreated", eventPayload)],
	});
}

async function processArbitratorsAssigned(args, eventPayload) {
	const tradeId = args[0].toString();
	const arbitrators = Array.isArray(args[1]) ? args[1] : [];

	await updateExistingTrade(
		tradeId,
		{
			arbitrators,
			status: "ARBITRATORS_ASSIGNED",
		},
		"arbitratorsAssigned",
		eventPayload,
	);
}

async function processExporterAcknowledged(args, eventPayload) {
	const tradeId = args[0].toString();
	const exporter = args[1];

	await updateExistingTrade(
		tradeId,
		{
			exporter,
			status: "EXPORTER_ACKNOWLEDGED",
		},
		"ExporterAcknowledged",
		eventPayload,
	);
}

async function processImporterDeposited(args, eventPayload) {
	const tradeId = args[0].toString();
	const importer = args[1];
	const amount = args[2].toString();

	await updateExistingTrade(
		tradeId,
		{
			importer,
			agreedAmount: amount,
			depositedAmount: amount,
			status: "IMPORTER_DEPOSITED",
		},
		"ImporterDeposited",
		eventPayload,
	);
}

async function processExporterSent(args, eventPayload) {
	const tradeId = args[0].toString();
	const exporter = args[1];

	await updateExistingTrade(
		tradeId,
		{
			exporter,
			status: "EXPORTER_SENT",
		},
		"ExporterSent",
		eventPayload,
	);
}

async function processExportCustomsReceived(args, eventPayload) {
	const tradeId = args[0].toString();
	const exportCustoms = args[1];

	await updateExistingTrade(
		tradeId,
		{
			exportCustoms,
			status: "EXPORT_CUSTOMS_RECEIVED",
		},
		"ExportCustomsReceived",
		eventPayload,
	);
}

async function processExportCustomsApproved(args, eventPayload) {
	const tradeId = args[0].toString();
	const exportCustoms = args[1];

	await updateExistingTrade(
		tradeId,
		{
			exportCustoms,
			status: "EXPORT_CUSTOMS_APPROVED",
		},
		"ExportCustomsApproved",
		eventPayload,
	);
}

async function processShipmentSent(args, eventPayload) {
	const tradeId = args[0].toString();
	const shipper = args[1];

	await updateExistingTrade(
		tradeId,
		{
			shipper,
			status: "SHIPMENT_SENT",
		},
		"ShipmentSent",
		eventPayload,
	);
}

async function processShipmentReceived(args, eventPayload) {
	const tradeId = args[0].toString();
	const shipper = args[1];

	await updateExistingTrade(
		tradeId,
		{
			shipper,
			status: "SHIPMENT_RECEIVED",
		},
		"ShipmentReceived",
		eventPayload,
	);
}

async function processImportCustomsReceived(args, eventPayload) {
	const tradeId = args[0].toString();
	const importCustoms = args[1];

	await updateExistingTrade(
		tradeId,
		{
			importCustoms,
			status: "IMPORT_CUSTOMS_RECEIVED",
		},
		"ImportCustomsReceived",
		eventPayload,
	);
}

async function processImportCustomsApproved(args, eventPayload) {
	const tradeId = args[0].toString();
	const importCustoms = args[1];

	await updateExistingTrade(
		tradeId,
		{
			importCustoms,
			status: "IMPORT_CUSTOMS_APPROVED",
		},
		"ImportCustomsApproved",
		eventPayload,
	);
}

async function processCompleted(args, eventPayload) {
	const tradeId = args[0].toString();
	const importer = args[1];
	const exporter = args[2];

	await updateExistingTrade(
		tradeId,
		{
			importer,
			exporter,
			status: "COMPLETED",
			completedAt: new Date(),
		},
		"Completed",
		eventPayload,
	);

	await incrementTradeTrustScores(tradeId, importer, exporter);
}

async function processDisputed(args, eventPayload) {
	const tradeId = args[0].toString();
	const disputer = args[1];

	await updateExistingTrade(
		tradeId,
		{
			disputedBy: disputer,
			status: "DISPUTED",
		},
		"Disputed",
		eventPayload,
	);
}

async function processTradeStateChanged(args, eventPayload) {
	const tradeId = args[0].toString();
	const stateIndex = Number(args[1]);
	const status = TRADE_STATE_LABELS[stateIndex] || `STATE_${stateIndex}`;
	const setFields = { status };

	if (stateIndex === COMPLETED_STATE_INDEX) {
		setFields.completedAt = new Date();
	}

	await updateExistingTrade(tradeId, setFields, "tradeStateChanged", eventPayload);

	if (stateIndex === COMPLETED_STATE_INDEX) {
		const trade = await Trade.findOne({ tradeId }).lean();
		if (trade) {
			await incrementTradeTrustScores(tradeId, trade.importer, trade.exporter);
		}
	}
}

async function processDisputeRaisedV2(args, eventPayload) {
	const tradeId = args[0].toString();

	await updateExistingTrade(
		tradeId,
		{
			status: "DISPUTED",
		},
		"disputeRaised",
		eventPayload,
	);
}

async function processDisputeResolvedV2(args, eventPayload) {
	const tradeId = args[0].toString();
	const action = Number(args[1]);

	await updateExistingTrade(
		tradeId,
		{
			status: action === 1 ? "CANCELLED" : "DISPUTE_RESOLVED",
			disputedBy: null,
		},
		"disputeResolved",
		eventPayload,
	);
}

const eventHandlers = {
	TradeCreated: processTradeCreated,
	tradeCreated: processTradeCreated,
	ExporterAcknowledged: processExporterAcknowledged,
	ImporterDeposited: processImporterDeposited,
	ExporterSent: processExporterSent,
	ExportCustomsReceived: processExportCustomsReceived,
	ExportCustomsApproved: processExportCustomsApproved,
	ShipmentSent: processShipmentSent,
	ShipmentReceived: processShipmentReceived,
	ImportCustomsReceived: processImportCustomsReceived,
	ImportCustomsApproved: processImportCustomsApproved,
	arbitratorsAssigned: processArbitratorsAssigned,
	ArbitratorsAssigned: processArbitratorsAssigned,
	Completed: processCompleted,
	Disputed: processDisputed,
	tradeStateChanged: processTradeStateChanged,
	disputeRaised: processDisputeRaisedV2,
	disputeResolved: processDisputeResolvedV2,
};

async function processTradeEvent(eventName, args, eventPayload) {
	const handler = eventHandlers[eventName];
	if (!handler) {
		return;
	}

	try {
		await handler(args, eventPayload);
		console.log(`[DB] Processed ${eventName}`);
	} catch (error) {
		if (
			(eventName === "TradeCreated" || eventName === "tradeCreated") &&
			error &&
			error.code === 11000
		) {
			console.warn(`[DB] Duplicate tradeCreated ignored for tradeId=${args[0].toString()}`);
			return;
		}

		console.error(`[DB] Failed processing ${eventName}:`, error.message || error);
	}
}

module.exports = {
	processTradeEvent,
};
