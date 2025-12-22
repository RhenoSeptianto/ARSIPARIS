"use strict";

const { Contract } = require("fabric-contract-api");
const { ClientIdentity } = require("fabric-shim");

class ArchiveContract extends Contract {
  _getRole(ctx) {
    const cid = new ClientIdentity(ctx.stub);
    return cid.getAttributeValue("role") || "";
  }

  _requireRole(ctx, allowed) {
    const role = this._getRole(ctx);
    if (!allowed.includes(role)) {
      throw new Error(`Role ${role || "(none)"} tidak diizinkan`);
    }
  }

  async _getArchive(ctx, archiveId) {
    const data = await ctx.stub.getState(archiveId);
    if (!data || data.length === 0) return null;
    return JSON.parse(data.toString());
  }

  async RegisterArchive(ctx, archiveId, hashCipher, ipfsCID, owner, classification, status, timestamp) {
    this._requireRole(ctx, ["Uploader", "Admin"]);
    const cid = new ClientIdentity(ctx.stub);
    const requester = cid.getAttributeValue("username") || "";
    const role = this._getRole(ctx);
    if (role === "Uploader" && owner !== requester) {
      throw new Error("Owner tidak sesuai dengan identity uploader");
    }
    const exists = await this._getArchive(ctx, archiveId);
    if (exists) throw new Error("Archive sudah ada");

    const record = {
      archiveId,
      hashCipher,
      ipfsCID,
      owner,
      classification,
      status,
      timestamp,
      rejectionNote: "",
      approvals: [],
    };

    await ctx.stub.putState(archiveId, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent("ArchiveRegistered", Buffer.from(JSON.stringify({ archiveId, status })));
    return JSON.stringify(record);
  }

  async SubmitArchive(ctx, archiveId) {
    this._requireRole(ctx, ["Uploader", "Admin"]);
    const record = await this._getArchive(ctx, archiveId);
    if (!record) throw new Error("Archive tidak ditemukan");
    if (record.status !== "Draft") throw new Error("Hanya Draft yang bisa disubmit");
    const role = this._getRole(ctx);
    if (role === "Uploader") {
      const requester = new ClientIdentity(ctx.stub).getAttributeValue("username") || "";
      if (record.owner !== requester) throw new Error("Hanya owner yang bisa submit");
    }

    record.status = "Pending";
    record.submittedAt = new Date().toISOString();

    await ctx.stub.putState(archiveId, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent("ArchiveSubmitted", Buffer.from(JSON.stringify({ archiveId, status: record.status })));
    return JSON.stringify(record);
  }

  async ApproveArchive(ctx, archiveId) {
    this._requireRole(ctx, ["Approver"]);
    const record = await this._getArchive(ctx, archiveId);
    if (!record) throw new Error("Archive tidak ditemukan");
    if (record.status !== "Pending") throw new Error("Hanya Pending yang bisa di-approve");

    record.status = "Approved";
    record.approvedAt = new Date().toISOString();
    record.approvals.push({
      approver: new ClientIdentity(ctx.stub).getID(),
      timestamp: record.approvedAt,
    });

    await ctx.stub.putState(archiveId, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent("ArchiveApproved", Buffer.from(JSON.stringify({ archiveId, status: record.status })));
    return JSON.stringify(record);
  }

  async RejectArchive(ctx, archiveId, note) {
    this._requireRole(ctx, ["Approver"]);
    const record = await this._getArchive(ctx, archiveId);
    if (!record) throw new Error("Archive tidak ditemukan");
    if (record.status !== "Pending") throw new Error("Hanya Pending yang bisa ditolak");

    record.status = "Rejected";
    record.rejectionNote = note || "";
    record.rejectedAt = new Date().toISOString();

    await ctx.stub.putState(archiveId, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent("ArchiveRejected", Buffer.from(JSON.stringify({ archiveId, status: record.status })));
    return JSON.stringify(record);
  }

  async GetArchive(ctx, archiveId) {
    const record = await this._getArchive(ctx, archiveId);
    if (!record) throw new Error("Archive tidak ditemukan");

    const role = this._getRole(ctx);
    if (role === "Uploader" && record.owner !== new ClientIdentity(ctx.stub).getAttributeValue("username")) {
      throw new Error("Forbidden");
    }

    return JSON.stringify(record);
  }

  async GetAuditTrail(ctx, archiveId) {
    this._requireRole(ctx, ["Admin", "Approver", "Auditor"]);
    const iterator = await ctx.stub.getHistoryForKey(archiveId);
    const history = [];
    while (true) {
      const res = await iterator.next();
      if (res.value) {
        history.push({
          txId: res.value.txId,
          timestamp: res.value.timestamp,
          isDelete: res.value.isDelete,
          value: res.value.value ? JSON.parse(res.value.value.toString()) : null,
        });
      }
      if (res.done) {
        await iterator.close();
        break;
      }
    }
    return JSON.stringify(history);
  }
}

module.exports = ArchiveContract;
