const mongoose = require("mongoose");

const TradeSchema = new mongoose.Schema(
	{
		tradeId: { type: String, required: true, unique: true, index: true },
		importer: { type: String, default: null },
		exporter: { type: String, default: null },
		importCustoms: { type: String, default: null },
		exportCustoms: { type: String, default: null },
		shipper: { type: String, default: null },
		agreedAmount: { type: String, default: null },
		depositedAmount: { type: String, default: null },
		status: { type: String, default: null },
		disputedBy: { type: String, default: null },
		completedAt: { type: Date, default: null },
		lastEventName: { type: String, default: null },
		lastTxHash: { type: String, default: null },
		lastBlockNumber: { type: Number, default: null },
		eventHistory: {
			type: [
				{
					eventName: { type: String, required: true },
					txHash: { type: String, required: true },
					blockNumber: { type: Number, required: true },
					timestamp: { type: Date, required: true },
				},
			],
			default: [],
		},
	},
	{
		timestamps: true,
		versionKey: false,
	},
);

module.exports = mongoose.models.Trade || mongoose.model("Trade", TradeSchema);
