const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Registry = await hre.ethers.getContractFactory("ArchiveRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  console.log("ArchiveRegistry deployed to:", await registry.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
