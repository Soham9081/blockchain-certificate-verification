const hre = require("hardhat");
const contractData = require("../src/contractData.json");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const contract = new hre.ethers.Contract(contractData.address, contractData.abi, signer);

  console.log("Issuer address:", signer.address);

  // 1. Issue CERT-001
  console.log("Issuing CERT-001...");
  const tx = await contract.issueCertificate("CERT-001", "Soham Tambe", "Blockchain Technology");
  const receipt = await tx.wait();
  console.log("Issued successfully! Tx hash:", receipt.hash);

  // 2. Verify CERT-001
  console.log("\nVerifying CERT-001:");
  const cert = await contract.verifyCertificate("CERT-001");
  console.log("Found:", cert.exists);
  console.log("Student:", cert.studentName);
  console.log("ID:", cert.certificateId);
  console.log("Course:", cert.courseName);
  console.log("Issue Date:", new Date(Number(cert.issueDate) * 1000).toLocaleString());
  console.log("Issuer:", cert.issuer);

  // 3. Verify CERT-999 (Non-existent)
  console.log("\nVerifying CERT-999 (Non-existent):");
  const certNotFound = await contract.verifyCertificate("CERT-999");
  console.log("Found exists flag:", certNotFound.exists);
  if (!certNotFound.exists) {
    console.log("Result: Certificate Not Found (as expected)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
