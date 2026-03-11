require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const BlockchainEnv = require("./config/env");

// Validate environment configuration
const envValidation = BlockchainEnv.validateEnvironment();
if (!envValidation.isValid) {
	console.error("Environment validation failed:");
	envValidation.errors.forEach((error) => console.error(`- ${error}`));
	process.exit(1);
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	solidity: "0.8.28",
	networks: {
		localhost: BlockchainEnv.getNetworkConfig(),
	},
};
