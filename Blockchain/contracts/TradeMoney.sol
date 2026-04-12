// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

error UnAuthorized(string message);

contract TradeMoney is Ownable {
    address tradeLogic;
    mapping(address => uint256) pendingWithdrawals;

    error WithdrawFailed(string message);

    constructor() Ownable(msg.sender) {}

    modifier onlyTradeLogic {
        if (msg.sender != tradeLogic) revert UnAuthorized("Unauthorized access not allowed");
        _;
    }

    function addMoney(address entity, uint256 amount) external onlyTradeLogic {
        pendingWithdrawals[entity] += amount;
    }

    function withdraw() public {
        (bool withdrawn, ) = msg.sender.call{value: pendingWithdrawals[msg.sender]}("");
        if (!withdrawn)
            revert WithdrawFailed("Unknown error occurred while withdrawing");
    }
}
