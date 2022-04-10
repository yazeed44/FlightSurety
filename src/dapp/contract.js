import FlightSuretyAppAbi from "../../build/contracts/FlightSuretyApp.json";
import FlightSuretyDataAbi from "../../build/contracts/FlightSuretyData.json";
import Config from "./config.json";
import { ethers } from "ethers";
export default class Contract {
    constructor(network) {
        this.config = Config[network];
        // default
        this.airlines = [];
        this.passengers = [];
        this.oracles = [];
        this.statuses = {
            0: "Unknown",
            10: "On Time",
            20: "Late (Airline)",
            30: "Late (Weather)",
            40: "Late (Technical)",
            50: "Late (Other)",
        };

        this.provider = new ethers.providers.JsonRpcProvider("http://localhost:7545");

        this.signer = this.provider.getSigner();

        this.flightSuretyApp = new ethers.Contract(this.config.appAddress, FlightSuretyAppAbi.abi, this.signer);
        this.flightSuretyData = new ethers.Contract(this.config.dataAddress, FlightSuretyDataAbi.abi, this.signer);
        console.log("enabled");
    }

    async registerEvents() {
        console.log(this.flightSuretyApp.filters);
        const appEventFilters = [
            this.flightSuretyApp.filters.FlightStatusInfo(),
            this.flightSuretyApp.filters.OracleReport(),
            this.flightSuretyApp.filters.OracleRequest(),
        ];

        const dataEventFilters = [];

        for (const event of await this.flightSuretyApp.queryFilter(appEventFilters))
            this.flightSuretyApp.on(event, (resultValues) => {
                // console.log(`FlightSuretyApp Event ${JSON.stringify(event)}: ${JSON.stringify(resultValues)}`);
            });

        for (const event of await this.flightSuretyData.queryFilter(dataEventFilters))
            this.flightSuretyData.on(event, (resultValues) => {
                // console.log(`FlightSuretyData Event ${JSON.stringify(event)}: ${JSON.stringify(resultValues)}`);
            });
    }

    async isOperational() {
        return this.flightSuretyApp.isOperational.call({ from: self.owner });
    }

    _findFlightByName(flightName) {
        flightName = flightName.trim();

        for (const f of this.flights) if (f.name === flightName) return f;

        return undefined;
    }

    async fetchFlightStatus(flightName) {
        const payload = this._findFlightByName(flightName);

        if (!payload) {
            console.error(`unknown flight: ${flightName}`, payload);
            return;
        }

        console.log(`Attempting to fetch flight (${flightName}) status of: ${JSON.stringify(payload)}`);

        await this.flightSuretyApp.fetchFlightStatus(payload.airlineAddress, payload.name, payload.updatedTimestamp);
        const flightStatus = await this.flightSuretyApp.getFlightStatus(payload.airlineAddress, payload.name, payload.updatedTimestamp);
        console.log(this.statuses[flightStatus]);
        return this.statuses[flightStatus];
    }

    async buyInsurance(flightName, insurance) {
        const payload = this._findFlightByName(flightName);

        if (!payload) {
            console.error(`unknown flight: ${flightName}`, payload);
            return;
        }
        const value = ethers.utils.parseEther(insurance.toString());

        console.log(`Attempting to buy insurance (${value} wei) for flight: ${JSON.stringify(payload)}`);

        await this.flightSuretyApp.buyInsurance(payload.airlineAddress, payload.name, payload.updatedTimestamp, { value: value });
        const insuredAmount = await this.flightSuretyApp.insuredAmount(payload.airlineAddress, payload.name, payload.updatedTimestamp);
        console.log(insuredAmount.toString());
        return insuredAmount;
    }

    async insuredAmount(flightName) {
        const payload = this._findFlightByName(flightName);

        if (!payload) {
            console.error(`unknown flight: ${flightName}`, payload);
            return;
        }

        const insuredAmount = await this.flightSuretyApp.insuredAmount(payload.airlineAddress, payload.name, payload.updatedTimestamp);
        console.log(`Insurance for ${flightName}: ${insuredAmount}`);
        return ethers.utils.formatEther(insuredAmount);
    }

    async payPassenger() {
        return new Promise(async (resolve) => {
            this.flightSuretyApp.once("PaidInsuree", async (_, payout, eventName) => {
                resolve(ethers.utils.formatEther(payout));
            });
            const tx = await this.flightSuretyApp.payInsuree();
            console.log(`Payout tx: ${JSON.stringify(tx)}`);
        });
    }

    async fetchFlights() {
        const flightsRaw = await this.flightSuretyData.getFlightsArray.call();
        this.flights = flightsRaw.map((raw) => ({
            name: raw[0],
            isRegistered: raw[1],
            statusCode: raw[2],
            updatedTimestamp: Number(raw[3]),
            airlineAddress: raw[4],
            from: raw[5],
            to: raw[6],
        }));
        console.log(this.flights);

        return this.flights;
    }
}
