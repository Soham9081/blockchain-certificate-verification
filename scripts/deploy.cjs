const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const CertificateVerification = await hre.ethers.getContractFactory("CertificateVerification");
  const certificateVerification = await CertificateVerification.deploy();

  await certificateVerification.waitForDeployment();

  const address = await certificateVerification.getAddress();
  console.log(`Contract deployed to: ${address}`);

  // Automatically export contract address & ABI to frontend src/contractData.json
  const contractArtifact = await hre.artifacts.readArtifact("CertificateVerification");

  const contractData = {
    address: address,
    abi: contractArtifact.abi
  };

  const srcDir = path.join(__dirname, "..", "src");
  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(srcDir, "contractData.json"),
    JSON.stringify(contractData, null, 2)
  );
  console.log("Contract address and ABI saved to src/contractData.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
