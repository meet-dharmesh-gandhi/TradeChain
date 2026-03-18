const mongoose = require("mongoose");

async function connectToMongo({ mongoUri, mongoDbName }) {
	mongoose.connection.on("connected", () => {
		console.log(`MongoDB connected (${mongoDbName})`);
	});

	mongoose.connection.on("error", (error) => {
		console.error("MongoDB connection error:", error.message || error);
	});

	mongoose.connection.on("disconnected", () => {
		console.log("MongoDB disconnected");
	});

	await mongoose.connect(mongoUri, {
		dbName: mongoDbName,
	});
}

async function disconnectFromMongo() {
	if (mongoose.connection.readyState !== 0) {
		await mongoose.disconnect();
	}
}

module.exports = {
	connectToMongo,
	disconnectFromMongo,
};
