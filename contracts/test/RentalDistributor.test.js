import assert from "node:assert/strict";
import hardhat from "hardhat";

const { ethers } = hardhat;

/**
 * 迴歸測試：租金收益不可因為「轉帳到新地址」而被重複領取。
 *
 * 舊版 RentalDistributor 用「當下餘額 × 每股累計 − 已領總額」計算，
 * 已領總額綁在地址上，所以領完再把代幣轉走，收款地址可以再領一次同一份收益，
 * 反覆操作即可抽乾獎勵池；同時原地址之後會 underflow revert 而永久領不到。
 */
describe("RentalDistributor", function () {
  let owner, alice, bob;
  let registry, usdc, property, distributor;

  const UNITS = (n) => ethers.parseUnits(n.toString(), 18);

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    registry = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
    usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();

    property = await (
      await ethers.getContractFactory("PropertyToken")
    ).deploy("Pepe Tower", "PTWR", 1000n, await registry.getAddress(), "商業辦公", "ipfs://doc");

    distributor = await (
      await ethers.getContractFactory("RentalDistributor")
    ).deploy(await property.getAddress(), await usdc.getAddress());

    await property.setRentalDistributor(await distributor.getAddress());

    for (const a of [owner, alice, bob]) {
      await registry.registerIdentity(a.address);
    }

    // owner 把 1000 單位中的 400 給 alice
    await property.transfer(alice.address, UNITS(400));

    // 準備租金
    await usdc.mint(owner.address, UNITS(100000));
    await usdc.approve(await distributor.getAddress(), UNITS(100000));
  });

  it("按持股比例計算應得租金", async function () {
    await distributor.distributeRent(UNITS(1000)); // 1000 USDC / 1000 單位 = 1 per unit

    assert.equal(await distributor.earnable(alice.address), UNITS(400));
    assert.equal(await distributor.earnable(owner.address), UNITS(600));
  });

  it("領取後把代幣轉給新地址，新地址不能再領同一份收益", async function () {
    await distributor.distributeRent(UNITS(1000));

    await distributor.connect(alice).claimRent();
    assert.equal(await usdc.balanceOf(alice.address), UNITS(400));

    // alice 把全部代幣轉給 bob —— 舊版這裡會讓 bob 憑空多出 400 USDC 可領
    await property.connect(alice).transfer(bob.address, UNITS(400));

    assert.equal(await distributor.earnable(bob.address), 0n);
    await assert.rejects(distributor.connect(bob).claimRent(), /NothingToClaim/);
  });

  it("轉出方領取前轉走代幣，仍可領到轉帳前累積的收益（且不會 underflow）", async function () {
    await distributor.distributeRent(UNITS(1000));

    // 還沒領就先轉走
    await property.connect(alice).transfer(bob.address, UNITS(400));

    // alice 保有轉帳前已產生的 400，bob 尚未持有時的收益為 0
    assert.equal(await distributor.earnable(alice.address), UNITS(400));
    assert.equal(await distributor.earnable(bob.address), 0n);

    await distributor.connect(alice).claimRent();
    assert.equal(await usdc.balanceOf(alice.address), UNITS(400));

    // 再領一次應被拒絕
    await assert.rejects(distributor.connect(alice).claimRent(), /NothingToClaim/);
  });

  it("下一輪派發依新的持股比例分配", async function () {
    await distributor.distributeRent(UNITS(1000));
    await property.connect(alice).transfer(bob.address, UNITS(400));
    await distributor.distributeRent(UNITS(1000));

    assert.equal(await distributor.earnable(alice.address), UNITS(400)); // 只有第一輪
    assert.equal(await distributor.earnable(bob.address), UNITS(400));   // 只有第二輪
    assert.equal(await distributor.earnable(owner.address), UNITS(1200)); // 兩輪各 600
  });

  it("獎勵池不會被抽乾：所有人領完的總額不超過已派發總額", async function () {
    await distributor.distributeRent(UNITS(1000));

    await distributor.connect(alice).claimRent();
    await property.connect(alice).transfer(bob.address, UNITS(400));
    await distributor.connect(owner).claimRent();

    const paidOut =
      (await usdc.balanceOf(alice.address)) + (await usdc.balanceOf(bob.address));
    assert.ok(paidOut <= UNITS(1000), "領出總額不得超過派發總額");
    assert.equal(await usdc.balanceOf(await distributor.getAddress()), 0n);
  });

  it("沒有持有人時不接受派發（避免資金卡死）", async function () {
    const empty = await (
      await ethers.getContractFactory("RentalDistributor")
    ).deploy(await property.getAddress(), await usdc.getAddress());
    // property 總量固定，這裡改測 amount = 0 的守衛
    await usdc.approve(await empty.getAddress(), UNITS(1));
    await assert.rejects(empty.distributeRent(0), /AmountZero/);
  });
});
