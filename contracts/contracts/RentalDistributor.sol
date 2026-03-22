// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PropertyToken.sol";

/**
 * @title RentalDistributor
 * @dev Handles the pro-rata distribution of rental income (USDC) 
 *      to PropertyToken holders.
 */
contract RentalDistributor is Ownable {
    PropertyToken public propertyToken;
    IERC20 public rewardToken; // e.g., MockUSDC

    uint256 public totalDistributed;
    mapping(address => uint256) public lastClaimedTotal;
    mapping(address => uint256) public accumulatedRewards;

    uint256 private rewardPerTokenStored;

    event RentDistributed(uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);

    constructor(address _propertyToken, address _rewardToken) Ownable(msg.sender) {
        propertyToken = PropertyToken(_propertyToken);
        rewardToken = IERC20(_rewardToken);
    }

    /**
     * @dev Admin deposits rent into the contract to be shared among holders.
     */
    function distributeRent(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Amount must be > 0");
        require(rewardToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");

        uint256 totalSupply = propertyToken.totalSupply();
        if (totalSupply > 0) {
            rewardPerTokenStored += (_amount * 1e18) / totalSupply;
        }
        totalDistributed += _amount;
        emit RentDistributed(_amount);
    }

    /**
     * @dev Returns how much rent a user can claim.
     */
    function earnable(address _account) public view returns (uint256) {
        uint256 balance = propertyToken.balanceOf(_account);
        return (balance * rewardPerTokenStored) / 1e18 - lastClaimedTotal[_account];
    }

    /**
     * @dev User claims their share of the rental income.
     */
    function claimRent() external {
        uint256 reward = earnable(msg.sender);
        require(reward > 0, "Nothing to claim");

        lastClaimedTotal[msg.sender] += reward;
        require(rewardToken.transfer(msg.sender, reward), "Transfer failed");

        emit RewardClaimed(msg.sender, reward);
    }
}
