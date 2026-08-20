// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IdentityRegistry.sol";

interface IRentalSettler {
    function settle(address from, address to) external;
}

contract PropertyToken is ERC20, Ownable {
    IdentityRegistry public identityRegistry;

    /// @notice 租金分配器；設定後每次轉帳都會先讓它用轉帳前的餘額結算雙方收益，
    ///         避免「領完就把代幣轉到新地址再領一次」的重複領取攻擊。
    IRentalSettler public rentalDistributor;

    // 台灣法規要求：不動產說明書與估價報告存證
    string public legalDocumentURI; // 存儲於 IPFS 或官方存證連結
    string public propertyUsage;    // 建物用途：如「商業辦公」、「集合住宅」

    event RentalDistributorUpdated(address indexed distributor);

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

    /// @notice 綁定租金分配器（部署後由 owner 設定一次）
    function setRentalDistributor(address _distributor) external onlyOwner {
        rentalDistributor = IRentalSettler(_distributor);
        emit RentalDistributorUpdated(_distributor);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            require(identityRegistry.checkIdentity(from), "Sender failed KYC/AML check");
            require(identityRegistry.checkIdentity(to), "Receiver failed KYC/AML check");
        }
        // 先用「轉帳前」的餘額結算收益，再變更餘額
        if (address(rentalDistributor) != address(0)) {
            rentalDistributor.settle(from, to);
        }
        super._update(from, to, value);
    }

    function updateLegalDoc(string memory _newURI) external onlyOwner {
        legalDocumentURI = _newURI;
    }
}
