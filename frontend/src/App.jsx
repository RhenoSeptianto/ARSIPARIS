import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

const roleLabels = {
  Admin: "Admin",
  Uploader: "Uploader (Unit Kerja)",
  Approver: "Approver (Arsiparis)",
  Auditor: "Auditor",
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
  const [userForm, setUserForm] = useState({ username: "", password: "", role: "Uploader" });
  const [userList, setUserList] = useState([]);
  const [editUser, setEditUser] = useState(null);

  const [uploadForm, setUploadForm] = useState({ classification: "", file: null });
  const [submitId, setSubmitId] = useState("");
  const [approveId, setApproveId] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [auditTrail, setAuditTrail] = useState([]);
  const [auditId, setAuditId] = useState("");
  const [keyData, setKeyData] = useState(null);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [fileUrl, setFileUrl] = useState("");

  const role = user?.role || "";

  const canManageUsers = role === "Admin";
  const canUpload = role === "Uploader";
  const canApprove = role === "Approver";
  const canAudit = role === "Auditor" || role === "Approver" || role === "Admin";

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
      const res = await fetch(`${API_BASE}/archives`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload gagal");
      setMessage(`Arsip tersimpan. ID: ${data.archiveId}`);
      setSubmitId(data.archiveId);
      setUploadForm({ classification: "", file: null });
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

  const archiveRows = useMemo(() => {
    if (!archives.length) return <div className="muted">Belum ada arsip.</div>;
    return archives.map((a) => (
      <div key={a.archive_id} className="list-item">
        <div>
          <div className="list-title">{a.archive_id}</div>
          <div className="muted">Owner: {a.owner}</div>
          <div className="muted">Klasifikasi: {a.classification}</div>
        </div>
        <div className="list-right">
          {statusBadge(a.status)}
          <button className="btn ghost" onClick={() => onViewArchive(a.archive_id)}>
            Detail
          </button>
          <button className="btn ghost" onClick={() => onFetchKey(a.archive_id)}>
            Kunci
          </button>
        </div>
      </div>
    ));
  }, [archives]);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <div className="eyebrow">Sistem Arsiparis Terdesentralisasi</div>
          <h1>DApp Arsip Berbasis Hyperledger Fabric</h1>
          <p>
            Integritas on-chain, E2E encryption, dan audit trail untuk pengelolaan arsip instansi.
          </p>
        </div>
        <div className="hero-card">
          <div className="card-title">Status Session</div>
          {user ? (
            <>
              <div className="muted">User: {user.username}</div>
              <div className="muted">Role: {roleLabels[user.role]}</div>
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
                  setUploadForm({ classification: "", file: null });
                  setMessage("");
                  setLoginForm({ username: "", password: "", captchaAnswer: "" });
                  setCaptcha({ a: null, b: null, token: "" });
                  loadCaptcha();
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
        <section className="grid">
          {canManageUsers && (
            <div className="panel">
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
            </div>
          )}

          {canUpload && (
            <div className="panel">
              <div className="panel-title">Unggah Arsip</div>
              <form onSubmit={onUpload} className="form">
                <input
                  value={uploadForm.classification}
                  onChange={(e) => setUploadForm({ ...uploadForm, classification: e.target.value })}
                  placeholder="Klasifikasi"
                />
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
            </div>
          )}

          {canApprove && (
            <div className="panel">
              <div className="panel-title">Review Arsip</div>
              <div className="inline-actions">
                <input
                  value={approveId}
                  onChange={(e) => setApproveId(e.target.value)}
                  placeholder="Archive ID"
                />
                <button className="btn" onClick={onApprove}>
                  Approve
                </button>
              </div>
              <textarea
                rows="3"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Catatan penolakan"
              />
              <button className="btn secondary" onClick={onReject}>
                Reject
              </button>
            </div>
          )}

          {canAudit && (
            <div className="panel">
              <div className="panel-title">Audit Trail</div>
              <div className="inline-actions">
                <input
                  value={auditId}
                  onChange={(e) => setAuditId(e.target.value)}
                  placeholder="Archive ID"
                />
                <button className="btn" onClick={onFetchAudit}>
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
                        <div className="muted">{item.timestamp?.seconds?.low || ""}</div>
                      </div>
                      <div className="muted">Status: {item.value?.status || ""}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {user && (
        <section className="panel wide">
          <div className="panel-title">Daftar Arsip</div>
          <div className="list">{archiveRows}</div>
        </section>
      )}

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
                <div className="list-title">Waktu Dibuat</div>
                <div className="muted">{selectedArchive.timestamp}</div>
              </div>
              {selectedArchive.submittedAt && (
                <div>
                  <div className="list-title">Waktu Submit</div>
                  <div className="muted">{selectedArchive.submittedAt}</div>
                </div>
              )}
              {selectedArchive.approvedAt && (
                <div>
                  <div className="list-title">Waktu Approve</div>
                  <div className="muted">{selectedArchive.approvedAt}</div>
                </div>
              )}
            </div>
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

      <footer className="footer">
        <div>Blockchain: Hyperledger Fabric | Storage: IPFS | Auth: Username/Password</div>
      </footer>
    </div>
  );
}
