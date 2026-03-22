// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IdentityRegistry
 * @dev A mock implementation of the ERC-3643 Identity Registry.
 *      In a real-world scenario, this would use the ONCHAINID standard,
 *      but for this demo, it simply maps addresses to a KYC status.
 */
contract IdentityRegistry is Ownable {
    mapping(address => bool) public isVerified;

    event IdentityVerified(address indexed user);
    event IdentityRevoked(address indexed user);

    constructor() Ownable(msg.sender) {}

    function registerIdentity(address _user) external onlyOwner {
        isVerified[_user] = true;
        emit IdentityVerified(_user);
    }

    function revokeIdentity(address _user) external onlyOwner {
        isVerified[_user] = false;
        emit IdentityRevoked(_user);
    }

    function checkIdentity(address _user) external view returns (bool) {
        return isVerified[_user];
    }
}
