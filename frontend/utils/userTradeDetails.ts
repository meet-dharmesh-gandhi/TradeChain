import { getEnvConfig } from "@/config/env";

export type TradeEntity =
	| "importer"
	| "exporter"
	| "exportCustoms"
	| "importCustoms"
	| "shipper"
	| "arbitrator"
	| "owner";

export interface TradeRecord {
	tradeId: string;
	importer: string | null;
	exporter: string | null;
	importCustoms: string | null;
	exportCustoms: string | null;
	shipper: string | null;
	arbitrators: string[];
	agreedAmount: string | null;
	depositedAmount: string | null;
	status: string | null;
	disputedBy: string | null;
	lastEventName: string | null;
	lastTxHash: string | null;
	lastBlockNumber: number | null;
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

interface TradesApiResponse {
	ok: boolean;
	trades?: TradeRecord[];
	error?: string;
}

interface TrustScoreApiResponse {
	ok: boolean;
	address?: string;
	trustScore?: number;
	error?: string;
}

interface MarkCompletedApiResponse {
	ok: boolean;
	error?: string;
}

interface MarkCancelledApiResponse {
	ok: boolean;
	error?: string;
}

const inFlightTradeRequests = new Map<string, Promise<TradeRecord[]>>();

function shouldAttachAddress(entity: TradeEntity) {
	return (
		entity !== "owner" &&
		entity !== "arbitrator" &&
		entity !== "shipper" &&
		entity !== "exportCustoms" &&
		entity !== "importCustoms"
	);
}

function getTradesApiUrl(entity: TradeEntity, accountAddress?: string) {
	const config = getEnvConfig();
	const url = new URL("/trades", config.backendUrl);
	url.searchParams.set("entity", entity);

	if (shouldAttachAddress(entity) && accountAddress) {
		url.searchParams.set("address", accountAddress);
	}

	return url.toString();
}

export async function getTradesForEntity(
	entity: TradeEntity,
	accountAddress?: string,
): Promise<TradeRecord[]> {
	if (shouldAttachAddress(entity) && !accountAddress) {
		return [];
	}

	const requestUrl = getTradesApiUrl(entity, accountAddress);
	if (inFlightTradeRequests.has(requestUrl)) {
		return inFlightTradeRequests.get(requestUrl) as Promise<TradeRecord[]>;
	}

	const fetchPromise = (async () => {
		const response = await fetch(requestUrl, {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
			cache: "no-store",
		});

		const data = (await response.json()) as TradesApiResponse;
		if (!response.ok || !data.ok) {
			throw new Error(data.error || "Failed to fetch trades from backend");
		}

		return data.trades || [];
	})();

	inFlightTradeRequests.set(requestUrl, fetchPromise);
	try {
		return await fetchPromise;
	} finally {
		inFlightTradeRequests.delete(requestUrl);
	}
}

export async function getOngoingTransactions(): Promise<Array<string>> {
	const trades = await getTradesForEntity("importer");
	return trades.map((trade) => trade.tradeId);
}

export async function getTrustScore(address: string): Promise<number> {
	if (!address) {
		return 0;
	}

	const config = getEnvConfig();
	const url = new URL("/trust-score", config.backendUrl);
	url.searchParams.set("address", address);

	const response = await fetch(url.toString(), {
		method: "GET",
		headers: { Accept: "application/json" },
		cache: "no-store",
	});

	const data = (await response.json()) as TrustScoreApiResponse;
	if (!response.ok || !data.ok) {
		throw new Error(data.error || "Failed to fetch trust score");
	}

	return data.trustScore || 0;
}

export async function markTradeCompleted(tradeId: string, txHash: string): Promise<void> {
	if (!tradeId) {
		throw new Error("tradeId is required to mark trade as completed.");
	}

	const config = getEnvConfig();
	const url = new URL(`/trades/${tradeId}/complete`, config.backendUrl);

	const response = await fetch(url.toString(), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({ txHash }),
	});

	const data = (await response.json()) as MarkCompletedApiResponse;
	if (!response.ok || !data.ok) {
		throw new Error(data.error || "Failed to sync completed trade to backend");
	}
}

export async function markTradeCancelled(tradeId: string, txHash: string): Promise<void> {
	if (!tradeId) {
		throw new Error("tradeId is required to mark trade as cancelled.");
	}

	const config = getEnvConfig();
	const url = new URL(`/trades/${tradeId}/cancel`, config.backendUrl);

	const response = await fetch(url.toString(), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({ txHash }),
	});

	const data = (await response.json()) as MarkCancelledApiResponse;
	if (!response.ok || !data.ok) {
		throw new Error(data.error || "Failed to sync cancelled trade to backend");
	}
}
