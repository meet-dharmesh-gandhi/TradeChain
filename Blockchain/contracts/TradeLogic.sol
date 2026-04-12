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

interface ITradeData {
    // getters
    function getLastTradeId() external view returns (uint256);
    function getTrade(uint256 _trade_id) external view returns (Trade memory trade);
    function getRole(address _entity) external view returns (Role);

    // actual data functions
    function createTrade(
        uint256 _trade_id,
        address _importer,
        address _exporter,
        uint256 _amount
    )
    external;
    function acknowledgeTrade(uint256 _trade_id) external;
    function assignArbitrators(
        uint256 _trade_id
    )
        external
        returns (address[] memory selected_arbitrators);
    function deposit(uint256 _trade_id) external;
    function sent(uint256 _trade_id) external;
    function exportCustomsReceived(uint256 _trade_id, address _export_customs) external;
    function exportCustomsApproved(uint256 _trade_id) external;
    function shipmentSent(uint256 _trade_id, address _shipper) external;
    function shipmentReceived(uint256 _trade_id) external;
    function importCustomsReceived(uint256 _trade_id, address _import_customs) external;
    function importCustomsApproved(uint256 _trade_id) external;
    function completeTrade(uint256 _trade_id) external;
    function solveDispute(uint256 _trade_id, DisputeAction disputeAction) external;
    function raiseDispute(uint256 _trade_id, address _disputer) external;
    function checkTradeExists(uint256 _trade_id) external view;
    function checkTradeNotExists(uint256 _trade_id) external view;
}

interface ITradeMoney {
    function addMoney(address entity, uint256 amount) external;
}

event tradeCreated(uint256 trade_id, address indexed importer, address indexed exporter, uint256 amount);
event arbitratorsAssigned(uint256 trade_id, address[] arbitrators);
event tradeStateChanged(uint256 trade_id, TradeState newState);
event entityIntroduced(address indexed entity, Role role);
event fundsGiven(address entity, uint256 amount);
event disputeRaised(uint256 trade_id);
event disputeResolved(uint256 trade_id, DisputeAction disputeAction);

error UnAuthorized(string message);
error InvalidParameter(string message);
error InvalidState(string message);
error InsufficientFunds(string message);

contract TradeLogic is Ownable {
    ITradeData dataContract;
    ITradeMoney moneyContract;
    uint64 shipperStake = 10;
    uint64 disputeStake = 20;

    constructor(address _dataContractAddress, address _moneyContractAddress) Ownable(msg.sender) {
        dataContract = ITradeData(_dataContractAddress);
        moneyContract = ITradeMoney(_moneyContractAddress);
    }


    /*
    Only owner functions
    */
    function setShipperStake(uint64 _shipperStake) external onlyOwner {
        shipperStake = _shipperStake;
    }

    function setDisputeStake(uint64 _disputeStake) external onlyOwner {
        disputeStake = _disputeStake;
    }


    /*
    Helper functions
    */
    function isValidAddress(address addr) internal pure {
        if (addr == address(0)) revert InvalidParameter("Invalid Address");
    }

    function isCorrectRole(address _addr, Role _role) internal view {
        Role role = dataContract.getRole(_addr);
        if (role == Role.NONE || role != _role)
            revert UnAuthorized("Role not authorized for this action");
    }

    function isArbitrator(Trade memory trade) internal view {
        bool foundArbitrator = false;
        for (uint256 i = 0; i < trade.arbitrators.length; i++) {
            if (msg.sender == trade.arbitrators[i]) {
                foundArbitrator = true;
                break;
            }
        }
        if (!foundArbitrator) revert UnAuthorized("Only arbitrator can perform this action");
    }


    /*
    Managing Trades
    */
    function createTrade(uint256 _trade_id, address _importer, address _exporter, uint256 _amount) public {
        // function checks
        isValidAddress(_importer);
        isValidAddress(_exporter);
        dataContract.checkTradeNotExists(_trade_id);

        // custom checks
        if (_trade_id == 0)
            revert InvalidParameter("Trade ID cannot be 0");
        if (_amount == 0)
            revert InvalidParameter("Trade amount cannot be 0");
        if (_importer == _exporter)
            revert InvalidState("Importer and Exporter cannot be different entities");

        // change data
        dataContract.createTrade(_trade_id, _importer, _exporter, _amount);

        // log change
        emit tradeCreated(_trade_id, _importer, _exporter, _amount);
    }

    function acknowledgeTrade(uint256 _trade_id)  public {
        // trade exists check
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (msg.sender != trade.exporter)
            revert UnAuthorized("Only the requested exporter can acknowledge");

        // change data
        dataContract.acknowledgeTrade(_trade_id);

        // log change
        emit tradeStateChanged(_trade_id, TradeState.EXPORTER_ACKNOWLEDGED);
    }

    function assignArbitrators(uint256 _trade_id) public {
        // checks
        dataContract.checkTradeExists(_trade_id);

        // change data
        address[] memory arbitrators = dataContract.assignArbitrators(_trade_id);

        // log change
        emit arbitratorsAssigned(_trade_id, arbitrators);
    }

    function importerDeposited(uint256 _trade_id) public payable {
        // checks
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (trade.importer != msg.sender)
            revert UnAuthorized("Unauthorized importer for this trade");

        // check money
        if (msg.value != trade.amount)
            revert InsufficientFunds("Insufficient funds to start trade");

        // change data
        dataContract.deposit(_trade_id);

        // log change
        emit tradeStateChanged(_trade_id, TradeState.IMPORTER_DEPOSITED);
    }

    function exporterSent(uint256 _trade_id) public {
        // checks
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (trade.exporter != msg.sender)
            revert UnAuthorized("Unauthorized exporter for this trade");

        // change data
        dataContract.sent(_trade_id);

        // log change
        emit tradeStateChanged(_trade_id, TradeState.EXPORTER_SENT);
    }

    function exportCustomsReceived(uint256 _trade_id) public {
        // checks
        isCorrectRole(msg.sender, Role.EXPORT_CUSTOMS);
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (
            msg.sender == trade.importer
            || msg.sender == trade.exporter
        )
            revert InvalidParameter("Invalid export customs");

        // change data
        dataContract.exportCustomsReceived(_trade_id, msg.sender);

        // log change
        emit entityIntroduced(msg.sender, Role.EXPORT_CUSTOMS);
    }

    function exportCustomsApproved(uint256 _trade_id) public {
        // checks
        isCorrectRole(msg.sender, Role.EXPORT_CUSTOMS);
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (msg.sender != trade.export_customs)
            revert UnAuthorized("Export customs not assigned for this trade");

        // change data
        dataContract.exportCustomsApproved(_trade_id);

        // log change
        emit tradeStateChanged(_trade_id, TradeState.EXPORT_CUSTOMS_APPROVED);
    }

    function shipmentSent(uint256 _trade_id) payable public {
        // checks
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (
            msg.sender == trade.importer
            || msg.sender == trade.exporter
            || msg.sender == trade.export_customs
        )
            revert InvalidParameter("Invalid shipper");
        if (msg.value != shipperStake)
            revert InsufficientFunds("Insufficient funds to start shipping");

        // change data
        dataContract.shipmentSent(_trade_id, msg.sender);

        // log change
        emit entityIntroduced(msg.sender, Role.NONE);
    }

    function shipmentReceived(uint256 _trade_id) public {
        // checks
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (trade.shipper != msg.sender)
            revert UnAuthorized("Unauthorized shipper for this trade");

        // change data
        dataContract.shipmentReceived(_trade_id);

        // log change
        emit tradeStateChanged(_trade_id, TradeState.SHIPMENT_RECEIVED);
    }

    function importCustomsReceived(uint256 _trade_id) public {
        // checks
        isCorrectRole(msg.sender, Role.IMPORT_CUSTOMS);
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (
            msg.sender == trade.importer
            || msg.sender == trade.exporter
            || msg.sender == trade.export_customs
            || msg.sender == trade.shipper
        )
            revert InvalidParameter("Invalid import customs");

        // change data
        dataContract.importCustomsReceived(_trade_id, msg.sender);

        // log change
        emit entityIntroduced(msg.sender, Role.IMPORT_CUSTOMS);
    }

    function importCustomsApproved(uint256 _trade_id) public {
        // checks
        isCorrectRole(msg.sender, Role.IMPORT_CUSTOMS);
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (msg.sender != trade.import_customs)
            revert UnAuthorized("Import customs not assigned for this trade");

        // change data
        dataContract.importCustomsApproved(_trade_id);

        // log change
        emit tradeStateChanged(_trade_id, TradeState.IMPORT_CUSTOMS_APPROVED);
    }

    function completeTrade(uint256 _trade_id) public {
        // checks
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (msg.sender != trade.importer)
            revert UnAuthorized("Importer not assigned for this trade");

        // calculate funds
        uint256 shipperFunds = 2 * (trade.amount / 100);
        uint256 exporterFunds = trade.amount - shipperFunds;

        // sends funds
        moneyContract.addMoney(trade.shipper, shipperFunds);
        moneyContract.addMoney(trade.exporter, exporterFunds);

        // change data
        dataContract.completeTrade(_trade_id);

        // log change
        emit fundsGiven(trade.shipper, shipperFunds);
        emit fundsGiven(trade.exporter, exporterFunds);
    }

    function raiseDispute(uint256 _trade_id) payable public {
        // checks
        if (msg.value != disputeStake)
            revert InsufficientFunds("Insufficient funds sent to raise a dispute");
        Trade memory trade = dataContract.getTrade(_trade_id);

        // custom checks
        if (msg.sender != trade.importer && msg.sender != trade.exporter)
            revert UnAuthorized("Dispute can only be raised by the exporter or importer");

        // change data
        dataContract.raiseDispute(_trade_id, msg.sender);

        // log change
        emit disputeRaised(_trade_id);
    }

    function dissolveDispute(uint256 _trade_id) public {
        // checks
        Trade memory trade = dataContract.getTrade(_trade_id);
        isArbitrator(trade);

        // give money back
        moneyContract.addMoney(trade.disputer, disputeStake);

        // change data
        dataContract.solveDispute(_trade_id, DisputeAction.DISSOLVE);

        // log change
        emit disputeResolved(_trade_id, DisputeAction.DISSOLVE);
    }

    function cancelDispute(uint256 _trade_id, uint256 importerFunds, uint256 exporterFunds, uint256 shipperFunds) public {
        // checks
        Trade memory trade = dataContract.getTrade(_trade_id);
        isArbitrator(trade);

        // custom checks
        if (importerFunds + exporterFunds + shipperFunds != trade.amount)
            revert InvalidParameter("Sum of importer funds, exporter funds and shipper funds should exactly equal trade amount");

        // transfer money
        moneyContract.addMoney(trade.importer, importerFunds);
        moneyContract.addMoney(trade.exporter, exporterFunds);
        moneyContract.addMoney(trade.shipper, shipperFunds);

        emit fundsGiven(trade.importer, importerFunds);
        emit fundsGiven(trade.exporter, exporterFunds);
        emit fundsGiven(trade.shipper, shipperFunds);

        // change data
        dataContract.solveDispute(_trade_id, DisputeAction.CANCEL);

        // log change
        emit disputeResolved(_trade_id, DisputeAction.CANCEL);
    }
}
