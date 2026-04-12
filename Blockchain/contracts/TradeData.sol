// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

enum Role {
    NONE,
    IMPORT_CUSTOMS,
    EXPORT_CUSTOMS
}

enum DisputeAction {
    DISSOLVE,
    CANCEL
}

enum TradeState {
    NOT_STARTED,
    CREATED,
    EXPORTER_ACKNOWLEDGED,
    ARBITRATORS_ASSIGNED,
    IMPORTER_DEPOSITED,
    EXPORTER_SENT,
    EXPORT_CUSTOMS_RECEIVED,
    EXPORT_CUSTOMS_APPROVED,
    SHIPMENT_SENT,
    SHIPMENT_RECEIVED,
    IMPORT_CUSTOMS_RECEIVED,
    IMPORT_CUSTOMS_APPROVED,
    COMPLETED,
    CANCELLED
}

struct Trade {
    address exporter;
    address importer;
    address shipper;
    address import_customs;
    address export_customs;
    address disputer;
    bool isDisputed;
    TradeState tradeState;
    address[] arbitrators;
    uint256 amount;
}

struct Arbitrators {
    mapping (address => uint256) index;
    address[] list;
}

// errors
error UnAuthorized(string message);
error InvalidTrade(string message);
error InvalidParameter(string message);
error InvalidState(string message);
error InvalidArbitrator(string message);


contract TradeData is Ownable {
    // constants
    address tradeLogic;
    uint256 ethDollarValue = 2250;
    uint256 curArbitrator = 0;


    // state variables
    uint256 lastTradeId = 0;
    mapping (address => Role) roles;
    Arbitrators arbitrators;
    mapping (uint256 => Trade) trades;


    // modifiers
    modifier onlyTradeLogic() {
        if (msg.sender != tradeLogic) revert UnAuthorized("Not accessible via this smart contract");
        _;
    }


    // constructor
    constructor() Ownable(msg.sender) {}


    // owner only functions
    function addTradeLogic(address _tradeLogicAddress) external onlyOwner {
        tradeLogic = _tradeLogicAddress;
    }

    function setEthDollarValue(uint256 _ethDollarValue) external onlyOwner {
        ethDollarValue = _ethDollarValue;
    }

    function addImportCustoms(address _importCustoms) external onlyOwner {
        roles[_importCustoms] = Role.IMPORT_CUSTOMS;
    }

    function removeImportCustoms(address _importCustoms) external onlyOwner {
        delete roles[_importCustoms];
    }

    function addExportCustoms(address _exportCustoms) external onlyOwner {
        roles[_exportCustoms] = Role.EXPORT_CUSTOMS;
    }

    function removeExportCustoms(address _exportCustoms) external onlyOwner {
        delete roles[_exportCustoms];
    }

    function addArbitrator(address _arbitrator) external onlyOwner {
        if (arbitrators.list.length > 0 && arbitrators.list[arbitrators.index[_arbitrator]] == _arbitrator)
            revert InvalidState("Same arbitrator cannot be added again");
        arbitrators.index[_arbitrator] = arbitrators.list.length;
        arbitrators.list.push(_arbitrator);
    }

    function removeArbitrator(address _arbitrator) external onlyOwner {
        // checks
        if (arbitrators.index[_arbitrator] >= arbitrators.list.length || arbitrators.list[arbitrators.index[_arbitrator]] != _arbitrator) {
            revert InvalidArbitrator("No such arbitrator exists");
        }

        // remove arbitrator
        if (arbitrators.index[_arbitrator] != arbitrators.list.length - 1) {
            arbitrators.index[arbitrators.list[arbitrators.list.length - 1]] = arbitrators.index[_arbitrator];
            arbitrators.list[arbitrators.index[_arbitrator]] = arbitrators.list[arbitrators.list.length - 1];
        }
        arbitrators.list.pop();
        delete arbitrators.index[_arbitrator];
    }


    // Managing Trades
    function createTrade(
        uint256 _trade_id,
        address _importer,
        address _exporter,
        uint256 _amount
    )
    external
    onlyTradeLogic
    {
        // function checks first
        tradeNotExists(_trade_id);

        // variables
        uint256 num_of_arbitrators = getArbitrators(_amount);
        if (num_of_arbitrators > arbitrators.list.length)
            revert InvalidTrade("Insufficient number of arbitrators to proceed, try a smaller amount");

        // create trade
        trades[_trade_id] = Trade(
            _importer,
            _exporter,
            address(0),
            address(0),
            address(0),
            address(0),
            false,
            TradeState.CREATED,
            new address[](num_of_arbitrators),
            _amount
        );

        lastTradeId = _trade_id;
    }

    function acknowledgeTrade(
        uint256 _trade_id
    )
        external
        onlyTradeLogic
    {
        // function checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.CREATED);

        // acknowledge the trade
        trades[_trade_id].tradeState = TradeState.EXPORTER_ACKNOWLEDGED;
    }

    function assignArbitrators(
        uint256 _trade_id
    )
        external
        onlyTradeLogic
        returns (
            address[] memory selected_arbitrators
        )
    {
        // function checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.EXPORTER_ACKNOWLEDGED);

        // variables
        Trade storage trade = trades[_trade_id];
        uint256 num_of_arbitrators = trade.arbitrators.length;

        // custom checks
        if (num_of_arbitrators > arbitrators.list.length || arbitrators.list.length == 0)
            revert InvalidState("Insufficient number of arbitrators to proceed, try a smaller amount");

        curArbitrator = curArbitrator % arbitrators.list.length;

        // assign arbitrators
        for (uint256 i = 0; i < num_of_arbitrators; i++) {
            trade.arbitrators[i] = arbitrators.list[(i + curArbitrator) % arbitrators.list.length];
        }

        curArbitrator = (curArbitrator + num_of_arbitrators) % arbitrators.list.length;

        trade.tradeState = TradeState.ARBITRATORS_ASSIGNED;

        // return
        return trade.arbitrators;
    }

    function deposit(uint256 _trade_id) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.ARBITRATORS_ASSIGNED);

        // change trade state
        trades[_trade_id].tradeState = TradeState.IMPORTER_DEPOSITED;
    }

    function sent(uint256 _trade_id) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.IMPORTER_DEPOSITED);

        // change trade state
        trades[_trade_id].tradeState = TradeState.EXPORTER_SENT;
    }

    function exportCustomsReceived(uint256 _trade_id, address _export_customs) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.EXPORTER_SENT);

        // add exporter to trade
        trades[_trade_id].export_customs = _export_customs;

        // change trade state
        trades[_trade_id].tradeState = TradeState.EXPORT_CUSTOMS_RECEIVED;
    }

    function exportCustomsApproved(uint256 _trade_id) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.EXPORT_CUSTOMS_RECEIVED);

        // change trade state
        trades[_trade_id].tradeState = TradeState.EXPORT_CUSTOMS_APPROVED;
    }

    function shipmentSent(uint256 _trade_id, address _shipper) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.EXPORT_CUSTOMS_APPROVED);

        // add shipper to trade
        trades[_trade_id].shipper = _shipper;

        // change trade state
        trades[_trade_id].tradeState = TradeState.SHIPMENT_SENT;
    }

    function shipmentReceived(uint256 _trade_id) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.SHIPMENT_SENT);

        // change trade state
        trades[_trade_id].tradeState = TradeState.SHIPMENT_RECEIVED;
    }

    function importCustomsReceived(uint256 _trade_id, address _import_customs) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.SHIPMENT_RECEIVED);

        // add exporter to trade
        trades[_trade_id].import_customs = _import_customs;

        // change trade state
        trades[_trade_id].tradeState = TradeState.IMPORT_CUSTOMS_RECEIVED;
    }

    function importCustomsApproved(uint256 _trade_id) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.IMPORT_CUSTOMS_RECEIVED);

        // change trade state
        trades[_trade_id].tradeState = TradeState.IMPORT_CUSTOMS_APPROVED;
    }

    function completeTrade(uint256 _trade_id) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);
        isNotDisputed(_trade_id);
        lastTradeState(_trade_id, TradeState.IMPORT_CUSTOMS_APPROVED);

        // delete trade
        delete trades[_trade_id];
    }

    function solveDispute(uint256 _trade_id, DisputeAction disputeAction) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);
        isDisputed(_trade_id);

        // solve dispute
        if (disputeAction == DisputeAction.DISSOLVE) {
            // continue ahead
            trades[_trade_id].isDisputed = false;
            trades[_trade_id].disputer = address(0);
        } else if (disputeAction == DisputeAction.CANCEL) {
            // cancel trade by marking it cancelled then deleting it
            delete trades[_trade_id];
        }
    }

    function raiseDispute(uint256 _trade_id, address _disputer) external onlyTradeLogic {
        // checks
        tradeExists(_trade_id);

        // change trade state
        trades[_trade_id].isDisputed = true;
        trades[_trade_id].disputer = _disputer;
    }

    function checkTradeExists(uint256 _trade_id) external onlyTradeLogic view {
        if (trades[_trade_id].tradeState == TradeState.NOT_STARTED) revert InvalidTrade("No such trade exists");
    }

    function checkTradeNotExists(uint256 _trade_id) external onlyTradeLogic view {
        if (trades[_trade_id].tradeState != TradeState.NOT_STARTED) revert InvalidTrade("Trade with this id exists");
    }



    /*
    Getter functions only for logic contract
    */
    function getLastTradeId() external view onlyTradeLogic returns (uint256) {
        return lastTradeId;
    }

    function getTrade(uint256 _trade_id) external view onlyTradeLogic returns (Trade memory trade) {
        tradeExists(_trade_id);
        return trades[_trade_id];
    }

    function getRole(address _entity) external view onlyTradeLogic returns (Role) {
        return roles[_entity];
    }


    /*
    Helper Functions
    */
    function getArbitrators(uint256 _amount) internal view returns (uint256 num_of_arbitrators) {
        return uint256((_amount + ethDollarValue - 1) / (ethDollarValue * 1000));
    }

    function tradeExists(uint256 _trade_id) internal view {
        if (trades[_trade_id].tradeState == TradeState.NOT_STARTED) revert InvalidTrade("No such trade exists");
    }

    function tradeNotExists(uint256 _trade_id) internal view {
        if (trades[_trade_id].tradeState != TradeState.NOT_STARTED) revert InvalidTrade("Trade with this id exists");
    }

    function lastTradeState(uint256 _trade_id, TradeState tradeState) internal view {
        if (trades[_trade_id].tradeState != tradeState) revert InvalidState("Invalid trade state, cannot perform this step yet");
    }

    function isNotDisputed(uint256 _trade_id) internal view {
        if (trades[_trade_id].isDisputed) revert InvalidState("Cannot proceed, dispute in progress");
    }

    function isDisputed(uint256 _trade_id) internal view {
        if (!trades[_trade_id].isDisputed) revert InvalidState("Cannot proceed, no current dispute");
    }
}
