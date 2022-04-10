// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14 .0;

/************************************************** */
/* FlightSurety Smart Contract                      */
/************************************************** */

import "./FlightSuretyData.sol";

contract FlightSuretyApp {
    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    // Flight status codees
    uint8 private constant STATUS_CODE_UNKNOWN = 0;
    uint8 private constant STATUS_CODE_ON_TIME = 10;
    uint8 private constant STATUS_CODE_LATE_AIRLINE = 20;
    uint8 private constant STATUS_CODE_LATE_WEATHER = 30;
    uint8 private constant STATUS_CODE_LATE_TECHNICAL = 40;
    uint8 private constant STATUS_CODE_LATE_OTHER = 50;

    address private contractOwner; // Account used to deploy contract
    FlightSuretyData private dataContract; // Contract that holds all the data
    struct Flight {
        bool isRegistered;
        uint8 statusCode;
        uint256 updatedTimestamp;
        address airline;
    }
    mapping(bytes32 => Flight) private flights;

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
        require(dataContract.isOperational(), "Contract is not operational");
        _; // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
     * @dev Modifier that requires the "ContractOwner" account to be the function caller
     */
    modifier requireContractOwner() {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    /********************************************************************************************/
    /*                                       CONSTRUCTOR                                        */
    /********************************************************************************************/

    /**
     * @dev Contract constructor
     *
     */
    constructor(address payable dataContract_) {
        contractOwner = msg.sender;
        dataContract = FlightSuretyData(dataContract_);
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    function isOperational() public view returns (bool) {
        return dataContract.isOperational();
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    /**
     * @dev Register a future flight for insuring.
     *
     */
    function registerFlight(
        string calldata flightName,
        uint256 timestamp,
        string memory from,
        string memory to
    ) public returns (bytes32) {
        return dataContract.registerFlight(msg.sender, flightName, timestamp, from, to);
    }

    /**
     * @dev Called after oracle has updated flight status
     *
     */
    function processFlightStatus(
        address airlineAddress,
        string memory flightName,
        uint256 timestamp,
        uint8 statusCode
    ) internal {
        dataContract.processFlightStatus(airlineAddress, flightName, timestamp, statusCode);
        if (statusCode == STATUS_CODE_LATE_AIRLINE) {
            dataContract.creditInsurees(airlineAddress, flightName, timestamp);
        }
    }

    // Generate a request for oracles to fetch flight information
    function fetchFlightStatus(
        address airline,
        string memory flight,
        uint256 timestamp
    ) external {
        uint8 index = getRandomIndex(msg.sender);

        // Generate a unique key for storing the request
        bytes32 key = keccak256(abi.encodePacked(index, airline, flight, timestamp));
        ResponseInfo storage response = oracleResponses[key];
        response.requester = msg.sender;
        response.isOpen = true;

        emit OracleRequest(index, airline, flight, timestamp);
    }

    function getFlightStatus(
        address airlineAddress,
        string calldata flightName,
        uint256 timestamp
    ) external view returns (uint8) {
        return dataContract.getFlightStatus(airlineAddress, flightName, timestamp);
    }

    // region ORACLE MANAGEMENT

    // Incremented to add pseudo-randomness at various points
    uint8 private nonce = 0;

    // Fee to be paid when registering oracle
    uint256 public constant ORACLE_REGISTRATION_FEE = 1 ether;

    // Number of oracles that must respond for valid status
    uint256 private constant MIN_RESPONSES = 3;

    struct Oracle {
        bool isRegistered;
        uint8[3] indexes;
    }

    // Track all registered oracles
    mapping(address => Oracle) private oracles;

    // Model for responses from oracles
    struct ResponseInfo {
        address requester; // Account that requested status
        bool isOpen; // If open, oracle responses are accepted
        mapping(uint8 => address[]) responses; // Mapping key is the status code reported
        // This lets us group responses and identify
        // the response that majority of the oracles
    }

    // Track all oracle responses
    // Key = hash(index, flight, timestamp)
    mapping(bytes32 => ResponseInfo) private oracleResponses;

    // Event fired each time an oracle submits a response
    event FlightStatusInfo(address airline, string flight, uint256 timestamp, uint8 status);

    event OracleReport(address airline, string flight, uint256 timestamp, uint8 status);

    // Event fired when flight status request is submitted
    // Oracles track this and if they have a matching index
    // they fetch data and submit a response
    event OracleRequest(uint8 indexed index, address airline, string flight, uint256 timestamp);

    event PaidInsuree(address passengerAddress, uint256 payout);

    // Register an oracle with the contract
    function registerOracle() external payable {
        // Require registration fee
        require(msg.value >= ORACLE_REGISTRATION_FEE, "Registration fee is required");

        uint8[3] memory indexes = generateIndexes(msg.sender);

        oracles[msg.sender] = Oracle({isRegistered: true, indexes: indexes});
    }

    function getMyIndexes() external view returns (uint8[3] memory) {
        require(oracles[msg.sender].isRegistered, "Not registered as an oracle");

        return oracles[msg.sender].indexes;
    }

    // Called by oracle when a response is available to an outstanding request
    // For the response to be accepted, there must be a pending request that is open
    // and matches one of the three Indexes randomly assigned to the oracle at the
    // time of registration (i.e. uninvited oracles are not welcome)
    function submitOracleResponse(
        uint8 index,
        address airline,
        string memory flight,
        uint256 timestamp,
        uint8 statusCode
    ) external {
        require(
            (oracles[msg.sender].indexes[0] == index) ||
                (oracles[msg.sender].indexes[1] == index) ||
                (oracles[msg.sender].indexes[2] == index),
            "Index does not match oracle request"
        );

        bytes32 key = keccak256(abi.encodePacked(index, airline, flight, timestamp));
        require(oracleResponses[key].isOpen, "Flight or timestamp do not match oracle request");

        oracleResponses[key].responses[statusCode].push(msg.sender);

        // Information isn't considered verified until at least MIN_RESPONSES
        // oracles respond with the *** same *** information
        emit OracleReport(airline, flight, timestamp, statusCode);
        if (oracleResponses[key].responses[statusCode].length >= MIN_RESPONSES) {
            emit FlightStatusInfo(airline, flight, timestamp, statusCode);

            // Handle flight status as appropriate
            processFlightStatus(airline, flight, timestamp, statusCode);
        }
    }

    function getFlightKey(
        address airline,
        string memory flight,
        uint256 timestamp
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    // Returns array of three non-duplicating integers from 0-9
    function generateIndexes(address account) internal returns (uint8[3] memory) {
        uint8[3] memory indexes;
        indexes[0] = getRandomIndex(account);

        indexes[1] = indexes[0];
        while (indexes[1] == indexes[0]) {
            indexes[1] = getRandomIndex(account);
        }

        indexes[2] = indexes[1];
        while ((indexes[2] == indexes[0]) || (indexes[2] == indexes[1])) {
            indexes[2] = getRandomIndex(account);
        }

        return indexes;
    }

    // Returns array of three non-duplicating integers from 0-9
    function getRandomIndex(address account) internal returns (uint8) {
        uint8 maxValue = 10;

        // Pseudo random number...the incrementing nonce adds variation
        uint8 random = uint8(uint256(keccak256(abi.encodePacked(blockhash(block.number - nonce++), account))) % maxValue);

        if (nonce > 250) {
            nonce = 0; // Can only fetch blockhashes for last 256 blocks so we adapt
        }

        return random;
    }

    fallback() external payable {
        payable(address(dataContract)).transfer(msg.value);
    }

    receive() external payable {
        payable(address(dataContract)).transfer(msg.value);
    }

    // endregion

    /**
     * @dev Add an airline to the registration queue
     *
     */
    function registerAirline(address airline, string calldata name) external returns (bool success, uint256 votes) {
        return dataContract.registerAirline(msg.sender, airline, name);
    }

    function fundAirline() public payable returns (bool) {
        return dataContract.fund(msg.sender, msg.value);
    }

    function hasVoted(address airlineAddress) public view returns (bool) {
        return dataContract.hasVoted(msg.sender, airlineAddress);
    }

    function votesCount(address airlineAddress) public view returns (uint256) {
        return dataContract.votesCount(airlineAddress);
    }

    function isRegistered(address airlineAddress) public view returns (bool, uint256) {
        return dataContract.isAirlineRegistered(airlineAddress);
    }

    function isFunded(address airlineAddress) public view returns (bool, uint256) {
        return dataContract.isAirlineFunded(airlineAddress);
    }

    // called by a passenger
    function buyInsurance(
        address airlineAddress,
        string memory flightName,
        uint256 timestamp
    ) public payable returns (bool) {
        // Require insurance amount, 0 to 1 ether.
        require(msg.value > 0, "Did not receive insurance amount");

        // is it more than it should be?
        uint256 value = msg.value;
        uint256 retvalue = 0;
        if (value > 1 ether) {
            value = 1 ether;
            retvalue = msg.value - 1 ether;
        }

        bool boughtInsurance = dataContract.buyInsurance{value: value}(msg.sender, airlineAddress, flightName, timestamp);
        if (retvalue > 0) payable(msg.sender).transfer(retvalue);

        return boughtInsurance;
    }

    function insuredAmount(
        address airline,
        string memory flight,
        uint256 timestamp
    ) public view returns (uint256) {
        return dataContract.insuredAmount(msg.sender, airline, flight, timestamp);
    }

    function payInsuree() public {
        uint256 payout = dataContract.payInsuree(payable(msg.sender));
        if (payout > 0) emit PaidInsuree(msg.sender, payout);
    }
}
