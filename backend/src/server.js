const express = require("express");
const { loadConfig } = require("./config");
const { createTradeChainListener } = require("./eventListener");
const { connectToMongo, disconnectFromMongo } = require("./db");

const config = loadConfig();
const app = express();
let listener;
let server;

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
			contractAddress: config.contractAddress,
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

async function start() {
	await connectToMongo({
		mongoUri: config.mongoUri,
		mongoDbName: config.mongoDbName,
	});

	listener = createTradeChainListener({
		rpcUrl: config.rpcUrl,
		contractAddress: config.contractAddress,
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
