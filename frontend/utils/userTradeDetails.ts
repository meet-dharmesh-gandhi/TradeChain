import { getEnvConfig } from "@/config/env";

export type TradeEntity =
	| "importer"
	| "exporter"
	| "exportCustoms"
	| "importCustoms"
	| "shipper"
	| "owner";

export interface TradeRecord {
	tradeId: string;
	importer: string | null;
	exporter: string | null;
	importCustoms: string | null;
	exportCustoms: string | null;
	shipper: string | null;
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

const inFlightTradeRequests = new Map<string, Promise<TradeRecord[]>>();

function shouldAttachAddress(entity: TradeEntity) {
	return entity !== "owner" && entity !== "exportCustoms" && entity !== "importCustoms";
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
