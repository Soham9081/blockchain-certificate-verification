// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CertificateVerification {
    struct Certificate {
        string certificateId;
        string studentName;
        string courseName;
        uint256 issueDate;
        address issuer;
        bool exists;
        bytes32 documentHash; // SHA-256 hash of the associated PDF (zero if none)
    }

    mapping(string => Certificate) public certificates;
    uint256 public certificateCount;

    event CertificateIssued(
        string certificateId,
        string studentName,
        string courseName,
        uint256 issueDate,
        address issuer,
        bytes32 documentHash
    );

    function issueCertificate(
        string memory certificateId,
        string memory studentName,
        string memory courseName,
        bytes32 documentHash
    ) public {
        require(bytes(certificateId).length > 0, "Certificate ID cannot be empty");
        require(bytes(studentName).length > 0, "Student name cannot be empty");
        require(bytes(courseName).length > 0, "Course name cannot be empty");
        require(!certificates[certificateId].exists, "Certificate ID already exists");

        certificates[certificateId] = Certificate({
            certificateId: certificateId,
            studentName: studentName,
            courseName: courseName,
            issueDate: block.timestamp,
            issuer: msg.sender,
            exists: true,
            documentHash: documentHash
        });

        certificateCount++;

        emit CertificateIssued(
            certificateId,
            studentName,
            courseName,
            block.timestamp,
            msg.sender,
            documentHash
        );
    }

    function verifyCertificate(string memory certificateId)
        public
        view
        returns (Certificate memory)
    {
        return certificates[certificateId];
    }
}
