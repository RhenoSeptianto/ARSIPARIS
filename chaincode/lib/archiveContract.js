"use strict";

const { Contract } = require("fabric-contract-api");
const { ClientIdentity } = require("fabric-shim");

class ArchiveContract extends Contract {
  _getTxTimeISO(ctx) {
    const ts = ctx.stub.getTxTimestamp();
    const seconds = (ts && ts.seconds && typeof ts.seconds.low === "number") ? ts.seconds.low : 0;
    const nanos = (ts && typeof ts.nanos === "number") ? ts.nanos : 0;
    const millis = seconds * 1000 + Math.floor(nanos / 1e6);
    return new Date(millis).toISOString();
  }
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

  async RegisterArchive(
    ctx,
    archiveId,
    hashCipher,
    ipfsCID,
    owner,
    classification,
    status,
    timestamp,
    uploaderName,
    uploaderType
  ) {
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
      uploaderName: uploaderName || "",
      uploaderType: uploaderType || "",
      rejectionNote: "",
      approvals: [],
      loan: null,
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

  async BorrowArchive(ctx, archiveId, borrowerName, borrowerEmail, borrowerPhone, borrowerType) {
    this._requireRole(ctx, ["Borrower"]);
    const record = await this._getArchive(ctx, archiveId);
    if (!record) throw new Error("Archive tidak ditemukan");
    if (record.status !== "Approved") throw new Error("Hanya arsip Approved yang bisa dipinjam");

    if (record.loan && record.loan.status === "BORROWED") {
      throw new Error("Arsip sedang dipinjam");
    }

    const cid = new ClientIdentity(ctx.stub);
    const borrower = cid.getAttributeValue("username") || "";
    if (!borrower) {
      throw new Error("Identity peminjam tidak memiliki atribut username");
    }

    const start = this._getTxTimeISO(ctx);
    const startMs = new Date(start).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const due = new Date(startMs + sevenDaysMs).toISOString();

    record.loan = {
      borrower,
      borrowerName: borrowerName || "",
      borrowerEmail: borrowerEmail || "",
      borrowerPhone: borrowerPhone || "",
      borrowerType: borrowerType || "",
      status: "BORROWED",
      loanStart: start,
      dueDate: due,
      extensionCount: 0,
      returnedAt: "",
    };

    await ctx.stub.putState(archiveId, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent("ArchiveBorrowed", Buffer.from(JSON.stringify({ archiveId, loan: record.loan })));
    return JSON.stringify(record);
  }

  async ExtendLoan(ctx, archiveId) {
    this._requireRole(ctx, ["Borrower"]);
    const record = await this._getArchive(ctx, archiveId);
    if (!record) throw new Error("Archive tidak ditemukan");
    if (!record.loan || record.loan.status !== "BORROWED") {
      throw new Error("Tidak ada peminjaman aktif untuk arsip ini");
    }

    const cid = new ClientIdentity(ctx.stub);
    const borrower = cid.getAttributeValue("username") || "";
    if (!borrower || record.loan.borrower !== borrower) {
      throw new Error("Hanya peminjam yang sama yang dapat memperpanjang");
    }

    if (record.loan.extensionCount >= 2) {
      throw new Error("Peminjaman sudah diperpanjang maksimal 2 kali");
    }

    const currentDueMs = new Date(record.loan.dueDate).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const newDue = new Date(currentDueMs + sevenDaysMs).toISOString();

    record.loan.dueDate = newDue;
    record.loan.extensionCount += 1;
    record.loan.lastExtendedAt = this._getTxTimeISO(ctx);

    await ctx.stub.putState(archiveId, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent("LoanExtended", Buffer.from(JSON.stringify({ archiveId, loan: record.loan })));
    return JSON.stringify(record);
  }

  async ReturnLoan(ctx, archiveId) {
    this._requireRole(ctx, ["Borrower"]);
    const record = await this._getArchive(ctx, archiveId);
    if (!record) throw new Error("Archive tidak ditemukan");
    if (!record.loan || record.loan.status !== "BORROWED") {
      throw new Error("Tidak ada peminjaman aktif untuk arsip ini");
    }

    const cid = new ClientIdentity(ctx.stub);
    const borrower = cid.getAttributeValue("username") || "";
    if (!borrower || record.loan.borrower !== borrower) {
      throw new Error("Hanya peminjam yang sama yang dapat mengembalikan");
    }

    record.loan.status = "RETURNED";
    record.loan.returnedAt = this._getTxTimeISO(ctx);

    await ctx.stub.putState(archiveId, Buffer.from(JSON.stringify(record)));
    ctx.stub.setEvent("LoanReturned", Buffer.from(JSON.stringify({ archiveId, loan: record.loan })));
    return JSON.stringify(record);
  }
}

module.exports = ArchiveContract;
