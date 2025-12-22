#!/bin/sh
set -e

export FABRIC_CA_CLIENT_HOME=/etc/hyperledger/fabric/organizations
export FABRIC_CFG_PATH=/etc/hyperledger/fabric/config
CA_URL=http://ca.org1.example.com:7054

mkdir -p /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com
mkdir -p /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com
mkdir -p /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
mkdir -p /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/msp
mkdir -p /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp

fabric-ca-client enroll -u http://admin:adminpw@ca.org1.example.com:7054 --caname ca-org1

fabric-ca-client register --caname ca-org1 --id.name org1admin --id.secret org1adminpw --id.type admin || true
fabric-ca-client register --caname ca-org1 --id.name peer0 --id.secret peer0pw --id.type peer || true
fabric-ca-client register --caname ca-org1 --id.name orderer --id.secret ordererpw --id.type orderer || true

mkdir -p /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/msp/cacerts
mkdir -p /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/msp/cacerts
mkdir -p /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/msp/tlscacerts
mkdir -p /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/msp/tlscacerts

cp /etc/hyperledger/fabric/organizations/msp/cacerts/* \
  /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/msp/cacerts/
cp /etc/hyperledger/fabric/organizations/msp/cacerts/* \
  /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/msp/cacerts/

cat > /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/msp/config.yaml <<'EOF'
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/ca-org1-example-com-7054-ca-org1.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/ca-org1-example-com-7054-ca-org1.pem
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/ca-org1-example-com-7054-ca-org1.pem
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/ca-org1-example-com-7054-ca-org1.pem
    OrganizationalUnitIdentifier: orderer
EOF

cat > /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/msp/config.yaml <<'EOF'
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/ca-org1-example-com-7054-ca-org1.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/ca-org1-example-com-7054-ca-org1.pem
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/ca-org1-example-com-7054-ca-org1.pem
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/ca-org1-example-com-7054-ca-org1.pem
    OrganizationalUnitIdentifier: orderer
EOF

cp /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/msp/config.yaml \
  /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/config.yaml
cp /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/msp/config.yaml \
  /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/msp/config.yaml
cp /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/msp/config.yaml \
  /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/config.yaml

fabric-ca-client enroll -u http://org1admin:org1adminpw@ca.org1.example.com:7054 --caname ca-org1 \
  -M /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp

fabric-ca-client enroll -u http://peer0:peer0pw@ca.org1.example.com:7054 --caname ca-org1 \
  -M /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/msp

fabric-ca-client enroll -u http://peer0:peer0pw@ca.org1.example.com:7054 --caname ca-org1 \
  --enrollment.profile tls \
  --csr.hosts peer0.org1.example.com --csr.hosts peer0 --csr.hosts localhost --csr.hosts 127.0.0.1 \
  -M /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls

cp /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/tlscacerts/* \
  /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
cp /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/signcerts/* \
  /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/server.crt
PEER_KEY_FILE=$(ls /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/keystore/* | head -n 1)
cp "$PEER_KEY_FILE" \
  /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/server.key

fabric-ca-client enroll -u http://orderer:ordererpw@ca.org1.example.com:7054 --caname ca-org1 \
  -M /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp

fabric-ca-client enroll -u http://orderer:ordererpw@ca.org1.example.com:7054 --caname ca-org1 \
  --enrollment.profile tls \
  --csr.hosts orderer.example.com --csr.hosts orderer --csr.hosts localhost --csr.hosts 127.0.0.1 \
  -M /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls

cp /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/tlscacerts/* \
  /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt
cp /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/signcerts/* \
  /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.crt
ORDERER_KEY_FILE=$(ls /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/keystore/* | head -n 1)
cp "$ORDERER_KEY_FILE" \
  /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.key

cp /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/tlscacerts/* \
  /etc/hyperledger/fabric/organizations/ordererOrganizations/example.com/msp/tlscacerts/ca.crt
cp /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/tlscacerts/* \
  /etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/msp/tlscacerts/ca.crt

configtxgen -profile ArsiparisOrdererGenesis -channelID system-channel \
  -outputBlock /etc/hyperledger/fabric/channel-artifacts/genesis.block

configtxgen -profile ArsiparisChannel -channelID mychannel \
  -outputCreateChannelTx /etc/hyperledger/fabric/channel-artifacts/mychannel.tx

echo "CA bootstrap selesai."
