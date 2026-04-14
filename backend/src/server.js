const express = require("express");
const { loadConfig } = require("./config");
const { createTradeChainListener } = require("./eventListener");
const { connectToMongo, disconnectFromMongo } = require("./db");
const Trade = require("./models/Trade");
const ParticipantTrust = require("./models/ParticipantTrust");

const config = loadConfig();
const app = express();
let listener;
let server;

const TERMINAL_STATUSES = new Set(["COMPLETED", "DISPUTED", "CANCELLED"]);
const TRADE_ENTITY_FIELDS = {
	importer: "importer",
	exporter: "exporter",
	exportCustoms: "exportCustoms",
	importCustoms: "importCustoms",
	shipper: "shipper",
	arbitrator: null,
	owner: null,
};

function normalizeAddress(address) {
	return typeof address === "string" ? address.toLowerCase() : "";
}

async function loadTradesForEntity({ entity, address, includeTerminal }) {
	let trades = await Trade.find().lean();

	if (!includeTerminal) {
		trades = trades.filter((trade) => !TERMINAL_STATUSES.has(trade.status));
	}

	if (!entity || entity === "owner") {
		return trades.sort((a, b) => Number(a.tradeId) - Number(b.tradeId));
	}

	if (
		entity === "exportCustoms" ||
		entity === "importCustoms" ||
		entity === "arbitrator" ||
		entity === "shipper"
	) {
		return trades.sort((a, b) => Number(a.tradeId) - Number(b.tradeId));
	}

	const field = TRADE_ENTITY_FIELDS[entity];
	if (!field) {
		const error = new Error(`Unsupported entity: ${entity}`);
		error.statusCode = 400;
		throw error;
	}

	if (!address) {
		const error = new Error(`Missing address for entity: ${entity}`);
		error.statusCode = 400;
		throw error;
	}

	const normalizedAddress = normalizeAddress(address);
	return trades
		.filter((trade) => normalizeAddress(trade[field]) === normalizedAddress)
		.sort((a, b) => Number(a.tradeId) - Number(b.tradeId));
}

app.use(express.json());
app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	res.header("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		res.sendStatus(204);
		return;
	}

	next();
});

app.get("/health", async (_req, res) => {
	try {
		if (!listener) {
			res.status(503).json({ ok: false, error: "Service initializing" });
			return;
		}

		const blockNumber = await listener.provider.getBlockNumber();
		res.json({
			ok: true,
			rpcUrl: config.rpcUrl,
			logicAddress: config.logicAddress,
			mongoDbName: config.mongoDbName,
			latestBlock: blockNumber,
		});
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error instanceof Error ? error.message : "Unknown error",
		});
	}
});

app.get("/trust-score", async (req, res) => {
	const address = typeof req.query.address === "string" ? req.query.address : "";
	if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
		res.status(400).json({
			ok: false,
			error: "Invalid or missing address query parameter.",
		});
		return;
	}

	try {
		const normalizedAddress = normalizeAddress(address);
		const trust = await ParticipantTrust.findOne({ address: normalizedAddress }).lean();
		res.json({
			ok: true,
			address: normalizedAddress,
			trustScore: trust ? trust.trustScore : 0,
		});
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error instanceof Error ? error.message : "Failed to load trust score",
		});
	}
});

app.get("/trades", async (req, res) => {
	const entity = typeof req.query.entity === "string" ? req.query.entity : "";
	const address = typeof req.query.address === "string" ? req.query.address : "";
	const includeTerminal = req.query.includeTerminal === "true";

	if (entity && !(entity in TRADE_ENTITY_FIELDS)) {
		res.status(400).json({
			ok: false,
			error: `Invalid entity '${entity}'. Allowed values: ${Object.keys(TRADE_ENTITY_FIELDS).join(", ")}`,
		});
		return;
	}

	try {
		const trades = await loadTradesForEntity({ entity, address, includeTerminal });
		res.json({ ok: true, count: trades.length, trades });
	} catch (error) {
		res.status(error.statusCode || 500).json({
			ok: false,
			error: error instanceof Error ? error.message : "Failed to load trades",
		});
	}
});

app.get("/trades/:tradeId", async (req, res) => {
	try {
		const trade = await Trade.findOne({ tradeId: req.params.tradeId }).lean();

		if (!trade) {
			res.status(404).json({ ok: false, error: "Trade not found" });
			return;
		}

		res.json({ ok: true, trade });
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error instanceof Error ? error.message : "Failed to load trade",
		});
	}
});

app.post("/trades/:tradeId/complete", async (req, res) => {
	const tradeId = req.params.tradeId;
	const txHash = typeof req.body?.txHash === "string" ? req.body.txHash : null;

	try {
		const result = await Trade.updateOne(
			{ tradeId },
			{
				$set: {
					status: "COMPLETED",
					completedAt: new Date(),
					lastEventName: "ManualCompleteSync",
					...(txHash ? { lastTxHash: txHash } : {}),
				},
			},
		);

		if (result.matchedCount === 0) {
			res.status(404).json({ ok: false, error: "Trade not found" });
			return;
		}

		res.json({ ok: true });
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error instanceof Error ? error.message : "Failed to mark trade completed",
		});
	}
});

app.post("/trades/:tradeId/cancel", async (req, res) => {
	const tradeId = req.params.tradeId;
	const txHash = typeof req.body?.txHash === "string" ? req.body.txHash : null;

	try {
		const result = await Trade.updateOne(
			{ tradeId },
			{
				$set: {
					status: "CANCELLED",
					lastEventName: "ManualCancelSync",
					disputedBy: null,
					...(txHash ? { lastTxHash: txHash } : {}),
				},
			},
		);

		if (result.matchedCount === 0) {
			res.status(404).json({ ok: false, error: "Trade not found" });
			return;
		}

		res.json({ ok: true });
	} catch (error) {
		res.status(500).json({
			ok: false,
			error: error instanceof Error ? error.message : "Failed to mark trade cancelled",
		});
	}
});

async function start() {
	await connectToMongo({
		mongoUri: config.mongoUri,
		mongoDbName: config.mongoDbName,
	});

	listener = createTradeChainListener({
		rpcUrl: config.rpcUrl,
		logicAddress: config.logicAddress,
		logicAbi: config.logicAbi,
		pollingInterval: config.pollingInterval,
	});

	listener.start();

	server = app.listen(config.port, () => {
		console.log(`Backend listener server running on http://localhost:${config.port}`);
		console.log(`Health endpoint: http://localhost:${config.port}/health`);
	});
}

async function shutdown(signal) {
	console.log(`Received ${signal}. Shutting down listener server...`);

	if (server) {
		await new Promise((resolve) => {
			server.close(resolve);
		});
	}

	if (listener) {
		await listener.stop();
	}

	await disconnectFromMongo();
	console.log("Listener server stopped.");
	process.exit(0);
}

process.on("SIGINT", () => {
	shutdown("SIGINT").catch((error) => {
		console.error(error);
		process.exit(1);
	});
});

process.on("SIGTERM", () => {
	shutdown("SIGTERM").catch((error) => {
		console.error(error);
		process.exit(1);
	});
});

start().catch((error) => {
	console.error("Failed to start backend listener server:", error.message || error);
	process.exit(1);
});
