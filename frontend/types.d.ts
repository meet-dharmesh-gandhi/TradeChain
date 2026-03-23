type InjectedProviders = {
	isMetaMask?: true;
};

type EthereumRequestArguments = {
	method: string;
	params?: unknown[] | Record<string, unknown>;
};

type EthereumListener = (...args: unknown[]) => void;

interface Window {
	ethereum: InjectedProviders & {
		on: (eventName: string, listener: EthereumListener) => void;
		removeListener?: (eventName: string, listener: EthereumListener) => void;
		request<T = unknown>(args: EthereumRequestArguments): Promise<T>;
	};
}
