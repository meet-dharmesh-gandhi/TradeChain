const { ethers } = require("ethers");
const abi = require("../../Blockchain/artifacts/contracts/TradeEscrow.sol/TradeChain.json");
const { processTradeEvent } = require("./services/tradeEventProcessor");

function safeStringify(value) {
	return JSON.stringify(
		value,
		(_, current) => (typeof current === "bigint" ? current.toString() : current),
		2,
	);
}

function createTradeChainListener({ rpcUrl, contractAddress, pollingInterval = 1000 }) {
	const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
		polling: true,
		pollingInterval,
	});

	const contract = new ethers.Contract(contractAddress, abi.abi, provider);
	const eventFragments = contract.interface.fragments.filter(
		(fragment) => fragment.type === "event",
	);

	const onAnyEvent = (eventName, ...args) => {
		const eventPayload = args[args.length - 1];
		const values = args.slice(0, -1);

		const logRecord = {
			timestamp: new Date().toISOString(),
			event: eventName,
			address: contractAddress,
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

		console.log(
			`Subscribed to ${eventFragments.length} TradeChain events at ${contractAddress}`,
		);
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
