const Trade = require("../models/Trade");

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

async function updateExistingTrade(tradeId, setFields, eventName, eventPayload) {
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
		},
	);

	if (result.matchedCount === 0) {
		console.warn(
			`[DB] Missing trade document for tradeId=${tradeId} while handling ${eventName}`,
		);
	}
}

async function processTradeCreated(args, eventPayload) {
	const tradeId = args[0].toString();
	const importer = args[1];
	const exporter = args[2];

	await Trade.create({
		tradeId,
		importer,
		exporter,
		status: "CREATED",
		...getCommonEventMetadata(eventPayload),
		lastEventName: "TradeCreated",
		eventHistory: [buildEventHistoryItem("TradeCreated", eventPayload)],
	});
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

const eventHandlers = {
	TradeCreated: processTradeCreated,
	ExporterAcknowledged: processExporterAcknowledged,
	ImporterDeposited: processImporterDeposited,
	ExporterSent: processExporterSent,
	ExportCustomsReceived: processExportCustomsReceived,
	ExportCustomsApproved: processExportCustomsApproved,
	ShipmentSent: processShipmentSent,
	ShipmentReceived: processShipmentReceived,
	ImportCustomsReceived: processImportCustomsReceived,
	ImportCustomsApproved: processImportCustomsApproved,
	Completed: processCompleted,
	Disputed: processDisputed,
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
		if (eventName === "TradeCreated" && error && error.code === 11000) {
			console.warn(`[DB] Duplicate TradeCreated ignored for tradeId=${args[0].toString()}`);
			return;
		}

		console.error(`[DB] Failed processing ${eventName}:`, error.message || error);
	}
}

module.exports = {
	processTradeEvent,
};
