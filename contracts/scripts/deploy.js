import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy MockUSDC
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  // 2. Deploy IdentityRegistry
  const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
  const registry = await IdentityRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("IdentityRegistry deployed to:", registryAddress);

  // Whitelist the deployer
  await (await registry.registerIdentity(deployer.address)).wait();
  console.log("Deployer whitelisted.");

  // 3. Deploy PropertyToken (6 arguments)
  const PropertyToken = await hre.ethers.getContractFactory("PropertyToken");
  const property = await PropertyToken.deploy(
    "Taipei 101 Financial Center",
    "T101",
    1000000, // initialSupply
    registryAddress,
    "Commercial Office",
    "https://ipfs.io/ipfs/QmExample..."
  );
  await property.waitForDeployment();
  const propertyAddress = await property.getAddress();
  console.log("PropertyToken deployed to:", propertyAddress);

  // 4. Deploy RentalDistributor
  const RentalDistributor = await hre.ethers.getContractFactory("RentalDistributor");
  const distributor = await RentalDistributor.deploy(propertyAddress, usdcAddress);
  await distributor.waitForDeployment();
  const distributorAddress = await distributor.getAddress();
  console.log("RentalDistributor deployed to:", distributorAddress);

  // Prepare deployment data
  const deploymentData = {
    addresses: {
      MockUSDC: usdcAddress,
      IdentityRegistry: registryAddress,
      PropertyToken: propertyAddress,
      RentalDistributor: distributorAddress
    },
    abis: {
      MockUSDC: (await hre.artifacts.readArtifact("MockUSDC")).abi,
      IdentityRegistry: (await hre.artifacts.readArtifact("IdentityRegistry")).abi,
      PropertyToken: (await hre.artifacts.readArtifact("PropertyToken")).abi,
      RentalDistributor: (await hre.artifacts.readArtifact("RentalDistributor")).abi
    }
  };

  const outputPath = path.join(__dirname, "..", "..", "deployed-contracts.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));
  console.log(`Deployment info saved to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
