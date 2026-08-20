// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PropertyToken.sol";

/**
 * @title RentalDistributor
 * @dev 依持股比例把租金收益（USDC）分配給 PropertyToken 持有人。
 *
 * 安全性說明（修正先前的重複領取漏洞）：
 *   舊版以「當下餘額 × 累計每股收益 − 已領總額」計算應得金額，而「已領總額」
 *   綁在地址上。持有人領完之後把代幣轉給新地址，新地址的已領總額為 0，
 *   於是同一份收益可以被反覆領取直到獎勵池被抽乾；同時原地址的計算會變成
 *   負值，在 0.8 的檢查算術下 underflow revert，讓它永遠再也領不到（DoS）。
 *
 *   這版改用標準的 rewardDebt（MasterChef/Synthetix）模式：每個帳戶記錄
 *   「上次結算時的每股累計值」，並在 PropertyToken 轉帳時由代幣合約回呼
 *   settle()，先把轉出方與轉入方的應得金額結算進 accruedRewards，
 *   再更新餘額。如此收益永遠跟著「產生收益當下的持有者」，轉帳不會複製收益。
 */
contract RentalDistributor is Ownable {
    using SafeERC20 for IERC20;

    uint256 private constant PRECISION = 1e18;

    PropertyToken public propertyToken;
    IERC20 public rewardToken; // e.g., MockUSDC

    uint256 public totalDistributed;

    /// @dev 每股累計收益（放大 PRECISION 倍）
    uint256 public rewardPerTokenStored;
    /// @dev 帳戶上次結算時的 rewardPerTokenStored
    mapping(address => uint256) public rewardPerTokenPaid;
    /// @dev 已結算但尚未提領的金額
    mapping(address => uint256) public accruedRewards;

    event RentDistributed(uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);

    error OnlyPropertyToken();
    error NothingToClaim();
    error AmountZero();
    error NoHolders();

    constructor(address _propertyToken, address _rewardToken) Ownable(msg.sender) {
        propertyToken = PropertyToken(_propertyToken);
        rewardToken = IERC20(_rewardToken);
    }

    /// @dev 只有掛鉤的 PropertyToken 可以呼叫 settle()
    modifier onlyPropertyToken() {
        if (msg.sender != address(propertyToken)) revert OnlyPropertyToken();
        _;
    }

    /// @dev 用「結算當下的餘額」把應得收益鎖進 accruedRewards
    function _updateReward(address account, uint256 balance) private {
        uint256 delta = rewardPerTokenStored - rewardPerTokenPaid[account];
        if (delta != 0 && balance != 0) {
            accruedRewards[account] += (balance * delta) / PRECISION;
        }
        rewardPerTokenPaid[account] = rewardPerTokenStored;
    }

    /**
     * @notice 由 PropertyToken 在轉帳「之前」呼叫，先用舊餘額結算雙方收益。
     * @dev 這是防止「轉帳複製收益」的關鍵：轉出後 from 的餘額變小、to 的變大，
     *      但雙方在此之前產生的收益都已鎖定，不會被重算。
     */
    function settle(address from, address to) external onlyPropertyToken {
        if (from != address(0)) _updateReward(from, propertyToken.balanceOf(from));
        if (to != address(0)) _updateReward(to, propertyToken.balanceOf(to));
    }

    /**
     * @dev 管理者存入租金，依比例分給所有持有人。
     */
    function distributeRent(uint256 _amount) external onlyOwner {
        if (_amount == 0) revert AmountZero();
        uint256 totalSupply = propertyToken.totalSupply();
        // 沒有任何持有人時直接擋下，否則這筆錢會永久卡在合約裡
        if (totalSupply == 0) revert NoHolders();

        rewardToken.safeTransferFrom(msg.sender, address(this), _amount);
        rewardPerTokenStored += (_amount * PRECISION) / totalSupply;
        totalDistributed += _amount;
        emit RentDistributed(_amount);
    }

    /**
     * @dev 查詢帳戶目前可領取的租金收益。
     */
    function earnable(address _account) public view returns (uint256) {
        uint256 balance = propertyToken.balanceOf(_account);
        uint256 delta = rewardPerTokenStored - rewardPerTokenPaid[_account];
        return accruedRewards[_account] + (balance * delta) / PRECISION;
    }

    /**
     * @dev 提領自己的租金收益。先結算再清零再轉帳（checks-effects-interactions）。
     */
    function claimRent() external {
        _updateReward(msg.sender, propertyToken.balanceOf(msg.sender));

        uint256 reward = accruedRewards[msg.sender];
        if (reward == 0) revert NothingToClaim();

        accruedRewards[msg.sender] = 0;
        rewardToken.safeTransfer(msg.sender, reward);

        emit RewardClaimed(msg.sender, reward);
    }
}
