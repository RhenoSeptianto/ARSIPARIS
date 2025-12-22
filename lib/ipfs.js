"use strict";

async function loadIpfsModule() {
  const mod = await import("ipfs-http-client");
  return mod;
}

async function createIpfsClient({ url }) {
  if (!url) {
    throw new Error("IPFS_API_URL tidak boleh kosong");
  }
  const { create } = await loadIpfsModule();
  return create({ url });
}

async function checkIpfs(clientPromise) {
  const client = await clientPromise;
  if (!client) throw new Error("IPFS client belum tersedia");
  return client.id();
}

module.exports = { createIpfsClient, checkIpfs };
