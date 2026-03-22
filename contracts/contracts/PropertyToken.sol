// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IdentityRegistry.sol";

contract PropertyToken is ERC20, Ownable {
    IdentityRegistry public identityRegistry;
    
    // 台灣法規要求：不動產說明書與估價報告存證
    string public legalDocumentURI; // 存儲於 IPFS 或官方存證連結
    string public propertyUsage;    // 建物用途：如「商業辦公」、「集合住宅」
    
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address _identityRegistry,
        string memory _usage,
        string memory _docURI
    ) ERC20(name, symbol) Ownable(msg.sender) {
        identityRegistry = IdentityRegistry(_identityRegistry);
        propertyUsage = _usage;
        legalDocumentURI = _docURI;
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            require(identityRegistry.checkIdentity(from), "Sender failed KYC/AML check");
            require(identityRegistry.checkIdentity(to), "Receiver failed KYC/AML check");
        }
        super._update(from, to, value);
    }

    function updateLegalDoc(string memory _newURI) external onlyOwner {
        legalDocumentURI = _newURI;
    }
}
