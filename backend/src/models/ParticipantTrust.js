const mongoose = require("mongoose");

const ParticipantTrustSchema = new mongoose.Schema(
	{
		address: { type: String, required: true, unique: true, index: true },
		trustScore: { type: Number, default: 0 },
	},
	{
		timestamps: true,
		versionKey: false,
	},
);

module.exports =
	mongoose.models.ParticipantTrust || mongoose.model("ParticipantTrust", ParticipantTrustSchema);
