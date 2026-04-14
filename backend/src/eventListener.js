const { ethers } = require("ethers");
const { processTradeEvent } = require("./services/tradeEventProcessor");

function safeStringify(value) {
	return JSON.stringify(
		value,
		(_, current) => (typeof current === "bigint" ? current.toString() : current),
		4,
	);
}

function createTradeChainListener({ rpcUrl, logicAddress, logicAbi, pollingInterval = 1000 }) {
	const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
		polling: true,
		pollingInterval,
	});

	const contract = new ethers.Contract(logicAddress, logicAbi, provider);
	const eventFragments = contract.interface.fragments.filter(
		(fragment) => fragment.type === "event",
	);

	const onAnyEvent = (eventName, ...args) => {
		const eventPayload = args[args.length - 1];
		const values = args.slice(0, -1);

		const logRecord = {
			timestamp: new Date().toISOString(),
			event: eventName,
			address: logicAddress,
			blockNumber: eventPayload.log.blockNumber,
			txHash: eventPayload.log.transactionHash,
			args: values,
		};

		console.log(`[EVENT] ${eventName} -> ${safeStringify(logRecord)}`);
	};

	function start() {
		for (const fragment of eventFragments) {
			contract.on(fragment.name, async (...args) => {
				onAnyEvent(fragment.name, ...args);

				const eventPayload = args[args.length - 1];
				const values = args.slice(0, -1);
				await processTradeEvent(fragment.name, values, eventPayload);
			});
		}

		provider.on("error", (error) => {
			console.error("[PROVIDER ERROR]", error.message || error);
		});

		console.log(`Subscribed to ${eventFragments.length} TradeLogic events at ${logicAddress}`);
		console.log(`Using RPC ${rpcUrl}`);
	}

	async function stop() {
		contract.removeAllListeners();
		provider.removeAllListeners();
		await provider.destroy();
	}

	return {
		start,
		stop,
		provider,
		contract,
	};
}

module.exports = {
	createTradeChainListener,
};
