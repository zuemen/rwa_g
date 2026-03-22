import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy MockUSDC
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  // Deploy IdentityRegistry
  const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
  const registry = await IdentityRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("IdentityRegistry deployed to:", registryAddress);

  // Whitelist the deployer (so they can receive and transfer tokens)
  const tx = await registry.registerIdentity(deployer.address);
  await tx.wait();
  console.log("Deployer whitelisted in IdentityRegistry.");

  // Deploy PropertyToken
  const PropertyToken = await hre.ethers.getContractFactory("PropertyToken");
  const property = await PropertyToken.deploy(
    "123 Main St, Anytown - RealT Series",
    "MAIN",
    1000, // 1000 tokens representing the property
    registryAddress
  );
  await property.waitForDeployment();
  const propertyAddress = await property.getAddress();
  console.log("PropertyToken deployed to:", propertyAddress);

  // Save the deployed addresses for the backend/frontend to use
  const addresses = {
    MockUSDC: usdcAddress,
    IdentityRegistry: registryAddress,
    PropertyToken: propertyAddress,
  };

  const addressFilePath = path.join(__dirname, "..", "..", "deployed-addresses.json");
  fs.writeFileSync(addressFilePath, JSON.stringify(addresses, null, 2));
  console.log(`Addresses saved to ${addressFilePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
