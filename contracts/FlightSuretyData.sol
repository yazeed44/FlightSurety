// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14 .0;

contract FlightSuretyData {
    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    struct Airline {
        address airlineAddress;
        string name;
        bool isRegistered;
        bool isFunded;
        uint256 amountFunded;
    }

    struct Flight {
        string name;
        bool isRegistered;
        uint8 statusCode;
        uint256 updatedTimestamp;
        address airlineAddress;
        string from;
        string to;
    }

    mapping(address => bool) private appContracts;

    address private contractOwner; // Account used to deploy contract
    bool private operational = true; // Blocks all state changes throughout the contract if false
    mapping(address => Airline) public airlines;
    uint256 public airlinesCount = 0;
    mapping(address => uint256) private votes;
    mapping(address => address[]) private voters;
    uint256 public registeredAirlinesCount = 0;
    uint256 public fundedAirlinesCount = 0;

    mapping(bytes32 => Flight) private flights; // key (airline, flight, timestamp)
    Flight[] public flightsArray;

    mapping(bytes32 => uint256) public insurances; // key (passenger, flightkey) -> amount of insurance

    mapping(address => uint256) private payouts; // passenger address -> amount to be paid out from insurance
    mapping(bytes32 => address[]) private passengers; // flight key -> passengers

    uint256 private totalFunds = 0;

    uint8 private constant STATUS_CODE_LATE_AIRLINE = 20;

    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/

    event AirlineSentFunds(address airlineAddress, uint256 amount, uint256 totalsent);
    event AirlineRegisteration(address airlineAddress, string airlineName);
    event AirlineFunded(address airlineAddress, string airlineName);

    event FlightRegistered(Flight flight, bytes32 key);
    event InsuranceBought(address passenger, string flightName, bytes32 key, uint256 amount);
    event CreditInsurees(address passengerAddress, string flightName, uint256 payout);

    /**
     * @dev Constructor
     *      The deploying account becomes contractOwner
     */
    constructor(address firstAirlineAddress, string memory firstAirlineName) {
        contractOwner = msg.sender;
        Airline memory firstAirline = Airline({
            airlineAddress: firstAirlineAddress,
            name: firstAirlineName,
            isRegistered: true,
            isFunded: false,
            amountFunded: 0
        });
        airlines[firstAirlineAddress] = firstAirline;
        airlinesCount++;
        registeredAirlinesCount++;
        emit AirlineRegisteration(firstAirlineAddress, firstAirlineName);
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
     * @dev Modifier that requires the "operational" boolean variable to be "true"
     *      This is used on all state changing functions to pause the contract in
     *      the event there is an issue that needs to be fixed
     */
    modifier requireIsOperational() {
        require(operational, "Contract is currently not operational");
        _; // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
     * @dev Modifier that requires the "ContractOwner" account to be the function caller
     */
    modifier requireContractOwner() {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    modifier requireAppCaller() {
        require(appContracts[msg.sender], "Caller has no authorization");
        _;
    }

    modifier requireAirlineToBeFunded(address airlineAddress) {
        require(airlines[airlineAddress].isFunded, "Caller is not a funded airline");
        _;
    }

    modifier requireAirlineToBeRegistered(address airlineAddress) {
        require(airlines[airlineAddress].isRegistered, "Airline is not registered");
        _;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
     * @dev Add an app contract that can call into this contract
     */

    function authorizeCaller(address appAddress) external requireContractOwner {
        appContracts[appAddress] = true;
    }

    function isCallerAuthorized(address appAddress) external view returns (bool) {
        return appContracts[appAddress];
    }

    /**
     * @dev Add an app contract that can call into this contract
     */
    function deauthorizeCaller(address appAddress) external requireContractOwner {
        delete appContracts[appAddress];
    }

    /**
     * @dev Get operating status of contract
     *
     * @return A bool that is the current operating status
     */
    function isOperational() public view returns (bool) {
        return operational;
    }

    /**
     * @dev Sets contract operations on/off
     *
     * When operational mode is disabled, all write transactions except for this one will fail
     */
    function setOperatingStatus(bool mode) external requireContractOwner {
        operational = mode;
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    /**
     * @dev Add an airline to the registration queue
     *      Can only be called from FlightSuretyApp contract
     *
     */
    function registerAirline(
        address registererAirlineAddress,
        address airlineAddress,
        string calldata airlineName
    ) external requireIsOperational requireAppCaller returns (bool, uint256) {
        require(!airlines[airlineAddress].isRegistered, "This airline has been registered");

        if (airlinesCount < 4) {
            require(airlines[registererAirlineAddress].isFunded, "Registerer is not funded");
            airlines[airlineAddress] = Airline({
                airlineAddress: airlineAddress,
                name: airlineName,
                isRegistered: true,
                isFunded: false,
                amountFunded: 0
            });
            airlinesCount += 1;
            emit AirlineRegisteration(airlineAddress, airlineName);
            return (true, 0);
        } else if (registererAirlineAddress != airlineAddress) {
            require(airlines[registererAirlineAddress].isFunded, "Registerer is not a funded airline");

            // Need to check if registerer has voted for this airline before
            address[] memory airlineVotes_ = voters[airlineAddress];
            bool found = false;
            for (uint256 idx = 0; idx < airlineVotes_.length; idx++) {
                if (registererAirlineAddress == airlineVotes_[idx]) {
                    found = true;
                    break;
                }
            }
            require(!found, "Registerer already voted for this airline");
        }

        Airline memory savedAirline = airlines[airlineAddress];

        if (savedAirline.airlineAddress != airlineAddress) {
            airlines[airlineAddress] = Airline({
                airlineAddress: airlineAddress,
                name: airlineName,
                isRegistered: true,
                isFunded: false,
                amountFunded: 0
            });
            voters[airlineAddress] = new address[](0);
            if (airlines[registererAirlineAddress].isFunded) {
                voters[airlineAddress].push(registererAirlineAddress);
                votes[airlineAddress] = 1;
            }
            airlinesCount += 1;
            return (false, 1);
        }

        uint256 airlineVotes = votes[airlineAddress];

        if (airlines[registererAirlineAddress].isFunded) {
            voters[airlineAddress].push(registererAirlineAddress);
            votes[airlineAddress] += 1;
        }

        if (votes[airlineAddress] > fundedAirlinesCount / 2) {
            airlines[airlineAddress].isRegistered = true;
            registeredAirlinesCount += 1;
            delete votes[airlineAddress];
            delete voters[airlineAddress];
            emit AirlineRegisteration(airlineAddress, airlines[airlineAddress].name);
            return (true, 0);
        } else {
            return (false, airlineVotes + 1);
        }
    }

    /**
     * @dev Buy insurance for a flight
     *
     */
    function buyInsurance(
        address passengerAddress,
        address airlineAddress,
        string calldata flightName,
        uint256 timestamp
    ) external payable requireIsOperational requireAppCaller requireAirlineToBeFunded(airlineAddress) returns (bool) {
        require(msg.value > 0, "Insurance has to be more than 0");
        bytes32 flightKey = getFlightKey(airlineAddress, flightName, timestamp);
        require(flights[flightKey].isRegistered && flights[flightKey].statusCode == 0, "Cannot insure a landed flight");

        bytes32 insuranceKey = getInsuranceKey(passengerAddress, flightKey);
        require(insurances[insuranceKey] == 0, "Insurance is bought already");

        insurances[insuranceKey] = msg.value;
        passengers[flightKey].push(passengerAddress);

        emit InsuranceBought(passengerAddress, flightName, flightKey, msg.value);

        return true;
    }

    /**
     *  @dev Credits payouts to insurees
     */
    function creditInsurees(
        address airlineAddress,
        string calldata flightName,
        uint256 timestamp
    ) external {
        bytes32 flightKey = getFlightKey(airlineAddress, flightName, timestamp);
        require(flights[flightKey].statusCode == STATUS_CODE_LATE_AIRLINE, "No credit if late due to reasons other than airline");
        address[] memory flightPassengers = passengers[flightKey];
        for (uint256 idx = 0; idx < flightPassengers.length; idx++) {
            bytes32 insuranceKey = getInsuranceKey(flightPassengers[idx], flightKey);
            if (insurances[insuranceKey] > 0) {
                uint256 payoutAmount = (insurances[insuranceKey] * 3) / 2;
                totalFunds -= payoutAmount; // this can run out
                payouts[flightPassengers[idx]] += payoutAmount;
                insurances[insuranceKey] = 0;
                emit CreditInsurees(flightPassengers[idx], flightName, payouts[flightPassengers[idx]]);
            }
        }
        passengers[flightKey] = new address[](0);
    }

    /**
     *  @dev Transfers eligible payout funds to insuree
     *
     */
    function payInsuree(address payable passengerAddress) external requireIsOperational requireAppCaller returns (uint256) {
        uint256 payout = payouts[passengerAddress];
        if (payout > 0) {
            payouts[passengerAddress] = 0;
            passengerAddress.transfer(payout);
            return payout;
        }
        return 0;
    }

    /**
     * @dev Initial funding for the insurance. Unless there are too many delayed flights
     *      resulting in insurance payouts, the contract should be self-sustaining
     *
     */
    function fund(address airlineAddress, uint256 funds)
        external
        payable
        requireIsOperational
        requireAppCaller
        requireAirlineToBeRegistered(airlineAddress)
        returns (bool)
    {
        require(funds > 0, "No funds were sent");
        require(airlines[airlineAddress].isRegistered, "Need to register an airline before funding");
        require(bytes(airlines[airlineAddress].name).length > 0, "airline needs to have a name");
        airlines[airlineAddress].amountFunded += funds;
        totalFunds += funds;
        emit AirlineSentFunds(airlineAddress, funds, airlines[airlineAddress].amountFunded);
        if (airlines[airlineAddress].amountFunded >= 10 ether) {
            airlines[airlineAddress].isFunded = true;
            fundedAirlinesCount++;
            emit AirlineFunded(airlineAddress, airlines[airlineAddress].name);
        }
        return airlines[airlineAddress].isFunded;
    }

    function getFlightKey(
        address airline,
        string memory flight,
        uint256 timestamp
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    function getInsuranceKey(address passengerAddress, bytes32 flightKey) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(passengerAddress, flightKey));
    }

    function getFlightStatus(
        address airlineAddress,
        string calldata flightName,
        uint256 timestamp
    ) external view returns (uint8) {
        bytes32 key = getFlightKey(airlineAddress, flightName, timestamp);

        return flights[key].statusCode;
    }

    function processFlightStatus(
        address airlineAddress,
        string calldata flightName,
        uint256 timestamp,
        uint8 newStatusCode
    ) external requireIsOperational requireAppCaller {
        flights[getFlightKey(airlineAddress, flightName, timestamp)].statusCode = newStatusCode;
    }

    function registerFlight(
        address airlineAddress,
        string calldata flightName,
        uint256 timestamp,
        string memory from,
        string memory to
    ) external requireIsOperational requireAppCaller requireAirlineToBeFunded(airlineAddress) returns (bytes32) {
        bytes32 key = getFlightKey(airlineAddress, flightName, timestamp);

        if (flights[key].isRegistered && flights[key].statusCode == 0) return key;

        Flight memory flight = Flight({
            name: flightName,
            isRegistered: true,
            statusCode: 0,
            updatedTimestamp: timestamp,
            airlineAddress: airlineAddress,
            from: from,
            to: to
        });
        flights[key] = flight;
        flightsArray.push(flight);

        passengers[key] = new address[](0);

        emit FlightRegistered(flight, key);

        return key;
    }

    function hasVoted(address votingAirline, address airlineToVoteTo) public view requireAppCaller returns (bool) {
        address[] memory airlineVotes = voters[airlineToVoteTo];

        for (uint256 idx = 0; idx < airlineVotes.length; idx++) if (votingAirline == airlineVotes[idx]) return true;
        return false;
    }

    function votesCount(address airlineAddress) public view requireAppCaller returns (uint256) {
        return votes[airlineAddress];
    }

    function isAirlineRegistered(address airlineAddress) external view requireAppCaller returns (bool, uint256) {
        return (airlines[airlineAddress].isRegistered, airlinesCount);
    }

    function isAirlineFunded(address airlineAddress) external view requireAppCaller returns (bool, uint256) {
        return (airlines[airlineAddress].isFunded, fundedAirlinesCount);
    }

    function insuredAmount(
        address passengerAddress,
        address airlineAddress,
        string calldata flightName,
        uint256 timestamp
    ) external view requireIsOperational requireAppCaller returns (uint256) {
        bytes32 insuranceKey = getInsuranceKey(passengerAddress, getFlightKey(airlineAddress, flightName, timestamp));
        return insurances[insuranceKey];
    }

    function getFlightsArray() external view requireIsOperational returns (Flight[] memory) {
        return flightsArray;
    }
}
