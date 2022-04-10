import DOM from "./dom";
import Contract from "./contract";
import "./flightsurety.css";
import $ from "jquery";
import "node-snackbar/dist/snackbar.css";
import Snackbar from "node-snackbar";

const run = async () => {
    console.log(`test index.js`);

    const contract = new Contract("localhost");
    await contract.registerEvents();

    const flights = await contract.fetchFlights();
    displayOracleForm(flights);
    displayInsuranceForm(flights);
    displayAmIInsured(flights);

    DOM.elid("check-operational-status").addEventListener("click", async () => {
        // Read transaction
        console.log("Clicked on check operational status");
        const isOperational = await contract.isOperational();

        console.log(`check-operational-status: isOperational: ${isOperational}`);

        Snackbar.show({ text: `Is operational: ${isOperational} `, pos: "bottom-center", textColor: "#ff3366" });
    });

    // User-submitted transaction
    DOM.elid("submit-oracle").addEventListener("click", async () => {
        const flight = DOM.elid("flight-number").value;

        // do nothing
        if (flight === "-1") return;
        console.log(flight);

        // Write transaction
        const flightStatus = await contract.fetchFlightStatus(flight);

        Snackbar.show({ text: `Flight status: ${flightStatus} `, pos: "bottom-center", textColor: "#ff3366" });
    });

    DOM.elid("buy-insurance").addEventListener("click", async () => {
        const flightName = DOM.elid("insurance-flights").value;
        const insuranceAmount = parseFloat($("#amount").val(), 10);

        console.log(flightName);
        console.log(insuranceAmount);

        if (isNaN(insuranceAmount)) {
            Snackbar.show({ text: `Invalid insurance amount`, pos: "bottom-center", textColor: "#ff3366" });
            return;
        }

        // do nothing
        if (flightName === "-1") return;

        let found = false;
        for (let f of flights) if (f.name === flightName) found = true;

        if (!found) Snackbar.show({ text: `Invalid flight`, pos: "bottom-center", textColor: "#ff3366" });

        try {
            await contract.buyInsurance(flightName, insuranceAmount);

            Snackbar.show({
                text: `Bought insurance of ${insuranceAmount} ether for flight (${flightName})`,
                pos: "bottom-center",
                textColor: "#ff3366",
            });
        } catch (e) {
            console.error(`Error buying insurance: ${e}`);
            Snackbar.show({ text: `error: ${e}`, pos: "bottom-center", textColor: "#ff3366" });
        }
    });

    DOM.elid("submit-ami").addEventListener("click", async () => {
        const flightName = DOM.elid("flight-number-insured").value;

        // do nothing
        if (flightName === "-1") return;
        console.log(flightName);

        // Write transaction
        const insuredAmount = await contract.insuredAmount(flightName);
        Snackbar.show({ text: `You are insured for: ${insuredAmount} ETH`, pos: "bottom-center", textColor: "#ff3366" });
    });

    DOM.elid("request-payment").addEventListener("click", async () => {
        // Write transaction
        const payout = await contract.payPassenger();
        console.log(`User will be paid ${JSON.stringify(payout)}`);
        Snackbar.show({ text: `Payout made out sucessfully: ${payout}`, pos: "bottom-center", textColor: "#ff3366" });
    });

    function displayOracleForm(flights) {
        $("#flight-number").find("option").remove().end().append($("<option />").val("-1").text("Select Flight..."));
        for (let flight of flights) {
            $("#flight-number").append($("<option />").val(flight.name).text(`${flight.name}: ${flight.from} to ${flight.to}`));
        }
    }

    function displayInsuranceForm(flights) {
        $("#insurance-flights").find("option").remove().end().append($("<option />").val("-1").text("Select Flight..."));
        for (let flight of flights) {
            $("#insurance-flights").append($("<option />").val(flight.name).text(`${flight.name}: ${flight.from} to ${flight.to}`));
        }
    }

    function displayAmIInsured(flights) {
        $("#flight-number-insured").find("option").remove().end().append($("<option />").val("-1").text("Select Flight..."));
        for (let flight of flights) {
            $("#flight-number-insured").append($("<option />").val(flight.name).text(`${flight.name}: ${flight.from} to ${flight.to}`));
        }
    }
};

run();
