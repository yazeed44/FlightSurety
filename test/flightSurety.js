const Test = require("../config/testConfig.js");
const assert = require("assert");

contract("Flight Surety Tests", async (accounts) => {
    var config;
    before("setup contract", async () => {
        config = await Test.Config(accounts);
        await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address);
    });

    it(`App contract can call data contract`, async () =>
        new Promise(async (resolve, reject) => {
            try {
                const votes = await config.flightSuretyApp.votesCount(config.flightSuretyData.address, {
                    from: config.flightSuretyApp.address,
                });
                assert.equal(votes, 0);
                resolve();
            } catch (e) {
                console.error(`App contract is not authorized to access data contract: ${e}`);
                reject(e);
            }
        }));

    /****************************************************************************************/
    /* Operations and Settings                                                              */
    /****************************************************************************************/

    it(`(multiparty) has correct initial isOperational() value`, async function () {
        // Get operating status
        const status = await config.flightSuretyApp.isOperational.call();
        assert.equal(status, true, "Incorrect initial operating status value");
    });

    it(`(multiparty) can block access to setOperatingStatus() for non-Contract Owner account`, async function () {
        // Ensure that access is denied for non-Contract Owner account
        try {
            await config.flightSuretyData.setOperatingStatus(false, { from: config.testAddresses[9] });
            assert.fail("Access not restricted to Contract Owner");
        } catch {
            const status = await config.flightSuretyApp.isOperational.call();
            assert.equal(status, true, "Incorrect operating status value");
        }
    });

    it(`(multiparty) can allow access to setOperatingStatus() for Contract Owner account`, async function () {
        // Ensure that access is allowed for Contract Owner account
        await config.flightSuretyData.setOperatingStatus(false, { from: config.owner });
        const isOperational = await config.flightSuretyApp.isOperational.call();

        assert.equal(isOperational, false, "Access not restricted to Contract Owner");
        await config.flightSuretyData.setOperatingStatus(true, { from: config.owner });
    });

    it(`(multiparty) can block access to functions using requireIsOperational when operating status is false`, async function () {
        await config.flightSuretyData.setOperatingStatus(false);
        try {
            await config.flightSuretyData.getFlightsArray.call();
            assert.fail("Failed to block access to ");
        } catch (e) {
            await config.flightSuretyData.setOperatingStatus(true);
        }
    });

    it("First airline is registered but without funds", async () => {
        const [isRegistered, registeredAirlinesCount] = Object.values(
            await config.flightSuretyApp.isRegistered.call(config.firstAirline, {
                from: config.flightSuretyApp.address,
            })
        );

        assert.equal(isRegistered, true, "First airline should be registered when contract is deployed");
        assert.equal(registeredAirlinesCount, 1, "The first airline should be the only airline stored");

        const [isFunded, fundedAirlinesCount] = Object.values(
            await config.flightSuretyApp.isFunded.call(config.firstAirline, {
                from: config.flightSuretyApp.address,
            })
        );

        assert.equal(isFunded, false, "Airlines should not be funded automatically");
        assert.equal(fundedAirlinesCount, 0);
    });

    it("only airline addresses can register flights", async () => {
        try {
            await config.flightSuretyApp.registerFlight("Test flight 1", 123456789, "To", "From", { from: accounts[0] });
            assert.fail("Should not be able to register a flight if not an airline");
        } catch {}
    });

    it("less than 10 ether does not count as funding", async () => {
        const nineEther = web3.utils.toWei("9", "ether");
        await config.flightSuretyApp.fundAirline({ from: config.firstAirline, value: nineEther });
        await config.flightSuretyApp.fundAirline({ from: config.firstAirline, value: web3.utils.toWei("0.5", "ether") });

        const [isFunded, fundedAirlinesCount] = Object.values(
            await config.flightSuretyApp.isFunded.call(config.firstAirline, {
                from: config.flightSuretyApp.address,
            })
        );

        assert.equal(isFunded, false, "Airline has not sent enough ether to be funded");
    });

    it("(airline) cannot register an Airline using registerAirline() if it is not funded", async () => {
        const newAirline = accounts[2];
        try {
            await config.flightSuretyApp.registerAirline(newAirline, "Airline 2", { from: config.firstAirline });
            assert.fail("Should fail to register if registerer is not funded");
        } catch {
            const [isRegistered] = Object.values(
                await config.flightSuretyApp.isRegistered.call(newAirline, { from: config.flightSuretyApp.address })
            );
            assert.equal(isRegistered, false, "Only airlines with funding should be able to register airlines");
        }
    });

    it("(airline) is funded if it sends 10 or more more ether", async () => {
        const tenEther = web3.utils.toWei("10", "ether");
        await config.flightSuretyApp.fundAirline({
            from: config.firstAirline,
            value: tenEther,
            nonce: await web3.eth.getTransactionCount(config.firstAirline),
        });
        const [isFunded] = Object.values(
            await config.flightSuretyApp.isFunded.call(config.firstAirline, {
                from: config.flightSuretyApp.address,
            })
        );
        assert.equal(isFunded, true, "Airline has sent enough ether to be funded");
        const fundedAirlinesCount = await config.flightSuretyData.fundedAirlinesCount.call();
        if (fundedAirlinesCount <= 0) assert.fail("Should increment fundedAirlinesCount");
    });

    it("(airline) can register another Airline using registerAirline() if it is funded", async () => {
        const newAirline = accounts[2];

        await config.flightSuretyApp.registerAirline(newAirline, "Airline 2", {
            from: config.firstAirline,
        });

        const [isRegistered] = Object.values(
            await config.flightSuretyApp.isRegistered.call(newAirline, { from: config.flightSuretyApp.address })
        );

        assert.equal(isRegistered, true, "Funded airline should be able to register an airline");

        const [isFunded] = Object.values(await config.flightSuretyApp.isFunded.call(newAirline, { from: config.flightSuretyApp.address }));

        assert.equal(isFunded, false, "New airline should not be funded after registeration immedietly");
    });
});
