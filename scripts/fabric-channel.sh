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
export CORE_PEER_BCCSP_SW_FILEKEYSTORE_KEYSTORE=/etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore

ORDERER_CA=/etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt

peer channel create -o orderer.example.com:7050 -c mychannel \
  -f /etc/hyperledger/fabric/channel-artifacts/mychannel.tx \
  --outputBlock /etc/hyperledger/fabric/channel-artifacts/mychannel.block \
  --tls --cafile "$ORDERER_CA"

peer channel join -b /etc/hyperledger/fabric/channel-artifacts/mychannel.block

echo "Channel mychannel berhasil dibuat dan peer bergabung."
