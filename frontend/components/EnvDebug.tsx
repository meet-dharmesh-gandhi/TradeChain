/**
 * Debug utility to check environment variable loading
 * Use this component temporarily to verify env vars are loaded correctly
 */

import { getSafeEnvConfig } from "../config/env";

export default function EnvDebug() {
	const config = getSafeEnvConfig();

	return (
		<div
			style={{
				padding: "20px",
				backgroundColor: "#f5f5f5",
				margin: "20px",
				borderRadius: "8px",
				fontFamily: "monospace",
			}}
		>
			<h3>Environment Variables Debug</h3>
			<p>
				<strong>Config Complete:</strong> {config.isComplete ? "✅ Yes" : "❌ No"}
			</p>

			<h4>Environment Variables:</h4>
			<ul>
				<li>
					<strong>CONTRACT_ADDRESS:</strong> {config.contractAddress || "❌ Missing"}
				</li>
				<li>
					<strong>NETWORK_ID:</strong> {config.networkId || "❌ Missing"}
				</li>
				<li>
					<strong>RPC_URL:</strong> {config.rpcUrl || "❌ Missing"}
				</li>
				<li>
					<strong>CHAIN_ID:</strong> {config.chainId || "❌ Missing"}
				</li>
				<li>
					<strong>CHAIN_NAME:</strong> {config.chainName || "❌ Missing"}
				</li>
			</ul>

			<h4>All NEXT_PUBLIC_ Variables:</h4>
			<pre style={{ backgroundColor: "#fff", padding: "10px", overflow: "auto" }}>
				{JSON.stringify(
					Object.keys(process.env)
						.filter((key) => key.startsWith("NEXT_PUBLIC_"))
						.reduce(
							(obj, key) => {
								obj[key] = process.env[key];
								return obj;
							},
							{} as Record<string, string | undefined>,
						),
					null,
					2,
				)}
			</pre>

			<p style={{ fontSize: "12px", color: "#666", marginTop: "20px" }}>
				💡 <strong>Tip:</strong> If variables are missing, restart the Next.js server:{" "}
				<code>npm run dev</code>
			</p>
		</div>
	);
}
