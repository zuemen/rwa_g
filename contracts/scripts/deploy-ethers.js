import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
// 預設值是 Anvil 公開測試帳號 #0（本機開發用）。部署到任何非本機網路前
// 一定要改用環境變數 DEPLOYER_PRIVATE_KEY，切勿把真實私鑰寫進原始碼。
const PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const readArtifact = (contractName) => {
    const filePath = path.join(__dirname, `../artifacts/contracts/${contractName}.sol/${contractName}.json`);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  };

  const usdcArtifact = readArtifact("MockUSDC");
  const registryArtifact = readArtifact("IdentityRegistry");
  const propertyArtifact = readArtifact("PropertyToken");
  const distributorArtifact = readArtifact("RentalDistributor");

  let currentNonce = await provider.getTransactionCount(wallet.address);

  // 1. Deploy MockUSDC
  const USDCFactory = new ethers.ContractFactory(usdcArtifact.abi, usdcArtifact.bytecode, wallet);
  const usdc = await USDCFactory.deploy({ nonce: currentNonce++ });
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();

  // 2. Deploy IdentityRegistry
  const RegistryFactory = new ethers.ContractFactory(registryArtifact.abi, registryArtifact.bytecode, wallet);
  const registry = await RegistryFactory.deploy({ nonce: currentNonce++ });
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();

  // 3. Whitelist the deployer
  await (await registry.registerIdentity(wallet.address, { nonce: currentNonce++ })).wait();

  // 4. Deploy PropertyToken (Updated for Legal URI)
  const PropertyFactory = new ethers.ContractFactory(propertyArtifact.abi, propertyArtifact.bytecode, wallet);
  const property = await PropertyFactory.deploy(
    "123 Main St - Elite Series",
    "ELITE",
    1000000n, // 1M tokens
    registryAddress,
    "商業用：辦公室",
    "https://example.com/legal/property-valuation-report.pdf",
    { nonce: currentNonce++ }
  );
  await property.waitForDeployment();
  const propertyAddress = await property.getAddress();

  // 5. Deploy RentalDistributor
  const DistFactory = new ethers.ContractFactory(distributorArtifact.abi, distributorArtifact.bytecode, wallet);
  const distributor = await DistFactory.deploy(propertyAddress, usdcAddress, { nonce: currentNonce++ });
  await distributor.waitForDeployment();
  const distributorAddress = await distributor.getAddress();

  // 6. 把分配器綁到 PropertyToken：轉帳時會回呼 settle() 先結算雙方收益，
  //    避免「領完再轉到新地址重複領」的漏洞。
  await (await property.setRentalDistributor(distributorAddress, { nonce: currentNonce++ })).wait();

  // Pre-approve distributor
  await (await new ethers.Contract(usdcAddress, usdcArtifact.abi, wallet).approve(distributorAddress, ethers.MaxUint256, { nonce: currentNonce++ })).wait();

  const outputData = {
    addresses: {
      MockUSDC: usdcAddress,
      IdentityRegistry: registryAddress,
      PropertyToken: propertyAddress,
      RentalDistributor: distributorAddress
    },
    abis: {
      MockUSDC: usdcArtifact.abi,
      IdentityRegistry: registryArtifact.abi,
      PropertyToken: propertyArtifact.abi,
      RentalDistributor: distributorArtifact.abi
    }
  };

  fs.writeFileSync(path.join(__dirname, "..", "..", "deployed-contracts.json"), JSON.stringify(outputData, null, 2));
  console.log("Deployment Complete!");
}

main().catch(console.error);
