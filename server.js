require("dotenv").config();
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { createIpfsClient, checkIpfs } = require("./lib/ipfs");
const { Gateway, Wallets } = require("fabric-network");
const FabricCAServices = require("fabric-ca-client");

const {
  PORT = 3001,
  JWT_SECRET,
  MASTER_KEY,
  IPFS_API_URL = "http://ipfs:5001",
  FABRIC_CONNECTION_PROFILE = "./fabric/connection.json",
  FABRIC_CA_URL = "http://ca.org1.example.com:7054",
  FABRIC_CA_NAME = "ca-org1",
  FABRIC_MSP_ID = "Org1MSP",
  FABRIC_WALLET_PATH = "./wallet",
  FABRIC_CHANNEL = "mychannel",
  FABRIC_CHAINCODE = "archive",
  FABRIC_CA_ADMIN = "admin",
  FABRIC_CA_ADMIN_PASS = "adminpw",
  DB_PATH = "./data/arsiparis.db",
} = process.env;

if (!JWT_SECRET) {
  console.error("JWT_SECRET wajib di .env");
  process.exit(1);
}
if (!MASTER_KEY) {
  console.error("MASTER_KEY wajib di .env (base64 32 bytes)");
  process.exit(1);
}

const masterKey = Buffer.from(MASTER_KEY, "base64");
if (masterKey.length !== 32) {
  console.error("MASTER_KEY harus base64 32 bytes");
  process.exit(1);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    fabric_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS archives (
    archive_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    classification TEXT NOT NULL,
    status TEXT NOT NULL,
    ipfs_cid TEXT NOT NULL,
    hash_cipher TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    rejection_note TEXT,
    uploader_name TEXT,
    uploader_type TEXT
  );

  CREATE TABLE IF NOT EXISTS archive_keys (
    archive_id TEXT PRIMARY KEY,
    key_cipher TEXT NOT NULL,
    key_iv TEXT NOT NULL,
    key_tag TEXT NOT NULL,
    iv_cipher TEXT NOT NULL,
    iv_iv TEXT NOT NULL,
    iv_tag TEXT NOT NULL,
    tag_cipher TEXT NOT NULL,
    tag_iv TEXT NOT NULL,
    tag_tag TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loan_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_id TEXT NOT NULL,
    type TEXT NOT NULL,
    target TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Simple migration for existing databases that were created
// before uploader_name/uploader_type columns existed.
try {
  const archiveCols = db.prepare("PRAGMA table_info(archives)").all();
  if (!archiveCols.find((c) => c.name === "uploader_name")) {
    db.exec("ALTER TABLE archives ADD COLUMN uploader_name TEXT");
  }
  if (!archiveCols.find((c) => c.name === "uploader_type")) {
    db.exec("ALTER TABLE archives ADD COLUMN uploader_type TEXT");
  }
} catch (e) {
  console.error("Gagal migrasi tabel archives:", e.message);
}

const ipfsClientPromise = createIpfsClient({ url: IPFS_API_URL });

const ccpPath = path.resolve(FABRIC_CONNECTION_PROFILE);
const ccpRaw = JSON.parse(fs.readFileSync(ccpPath, "utf8"));

function loadConnectionProfile() {
  const ccp = JSON.parse(JSON.stringify(ccpRaw));
  const resolveTls = (node) => {
    if (node.tlsCACerts && node.tlsCACerts.path) {
      const pemPath = path.resolve(path.dirname(ccpPath), node.tlsCACerts.path);
      node.tlsCACerts.pem = fs.readFileSync(pemPath, "utf8");
      delete node.tlsCACerts.path;
    }
  };
  Object.values(ccp.peers || {}).forEach(resolveTls);
  Object.values(ccp.orderers || {}).forEach(resolveTls);
  return ccp;
}

async function getWallet() {
  return Wallets.newFileSystemWallet(path.resolve(FABRIC_WALLET_PATH));
}

function getCAService() {
  return new FabricCAServices(FABRIC_CA_URL, { trustedRoots: [], verify: false }, FABRIC_CA_NAME);
}

function hasCaError(err, code, contains) {
  const msg = (err && err.message) ? err.message.toLowerCase() : "";
  const needle = contains ? contains.toLowerCase() : "";
  const errors = (err && err.errors) ? err.errors : [];
  if (code && errors.some((e) => e.code === code)) return true;
  if (needle && msg.includes(needle)) return true;
  return false;
}

async function ensureAdminIdentity() {
  const wallet = await getWallet();
  const adminIdentity = await wallet.get(FABRIC_CA_ADMIN);
  if (adminIdentity) return;

  const ca = getCAService();
  const enrollment = await ca.enroll({ enrollmentID: FABRIC_CA_ADMIN, enrollmentSecret: FABRIC_CA_ADMIN_PASS });
  const identity = {
    credentials: {
      certificate: enrollment.certificate,
      privateKey: enrollment.key.toBytes(),
    },
    mspId: FABRIC_MSP_ID,
    type: "X.509",
  };
  await wallet.put(FABRIC_CA_ADMIN, identity);
}

async function registerAndEnrollUser({ username, role, password }) {
  await ensureAdminIdentity();
  const wallet = await getWallet();
  const userIdentity = await wallet.get(username);
  if (userIdentity) return;

  const ca = getCAService();
  const adminIdentity = await wallet.get(FABRIC_CA_ADMIN);
  const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
  const adminUser = await provider.getUserContext(adminIdentity, FABRIC_CA_ADMIN);

  const enrollmentSecret = password || `${username}pw`;
  let secret = enrollmentSecret;
  try {
    secret = await ca.register(
      {
        enrollmentID: username,
        enrollmentSecret,
        role: "client",
        maxEnrollments: -1,
        attrs: [
          { name: "role", value: role, ecert: true },
          { name: "username", value: username, ecert: true },
        ],
      },
      adminUser
    );
  } catch (err) {
    if (hasCaError(err, 74, "already registered")) {
      const identityService = ca.newIdentityService();
      try {
        await identityService.update(username, { secret: enrollmentSecret, maxEnrollments: -1 }, adminUser);
      } catch {
        // If update fails, we'll still attempt enroll with provided secret.
      }
      secret = enrollmentSecret;
    } else {
      throw err;
    }
  }

  let enrollment;
  try {
    enrollment = await ca.enroll({ enrollmentID: username, enrollmentSecret: secret });
  } catch (err) {
    if (hasCaError(err, 20, "authentication failure")) {
      const identityService = ca.newIdentityService();
      try {
        await identityService.update(username, { secret: enrollmentSecret, maxEnrollments: -1 }, adminUser);
      } catch {
        // Fallback to delete+register if update is not allowed.
        try {
          await identityService.delete(username, adminUser);
          secret = await ca.register(
            {
              enrollmentID: username,
              enrollmentSecret,
              role: "client",
              maxEnrollments: -1,
              attrs: [
                { name: "role", value: role, ecert: true },
                { name: "username", value: username, ecert: true },
              ],
            },
            adminUser
          );
        } catch {
          // Ignore and retry enroll with provided secret.
        }
      }
      enrollment = await ca.enroll({ enrollmentID: username, enrollmentSecret: enrollmentSecret });
    } else {
      throw err;
    }
  }
  const identity = {
    credentials: {
      certificate: enrollment.certificate,
      privateKey: enrollment.key.toBytes(),
    },
    mspId: FABRIC_MSP_ID,
    type: "X.509",
  };
  await wallet.put(username, identity);
}

async function removeUserIdentity(username) {
  const wallet = await getWallet();
  await wallet.remove(username);
}

async function getContract(username) {
  const wallet = await getWallet();
  const identity = await wallet.get(username);
  if (!identity) throw new Error("Identity belum terdaftar di Fabric wallet");

  const gateway = new Gateway();
  await gateway.connect(loadConnectionProfile(), {
    wallet,
    identity: username,
    // Gunakan Fabric service discovery supaya daftar peer endorser
    // untuk channel "mychannel" terisi otomatis.
    discovery: { enabled: true, asLocalhost: false },
  });

  const network = await gateway.getNetwork(FABRIC_CHANNEL);
  const contract = network.getContract(FABRIC_CHAINCODE);
  return { contract, gateway };
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.username, role: user.role, fabricId: user.fabric_id },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function createCaptchaChallenge() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const answer = a + b;
  const token = jwt.sign({ type: "captcha", answer }, JWT_SECRET, { expiresIn: "5m" });
  return { a, b, token };
}

function verifyCaptcha(captchaToken, captchaAnswer) {
  if (!captchaToken || captchaAnswer === undefined || captchaAnswer === null || captchaAnswer === "") {
    return false;
  }
  let payload;
  try {
    payload = jwt.verify(captchaToken, JWT_SECRET);
  } catch {
    return false;
  }
  if (!payload || payload.type !== "captcha") return false;
  return String(payload.answer) === String(captchaAnswer);
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Token invalid" });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}

function wrapKey(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipherText: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function unwrapKey({ cipherText, iv, tag }) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(cipherText, "base64")), decipher.final()]);
}

function encryptDocument(buffer) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, key, iv, tag };
}

function getUser(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

function insertUser({ username, passwordHash, role }) {
  db.prepare(
    "INSERT INTO users (username, password_hash, role, fabric_id, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(username, passwordHash, role, username, new Date().toISOString());
}

function upsertArchive(record) {
  db.prepare(
    `INSERT INTO archives (
       archive_id,
       owner,
       classification,
       status,
       ipfs_cid,
       hash_cipher,
       timestamp,
       rejection_note,
       uploader_name,
       uploader_type
     )
     VALUES (
       @archive_id,
       @owner,
       @classification,
       @status,
       @ipfs_cid,
       @hash_cipher,
       @timestamp,
       @rejection_note,
       @uploader_name,
       @uploader_type
     )
     ON CONFLICT(archive_id) DO UPDATE SET
       status=excluded.status,
       rejection_note=excluded.rejection_note,
       uploader_name=COALESCE(excluded.uploader_name, uploader_name),
       uploader_type=COALESCE(excluded.uploader_type, uploader_type)`
  ).run(record);
}

function saveArchiveKey(archiveId, key, iv, tag) {
  const wrappedKey = wrapKey(key);
  const wrappedIv = wrapKey(iv);
  const wrappedTag = wrapKey(tag);
  db.prepare(
    `INSERT INTO archive_keys (
      archive_id,
      key_cipher, key_iv, key_tag,
      iv_cipher, iv_iv, iv_tag,
      tag_cipher, tag_iv, tag_tag
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(archive_id) DO UPDATE SET
       key_cipher=excluded.key_cipher,
       key_iv=excluded.key_iv,
       key_tag=excluded.key_tag,
       iv_cipher=excluded.iv_cipher,
       iv_iv=excluded.iv_iv,
       iv_tag=excluded.iv_tag,
       tag_cipher=excluded.tag_cipher,
       tag_iv=excluded.tag_iv,
       tag_tag=excluded.tag_tag`
  ).run(
    archiveId,
    wrappedKey.cipherText,
    wrappedKey.iv,
    wrappedKey.tag,
    wrappedIv.cipherText,
    wrappedIv.iv,
    wrappedIv.tag,
    wrappedTag.cipherText,
    wrappedTag.iv,
    wrappedTag.tag
  );
}

function getArchiveKey(archiveId) {
  const row = db.prepare("SELECT * FROM archive_keys WHERE archive_id = ?").get(archiveId);
  if (!row) return null;
  return {
    key: unwrapKey({ cipherText: row.key_cipher, iv: row.key_iv, tag: row.key_tag }).toString("base64"),
    iv: unwrapKey({ cipherText: row.iv_cipher, iv: row.iv_iv, tag: row.iv_tag }).toString("base64"),
    tag: unwrapKey({ cipherText: row.tag_cipher, iv: row.tag_iv, tag: row.tag_tag }).toString("base64"),
  };
}

function ensureDefaultAdmin() {
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "admin123";
  if (!getUser(adminUser)) {
    insertUser({
      username: adminUser,
      passwordHash: bcrypt.hashSync(adminPass, 10),
      role: "Admin",
    });
  }
  registerAndEnrollUser({ username: adminUser, role: "Admin" }).catch((err) => {
    console.error("Gagal registrasi admin Fabric:", err.message);
  });
}

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/health/ipfs", async (_req, res) => {
  try {
    const info = await checkIpfs(ipfsClientPromise);
    return res.json({ ok: true, id: info.id, agentVersion: info.agentVersion });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/auth/captcha", (_req, res) => {
  const challenge = createCaptchaChallenge();
  return res.json(challenge);
});

app.post("/auth/login", (req, res) => {
  const { username, password, captchaToken, captchaAnswer } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username & password wajib" });
  if (!verifyCaptcha(captchaToken, captchaAnswer)) {
    return res.status(400).json({ error: "Captcha salah atau kadaluarsa" });
  }
  const user = getUser(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Login gagal" });
  }
  return res.json({ token: issueToken(user), role: user.role, username: user.username });
});

app.post("/admin/users", authRequired, requireRole(["Admin"]), async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ error: "Data user tidak lengkap" });
  if (!["Admin", "Uploader", "Approver", "Auditor", "Borrower"].includes(role)) {
    return res.status(400).json({ error: "Role tidak valid" });
  }
  if (getUser(username)) return res.status(409).json({ error: "User sudah ada" });

  try {
    await registerAndEnrollUser({ username, role, password });
    insertUser({ username, passwordHash: bcrypt.hashSync(password, 10), role });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/admin/users", authRequired, requireRole(["Admin"]), (req, res) => {
  const users = db.prepare("SELECT username, role, created_at FROM users ORDER BY created_at DESC").all();
  return res.json(users);
});

app.put("/admin/users/:username", authRequired, requireRole(["Admin"]), async (req, res) => {
  const username = req.params.username;
  const { role, password } = req.body || {};
  if (!getUser(username)) return res.status(404).json({ error: "User tidak ditemukan" });
  if (role && !["Admin", "Uploader", "Approver", "Auditor", "Borrower"].includes(role)) {
    return res.status(400).json({ error: "Role tidak valid" });
  }
  try {
    if (role) {
      db.prepare("UPDATE users SET role = ? WHERE username = ?").run(role, username);
    }
    if (password) {
      db.prepare("UPDATE users SET password_hash = ? WHERE username = ?").run(
        bcrypt.hashSync(password, 10),
        username
      );
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/admin/users/:username", authRequired, requireRole(["Admin"]), async (req, res) => {
  const username = req.params.username;
  if (username === req.user.sub) return res.status(400).json({ error: "Tidak bisa menghapus diri sendiri" });
  if (!getUser(username)) return res.status(404).json({ error: "User tidak ditemukan" });
  try {
    await removeUserIdentity(username);
    db.prepare("DELETE FROM users WHERE username = ?").run(username);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/archives", authRequired, async (req, res) => {
  const role = req.user.role;
  let rows;
  if (role === "Uploader") {
    rows = db.prepare("SELECT * FROM archives WHERE owner = ? ORDER BY timestamp DESC").all(req.user.sub);
  } else {
    rows = db.prepare("SELECT * FROM archives ORDER BY timestamp DESC").all();
  }
  try {
    const { contract, gateway } = await getContract(req.user.sub);
    try {
      const enriched = [];
      for (const row of rows) {
        try {
          const result = await contract.evaluateTransaction("GetArchive", row.archive_id);
          const ledgerRecord = JSON.parse(result.toString());
          enriched.push({
            ...row,
            status: ledgerRecord.status || row.status,
            loan: ledgerRecord.loan || null,
          });
        } catch {
          enriched.push(row);
        }
      }
      return res.json(enriched);
    } finally {
      gateway.disconnect();
    }
  } catch (err) {
    console.error(err);
    // Jika koneksi ke Fabric gagal, fallback ke data SQLite saja.
    return res.json(rows);
  }
});

app.post("/archives", authRequired, requireRole(["Uploader"]), upload.single("file"), async (req, res) => {
  const { classification, uploaderName, uploaderType } = req.body || {};
  if (!classification) return res.status(400).json({ error: "classification wajib" });
  if (!req.file) return res.status(400).json({ error: "file wajib" });

  try {
    const { encrypted, key, iv, tag } = encryptDocument(req.file.buffer);
    const hashCipher = crypto.createHash("sha256").update(encrypted).digest("hex");
    const ipfsClient = await ipfsClientPromise;
    const ipfsAdded = await ipfsClient.add(encrypted);
    const archiveId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const { contract, gateway } = await getContract(req.user.sub);
    try {
      await contract.submitTransaction(
        "RegisterArchive",
        archiveId,
        hashCipher,
        ipfsAdded.cid.toString(),
        req.user.sub,
        classification,
        "Draft",
        timestamp,
        uploaderName || "",
        uploaderType || ""
      );
    } finally {
      gateway.disconnect();
    }

    upsertArchive({
      archive_id: archiveId,
      owner: req.user.sub,
      classification,
      status: "Draft",
      ipfs_cid: ipfsAdded.cid.toString(),
      hash_cipher: hashCipher,
      timestamp,
      rejection_note: null,
      uploader_name: uploaderName || null,
      uploader_type: uploaderType || null,
    });
    saveArchiveKey(archiveId, key, iv, tag);

    return res.json({ archiveId, cid: ipfsAdded.cid.toString(), hashCipher, status: "Draft" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/archives/:id/submit", authRequired, requireRole(["Uploader"]), async (req, res) => {
  const archiveId = req.params.id;
  try {
    const { contract, gateway } = await getContract(req.user.sub);
    try {
      await contract.submitTransaction("SubmitArchive", archiveId);
    } finally {
      gateway.disconnect();
    }

    db.prepare("UPDATE archives SET status = ? WHERE archive_id = ?").run("Pending", archiveId);
    return res.json({ ok: true, status: "Pending" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/archives/:id/approve", authRequired, requireRole(["Approver"]), async (req, res) => {
  const archiveId = req.params.id;
  try {
    const { contract, gateway } = await getContract(req.user.sub);
    try {
      await contract.submitTransaction("ApproveArchive", archiveId);
    } finally {
      gateway.disconnect();
    }

    db.prepare("UPDATE archives SET status = ? WHERE archive_id = ?").run("Approved", archiveId);
    return res.json({ ok: true, status: "Approved" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/archives/:id/reject", authRequired, requireRole(["Approver"]), async (req, res) => {
  const archiveId = req.params.id;
  const { note } = req.body || {};
  if (!note) return res.status(400).json({ error: "note wajib" });
  try {
    const { contract, gateway } = await getContract(req.user.sub);
    try {
      await contract.submitTransaction("RejectArchive", archiveId, note);
    } finally {
      gateway.disconnect();
    }

    db.prepare("UPDATE archives SET status = ?, rejection_note = ? WHERE archive_id = ?").run(
      "Rejected",
      note,
      archiveId
    );
    return res.json({ ok: true, status: "Rejected" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/archives/:id", authRequired, async (req, res) => {
  const archiveId = req.params.id;
  try {
    const { contract, gateway } = await getContract(req.user.sub);
    let archive;
    try {
      const result = await contract.evaluateTransaction("GetArchive", archiveId);
      archive = JSON.parse(result.toString());
    } finally {
      gateway.disconnect();
    }
    return res.json(archive);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/archives/:id/audit", authRequired, requireRole(["Admin", "Approver", "Auditor"]), async (req, res) => {
  const archiveId = req.params.id;
  try {
    const { contract, gateway } = await getContract(req.user.sub);
    let history;
    try {
      const result = await contract.evaluateTransaction("GetAuditTrail", archiveId);
      history = JSON.parse(result.toString());
    } finally {
      gateway.disconnect();
    }
    return res.json(history);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/archives/:id/borrow", authRequired, requireRole(["Borrower"]), async (req, res) => {
  const archiveId = req.params.id;
  const { name, email, phone, type } = req.body || {};
  try {
    const { contract, gateway } = await getContract(req.user.sub);
    let updated;
    try {
      const result = await contract.submitTransaction(
        "BorrowArchive",
        archiveId,
        name || "",
        email || "",
        phone || "",
        type || ""
      );
      updated = result && result.length ? JSON.parse(result.toString()) : null;
    } finally {
      gateway.disconnect();
    }
    return res.json({ ok: true, loan: updated ? updated.loan : null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

async function checkDueLoans(nowOverride) {
  const now = nowOverride ? new Date(nowOverride) : new Date();
  const rows = db.prepare("SELECT archive_id FROM archives").all();
  if (!rows.length) return { checked: 0, notifications: 0 };

  let notifications = 0;
  for (const row of rows) {
    try {
      const { contract, gateway } = await getContract(FABRIC_CA_ADMIN);
      try {
        const result = await contract.evaluateTransaction("GetArchive", row.archive_id);
        const record = JSON.parse(result.toString());
        if (!record.loan || record.loan.status !== "BORROWED") continue;
        const due = new Date(record.loan.dueDate);
        if (isNaN(due.getTime())) continue;
        if (due > now) continue;

        const already = db
          .prepare(
            "SELECT 1 FROM loan_notifications WHERE archive_id = ? AND type = ? LIMIT 1"
          )
          .get(row.archive_id, "due");
        if (already) continue;

        const msg = `Peminjaman arsip ${record.archiveId} atas nama ${
          record.loan.borrowerName || record.loan.borrower
        } sudah jatuh tempo pada ${record.loan.dueDate}`;

        const createdAt = new Date().toISOString();
        if (record.loan.borrowerEmail) {
          db.prepare(
            "INSERT INTO loan_notifications (archive_id, type, target, message, created_at) VALUES (?, ?, ?, ?, ?)"
          ).run(row.archive_id, "email", record.loan.borrowerEmail, msg, createdAt);
          console.log("[NOTIF][EMAIL]", record.loan.borrowerEmail, msg);
          notifications++;
        }
        if (record.loan.borrowerPhone) {
          db.prepare(
            "INSERT INTO loan_notifications (archive_id, type, target, message, created_at) VALUES (?, ?, ?, ?, ?)"
          ).run(row.archive_id, "whatsapp", record.loan.borrowerPhone, msg, createdAt);
          console.log("[NOTIF][WA]", record.loan.borrowerPhone, msg);
          notifications++;
        }
      } finally {
        gateway.disconnect();
      }
    } catch (err) {
      console.error("Gagal cek jatuh tempo untuk", row.archive_id, err.message);
    }
  }
  return { checked: rows.length, notifications };
}

app.post(
  "/jobs/check-due-loans",
  authRequired,
  requireRole(["Admin"]),
  async (req, res) => {
    try {
      const { now } = req.body || {};
      const result = await checkDueLoans(now);
      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post("/archives/:id/extend", authRequired, requireRole(["Borrower"]), async (req, res) => {
  const archiveId = req.params.id;
  try {
    const { contract, gateway } = await getContract(req.user.sub);
    let updated;
    try {
      const result = await contract.submitTransaction("ExtendLoan", archiveId);
      updated = result && result.length ? JSON.parse(result.toString()) : null;
    } finally {
      gateway.disconnect();
    }
    return res.json({ ok: true, loan: updated ? updated.loan : null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/archives/:id/return", authRequired, requireRole(["Borrower"]), async (req, res) => {
  const archiveId = req.params.id;
  try {
    const { contract, gateway } = await getContract(req.user.sub);
    let updated;
    try {
      const result = await contract.submitTransaction("ReturnLoan", archiveId);
      updated = result && result.length ? JSON.parse(result.toString()) : null;
    } finally {
      gateway.disconnect();
    }
    return res.json({ ok: true, loan: updated ? updated.loan : null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/archives/:id/file", authRequired, async (req, res) => {
  const archiveId = req.params.id;
  const role = req.user.role;
  const archive = db.prepare("SELECT * FROM archives WHERE archive_id = ?").get(archiveId);
  if (!archive) return res.status(404).json({ error: "Arsip tidak ditemukan" });

  const allowed = ["Admin", "Approver", "Auditor"].includes(role) || archive.owner === req.user.sub;
  if (!allowed) return res.status(403).json({ error: "Forbidden" });

  const keyData = getArchiveKey(archiveId);
  if (!keyData) return res.status(404).json({ error: "Kunci tidak tersedia" });

  try {
    const ipfsClient = await ipfsClientPromise;
    const chunks = [];
    for await (const chunk of ipfsClient.cat(archive.ipfs_cid)) {
      chunks.push(chunk);
    }
    const encrypted = Buffer.concat(chunks.map((c) => Buffer.from(c)));

    const key = Buffer.from(keyData.key, "base64");
    const iv = Buffer.from(keyData.iv, "base64");
    const tag = Buffer.from(keyData.tag, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    res.setHeader("Content-Type", "application/octet-stream");
    res.send(decrypted);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/archives/:id/key", authRequired, async (req, res) => {
  const archiveId = req.params.id;
  const role = req.user.role;
  const archive = db.prepare("SELECT * FROM archives WHERE archive_id = ?").get(archiveId);
  if (!archive) return res.status(404).json({ error: "Arsip tidak ditemukan" });

  const allowed = ["Admin", "Approver", "Auditor"].includes(role) || archive.owner === req.user.sub;
  if (!allowed) return res.status(403).json({ error: "Forbidden" });

  const keyData = getArchiveKey(archiveId);
  if (!keyData) return res.status(404).json({ error: "Kunci tidak tersedia" });
  return res.json(keyData);
});

ensureDefaultAdmin();
ensureAdminIdentity().catch((err) => console.error("Fabric admin init gagal:", err.message));

app.listen(PORT, () => {
  console.log(`Backend listening on ${PORT}`);
});
