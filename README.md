# Sistem Arsiparis Terdesentralisasi Berbasis Hyperledger Fabric

Aplikasi arsip terdesentralisasi berbasis Hyperledger Fabric (permissioned blockchain, bukan blockchain publik) untuk menjaga integritas, kerahasiaan, dan audit trail arsip institusi tanpa crypto wallet dan tanpa gas fee.

## Prinsip
- Integrity: data arsip dan riwayat keputusan disimpan immutable di Fabric ledger.
- Confidentiality: file dienkripsi AES-256-GCM sebelum masuk IPFS.
- Conditional approval: status arsip dikontrol oleh approver melalui chaincode.

## Peran (4 role)
1. Admin: kelola user/role dan identity Fabric.
2. Uploader (Unit Kerja): unggah arsip + metadata.
3. Approver (Arsiparis): review dan approve/reject.
4. Auditor: read-only, audit trail dan verifikasi hash.

## Arsitektur
- Blockchain: Hyperledger Fabric (permissioned).
- Chaincode: Node.js (`chaincode/`).
- Backend API: Express (`server.js`).
- Storage: IPFS (multi node opsional) untuk file terenkripsi, SQLite untuk metadata lokal.
- Auth: username/password (JWT) + Fabric ABAC.
- Container: Docker Compose.

## Struktur
- `chaincode/` - Chaincode Fabric.
- `fabric/` - connection profile dan configtx.
- `server.js` - Backend API.
- `frontend/` - UI React sederhana (role-based).
- `scripts/` - script bootstrap Fabric.

## Setup
Prerequisites:
- Docker + Docker Compose
- Node.js 20+ (opsional jika run lokal tanpa container)

### 1) Siapkan env
Salin `.env.example` ke `.env` dan isi `JWT_SECRET` + `MASTER_KEY`.
Docker Compose akan membaca `.env` untuk backend.
Jika ingin redundansi IPFS, isi `IPFS_API_URLS` (comma-separated).

Contoh membuat `MASTER_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Contoh membuat `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Install di Device Baru (Quick Start)
1. Clone repository dan masuk ke folder proyek:
	```bash
	git clone https://github.com/RhenoSeptianto/ARSIPARIS.git
	cd ARSIPARIS
	```
2. Pastikan Docker Desktop (atau Docker Engine) sudah terinstall dan berjalan.
3. Salin file environment dan isi nilai penting:
	```bash
	# Linux / macOS
	cp .env.example .env
	# Windows (PowerShell)
	copy .env.example .env
	```
	- Set `JWT_SECRET` dengan string acak yang cukup panjang.
	- Set `MASTER_KEY` dengan nilai base64 32 bytes (lihat contoh perintah di atas).
4. Bootstrap jaringan Fabric (hanya perlu sekali per environment):
	```bash
	docker compose up -d ca.org1.example.com
	docker compose run --rm cli sh scripts/fabric-init.sh
	docker compose up -d orderer.example.com peer0.org1.example.com
	docker compose run --rm cli sh scripts/fabric-channel.sh
	docker compose run --rm cli sh scripts/fabric-deploy-cc.sh
	```
5. Jalankan IPFS, backend, dan frontend:
	```bash
	docker compose up -d ipfs ipfs2 backend frontend
	```
6. Akses aplikasi:
	- UI: `http://localhost:5173`
	- API backend: `http://localhost:3001`

### 2) Bootstrap Fabric network
Jalankan CA terlebih dulu:
```bash
docker compose up -d ca.org1.example.com
```

Generate MSP + genesis + channel tx:
```bash
docker compose run --rm cli sh scripts/fabric-init.sh
```

Start orderer + peer:
```bash
docker compose up -d orderer.example.com peer0.org1.example.com
```

Create channel + join peer:
```bash
docker compose run --rm cli sh scripts/fabric-channel.sh
```

Deploy chaincode:
```bash
docker compose run --rm cli sh scripts/fabric-deploy-cc.sh
```

### 3) Jalankan backend + IPFS + frontend
```bash
docker compose up -d ipfs ipfs2 backend frontend
```

UI tersedia di `http://localhost:5173`.

## Alur Aplikasi
1. User login (tanpa wallet).
2. Uploader mengunggah dokumen dan metadata.
3. Backend mengenkripsi file (AES-256-GCM) dan upload ke IPFS (multi node jika aktif).
4. Hash cipher + CID + metadata disimpan di Fabric.
5. Approver menyetujui/menolak.
6. Auditor melihat audit trail.

## Penggunaan Singkat (Peran Pengguna)
- **Admin**
	- Login ke UI (`http://localhost:5173`).
	- Buka menu Manajemen Pengguna dan buat user baru dengan role: Uploader, Approver, atau Auditor.
- **Uploader (Unit Kerja)**
	- Login dengan akun Uploader.
	- Buka menu Upload Arsip, pilih file dan isi klasifikasi, lalu simpan.
	- Setelah ID arsip muncul, klik kirim/submit untuk mengirim ke Approver.
- **Approver (Arsiparis)**
	- Login dengan akun Approver.
	- Lihat daftar arsip Pending, buka detail arsip yang ingin direview.
	- Tekan Approve untuk menyetujui atau Reject untuk menolak (isi alasan jika menolak).
- **Auditor**
	- Login dengan akun Auditor.
	- Buka menu Audit, masukkan ID arsip yang ingin dicek.
	- Lihat status akhir arsip dan riwayat keputusannya (audit trail).

## API Ringkas
- `POST /auth/login`
- `POST /admin/users`
- `POST /archives` (multipart file)
- `POST /archives/:id/submit`
- `POST /archives/:id/approve`
- `POST /archives/:id/reject`
- `GET /archives` / `GET /archives/:id`
- `GET /archives/:id/audit`
- `GET /archives/:id/key`

## Catatan
- Tidak ada MetaMask/crypto wallet.
- Tidak ada gas fee.
- ABAC di chaincode menggunakan attribute `role` dari identity Fabric.

## Rangkuman Teknis Detail

### Tujuan & Konteks Sistem
- Sistem Arsiparis Terdesentralisasi untuk pengelolaan arsip instansi berbasis Hyperledger Fabric.
- Menjaga integritas (ledger immutable), kerahasiaan (enkripsi AES-256-GCM sebelum IPFS), dan audit trail keputusan arsip.
- Tidak memakai crypto wallet dan tidak ada gas fee karena berjalan di jaringan permissioned.

### Peran Pengguna
- **Admin**: kelola user/role, bootstrap identitas di Fabric CA, dan mengelola akses ke sistem.
- **Uploader (Unit Kerja)**: unggah arsip + metadata, lalu submit arsip ke approver.
- **Approver (Arsiparis)**: melakukan review arsip Pending dan memberi keputusan approve/reject.
- **Auditor**: read-only, melihat daftar arsip, detail, dan audit trail untuk keperluan audit.

### Arsitektur Teknis
- **Blockchain / Fabric**
	- Hyperledger Fabric permissioned network dengan konfigurasi di folder `fabric/`, `config/`, `organizations/`, dan `scripts/`.
	- Channel utama `mychannel` dan chaincode `archive` (Node.js) untuk mencatat metadata arsip, status, dan jejak keputusan.
- **Backend API (Express)**
	- Implementasi di `server.js` dengan endpoint untuk autentikasi, manajemen user, dan operasi arsip.
	- Menggunakan `fabric-network` dan `fabric-ca-client` untuk koneksi ke peer/orderer dan CA Fabric.
	- Menggunakan `better-sqlite3` untuk database lokal (users, archives, archive_keys) serta `ipfs-http-client` untuk koneksi ke node IPFS.
- **Penyimpanan**
	- **IPFS**: menyimpan ciphertext dokumen terenkripsi. Konfigurasi dan datastore lokal berada di folder `data/ipfs` dan `data/ipfs2` (opsional).
	- **SQLite**: menyimpan user, metadata arsip, dan key terenkripsi di file `data/arsiparis.db`.
- **Frontend (React + Vite)**
	- UI role-based di folder `frontend/` (file utama `frontend/src/App.jsx`).
	- Berkomunikasi dengan backend via `VITE_API_BASE` (default `http://localhost:3001`).

#### Topologi Node (Docker Compose)
- **Fabric**
	- 1 orderer: `orderer.example.com`.
	- 1 peer organisasi: `peer0.org1.example.com` (Org1MSP).
	- 1 CA: `ca.org1.example.com` (untuk registrasi dan enrolment identitas).
- **Layanan pendukung**
	- 2 node IPFS: service `ipfs` (API `:5001`, gateway `:8080`) dan `ipfs2` (API `:5002`, gateway `:8081`).
	- 1 backend API: service `backend` (`arsiparis-backend`).
	- 1 frontend: service `frontend` (Vite dev server `:5173`).
	- 1 container CLI admin: service `cli` (untuk bootstrap dan operasi Fabric via script).

#### Peran Komponen Fabric
- **CA (`hyperledger/fabric-ca:1.5`)**
	- Layanan Certificate Authority yang menerbitkan identitas digital (sertifikat X.509) untuk admin, peer, dan client (user aplikasi).
	- Menangani proses registrasi dan enrolment user: menghasilkan pasangan private key + certificate yang kemudian disimpan di wallet.
- **Orderer (`hyperledger/fabric-orderer:2.5`)**
	- Mengumpulkan transaksi dari client/peer, mengurutkannya, dan membentuk blok.
	- Mendistribusikan blok ke peer di channel `mychannel` sehingga semua peer memiliki urutan transaksi yang konsisten.
- **Peer (`hyperledger/fabric-peer:2.5`)**
	- Menjalankan chaincode (smart contract) `archive` untuk mensimulasikan dan meng-endorse transaksi.
	- Menyimpan ledger (riwayat blok dan world state) dan mengupdate state ketika menerima blok baru dari orderer.

### Keamanan & Kriptografi
- **MASTER_KEY**
	- Diambil dari environment variable `MASTER_KEY` (base64, 32 bytes) dan divalidasi saat startup.
	- Dipakai untuk "membungkus" (wrap) key dokumen, IV, dan auth tag dengan AES-256-GCM sebelum disimpan di tabel `archive_keys`.
- **Enkripsi Dokumen**
	- Untuk setiap upload dokumen:
		- Dibuat key acak 32 byte dan IV acak 12 byte.
		- Dokumen dienkripsi menggunakan AES-256-GCM → menghasilkan ciphertext + auth tag.
		- Ciphertext diupload ke IPFS → didapat CID; hash ciphertext dan CID disimpan di Fabric + SQLite.
		- Key, IV, dan tag di-wrap dengan MASTER_KEY dan disimpan sebagai baris di `archive_keys`.
- **Autentikasi & Otorisasi**
	- Login menggunakan username/password yang disimpan sebagai hash `bcrypt` pada tabel `users`.
	- Backend mengeluarkan JWT yang berisi `sub` (username), `role`, dan `fabricId`.
	- Middleware `authRequired` dan `requireRole` membatasi akses endpoint berdasarkan role.
	- Di Fabric, ABAC memanfaatkan attribute `role` dan `username` di sertifikat user.

### Alur Bisnis Arsip
- **Admin**
	- Membuat user baru melalui endpoint `/admin/users` (via UI atau langsung API).
	- Backend mendaftarkan dan meng-enroll user ke Fabric CA dengan atribut identitas yang sesuai.
- **Uploader**
	- Login, lalu mengunggah file + klasifikasi ke endpoint `POST /archives`.
	- Backend mengenkripsi file, upload ciphertext ke IPFS, dan menyimpan metadata + hash ke Fabric & SQLite.
	- Mengirim arsip untuk persetujuan dengan `POST /archives/:id/submit`.
- **Approver**
	- Melihat daftar arsip Pending dari endpoint `GET /archives`.
	- Menyetujui arsip melalui `POST /archives/:id/approve` atau menolak melalui `POST /archives/:id/reject` (dengan alasan penolakan).
- **Auditor**
	- Mengambil audit trail dan detail arsip dari endpoint `GET /archives/:id/audit` dan `GET /archives/:id`.
	- Memverifikasi konsistensi hash dan status keputusan terhadap ledger Fabric.

### ID Arsip vs ID Transaksi (Audit Trail)
- **`archiveId`**
	- ID utama arsip yang digunakan aplikasi (format UUID), misal: `fddd1171-e648-4c97-886b-df15076a01eb`.
	- Dipakai di semua endpoint bisnis: `GET /archives/:id`, `POST /archives/:id/approve`, `GET /archives/:id/audit`, dan lain-lain.
- **`txId` (ID transaksi)**
	- ID setiap transaksi di Hyperledger Fabric yang menyentuh arsip tersebut (deretan karakter hex panjang).
	- Ditampilkan di hasil `GetAuditTrail` sebagai daftar riwayat, misalnya beberapa transaksi untuk satu `archiveId` dengan status bertahap Draft → Pending → Approved.
- **Hubungan keduanya**
	- Satu `archiveId` dapat memiliki banyak `txId` (setiap perubahan status atau update lain menghasilkan satu transaksi baru).
	- Audit trail menampilkan deretan `txId` dan nilai status pada masing-masing titik waktu, sehingga perubahan arsip dapat diaudit tanpa mengubah ID arsip utamanya.

### Kontrak Solidity (Opsional / Referensi)
- Terdapat kontrak `ArchiveRegistry` di `contracts/ArchiveRegistry.sol` (berbasis Solidity + OpenZeppelin).
- Digunakan sebagai contoh/alternatif registry arsip di jaringan EVM, namun jalur utama sistem ini tetap menggunakan chaincode Hyperledger Fabric.

### Smart Contract dalam Sistem Ini
- **Smart contract utama (Hyperledger Fabric)**
	- Smart contract di Fabric diwujudkan sebagai *chaincode* Node.js di folder `chaincode/`.
	- Fungsi seperti `RegisterArchive`, `SubmitArchive`, `ApproveArchive`, `RejectArchive`, dan `GetAuditTrail` berisi aturan bisnis untuk pengelolaan arsip.
	- Ketika backend memanggil `contract.submitTransaction(...)`, peer Fabric menjalankan fungsi chaincode tersebut dan hasilnya dicatat di ledger (tidak dapat diubah kembali).
- **Smart contract contoh (EVM / Solidity)**
	- File `contracts/ArchiveRegistry.sol` adalah smart contract berbasis Solidity yang mencontohkan registry arsip di jaringan EVM.
	- Saat ini digunakan sebagai referensi/opsi tambahan, sedangkan implementasi utama di aplikasi ini menggunakan chaincode Hyperledger Fabric.
- **Lapisan aplikasi off-chain**
	- Backend Express di `server.js` dan frontend React di `frontend/` **bukan** smart contract; keduanya adalah aplikasi off-chain yang:
		- Menangani login, enkripsi dokumen, upload ke IPFS, dan logika UI.
		- Mengirim transaksi ke smart contract/chaincode dan membaca data dari ledger untuk ditampilkan ke pengguna.

### Cara Jalan Singkat (Ringkasan)
- Siapkan `.env` dari `.env.example` dan isi minimal `JWT_SECRET` serta `MASTER_KEY` (base64, 32 bytes).
- Bootstrap jaringan Fabric menggunakan script di folder `scripts/` sesuai langkah pada bagian Setup di atas.
- Jalankan IPFS, backend, dan frontend menggunakan Docker Compose:
	- `docker compose up -d ipfs ipfs2 backend frontend`
- Akses UI di `http://localhost:5173` dan backend API di `http://localhost:3001`.

### Quick Demo (5-10 menit)
1. Pastikan semua service sudah up:
	```bash
	docker compose up -d ipfs ipfs2 backend frontend
	```
2. Login sebagai Admin (default dari `.env`), lalu buat 4 user:
	- Uploader, Approver, Auditor, Borrower.
3. Login sebagai Uploader:
	- Upload 1 file arsip, catat `Archive ID`.
	- Klik Submit untuk approval.
4. Login sebagai Approver:
	- Approve arsip menggunakan `Archive ID`.
5. Login sebagai Auditor:
	- Buka Audit Trail dan masukkan `Archive ID` untuk lihat riwayat transaksi.
6. (Opsional) Login sebagai Borrower:
	- Pinjam arsip yang sudah Approved, lalu lihat status pinjaman di daftar arsip.
