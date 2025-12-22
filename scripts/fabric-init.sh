#!/bin/sh
set -e

export FABRIC_CFG_PATH=/etc/hyperledger/fabric

mkdir -p /etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com
export FABRIC_CA_CLIENT_HOME=/etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com

fabric-ca-client enroll -u http://admin:adminpw@ca.org1.example.com:7054 --caname ca-org1
fabric-ca-client register --caname ca-org1 --id.name org1admin --id.secret org1adminpw --id.type admin
fabric-ca-client register --caname ca-org1 --id.name peer0 --id.secret peer0pw --id.type peer
fabric-ca-client register --caname ca-org1 --id.name orderer --id.secret ordererpw --id.type orderer

fabric-ca-client enroll -u http://peer0:peer0pw@ca.org1.example.com:7054 --caname ca-org1 \
  -M /etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/msp

fabric-ca-client enroll -u http://org1admin:org1adminpw@ca.org1.example.com:7054 --caname ca-org1 \
  -M /etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp

fabric-ca-client enroll -u http://peer0:peer0pw@ca.org1.example.com:7054 --caname ca-org1 \
  --enrollment.profile tls \
  -M /etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls

mkdir -p /etc/hyperledger/fabric/crypto-config/ordererOrganizations/example.com
export FABRIC_CA_CLIENT_HOME=/etc/hyperledger/fabric/crypto-config/ordererOrganizations/example.com

fabric-ca-client enroll -u http://admin:adminpw@ca.org1.example.com:7054 --caname ca-org1
fabric-ca-client enroll -u http://orderer:ordererpw@ca.org1.example.com:7054 --caname ca-org1 \
  -M /etc/hyperledger/fabric/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/msp

fabric-ca-client enroll -u http://orderer:ordererpw@ca.org1.example.com:7054 --caname ca-org1 \
  --enrollment.profile tls \
  -M /etc/hyperledger/fabric/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls

cp /etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/tlscacerts/* \
  /etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
cp /etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/signcerts/* \
  /etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/server.crt
cp /etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/keystore/* \
  /etc/hyperledger/fabric/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/server.key

cp /etc/hyperledger/fabric/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/tlscacerts/* \
  /etc/hyperledger/fabric/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt
cp /etc/hyperledger/fabric/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/signcerts/* \
  /etc/hyperledger/fabric/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.crt
cp /etc/hyperledger/fabric/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/keystore/* \
  /etc/hyperledger/fabric/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.key

configtxgen -profile ArsiparisOrdererGenesis -channelID system-channel \
  -outputBlock /etc/hyperledger/fabric/channel-artifacts/genesis.block

configtxgen -profile ArsiparisChannel -channelID mychannel \
  -outputCreateChannelTx /etc/hyperledger/fabric/channel-artifacts/mychannel.tx

echo "Fabric bootstrap selesai. Jalankan fabric-channel.sh untuk create/join channel."
