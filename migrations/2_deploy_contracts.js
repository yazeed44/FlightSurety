const FlightSuretyApp = artifacts.require("FlightSuretyApp");
const FlightSuretyData = artifacts.require("FlightSuretyData");
const fs = require("fs");

module.exports = async function (deployer) {
    const [firstAirlineAddress, firstAirlineName] = [deployer.provider.addresses[0], "Airline 0"];
    await deployer.deploy(FlightSuretyData, firstAirlineAddress, firstAirlineName);

    await deployer.deploy(FlightSuretyApp, FlightSuretyData.address);
    const config = {
        localhost: {
            url: "http://127.0.0.1:7545",
            dataAddress: FlightSuretyData.address,
            appAddress: FlightSuretyApp.address,
        },
    };
    fs.writeFileSync(__dirname + "/../src/dapp/config.json", JSON.stringify(config, null, "\t"), "utf-8");
    fs.writeFileSync(__dirname + "/../src/server/config.json", JSON.stringify(config, null, "\t"), "utf-8");
};
