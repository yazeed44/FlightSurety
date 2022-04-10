"use strict";
import FlightSuretyApp from "../../build/contracts/FlightSuretyApp.json";
import FlightSuretyData from "../../build/contracts/FlightSuretyData.json";
import Config from "./config.json";
import Web3 from "web3";
import express from "express";
import cors from "cors";
const config = Config["localhost"];
import assert from "assert";

const web3 = new Web3(new Web3.providers.WebsocketProvider(config.url.replace("http", "ws")));
const flightSuretyApp = new web3.eth.Contract(FlightSuretyApp.abi, config.appAddress);
flightSuretyApp.options.gasPrice = "20000000000000"; // default gas price in wei
flightSuretyApp.options.gas = 5000000; // provide as fallback always 5M gas
const flightSuretyData = new web3.eth.Contract(FlightSuretyData.abi, config.dataAddress);

const numOracles = 20;
const oracleAddressStart = 10; // addresses 10 to 30 are oracles
const numOfFlightsPerAirline = 5;
const flightRegisterPayment = web3.utils.toWei("10", "ether");
const oracleRegisterPayment = web3.utils.toWei("1", "ether");

const STATUS_CODES = {
    STATUS_CODE_UNKNOWN: 0,
    STATUS_CODE_ON_TIME: 10,
    STATUS_CODE_LATE_AIRLINE: 20,
    STATUS_CODE_LATE_WEATHER: 30,
    STATUS_CODE_LATE_TECHNICAL: 40,
    STATUS_CODE_LATE_OTHER: 50,
};

const airlines = [];

function _randomStatusCode() {
    return Object.values(STATUS_CODES)[Math.round(Math.random() * (Object.keys(STATUS_CODES).length - 1))];
}

// internal: listen for OracleReport and FlightStatusInfo events
function listenToEvents() {
    for (const contract of [flightSuretyApp, flightSuretyData]) {
        contract.events.allEvents({ fromBlock: 0 }, (error, event) => {
            if (error) console.error(`Event ${event.event} emitted an err: ${error}`);
            console.log(`New event (${event.event}): ${JSON.stringify(event.returnValues)}`);
        });
    }
}

async function handleAirlinesEndpoint(req, res) {
    const accounts = await web3.eth.getAccounts();
    console.log(`server.js thinks that first airline address is ${accounts[0]}`);

    const trace = [];
    const isAppAuthorized = await flightSuretyData.methods.isCallerAuthorized(config.appAddress).call();
    if (isAppAuthorized) console.log(`App contract is already authorized to work with data contract, no need to authorize it`);
    else {
        console.log(`App contract is not authorized to work with data contract, attempting to authorize it`);
        await flightSuretyData.methods.authorizeCaller(config.appAddress).send({ from: accounts[0] });
    }

    let isFirstAirlineFunded = (await flightSuretyApp.methods.isFunded(accounts[0]).call({ from: accounts[1] }))[0];
    console.log(`Airline (${accounts[0]}) is funded: ${isFirstAirlineFunded}`);
    if (!isFirstAirlineFunded) {
        await flightSuretyApp.methods.fundAirline().send({ from: accounts[0], value: flightRegisterPayment });
        trace.push("First Airline has been funded");
    } else trace.push("First airline is already funded");
    isFirstAirlineFunded = (await flightSuretyApp.methods.isFunded(accounts[0]).call({ from: accounts[1] }))[0];
    assert(isFirstAirlineFunded, "Failed to fund first airline");

    console.log(`First airline is or has been funded`);
    airlines.push({ airlineAddress: accounts[0], name: `Airline 0` });

    for (let i = 2; i <= 4; i++) {
        const name = `Airline ${i}`;

        const isAirlineRegistered = (await flightSuretyApp.methods.isRegistered(accounts[i]).call({ from: accounts[0] }))[0];
        console.log(`${name} (${accounts[i]}) registeration: ${isAirlineRegistered}`);
        if (!isAirlineRegistered) {
            const msg = `Registered ${name} under address ${accounts[i]}`;
            await flightSuretyApp.methods.registerAirline(accounts[i], name).send({ from: accounts[0] });
            console.log(msg);
            trace.push(msg);
        } else trace.push(`${name} is already registered under address ${accounts[i]}`);

        const isAirlineFunded = (await flightSuretyApp.methods.isFunded(accounts[i]).call({ from: accounts[0] }))[0];
        console.log(`${name} (${accounts[i]}) is funded: ${isAirlineFunded}`);

        if (!isAirlineFunded) {
            await flightSuretyApp.methods.fundAirline().send({ from: accounts[i], value: flightRegisterPayment });
            const msg = `funding ${name} under address ${accounts[i]}`;
            console.log(msg);
            trace.push(msg);
        } else trace.push(`${name} is already funded under address ${accounts[i]}`);

        airlines.push({ airlineAddress: accounts[i], name: name });
    }

    if (res !== undefined) return res.json({ status: "okay", events: trace }).end();
}

async function handleFlightsEndpoint(req, res) {
    const trace = [];

    const generateRandomFlight = (airlineAddress) => {
        const spots = ["RYD", "DAM", "SAM", "COLL", "ASB"];
        const from = spots[Math.floor(Math.random() * spots.length)];
        let to = spots[Math.floor(Math.random() * spots.length)];
        while (to === from) to = spots[Math.floor(Math.random() * spots.length)];
        const flight = {
            name: `Flight ${Date.now()}`,
            updatedTimestamp: Math.round(Date.now() / 1000),
            airlineAddress: airlineAddress,
            isRegistered: true,
            statusCode: 0,
            from: from,
            to: to,
        };
        return flight;
    };

    for (const airline of airlines) {
        // Will add two flights to each airline

        const flights = new Array(numOfFlightsPerAirline).fill(null).map(() => generateRandomFlight(airline.airlineAddress));
        for (const flight of flights) {
            await flightSuretyApp.methods
                .registerFlight(flight.name, flight.updatedTimestamp, flight.from, flight.to)
                .send({ from: flight.airlineAddress });
            const msg = `Registered flight ${flight.name} under airline ${airline.airlineAddress}`;
            console.log(msg);
            trace.push(msg);
        }
    }

    if (res !== undefined) return res.json({ status: "okay", events: trace }).end();
}

async function handleOraclesEndpoint(req, res) {
    const accounts = await web3.eth.getAccounts();
    const oracleAccounts = accounts.slice(oracleAddressStart, oracleAddressStart + numOracles + 1);
    const trace = [];

    for (let i = 0; i < numOracles; i++) {
        const oracleAccount = oracleAccounts[i];

        const registerOracleResult = await flightSuretyApp.methods
            .registerOracle()
            .send({ from: oracleAccount, value: oracleRegisterPayment });
        const msg = `Registered a new oracle (${i} with address: ${oracleAccount} and status: ${registerOracleResult.status}`;
        console.log(msg);
        trace.push(msg);

        const oracleIndices = await flightSuretyApp.methods.getMyIndexes().call({ from: oracleAccount });
        console.log(`Oracle (${oracleAccount}) indices are: ${oracleIndices}`);

        // listen
        flightSuretyApp.events.OracleRequest({ fromBlock: 0, filter: { index: oracleIndices } }, async (err, event) => {
            if (err) console.error(err);
            else {
                const result = event.returnValues;

                const statusCode = _randomStatusCode();
                console.log(`Oracle ${i} (${oracleAccounts[i]} - ${oracleIndices}): replying with ${statusCode}`);
                await flightSuretyApp.methods
                    .submitOracleResponse(result.index, result.airline, result.flight, result.timestamp, statusCode)
                    .send({ from: oracleAccounts[i] });
            }
        });
    }

    if (res !== undefined) return res.json({ status: "okay", events: trace }).end();
}

const app = express();
app.get("/api", (req, res) => {
    res.send({
        message: "An API for use with your Dapp!",
    });
});

const setupAll = async () => {
    await handleAirlinesEndpoint();
    await handleFlightsEndpoint();
    await handleOraclesEndpoint();
    console.log("Set up airlines, flights and oracles");
};

app.use(cors());

app.use(express.static("prod/dapp"));

app.post("/api/airlines", handleAirlinesEndpoint);
app.post("/api/flights", handleFlightsEndpoint);
app.post("/api/oracles", handleOraclesEndpoint);

setupAll();
listenToEvents();

export default app;
