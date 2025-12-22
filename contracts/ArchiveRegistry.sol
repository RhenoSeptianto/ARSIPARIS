// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Arsiparis Registry
/// @notice Minimal archive registry: store hashed CID, doc type, submitter, and admin decision.
contract ArchiveRegistry is Ownable {
    enum Status {
        Pending,
        Approved,
        Rejected
    }

    struct Record {
        bytes32 cidHash; // keccak256 of CID or CID+salt
        address submitter;
        Status status;
        uint64 createdAt;
        uint64 decidedAt;
        string docType;
    }

    uint256 public recordCount;
    mapping(uint256 => Record) public records;

    event Submitted(uint256 indexed id, bytes32 cidHash, address indexed submitter, string docType);
    event Decided(uint256 indexed id, Status status, address indexed admin);

    constructor() Ownable(msg.sender) {}

    function submit(bytes32 cidHash, string calldata docType) external returns (uint256 id) {
        id = ++recordCount;
        records[id] = Record({
            cidHash: cidHash,
            submitter: msg.sender,
            status: Status.Pending,
            createdAt: uint64(block.timestamp),
            decidedAt: 0,
            docType: docType
        });
        emit Submitted(id, cidHash, msg.sender, docType);
    }

    function approve(uint256 id) external onlyOwner {
        _decide(id, Status.Approved);
    }

    function reject(uint256 id) external onlyOwner {
        _decide(id, Status.Rejected);
    }

    function _decide(uint256 id, Status newStatus) internal {
        Record storage r = records[id];
        require(r.cidHash != bytes32(0), "not found");
        require(r.status == Status.Pending, "already decided");
        r.status = newStatus;
        r.decidedAt = uint64(block.timestamp);
        emit Decided(id, newStatus, msg.sender);
    }
}
