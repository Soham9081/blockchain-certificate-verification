import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, HARDHAT_CHAIN_ID_DECIMAL } from './contract';

// --- PDF SHA-256 helper (browser-native, no upload) ---
async function hashPdfFile(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const ZERO_HASH = '0x' + '00'.repeat(32);

function App() {
  const [account, setAccount] = useState('');
  const [networkError, setNetworkError] = useState('');

  // Issue state
  const [studentName, setStudentName] = useState('');
  const [certificateId, setCertificateId] = useState('');
  const [courseName, setCourseName] = useState('');
  const [issuePdfFile, setIssuePdfFile] = useState(null);
  const [issuePdfHash, setIssuePdfHash] = useState('');
  const [issueStatus, setIssueStatus] = useState('');
  const [issueTxHash, setIssueTxHash] = useState('');
  const [issueError, setIssueError] = useState('');
  const [isIssuing, setIsIssuing] = useState(false);
  const issuePdfRef = useRef(null);

  // Verify state
  const [verifyId, setVerifyId] = useState('');
  const [verifiedCert, setVerifiedCert] = useState(null);
  const [verifyNotFound, setVerifyNotFound] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyPdfFile, setVerifyPdfFile] = useState(null);
  const [docMatchResult, setDocMatchResult] = useState(null); // 'match' | 'mismatch' | null
  const verifyPdfRef = useRef(null);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          setAccount('');
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }
  }, []);

  const checkNetwork = async (provider) => {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== HARDHAT_CHAIN_ID_DECIMAL) {
      const msg = `Wrong network detected (Chain ID: ${network.chainId}). Please switch MetaMask to Hardhat Local (Chain ID: 31337, RPC: http://127.0.0.1:8545).`;
      setNetworkError(msg);
      return false;
    }
    setNetworkError('');
    return true;
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert('MetaMask not detected! Please install MetaMask extension.');
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const isCorrectNetwork = await checkNetwork(provider);
      if (!isCorrectNetwork) return;

      const accounts = await provider.send('eth_requestAccounts', []);
      if (accounts.length > 0) {
        setAccount(accounts[0]);
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting wallet: ' + (err.message || err));
    }
  };

  // Handle PDF selection in issue form
  const handleIssuePdfChange = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      setIssuePdfFile(null);
      setIssuePdfHash('');
      return;
    }
    setIssuePdfFile(file);
    const h = await hashPdfFile(file);
    setIssuePdfHash(h);
  };

  const handleIssueCertificate = async (e) => {
    e.preventDefault();
    setIssueError('');
    setIssueStatus('');
    setIssueTxHash('');

    if (!studentName.trim() || !certificateId.trim() || !courseName.trim()) {
      setIssueError('All fields (Student Name, Certificate ID, Course Name) are required.');
      return;
    }

    if (!CONTRACT_ADDRESS) {
      setIssueError('Contract not deployed yet! Please run deploy script first.');
      return;
    }

    try {
      setIsIssuing(true);
      if (!window.ethereum) throw new Error('MetaMask is not installed.');

      const provider = new ethers.BrowserProvider(window.ethereum);
      const isCorrectNetwork = await checkNetwork(provider);
      if (!isCorrectNetwork) {
        setIsIssuing(false);
        return;
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      // Use the computed PDF hash or zero bytes32 if no PDF selected
      const docHash = issuePdfHash || ZERO_HASH;

      setIssueStatus('Transaction pending... Please confirm in MetaMask.');
      const tx = await contract.issueCertificate(
        certificateId.trim(),
        studentName.trim(),
        courseName.trim(),
        docHash
      );

      setIssueStatus('Waiting for block confirmation...');
      const receipt = await tx.wait();

      setIssueStatus('Transaction successful!');
      setIssueTxHash(receipt.hash);

      // Clear inputs
      setStudentName('');
      setCertificateId('');
      setCourseName('');
      setIssuePdfFile(null);
      setIssuePdfHash('');
      if (issuePdfRef.current) issuePdfRef.current.value = '';
    } catch (err) {
      console.error(err);
      let errMsg = err.reason || err.message || 'Transaction failed';
      if (err.info && err.info.error && err.info.error.message) {
        errMsg = err.info.error.message;
      }
      setIssueError(errMsg);
      setIssueStatus('');
    } finally {
      setIsIssuing(false);
    }
  };

  const handleVerifyCertificate = async (e) => {
    e.preventDefault();
    setVerifyError('');
    setVerifiedCert(null);
    setVerifyNotFound(false);
    setDocMatchResult(null);

    if (!verifyId.trim()) {
      setVerifyError('Please enter a Certificate ID.');
      return;
    }

    if (!CONTRACT_ADDRESS) {
      setVerifyError('Contract not deployed yet! Please run deploy script first.');
      return;
    }

    try {
      setIsVerifying(true);
      // Read-only verification can use BrowserProvider or JsonRpcProvider
      let provider;
      if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
      } else {
        provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const cert = await contract.verifyCertificate(verifyId.trim());

      if (cert && cert.exists) {
        const certData = {
          certificateId: cert.certificateId,
          studentName: cert.studentName,
          courseName: cert.courseName,
          issueDate: new Date(Number(cert.issueDate) * 1000).toLocaleString(),
          issuer: cert.issuer,
          exists: cert.exists,
          documentHash: cert.documentHash
        };
        setVerifiedCert(certData);

        // If a PDF was uploaded for verification, compare hashes
        if (verifyPdfFile) {
          const uploadedHash = await hashPdfFile(verifyPdfFile);
          const storedHash = cert.documentHash;
          if (storedHash === ZERO_HASH) {
            // No PDF was registered — show info but no match/mismatch
            setDocMatchResult('no-pdf-registered');
          } else if (uploadedHash.toLowerCase() === storedHash.toLowerCase()) {
            setDocMatchResult('match');
          } else {
            setDocMatchResult('mismatch');
          }
        }
      } else {
        setVerifyNotFound(true);
      }
    } catch (err) {
      console.error(err);
      setVerifyError(err.reason || err.message || 'Error verifying certificate');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="app-shell">

      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">◆</div>
          <div>
            <div className="brand-name">CERTCHAIN</div>
            <div className="brand-subtitle">Academic Credential Network</div>
          </div>
        </div>

        <div className="network-pill">
          <span className="network-dot"></span>
          Hardhat Local
        </div>
      </header>

      <main className="container">

        {/* Hero */}
        <section className="hero">
          <div className="hero-tag">BLOCKCHAIN CERTIFICATE SYSTEM</div>

          <h1>Academic Certificate Verification</h1>

          <p>
            Issue tamper-resistant academic certificates and verify their
            authenticity directly on the blockchain.
          </p>
        </section>

        {/* Wallet */}
        <section className="wallet-card">
          <div className="wallet-icon">◈</div>

          <div className="wallet-content">
            <div className="card-label">WALLET CONNECTION</div>

            {!account ? (
              <div className="wallet-row">
                <div>
                  <h3>Connect your wallet</h3>
                  <p>Connect MetaMask to issue blockchain certificates.</p>
                </div>

                <button
                  id="connect-wallet-btn"
                  className="secondary-button"
                  onClick={connectWallet}
                >
                  Connect MetaMask
                </button>
              </div>
            ) : (
              <div className="wallet-row">
                <div>
                  <div className="connected-label">
                    <span className="online-dot"></span>
                    Wallet Connected
                  </div>

                  <div className="wallet-address" id="wallet-address">
                    {account}
                  </div>
                </div>

                <div className="wallet-network">
                  <span>NETWORK</span>
                  <strong>Hardhat Local</strong>
                </div>
              </div>
            )}

            {networkError && (
              <div className="status-box status-error">
                {networkError}
              </div>
            )}
          </div>
        </section>

        {/* Main dashboard */}
        <div className="dashboard-grid">

          {/* Issue Certificate */}
          <section className="panel">
            <div className="panel-header">
              <div className="panel-icon issue-icon">+</div>

              <div>
                <div className="card-label">CERTIFICATE ISSUANCE</div>
                <h2>Issue Certificate</h2>
              </div>
            </div>

            <p className="panel-description">
              Create a new academic certificate and permanently record it on
              the blockchain. Optionally attach a PDF to store its hash on-chain.
            </p>

            <form onSubmit={handleIssueCertificate}>

              <div className="form-group">
                <label htmlFor="student-name">Student Name</label>
                <input
                  id="student-name"
                  type="text"
                  placeholder="e.g. Soham Tambe"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="cert-id">Certificate ID</label>
                <input
                  id="cert-id"
                  type="text"
                  placeholder="e.g. CERT-001"
                  value={certificateId}
                  onChange={(e) => setCertificateId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="course-name">Course Name</label>
                <input
                  id="course-name"
                  type="text"
                  placeholder="e.g. Blockchain Technology"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="issue-pdf">
                  PDF Document <span className="optional-label">(optional — hash stored on-chain)</span>
                </label>
                <input
                  id="issue-pdf"
                  type="file"
                  accept="application/pdf"
                  ref={issuePdfRef}
                  onChange={handleIssuePdfChange}
                  className="file-input"
                />
                {issuePdfHash && (
                  <div className="hash-preview">
                    <span>SHA-256:</span>
                    <code>{issuePdfHash.slice(0, 20)}…</code>
                  </div>
                )}
              </div>

              <button
                id="issue-btn"
                className="primary-button"
                type="submit"
                disabled={isIssuing}
              >
                {isIssuing ? 'Processing...' : 'Issue Certificate'}
                {!isIssuing && <span>→</span>}
              </button>
            </form>

            {issueStatus && (
              <div className="status-box status-success" id="issue-status">
                <strong>{issueStatus}</strong>

                {issueTxHash && (
                  <div className="tx-info">
                    <span>Transaction Hash</span>
                    <code id="tx-hash">{issueTxHash}</code>
                  </div>
                )}
              </div>
            )}

            {issueError && (
              <div className="status-box status-error" id="issue-error">
                {issueError}
              </div>
            )}
          </section>

          {/* Verify Certificate */}
          <section className="panel verify-panel">
            <div className="panel-header">
              <div className="panel-icon verify-icon">✓</div>

              <div>
                <div className="card-label">CERTIFICATE AUTHENTICATION</div>
                <h2>Verify Certificate</h2>
              </div>
            </div>

            <p className="panel-description">
              Check whether a certificate exists on the blockchain. Optionally
              upload the original PDF to detect tampering.
            </p>

            <form onSubmit={handleVerifyCertificate}>

              <div className="form-group">
                <label htmlFor="verify-id">Certificate ID</label>

                <input
                  id="verify-id"
                  type="text"
                  placeholder="e.g. CERT-001"
                  value={verifyId}
                  onChange={(e) => setVerifyId(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="verify-pdf">
                  PDF Document <span className="optional-label">(optional — tamper detection)</span>
                </label>
                <input
                  id="verify-pdf"
                  type="file"
                  accept="application/pdf"
                  ref={verifyPdfRef}
                  onChange={(e) => {
                    setVerifyPdfFile(e.target.files[0] || null);
                    setDocMatchResult(null);
                  }}
                  className="file-input"
                />
              </div>

              <button
                id="verify-btn"
                className="primary-button"
                type="submit"
                disabled={isVerifying}
              >
                {isVerifying ? 'Verifying...' : 'Verify Certificate'}
                {!isVerifying && <span>→</span>}
              </button>
            </form>

            {verifyNotFound && (
              <div className="status-box status-error" id="not-found-msg">
                <strong>CERTIFICATE NOT FOUND</strong>
                <span>
                  No certificate with this ID exists on the blockchain.
                </span>
              </div>
            )}

            {verifiedCert && (
              <div className="certificate-result" id="cert-details">

                <div className="certificate-top">
                  <div>
                    <span className="valid-badge">
                      <span>✓</span> VERIFIED
                    </span>

                    <h3>Certificate Authentic</h3>
                  </div>

                  <div className="verified-mark">✓</div>
                </div>

                <div className="certificate-divider"></div>

                <div className="certificate-details">

                  <div className="detail-item">
                    <span>STUDENT</span>
                    <strong>{verifiedCert.studentName}</strong>
                  </div>

                  <div className="detail-item">
                    <span>CERTIFICATE ID</span>
                    <strong>{verifiedCert.certificateId}</strong>
                  </div>

                  <div className="detail-item">
                    <span>COURSE</span>
                    <strong>{verifiedCert.courseName}</strong>
                  </div>

                  <div className="detail-item">
                    <span>ISSUED</span>
                    <strong>{verifiedCert.issueDate}</strong>
                  </div>

                  <div className="detail-item full-width">
                    <span>ISSUER ADDRESS</span>
                    <code>{verifiedCert.issuer}</code>
                  </div>

                  {verifiedCert.documentHash && verifiedCert.documentHash !== ZERO_HASH && (
                    <div className="detail-item full-width">
                      <span>DOCUMENT HASH (on-chain)</span>
                      <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>
                        {verifiedCert.documentHash}
                      </code>
                    </div>
                  )}

                </div>

                {/* Document tamper-detection result */}
                {docMatchResult === 'match' && (
                  <div className="status-box doc-match" id="doc-match">
                    <strong>✓ DOCUMENT MATCH</strong>
                    <span>The uploaded PDF hash matches the on-chain record. Document is authentic.</span>
                  </div>
                )}
                {docMatchResult === 'mismatch' && (
                  <div className="status-box doc-mismatch" id="doc-mismatch">
                    <strong>✗ DOCUMENT MISMATCH</strong>
                    <span>The uploaded PDF does not match the on-chain hash. The document may have been tampered with.</span>
                  </div>
                )}
                {docMatchResult === 'no-pdf-registered' && (
                  <div className="status-box status-warning" id="doc-no-pdf">
                    <strong>ℹ No PDF Registered</strong>
                    <span>This certificate was issued without a PDF document hash.</span>
                  </div>
                )}

                <div className="blockchain-proof">
                  <span className="proof-dot"></span>
                  Verified directly against the blockchain
                </div>

              </div>
            )}

            {verifyError && (
              <div className="status-box status-error" id="verify-error">
                {verifyError}
              </div>
            )}
          </section>

        </div>

        {/* Technical information */}
        <section className="tech-strip">
          <div className="tech-item">
            <span className="tech-icon">◈</span>
            <div>
              <span>SMART CONTRACT</span>
              <strong>Solidity</strong>
            </div>
          </div>

          <div className="tech-divider"></div>

          <div className="tech-item">
            <span className="tech-icon">⬡</span>
            <div>
              <span>NETWORK</span>
              <strong>Hardhat Local</strong>
            </div>
          </div>

          <div className="tech-divider"></div>

          <div className="tech-item">
            <span className="tech-icon">⌁</span>
            <div>
              <span>WALLET</span>
              <strong>MetaMask</strong>
            </div>
          </div>

          <div className="tech-divider"></div>

          <div className="tech-item">
            <span className="tech-icon">◉</span>
            <div>
              <span>WEB3 LIBRARY</span>
              <strong>ethers.js</strong>
            </div>
          </div>
        </section>

      </main>

      <footer>
        Blockchain Academic Certificate Verification
        <span>•</span>
        Final Year Project
      </footer>

    </div>
  );
}

export default App;
