#!/bin/sh
set -e

export FABRIC_CFG_PATH=/etc/hyperledger/fabric/config
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=peer0.org1.example.com:7051
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_BCCSP_DEFAULT=SW
export CORE_PEER_BCCSP_SW_HASH=SHA2
export CORE_PEER_BCCSP_SW_SECURITY=256
ORDERER_CA=/etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt

CC_LABEL=archive_6
CC_VERSION=6.0
# Upgrade definisi chaincode ke sequence berikutnya.
CC_SEQUENCE=5

peer lifecycle chaincode package /tmp/archive.tar.gz \
  --path /etc/hyperledger/fabric/chaincode --lang node --label "$CC_LABEL"

if peer lifecycle chaincode queryinstalled | grep -q "${CC_LABEL}:"; then
  PKG_ID=$(peer lifecycle chaincode queryinstalled | grep -o "${CC_LABEL}:.*" | cut -d',' -f1 | sed 's/Package ID: //')
else
  peer lifecycle chaincode install /tmp/archive.tar.gz
  PKG_ID=$(peer lifecycle chaincode queryinstalled | grep -o "${CC_LABEL}:.*" | cut -d',' -f1 | sed 's/Package ID: //')
fi

if peer lifecycle chaincode queryapproved -o orderer.example.com:7050 --channelID mychannel --name archive --sequence "$CC_SEQUENCE" --tls --cafile "$ORDERER_CA" > /tmp/approved.json 2>/dev/null; then
  echo "Approve sudah ada, lanjut commit."
else
  peer lifecycle chaincode approveformyorg \
    -o orderer.example.com:7050 \
    --channelID mychannel \
    --name archive \
    --version "$CC_VERSION" \
    --package-id "$PKG_ID" \
    --sequence "$CC_SEQUENCE" \
    --tls --cafile "$ORDERER_CA" || true
fi

peer lifecycle chaincode commit \
  -o orderer.example.com:7050 \
  --channelID mychannel \
  --name archive \
  --version "$CC_VERSION" \
  --sequence "$CC_SEQUENCE" \
  --peerAddresses peer0.org1.example.com:7051 \
  --tlsRootCertFiles "$CORE_PEER_TLS_ROOTCERT_FILE" \
  --tls --cafile "$ORDERER_CA"

echo "Chaincode archive berhasil di-deploy."
