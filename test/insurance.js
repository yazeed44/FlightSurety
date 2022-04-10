const assert = require("assert");
const Test = require("../config/testConfig.js");
contract("Flight Insurance Tests", async (accounts) => {
    let config;
    before("setup contract", async () => {
        config = await Test.Config(accounts);
        await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address);
    });

    const airlines = [];
    let flights = [];

    it("First airline is funded", async () => {
        const tenEther = web3.utils.toWei("10", "ether");

        await config.flightSuretyApp.fundAirline({ from: config.firstAirline, value: tenEther });

        const isFirstAirlineFunded = Object.values(
            await config.flightSuretyData.isAirlineFunded.call(config.firstAirline, { from: config.flightSuretyApp.address })
        )[0];
        assert.equal(isFirstAirlineFunded, true, "Airline has sent enough ether to be funded");
        airlines.push(config.firstAirline);
    });

    it("Funded airline can register three airlines using registerAirline()", async () => {
        const secondAirline = accounts[2];
        const thirdAirline = accounts[3];
        const fourthAirline = accounts[4];
        const tenEther = web3.utils.toWei("10", "ether");

        await Promise.all(
            [secondAirline, thirdAirline, fourthAirline].map(async (airline, i) => {
                await config.flightSuretyApp.registerAirline(airline, `Airline ${i + 2}`, { from: config.firstAirline });
                await config.flightSuretyApp.fundAirline({ from: airline, value: tenEther });
                const isFunded = Object.values(
                    await config.flightSuretyData.isAirlineFunded.call(airline, { from: config.flightSuretyApp.address })
                )[0];
                assert.equal(isFunded, true, "Airline should be funded");
                airlines.push(airline);
            })
        );
    });

    it("register random flights", async () => {
        const generateRandomFlight = (airlineAddress) => {
            const spots = ["RYD", "DAM", "SAM", "COLL", "ASB"];
            const from = spots[Math.floor(Math.random() * spots.length)];
            let to = spots[Math.floor(Math.random() * spots.length)];
            while (to === from) to = spots[Math.floor(Math.random() * spots.length)];
            const flight = {
                name: `Flight ${Date.now()} (${from} -> ${to})`,
                updatedTimestamp: Math.round(Date.now() / 1000),
                airlineAddress: airlineAddress,
                isRegistered: true,
                statusCode: 0,
                from: from,
                to: to,
            };
            return flight;
        };

        flights = new Array(15).fill(null).map(() => generateRandomFlight(airlines[Math.round(Math.random() * (airlines.length - 1))]));

        await Promise.all(
            flights.map(async (flight) => {
                config.flightSuretyApp.registerFlight(flight.name, flight.updatedTimestamp, flight.to, flight.from, {
                    from: flight.airlineAddress,
                });
            })
        );
    });

    it("buy insurance for flight 0 with no money", async () => {
        const flight = flights[0];
        const passenger = accounts[10];

        try {
            await config.flightSuretyApp.buyInsurance(flight.airlineAddress, flight.name, flight.updatedTimestamp, {
                from: passenger,
                value: 0,
            });
            assert.fail("Buying insurance with 0 value should fail");
        } catch {}
    });

    it("buy insurance for a flight 0: send 0.5 ether", async () => {
        const flight = flights[0];
        const passenger = accounts[10];

        const halfEther = web3.utils.toWei("0.5", "ether");

        await config.flightSuretyApp.buyInsurance(flight.airlineAddress, flight.name, flight.updatedTimestamp, {
            from: passenger,
            value: halfEther,
        });

        const amount = await config.flightSuretyApp.insuredAmount.call(flight.airlineAddress, flight.name, flight.updatedTimestamp, {
            from: passenger,
        });

        assert.equal(amount, halfEther, "should be insured for 0.5 ETH");
    });

    it("buy insurance for a flight 0: send 2 ether but only 1 ether is insured", async () => {
        const flight = flights[1];
        const passenger = accounts[10];

        const twoEther = web3.utils.toWei("2", "ether");

        await config.flightSuretyApp.buyInsurance(flight.airlineAddress, flight.name, flight.updatedTimestamp, {
            from: passenger,
            value: twoEther,
        });

        const insuredAmount = await config.flightSuretyApp.insuredAmount.call(flight.airlineAddress, flight.name, flight.updatedTimestamp, {
            from: passenger,
        });

        const oneEther = web3.utils.toWei("1", "ether");

        assert.equal(
            insuredAmount,
            oneEther,
            `Insured amount should be 1 eth but it's ${web3.utils.fromWei(insuredAmount, "ether")} ether`
        );
    });

    it("cannot buy insurance for the flight 1 twice", async () => {
        const flight = flights[1];
        const passenger = accounts[10];
        const twoEther = web3.utils.toWei("2", "ether");

        try {
            await config.flightSuretyApp.buyInsurance(flight.address, flight.name, flight.updatedTimestamp, {
                from: passenger,
                value: twoEther,
            });
            assert.fail("Should not be able to buy insurance twice");
        } catch {}
    });

    it("register oracles", async () => {
        const oracleStartAt = 10;
        const oraclesCount = 20;
        const oracleRegisterationFee = await config.flightSuretyApp.ORACLE_REGISTRATION_FEE.call();

        for (let i = 0; i < oraclesCount; i++)
            await config.flightSuretyApp.registerOracle({ from: accounts[oracleStartAt + i], value: oracleRegisterationFee });
    });

    // this part is from test/oracle.js
    it("request flight 1 status and reply with STATUS_CODE_LATE_AIRLINE", async () => {
        const flight = flights[1];
        const oracleStartAt = 10;
        const oraclesCount = 20;

        const STATUS_CODE_LATE_AIRLINE = 20;

        await config.flightSuretyApp.fetchFlightStatus(flight.airlineAddress, flight.name, flight.updatedTimestamp);

        // ideally we should listen for the OracleRequest event, find the index, and use the
        // appropriate oracle to respond.
        for (let i = 0; i < oraclesCount; i++) {
            const oracleIndexes = await config.flightSuretyApp.getMyIndexes.call({ from: accounts[oracleStartAt + i] });
            for (let idx = 0; idx < 3; idx++)
                await config.flightSuretyApp.submitOracleResponse(
                    oracleIndexes[idx],
                    flight.airlineAddress,
                    flight.name,
                    flight.updatedTimestamp,
                    STATUS_CODE_LATE_AIRLINE,
                    { from: accounts[oracleStartAt + i] }
                );
        }
    });

    it("Passenger can withdraw any funds owed to them", async () => {
        const flight = flights[1];
        const passenger = accounts[10];

        // money has moved to payout.
        const insuredAmount = await config.flightSuretyApp.insuredAmount.call(flight.airlineAddress, flight.name, flight.updatedTimestamp, {
            from: passenger,
        });
        assert.equal(
            insuredAmount,
            0,
            `Insured amount (${await web3.utils.fromWei(insuredAmount, "ether")} ether) should be moved to payout and be 0`
        );

        const passengerBalanceBeforePayout = web3.utils.fromWei(await web3.eth.getBalance(passenger), "ether");

        const tx = await config.flightSuretyApp.payInsuree({ from: passenger });
        const payout = web3.utils.fromWei(tx.logs[0].args.payout);

        const passengerBalanceAfterPayout = web3.utils.fromWei(await web3.eth.getBalance(passenger), "ether");
        const oneHalfEther = 1.5;

        assert.equal(payout, oneHalfEther);
        assert.equal(
            parseFloat(passengerBalanceAfterPayout).toFixed(2),
            (parseFloat(passengerBalanceBeforePayout) + oneHalfEther).toFixed(2),
            `Passenger balance should be ${passengerBalanceBeforePayout + oneHalfEther} instead of ${passengerBalanceAfterPayout}`
        );
    });

    it("Flight 0 should still be insured for", async () => {
        const passenger = accounts[10];
        const flight = flights[0];
        const halfEther = web3.utils.toWei("0.5", "ether");

        const insuredAmount = await config.flightSuretyApp.insuredAmount.call(flight.airlineAddress, flight.name, flight.updatedTimestamp, {
            from: passenger,
        });

        assert.equal(insuredAmount, halfEther, "Should be 0.5 ether");
    });
});
