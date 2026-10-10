const { expect } = require("chai");
const { ethers } = require("hardhat");

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const FAKE_HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

describe("CertificateVerification", function () {
  let contract;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const CertificateVerification = await ethers.getContractFactory("CertificateVerification");
    contract = await CertificateVerification.deploy();
    await contract.waitForDeployment();
  });

  it("1. Contract deploys", async function () {
    expect(await contract.getAddress()).to.be.properAddress;
    expect(await contract.certificateCount()).to.equal(0);
  });

  it("2. Certificate can be issued (no PDF)", async function () {
    await expect(contract.issueCertificate("CERT-001", "Soham Tambe", "Blockchain Technology", ZERO_HASH))
      .to.emit(contract, "CertificateIssued");
  });

  it("3. Certificate can be issued with document hash", async function () {
    await expect(contract.issueCertificate("CERT-002", "Soham Tambe", "Blockchain Technology", FAKE_HASH))
      .to.emit(contract, "CertificateIssued");
  });

  it("4. Certificate can be verified", async function () {
    await contract.issueCertificate("CERT-001", "Soham Tambe", "Blockchain Technology", ZERO_HASH);
    const cert = await contract.verifyCertificate("CERT-001");

    expect(cert.exists).to.be.true;
    expect(cert.certificateId).to.equal("CERT-001");
    expect(cert.studentName).to.equal("Soham Tambe");
    expect(cert.courseName).to.equal("Blockchain Technology");
    expect(cert.issuer).to.equal(owner.address);
    expect(cert.issueDate).to.be.greaterThan(0);
    expect(cert.documentHash).to.equal(ZERO_HASH);
  });

  it("5. Document hash is stored correctly", async function () {
    await contract.issueCertificate("CERT-003", "Alice", "AI and ML", FAKE_HASH);
    const cert = await contract.verifyCertificate("CERT-003");
    expect(cert.documentHash).to.equal(FAKE_HASH);
  });

  it("6. Duplicate certificate IDs are rejected", async function () {
    await contract.issueCertificate("CERT-001", "Soham Tambe", "Blockchain Technology", ZERO_HASH);
    await expect(
      contract.issueCertificate("CERT-001", "Another Student", "Cybersecurity", ZERO_HASH)
    ).to.be.revertedWith("Certificate ID already exists");
  });

  it("7. Certificate count increases", async function () {
    expect(await contract.certificateCount()).to.equal(0);
    await contract.issueCertificate("CERT-001", "Soham Tambe", "Blockchain Technology", ZERO_HASH);
    expect(await contract.certificateCount()).to.equal(1);
    await contract.issueCertificate("CERT-002", "Alex Smith", "AI and ML", ZERO_HASH);
    expect(await contract.certificateCount()).to.equal(2);
  });
});
