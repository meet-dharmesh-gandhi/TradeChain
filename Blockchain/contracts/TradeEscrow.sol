// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

enum TradeState {
    CREATED,
    EXPORTER_ACKNOWLEDGED,
    IMPORTER_DEPOSITED,
    EXPORTER_SENT,
    EXPORT_CUSTOMS_RECEIVED,
    EXPORT_CUSTOMS_APPROVED,
    SHIPMENT_SENT,
    SHIPMENT_RECEIVED,
    IMPORT_CUSTOMS_RECEIVED,
    IMPORT_CUSTOMS_APPROVED,
    COMPLETED,
    DISPUTED
}

enum Role {
    NONE,
    EXPORT_CUSTOM,
    IMPORT_CUSTOM,
    SHIPPER
}

struct Trade {
    address importer;
    address exporter;
    address importCustoms;
    address exportCustoms;
    address shipper;
    uint256 amount;
    TradeState tradeState;
}

contract TradeChain is ReentrancyGuard, Ownable {
    mapping (uint256 => Trade) public trades;
    mapping (address => Role) public roles;
    uint256 internal nextTradeId = 0;

    event TradeCreated(uint256 indexed tradeId, address indexed importer, address indexed exporter);
    event ExporterAcknowledged(uint256 indexed tradeId, address indexed exporter);
    event ImporterDeposited(uint256 indexed tradeId, address indexed importer, uint256 amount);
    event ExporterSent(uint256 indexed tradeId, address indexed exporter);
    event ExportCustomsReceived(uint256 indexed tradeId, address exportCustoms);
    event ExportCustomsApproved(uint256 indexed tradeId, address exportCustoms);
    event ShipmentSent(uint256 indexed tradeId, address exportCustoms);
    event ShipmentReceived(uint256 indexed tradeId, address importCustoms);
    event ImportCustomsReceived(uint256 indexed tradeId, address importCustoms);
    event ImportCustomsApproved(uint256 indexed tradeId, address importCustoms);
    event Completed(uint256 indexed tradeId, address indexed importer, address indexed exporter);
    event Disputed(uint256 indexed tradeId, address disputer);

    error InvalidState();
    error UnAuthorized();

    constructor() Ownable(msg.sender) {}

    function checkTradeExists(uint256 tradeId) internal view {
        require(tradeId < nextTradeId, "Trade does not exist");
        require(trades[tradeId].importer != address(0), "Trade does not exist");
    }

    function verifyExporter(uint256 tradeId, address exporter) internal view {
        require(trades[tradeId].exporter == exporter, "Exporter not part of this trade");
    }

    function verifyImporter(uint256 tradeId, address importer) internal view {
        require(trades[tradeId].importer == importer, "Importer not part of this trade");
    }

    function verifyLastStageReached(uint256 tradeId, TradeState tradeState) internal view {
        require(trades[tradeId].tradeState == tradeState, "Did not reach the required trade state");
    }

    function setTradeState(uint256 tradeId, TradeState tradeState) internal {
        trades[tradeId].tradeState = tradeState;
    }

    function verifyExportCustoms(address exportCustoms) internal view {
        require(roles[exportCustoms] == Role.EXPORT_CUSTOM, "Must be export customs");
    }

    function verifyImportCustoms(address importCustoms) internal view {
        require(roles[importCustoms] == Role.IMPORT_CUSTOM, "Must be import customs");
    }

    function verifyShipper(address shipper) internal view {
        require(roles[shipper] == Role.SHIPPER, "Must be a shipper");
    }

    function addImportCustoms(uint256 tradeId, address importCustoms) internal {
        trades[tradeId].importCustoms = importCustoms;
    }

    function addExportCustoms(uint256 tradeId, address exportCustoms) internal {
        trades[tradeId].exportCustoms = exportCustoms;
    }

    function addShipper(uint256 tradeId, address shipper) internal {
        trades[tradeId].shipper = shipper;
    }

    function createTrade(address exporter, uint256 price) public {
        require(exporter != address(0), "Invalid exporter address");

        Trade memory newTrade = Trade(msg.sender, exporter, address(0), address(0), address(0), price, TradeState.CREATED);
        trades[nextTradeId] = newTrade;

        emit TradeCreated(nextTradeId, msg.sender, exporter);

        nextTradeId++;
    }

    function acknowledgeTrade(uint256 tradeId) public {
        checkTradeExists(tradeId);
        verifyExporter(tradeId, msg.sender);
        verifyLastStageReached(tradeId, TradeState.CREATED);

        setTradeState(tradeId, TradeState.EXPORTER_ACKNOWLEDGED);

        emit ExporterAcknowledged(tradeId, msg.sender);
    }

    function deposit(uint256 tradeId) public payable {
        checkTradeExists(tradeId);
        verifyImporter(tradeId, msg.sender);
        verifyLastStageReached(tradeId, TradeState.EXPORTER_ACKNOWLEDGED);
        require(trades[tradeId].amount == msg.value, "Sent amount does not match agreed amount");

        setTradeState(tradeId, TradeState.IMPORTER_DEPOSITED);

        emit ImporterDeposited(tradeId, msg.sender, msg.value);
    }

    function export(uint256 tradeId) public {
        checkTradeExists(tradeId);
        verifyExporter(tradeId, msg.sender);
        verifyLastStageReached(tradeId, TradeState.IMPORTER_DEPOSITED);

        setTradeState(tradeId, TradeState.EXPORTER_SENT);

        emit ExporterSent(tradeId, msg.sender);
    }

    // Q: how do I verify that the incoming request is actually from a verified export customs?
    function customsReceived(uint256 tradeId) public {
        checkTradeExists(tradeId);

        if (trades[tradeId].tradeState == TradeState.EXPORTER_SENT) {
            // this means that this should be the export customs
            verifyExportCustoms(msg.sender);

            addExportCustoms(tradeId, msg.sender);
            setTradeState(tradeId, TradeState.EXPORT_CUSTOMS_RECEIVED);

            emit ExportCustomsReceived(tradeId, msg.sender);
        } else if (trades[tradeId].tradeState == TradeState.SHIPMENT_RECEIVED) {
            // this means that this should be the import customs
            verifyImportCustoms(msg.sender);

            addImportCustoms(tradeId, msg.sender);
            setTradeState(tradeId, TradeState.IMPORT_CUSTOMS_RECEIVED);

            emit ImportCustomsReceived(tradeId, msg.sender);
        } else {
            revert InvalidState();
        }
    }

    function customsApproved(uint256 tradeId) public {
        checkTradeExists(tradeId);

        if (trades[tradeId].tradeState == TradeState.EXPORT_CUSTOMS_RECEIVED) {
            // this means that this should be the export customs
            verifyExportCustoms(msg.sender);

            setTradeState(tradeId, TradeState.EXPORT_CUSTOMS_APPROVED);

            emit ExportCustomsApproved(tradeId, msg.sender);
        } else if (trades[tradeId].tradeState == TradeState.IMPORT_CUSTOMS_RECEIVED) {
            // this means that this should be the import customs
            verifyImportCustoms(msg.sender);

            setTradeState(tradeId, TradeState.IMPORT_CUSTOMS_APPROVED);

            emit ImportCustomsApproved(tradeId, msg.sender);
        } else {
            revert InvalidState();
        }
    }

    function sendShipment(uint256 tradeId) public {
        checkTradeExists(tradeId);
        verifyShipper(msg.sender);
        verifyLastStageReached(tradeId, TradeState.EXPORT_CUSTOMS_APPROVED);

        addShipper(tradeId, msg.sender);
        setTradeState(tradeId, TradeState.SHIPMENT_SENT);

        emit ShipmentSent(tradeId, msg.sender);
    }

    function receiveShipment(uint256 tradeId) public {
        checkTradeExists(tradeId);
        verifyShipper(msg.sender);
        verifyLastStageReached(tradeId, TradeState.SHIPMENT_SENT);

        setTradeState(tradeId, TradeState.SHIPMENT_RECEIVED);

        emit ShipmentReceived(tradeId, msg.sender);
    }

    function received(uint256 tradeId) public nonReentrant {
        checkTradeExists(tradeId);
        verifyImporter(tradeId, msg.sender);
        verifyLastStageReached(tradeId, TradeState.SHIPMENT_RECEIVED);

        setTradeState(tradeId, TradeState.COMPLETED);

        payExporter(tradeId);

        emit Completed(tradeId, msg.sender, trades[tradeId].exporter);
    }

    function payExporter(uint256 tradeId) internal {
        checkTradeExists(tradeId);

        Trade storage trade = trades[tradeId];
        (bool success, ) = trade.exporter.call{value: trade.amount}("");
        require(success, "Refund to exporter failed");
    }

    // logic pending, the item need to reach exporter and money needs to reach importer
    function dispute(uint256 tradeId) public {
        checkTradeExists(tradeId);
        require(trades[tradeId].tradeState != TradeState.COMPLETED, "Cannot dispute after the trade has completed");

        if (trades[tradeId].importer == msg.sender) {
            // importer wants to dispute
            setTradeState(tradeId, TradeState.DISPUTED);

            emit Disputed(tradeId, msg.sender);
        } else if (trades[tradeId].exporter == msg.sender) {
            // exporter wants to dispute
            setTradeState(tradeId, TradeState.DISPUTED);

            emit Disputed(tradeId, msg.sender);
        } else {
            revert UnAuthorized();
        }
    }

    function addExportCustoms(address customs) external onlyOwner {
        roles[customs] = Role.EXPORT_CUSTOM;
    }

    function addImportCustoms(address customs) external onlyOwner {
        roles[customs] = Role.IMPORT_CUSTOM;
    }

    function addShipper(address shipper) external onlyOwner {
        roles[shipper] = Role.SHIPPER;
    }

    function removeRole(address role) external onlyOwner {
        delete roles[role];
    }
}
