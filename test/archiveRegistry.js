const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ArchiveRegistry", () => {
  const cid = "bafybeigdyrztx2kp44jzlp";
  const cidHash = ethers.keccak256(ethers.toUtf8Bytes(cid));

  async function deploy() {
    const [owner, submitter] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("ArchiveRegistry");
    const registry = await Registry.connect(owner).deploy();
    await registry.waitForDeployment();
    return { registry, owner, submitter };
  }

  it("stores submissions and emits event", async () => {
    const { registry, submitter } = await deploy();
    const tx = await registry.connect(submitter).submit(cidHash, "docType1");
    await expect(tx)
      .to.emit(registry, "Submitted")
      .withArgs(1, cidHash, submitter.address, "docType1");
    const record = await registry.records(1);
    expect(record.cidHash).to.equal(cidHash);
    expect(record.submitter).to.equal(submitter.address);
    expect(record.status).to.equal(0); // Pending
  });

  it("allows owner to approve or reject once", async () => {
    const { registry, owner, submitter } = await deploy();
    await registry.connect(submitter).submit(cidHash, "docType1");
    await expect(registry.connect(owner).approve(1)).to.emit(registry, "Decided");
    const record = await registry.records(1);
    expect(record.status).to.equal(1); // Approved
    await expect(registry.connect(owner).approve(1)).to.be.revertedWith("already decided");
  });

  it("blocks non-owner decisions", async () => {
    const { registry, submitter } = await deploy();
    await registry.connect(submitter).submit(cidHash, "docType1");
    await expect(
      registry.connect(submitter).approve(1)
    ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount").withArgs(submitter.address);
  });
});
