import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";
const APP_VERSION = "v0.2.0-borrowing-2026-01-10";

const roleLabels = {
  Admin: "Admin",
  Uploader: "Uploader (Unit Kerja)",
  Approver: "Approver (Arsiparis)",
  Auditor: "Auditor",
  Borrower: "Peminjam Eksternal",
};

async function apiFetch(path, token, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request gagal");
  return data;
}

export function App() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: "", password: "", captchaAnswer: "" });
  const [captcha, setCaptcha] = useState({ a: null, b: null, token: "" });
  const [activeSection, setActiveSection] = useState("arsip");
  const [userForm, setUserForm] = useState({ username: "", password: "", role: "Uploader" });
  const [userList, setUserList] = useState([]);
  const [editUser, setEditUser] = useState(null);

  const [uploadForm, setUploadForm] = useState({
    classification: "",
    file: null,
    uploaderName: "",
    uploaderType: "Perorangan",
  });
  const [submitId, setSubmitId] = useState("");
  const [approveId, setApproveId] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [auditTrail, setAuditTrail] = useState([]);
  const [auditId, setAuditId] = useState("");
  const [keyData, setKeyData] = useState(null);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const [loanArchiveId, setLoanArchiveId] = useState("");

  const role = user?.role || "";

  const canManageUsers = role === "Admin";
  const canUpload = role === "Uploader";
  const canApprove = role === "Approver";
  const canAudit = role === "Auditor" || role === "Approver" || role === "Admin";
  const canBorrow = role === "Borrower";

  const formatFabricTimestamp = (ts) => {
    if (!ts) return "";
    try {
      const seconds = typeof ts.seconds === "number" ? ts.seconds : ts.seconds?.low || 0;
      const nanos = typeof ts.nanos === "number" ? ts.nanos : 0;
      const millis = seconds * 1000 + Math.floor(nanos / 1e6);
      return new Date(millis).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const formatIsoTimestamp = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const loadCaptcha = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/captcha`);
      const data = await res.json();
      setCaptcha({ a: data.a, b: data.b, token: data.token });
      setLoginForm((prev) => ({ ...prev, captchaAnswer: "" }));
    } catch {
      // jika gagal, biarkan tanpa captcha baru
    }
  };

  const refreshArchives = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("/archives", token);
      setArchives(data || []);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshUsers = async () => {
    if (!token) return;
    try {
      const data = await apiFetch("/admin/users", token);
      setUserList(data || []);
    } catch (err) {
      setMessage(err.message);
    }
  };

  useEffect(() => {
    refreshArchives();
    if (role === "Admin") {
      refreshUsers();
    }
  }, [token]);

  useEffect(() => {
    loadCaptcha();
  }, []);

  const onLogin = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const data = await apiFetch("/auth/login", null, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginForm.username,
          password: loginForm.password,
          captchaAnswer: loginForm.captchaAnswer,
          captchaToken: captcha.token,
        }),
      });
      setToken(data.token);
      setUser({ username: data.username, role: data.role });
      setMessage("Login berhasil");
      setActiveSection("arsip");
    } catch (err) {
      setMessage(err.message);
      loadCaptcha();
    }
  };

  const onCreateUser = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await apiFetch("/admin/users", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm),
      });
      setMessage("User berhasil dibuat");
      setUserForm({ username: "", password: "", role: "Uploader" });
      refreshUsers();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onEditUser = async (e) => {
    e.preventDefault();
    if (!editUser) return;
    setMessage("");
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(editUser.username)}`, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editUser.role,
          password: editUser.password || undefined,
        }),
      });
      setMessage("User diperbarui");
      setEditUser(null);
      refreshUsers();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onDeleteUser = async (username) => {
    setMessage("");
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(username)}`, token, {
        method: "DELETE",
      });
      setMessage("User dihapus");
      refreshUsers();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) {
      setMessage("File wajib diunggah");
      return;
    }
    setMessage("");
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", uploadForm.file);
      form.append("classification", uploadForm.classification);
      form.append("uploaderName", uploadForm.uploaderName || "");
      form.append("uploaderType", uploadForm.uploaderType || "");
      const res = await fetch(`${API_BASE}/archives`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload gagal");
      setMessage(`Arsip tersimpan. ID: ${data.archiveId}`);
      setSubmitId(data.archiveId);
      setUploadForm({ classification: "", file: null, uploaderName: "", uploaderType: "Perorangan" });
      refreshArchives();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onSubmitArchive = async () => {
    if (!submitId) return;
    setMessage("");
    try {
      await apiFetch(`/archives/${submitId}/submit`, token, { method: "POST" });
      setMessage("Arsip dikirim untuk approval");
      refreshArchives();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onApprove = async () => {
    if (!approveId) return;
    setMessage("");
    try {
      await apiFetch(`/archives/${approveId}/approve`, token, { method: "POST" });
      setMessage("Arsip disetujui");
      refreshArchives();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onReject = async () => {
    if (!approveId) return;
    setMessage("");
    try {
      await apiFetch(`/archives/${approveId}/reject`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: rejectNote }),
      });
      setMessage("Arsip ditolak");
      setRejectNote("");
      refreshArchives();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onFetchAudit = async () => {
    if (!auditId) return;
    setMessage("");
    try {
      const data = await apiFetch(`/archives/${auditId}/audit`, token);
      setAuditTrail(data || []);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onFetchKey = async (archiveId) => {
    setMessage("");
    try {
      const data = await apiFetch(`/archives/${archiveId}/key`, token);
      setKeyData({ archiveId, ...data });
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onViewArchive = async (archiveId) => {
    setMessage("");
    setFileUrl("");
    try {
      const data = await apiFetch(`/archives/${archiveId}`, token);
      setSelectedArchive(data || null);
    } catch (err) {
      setSelectedArchive(null);
      setMessage(err.message);
    }
  };

  const onViewFile = async (archiveId) => {
    setMessage("");
    setFileUrl("");
    try {
      const res = await fetch(`${API_BASE}/archives/${archiveId}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal mengambil file arsip");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setFileUrl(url);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const statusBadge = (status) => {
    const className = status === "Approved" ? "badge approved" : status === "Rejected" ? "badge rejected" : "badge pending";
    return <span className={className}>{status}</span>;
  };

  const [borrowerContact, setBorrowerContact] = useState({ name: "", email: "", phone: "", type: "Perorangan" });

  const onBorrow = async () => {
    if (!loanArchiveId) return;
    setMessage("");
    try {
      await apiFetch(`/archives/${encodeURIComponent(loanArchiveId)}/borrow`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: borrowerContact.name,
          email: borrowerContact.email,
          phone: borrowerContact.phone,
          type: borrowerContact.type,
        }),
      });
      setMessage("Peminjaman berhasil dibuat");
      refreshArchives();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onExtendLoan = async () => {
    if (!loanArchiveId) return;
    setMessage("");
    try {
      await apiFetch(`/archives/${encodeURIComponent(loanArchiveId)}/extend`, token, { method: "POST" });
      setMessage("Peminjaman berhasil diperpanjang");
      refreshArchives();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onReturnLoan = async () => {
    if (!loanArchiveId) return;
    setMessage("");
    try {
      await apiFetch(`/archives/${encodeURIComponent(loanArchiveId)}/return`, token, { method: "POST" });
      setMessage("Peminjaman dikembalikan");
      refreshArchives();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const onCopyArchiveId = async (archiveId) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(archiveId);
        setMessage("Archive ID disalin ke clipboard");
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = archiveId;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setMessage("Archive ID disalin ke clipboard");
      }
    } catch {
      setMessage("Gagal menyalin Archive ID");
    }
  };

  const goToLoanWithArchive = (archiveId) => {
    setActiveSection("loan");
    setLoanArchiveId(archiveId);
    setBorrowerContact({ name: "", email: "", phone: "", type: "Perorangan" });
  };

  const archiveRows = useMemo(() => {
    if (loading) return <div className="muted">Memuat data arsip...</div>;
    if (!archives.length) return <div className="muted">Belum ada arsip.</div>;
    return archives.map((a) => (
      <div key={a.archive_id} className="list-item">
        <div>
          <div className="list-title">{a.archive_id}</div>
          <div className="muted">Owner: {a.owner}</div>
          <div className="muted">Klasifikasi: {a.classification}</div>
          <div className="muted">
            Pengunggah: {a.uploader_name || a.owner} {a.uploader_type && `(${a.uploader_type})`}
          </div>
          {(a.status === "Approved" || a.loan) && (
            <div className="muted">
              Status peminjaman:
              {a.loan ? (
                <>
                  {" "}
                  <span
                    className={`badge inline ${a.loan.status === "BORROWED" ? "pending" : "approved"}`}
                    style={{ marginRight: "0.35rem" }}
                  >
                    {a.loan.status === "BORROWED"
                      ? "Dipinjam"
                      : a.loan.status === "RETURNED"
                      ? "Selesai"
                      : a.loan.status}
                  </span>
                  {(a.loan.borrowerName || a.loan.borrower) &&
                    ` oleh ${
                      a.loan.borrowerName || a.loan.borrower
                    }${a.loan.borrowerType ? ` (${a.loan.borrowerType})` : ""}`}
                  {a.loan.dueDate && (
                    <>
                      <br />
                      Jatuh tempo: {formatIsoTimestamp(a.loan.dueDate)}
                    </>
                  )}
                </>
              ) : (
                <>
                  {" "}
                  <span className="badge inline approved" style={{ marginRight: "0.35rem" }}>
                    Tersedia
                  </span>
                  Belum pernah / tidak sedang dipinjam
                </>
              )}
            </div>
          )}
        </div>
        <div className="list-right">
          {statusBadge(a.status)}
          <button className="btn ghost compact" type="button" onClick={() => onCopyArchiveId(a.archive_id)}>
            Copy ID
          </button>
          <button className="btn ghost compact" onClick={() => onViewArchive(a.archive_id)}>
            Detail
          </button>
          <button className="btn ghost compact" onClick={() => onFetchKey(a.archive_id)}>
            Kunci
          </button>
          {canBorrow && a.status === "Approved" && (
            <button
              className="btn compact loan-action"
              type="button"
              onClick={() => goToLoanWithArchive(a.archive_id)}
            >
              {a.loan && a.loan.status === "BORROWED" ? "Kembalikan" : "Pinjam"}
            </button>
          )}
        </div>
      </div>
    ));
  }, [archives]);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <div className="eyebrow">Sistem Arsiparis Terdesentralisasi</div>
          <h1>Sistem Arsip Berbasis Hyperledger Fabric (Permissioned)</h1>
          <p>
            Integritas on-chain, E2E encryption, dan audit trail untuk pengelolaan arsip instansi tanpa blockchain publik dan tanpa gas fee.
          </p>
        </div>
        <div className="hero-card">
          <div className="card-title">Status Session</div>
          {user ? (
            <>
              <div className="muted">User: {user.username}</div>
              <div className="muted">Role: {roleLabels[user.role]}</div>
              <div className="muted" style={{ marginTop: "0.4rem", fontSize: "0.8rem" }}>
                {user.role === "Admin" && "Admin dapat mengelola user dan melihat seluruh arsip."}
                {user.role === "Uploader" &&
                  "Uploader dapat mengenkripsi dan mengunggah arsip lalu submit untuk approval."}
                {user.role === "Approver" &&
                  "Approver meninjau arsip Pending lalu melakukan Approve atau Reject."}
                {user.role === "Auditor" && "Auditor dapat membaca arsip dan Audit Trail tanpa mengubah data."}
                {user.role === "Borrower" &&
                  "Peminjam Eksternal hanya dapat meminjam, memperpanjang, dan mengembalikan arsip yang Approved."}
              </div>
              <button
                className="btn secondary"
                onClick={() => {
                  setToken("");
                  setUser(null);
                  setArchives([]);
                  setSelectedArchive(null);
                  setKeyData(null);
                  setFileUrl("");
                  setAuditTrail([]);
                  setAuditId("");
                  setSubmitId("");
                  setApproveId("");
                  setRejectNote("");
                  setUserList([]);
                  setEditUser(null);
                  setUploadForm({ classification: "", file: null, uploaderName: "", uploaderType: "Perorangan" });
                  setMessage("");
                  setLoginForm({ username: "", password: "", captchaAnswer: "" });
                  setCaptcha({ a: null, b: null, token: "" });
                  loadCaptcha();
                  setActiveSection("arsip");
                  setLoanArchiveId("");
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <form onSubmit={onLogin} className="form">
              <input
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                placeholder="Username"
              />
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                placeholder="Password"
              />
              {captcha.a !== null && captcha.b !== null && (
                <div className="captcha-row">
                  <div className="muted">Captcha: berapa {captcha.a} + {captcha.b}?</div>
                  <div className="captcha-controls">
                    <input
                      type="number"
                      value={loginForm.captchaAnswer}
                      onChange={(e) => setLoginForm({ ...loginForm, captchaAnswer: e.target.value })}
                      placeholder="Jawaban"
                    />
                    <button className="btn ghost" type="button" onClick={loadCaptcha}>
                      Ganti
                    </button>
                  </div>
                </div>
              )}
              <button className="btn" type="submit">
                Login
              </button>
            </form>
          )}
        </div>
      </header>

      {message && (
        <div className="flash">{message}</div>
      )}

      {user && (
        <>
          <div className="tabs">
            <button
              type="button"
              className={`tab-button ${activeSection === "arsip" ? "active" : ""}`}
              onClick={() => {
                setActiveSection("arsip");
                setSelectedArchive(null);
                setKeyData(null);
                setFileUrl("");
                setLoanArchiveId("");
                setBorrowerContact({ name: "", email: "", phone: "", type: "Perorangan" });
              }}
            >
              Arsip
            </button>
            {canManageUsers && (
              <button
                type="button"
                className={`tab-button ${activeSection === "admin" ? "active" : ""}`}
                onClick={() => {
                  setActiveSection("admin");
                  setUserForm({ username: "", password: "", role: "Uploader" });
                  setEditUser(null);
                }}
              >
                Manajemen Pengguna
              </button>
            )}
            {canUpload && (
              <button
                type="button"
                className={`tab-button ${activeSection === "upload" ? "active" : ""}`}
                onClick={() => {
                  setActiveSection("upload");
                  setUploadForm({ classification: "", file: null, uploaderName: "", uploaderType: "Perorangan" });
                  setSubmitId("");
                }}
              >
                Upload Arsip
              </button>
            )}
            {canApprove && (
              <button
                type="button"
                className={`tab-button ${activeSection === "approval" ? "active" : ""}`}
                onClick={() => {
                  setActiveSection("approval");
                  setApproveId("");
                  setRejectNote("");
                }}
              >
                Approval
              </button>
            )}
            {canBorrow && (
              <button
                type="button"
                className={`tab-button ${activeSection === "loan" ? "active" : ""}`}
                onClick={() => {
                  setActiveSection("loan");
                  setLoanArchiveId("");
                  setBorrowerContact({ name: "", email: "", phone: "", type: "Perorangan" });
                }}
              >
                Peminjaman
              </button>
            )}
            {canAudit && (
              <button
                type="button"
                className={`tab-button ${activeSection === "audit" ? "active" : ""}`}
                onClick={() => {
                  setActiveSection("audit");
                  setAuditId("");
                  setAuditTrail([]);
                }}
              >
                Audit Trail
              </button>
            )}
          </div>

          {activeSection === "admin" && canManageUsers && (
            <section className="panel wide">
              <div className="panel-title">Manajemen Pengguna</div>
              <form onSubmit={onCreateUser} className="form">
                <input
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  placeholder="Username baru"
                />
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder="Password sementara"
                />
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                >
                  <option value="Admin">Admin</option>
                  <option value="Uploader">Uploader</option>
                  <option value="Approver">Approver</option>
                  <option value="Auditor">Auditor</option>
                  <option value="Borrower">Peminjam Eksternal</option>
                </select>
                <button className="btn" type="submit">
                  Buat User
                </button>
              </form>
              <div className="divider" />
              <div className="panel-title">Daftar Pengguna</div>
              <div className="list">
                {userList.length === 0 ? (
                  <div className="muted">Belum ada user.</div>
                ) : (
                  userList.map((u) => (
                    <div key={u.username} className="list-item">
                      <div>
                        <div className="list-title">{u.username}</div>
                        <div className="muted">Role: {roleLabels[u.role]}</div>
                        {editUser?.username === u.username && (
                          <form onSubmit={onEditUser} className="form">
                            <select
                              value={editUser.role}
                              onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                            >
                              <option value="Admin">Admin</option>
                              <option value="Uploader">Uploader</option>
                              <option value="Approver">Approver</option>
                              <option value="Auditor">Auditor</option>
                              <option value="Borrower">Peminjam Eksternal</option>
                            </select>
                            <input
                              type="password"
                              value={editUser.password}
                              onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
                              placeholder="Password baru (opsional)"
                            />
                            <div className="inline-actions">
                              <button className="btn" type="submit">Simpan</button>
                              <button className="btn ghost" type="button" onClick={() => setEditUser(null)}>Batal</button>
                            </div>
                          </form>
                        )}
                      </div>
                      <div className="list-right">
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => setEditUser({ username: u.username, role: u.role, password: "" })}
                        >
                          Edit
                        </button>
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => onDeleteUser(u.username)}
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {activeSection === "upload" && canUpload && (
            <section className="panel wide">
              <div className="panel-title">Unggah Arsip</div>
              <form onSubmit={onUpload} className="form">
                <input
                  value={uploadForm.classification}
                  onChange={(e) => setUploadForm({ ...uploadForm, classification: e.target.value })}
                  placeholder="Klasifikasi"
                />
                <input
                  value={uploadForm.uploaderName}
                  onChange={(e) => setUploadForm({ ...uploadForm, uploaderName: e.target.value })}
                  placeholder="Nama Pengunggah (mis. nama pegawai/instansi)"
                />
                <select
                  value={uploadForm.uploaderType}
                  onChange={(e) => setUploadForm({ ...uploadForm, uploaderType: e.target.value })}
                >
                  <option value="Perorangan">Perorangan</option>
                  <option value="PT/Instansi">PT / Instansi</option>
                </select>
                <input
                  type="file"
                  onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                />
                <button className="btn" type="submit" disabled={loading}>
                  Enkripsi + Upload
                </button>
              </form>
              <div className="inline-actions">
                <input
                  value={submitId}
                  onChange={(e) => setSubmitId(e.target.value)}
                  placeholder="Archive ID untuk submit"
                />
                <button className="btn secondary" onClick={onSubmitArchive}>
                  Submit untuk Approval
                </button>
              </div>
            </section>
          )}

          {activeSection === "approval" && canApprove && (
            <section className="panel wide">
              <div className="panel-title">Review Arsip</div>
              <div className="muted" style={{ marginBottom: "0.5rem" }}>
                Masukkan Archive ID arsip berstatus Pending untuk melakukan Approve atau Reject.
              </div>
              <div className="inline-actions">
                <input
                  value={approveId}
                  onChange={(e) => setApproveId(e.target.value)}
                  placeholder="Archive ID"
                />
                <button className="btn" onClick={onApprove} disabled={!approveId}>
                  Approve
                </button>
              </div>
              <textarea
                rows="3"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Catatan penolakan"
              />
              <button className="btn secondary" onClick={onReject} disabled={!approveId}>
                Reject
              </button>
            </section>
          )}

          {activeSection === "audit" && canAudit && (
            <section className="panel wide">
              <div className="panel-title">Audit Trail</div>
              <div className="muted" style={{ marginBottom: "0.5rem" }}>
                Masukkan Archive ID untuk melihat seluruh riwayat perubahan arsip pada blockchain.
              </div>
              <div className="inline-actions">
                <input
                  value={auditId}
                  onChange={(e) => setAuditId(e.target.value)}
                  placeholder="Archive ID"
                />
                <button className="btn" onClick={onFetchAudit} disabled={!auditId}>
                  Ambil Audit
                </button>
              </div>
              <div className="audit-list">
                {auditTrail.length === 0 ? (
                  <div className="muted">Belum ada data audit.</div>
                ) : (
                  auditTrail.map((item) => (
                    <div key={item.txId} className="list-item small">
                      <div>
                        <div className="list-title">{item.txId}</div>
                        <div className="muted">{formatFabricTimestamp(item.timestamp)}</div>
                      </div>
                      <div className="muted">
                        Status Arsip: {item.value?.status || ""}
                        {item.value?.loan && (
                          <>
                            {" "}| Peminjaman: {item.value.loan.status}
                            {(item.value.loan.borrowerName || item.value.loan.borrower) &&
                              ` oleh ${
                                item.value.loan.borrowerName || item.value.loan.borrower
                              }${item.value.loan.borrowerType ? ` (${item.value.loan.borrowerType})` : ""}`}
                            {item.value.loan.loanStart &&
                              ` | Mulai: ${formatIsoTimestamp(item.value.loan.loanStart)}`}
                            {item.value.loan.dueDate &&
                              ` | Jatuh tempo: ${formatIsoTimestamp(item.value.loan.dueDate)}`}
                            {typeof item.value.loan.extensionCount === "number" &&
                              ` | Perpanjangan: ${item.value.loan.extensionCount}x`}
                            {item.value.loan.returnedAt &&
                              ` | Dikembalikan: ${formatIsoTimestamp(item.value.loan.returnedAt)}`}
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {activeSection === "arsip" && (
            <>
              <section className="panel wide">
                <div className="panel-title">Daftar Arsip</div>
                <div className="list">{archiveRows}</div>
              </section>

              {selectedArchive && (
                <section className="panel wide">
          <div className="panel-title">Detail Arsip</div>
          <div className="list">
            <div className="list-item small">
              <div>
                <div className="list-title">ID Arsip</div>
                <div className="muted">{selectedArchive.archiveId}</div>
              </div>
              <div className="list-right">{statusBadge(selectedArchive.status)}</div>
            </div>
            <div className="list-item small">
              <div>
                <div className="list-title">Owner</div>
                <div className="muted">{selectedArchive.owner}</div>
              </div>
              <div>
                <div className="list-title">Klasifikasi</div>
                <div className="muted">{selectedArchive.classification}</div>
              </div>
            </div>
            <div className="list-item small">
              <div>
                <div className="list-title">Pengunggah</div>
                <div className="muted">
                  {selectedArchive.uploaderName || selectedArchive.owner}
                  {selectedArchive.uploaderType && ` (${selectedArchive.uploaderType})`}
                </div>
              </div>
            </div>
            <div className="list-item small">
              <div>
                <div className="list-title">Waktu Dibuat</div>
                <div className="muted">{formatIsoTimestamp(selectedArchive.timestamp)}</div>
              </div>
              {selectedArchive.submittedAt && (
                <div>
                  <div className="list-title">Waktu Submit</div>
                  <div className="muted">{formatIsoTimestamp(selectedArchive.submittedAt)}</div>
                </div>
              )}
              {selectedArchive.approvedAt && (
                <div>
                  <div className="list-title">Waktu Approve</div>
                  <div className="muted">{formatIsoTimestamp(selectedArchive.approvedAt)}</div>
                </div>
              )}
            </div>
            {selectedArchive.status === "Approved" && !selectedArchive.loan && (
              <div className="list-item small">
                <div>
                  <div className="list-title">Ketersediaan</div>
                  <div className="muted">Arsip tersedia dan dapat dipinjam oleh Peminjam Eksternal.</div>
                </div>
              </div>
            )}
            {selectedArchive.loan && (
              <div className="list-item small">
                <div>
                  <div className="list-title">Status Peminjaman</div>
                  <div className="muted">
                    Status: {selectedArchive.loan.status}
                    {(selectedArchive.loan.borrowerName || selectedArchive.loan.borrower) &&
                      ` | Peminjam: ${
                        selectedArchive.loan.borrowerName || selectedArchive.loan.borrower
                      }${selectedArchive.loan.borrowerType ? ` (${selectedArchive.loan.borrowerType})` : ""}`}
                    {selectedArchive.loan.loanStart &&
                      ` | Mulai: ${formatIsoTimestamp(selectedArchive.loan.loanStart)}`}
                    {selectedArchive.loan.dueDate &&
                      ` | Jatuh tempo: ${formatIsoTimestamp(selectedArchive.loan.dueDate)}`}
                    {typeof selectedArchive.loan.extensionCount === "number" &&
                      ` | Perpanjangan: ${selectedArchive.loan.extensionCount}x`}
                    {selectedArchive.loan.returnedAt &&
                      ` | Dikembalikan: ${formatIsoTimestamp(selectedArchive.loan.returnedAt)}`}
                  </div>
                </div>
              </div>
            )}
            <div className="list-item small">
              <div>
                <div className="list-title">IPFS CID</div>
                <div className="muted">{selectedArchive.ipfsCID}</div>
              </div>
              <div>
                <div className="list-title">Hash Cipher (SHA-256)</div>
                <div className="muted">{selectedArchive.hashCipher}</div>
              </div>
            </div>
            {selectedArchive.rejectionNote && (
              <div className="list-item small">
                <div>
                  <div className="list-title">Catatan Penolakan</div>
                  <div className="muted">{selectedArchive.rejectionNote}</div>
                </div>
              </div>
            )}
            {selectedArchive.approvals && selectedArchive.approvals.length > 0 && (
              <div className="list-item small">
                <div>
                  <div className="list-title">Riwayat Approval</div>
                  {selectedArchive.approvals.map((appr, idx) => (
                    <div key={idx} className="muted">
                      {appr.timestamp} oleh {appr.approver}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="list-item small">
              <div>
                <div className="list-title">File Arsip</div>
                <button className="btn ghost" type="button" onClick={() => onViewFile(selectedArchive.archiveId)}>
                  Tampilkan / Unduh File
                </button>
              </div>
            </div>
            {fileUrl && (
              <div className="list-item small" style={{ display: "block" }}>
                <div className="list-title">Preview</div>
                <div className="muted">Jika bukan gambar, gunakan tautan unduh di bawah.</div>
                <div style={{ marginTop: "0.75rem" }}>
                  <img
                    src={fileUrl}
                    alt="Preview arsip"
                    style={{ maxWidth: "100%", borderRadius: "12px" }}
                  />
                </div>
                <div style={{ marginTop: "0.75rem" }}>
                  <a href={fileUrl} download className="btn ghost">
                    Unduh File
                  </a>
                </div>
              </div>
            )}
          </div>
                </section>
              )}

              {keyData && (
                <section className="panel wide">
                  <div className="panel-title">Kunci Dekripsi</div>
                  <div className="muted">Archive ID: {keyData.archiveId}</div>
                  <div className="key-grid">
                    <div>
                      <div className="key-label">Key (base64)</div>
                      <textarea readOnly value={keyData.key} />
                    </div>
                    <div>
                      <div className="key-label">IV (base64)</div>
                      <textarea readOnly value={keyData.iv} />
                    </div>
                    <div>
                      <div className="key-label">Tag (base64)</div>
                      <textarea readOnly value={keyData.tag} />
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
              {activeSection === "loan" && canBorrow && (
                <section className="panel wide">
                  <div className="panel-title">Peminjaman Arsip</div>

                  <div className="muted" style={{ marginBottom: "0.5rem" }}>
                    Langkah 1: pastikan arsip sudah berstatus Approved. Isi Archive ID dan data peminjam untuk membuat
                    peminjaman baru.
                  </div>

                  <div className="panel-subtitle">Peminjaman Baru (isi data peminjam)</div>
                  <div className="inline-actions">
                    <input
                      value={loanArchiveId}
                      onChange={(e) => setLoanArchiveId(e.target.value)}
                      placeholder="Archive ID untuk peminjaman"
                    />
                  </div>
                  <div className="form" style={{ marginTop: "0.75rem" }}>
                    <input
                      value={borrowerContact.name}
                      onChange={(e) => setBorrowerContact({ ...borrowerContact, name: e.target.value })}
                      placeholder="Nama peminjam (untuk notifikasi)"
                    />
                    <input
                      type="email"
                      value={borrowerContact.email}
                      onChange={(e) => setBorrowerContact({ ...borrowerContact, email: e.target.value })}
                      placeholder="Email peminjam (opsional)"
                    />
                    <input
                      value={borrowerContact.phone}
                      onChange={(e) => setBorrowerContact({ ...borrowerContact, phone: e.target.value })}
                      placeholder="No. HP / WhatsApp peminjam (opsional)"
                    />
                    <select
                      value={borrowerContact.type}
                      onChange={(e) => setBorrowerContact({ ...borrowerContact, type: e.target.value })}
                    >
                      <option value="Perorangan">Perorangan</option>
                      <option value="PT/Instansi">PT / Instansi</option>
                    </select>
                  </div>
                  <div className="inline-actions" style={{ marginTop: "0.75rem" }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={onBorrow}
                      disabled={!loanArchiveId || !borrowerContact.name}
                    >
                      Pinjam
                    </button>
                  </div>

                  <div className="divider" style={{ margin: "1.25rem 0" }} />

                  <div className="panel-subtitle">Perpanjang / Pengembalian</div>
                  <div className="inline-actions">
                    <input
                      value={loanArchiveId}
                      onChange={(e) => setLoanArchiveId(e.target.value)}
                      placeholder="Archive ID arsip yang sedang dipinjam"
                    />
                  </div>
                  <div className="inline-actions" style={{ marginTop: "0.75rem" }}>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={onExtendLoan}
                      disabled={!loanArchiveId}
                    >
                      Perpanjang (maks. 2x)
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={onReturnLoan}
                      disabled={!loanArchiveId}
                    >
                      Kembalikan
                    </button>
                  </div>
                  <div className="muted" style={{ marginTop: "0.75rem" }}>
                    Untuk perpanjangan dan pengembalian, cukup isi Archive ID. Waktu mulai pinjam, jatuh tempo, dan
                    perpanjangan dicatat otomatis di blockchain dan muncul di Audit Trail arsip terkait.
                  </div>
                </section>
              )}
        </>
      )}

      <footer className="footer">
        <div>Blockchain: Hyperledger Fabric | Storage: IPFS | Auth: Username/Password</div>
        <div>Versi Aplikasi: {APP_VERSION}</div>
      </footer>
    </div>
  );
}
