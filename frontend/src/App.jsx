import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';

function App() {
  const [properties, setProperties] = useState([]);
  const [config, setConfig] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [walletAddress, setWalletAddress] = useState("");
  const [pwaBalance, setPwaBalance] = useState("0");
  const [kycStatus, setKycStatus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [balance, setBalance] = useState("0");
  const [tokenBalance, setTokenBalance] = useState("0");
  const [claimableRent, setClaimableRent] = useState("0");
  const [activeTab, setActiveTab] = useState('market');
  const [selectedProperty, setSelectedProperty] = useState(null);

  useEffect(() => { 
    initApp();
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accs) => setWalletAddress(accs[0] || ""));
    }
  }, []);

  useEffect(() => {
    if (walletAddress && config) {
      refreshData();
      const interval = setInterval(refreshData, 10000);
      return () => clearInterval(interval);
    }
  }, [walletAddress, config]);

  const initApp = async () => {
    try {
        const [conf, prop, txs] = await Promise.all([
            axios.get('http://localhost:3001/api/config'),
            axios.get('http://localhost:3001/api/properties'),
            axios.get('http://localhost:3001/api/transactions')
        ]);
        setConfig(conf.data);
        setProperties(prop.data);
        setTransactions(txs.data);
    } catch (e) { setMessage("Pepe Network Offline"); }
  };

  const refreshData = async () => {
    if (!walletAddress || !config) return;
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const usdc = new ethers.Contract(config.addresses.MockUSDC, config.abis.MockUSDC, provider);
        const property = new ethers.Contract(config.addresses.PropertyToken, config.abis.PropertyToken, provider);
        const registry = new ethers.Contract(config.addresses.IdentityRegistry, config.abis.IdentityRegistry, provider);

        const [uBal, pBal, isV, pwaRes, rentRes] = await Promise.all([
            usdc.balanceOf(walletAddress),
            property.balanceOf(walletAddress),
            registry.checkIdentity(walletAddress),
            axios.get(`http://localhost:3001/api/pwa/balance/${walletAddress}`),
            axios.get(`http://localhost:3001/api/rewards/${walletAddress}`)
        ]);

        setBalance(ethers.formatUnits(uBal, 18));
        setTokenBalance(ethers.formatUnits(pBal, 18));
        setKycStatus(isV);
        setPwaBalance(pwaRes.data.balance);
        setClaimableRent(rentRes.data.claimable);
        
        const txs = await axios.get('http://localhost:3001/api/transactions');
        setTransactions(txs.data);
    } catch (e) { console.warn(e); }
  };

  const connectWallet = async () => {
    if (!window.ethereum) return setMessage("MetaMask Required");
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setWalletAddress(accounts[0]);
    } catch (e) { setMessage("Connect Failed"); }
  };

  const buyPwa = async (usdcAmount) => {
    setLoading(true);
    try {
        const res = await axios.post('http://localhost:3001/api/pwa/buy', { address: walletAddress, usdcAmount });
        setMessage(res.data.message);
        refreshData();
    } catch (e) { setMessage("Swap Failed"); }
    setLoading(false);
  };

  const invest = async (amount) => {
    if (!kycStatus) return setMessage("Complete KYC First");
    setLoading(true);
    try {
        await axios.post('http://localhost:3001/api/buy', { address: walletAddress, amount });
        setMessage("Investment Confirmed on PepeChain");
        refreshData();
    } catch (e) { setMessage("Investment Failed"); }
    setLoading(false);
  };

  const claimRewards = async () => {
    setLoading(true);
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const distributor = new ethers.Contract(config.addresses.RentalDistributor, config.abis.RentalDistributor, signer);
        await (await distributor.claimRent()).wait();
        setMessage("Yield Claimed Successfully!");
        refreshData();
    } catch (e) { setMessage("Claim Failed"); }
    setLoading(false);
  };

  return (
    <div style={globalStyle}>
      {/* Sidebar */}
      <nav style={sidebarStyle}>
        <div style={logoContainer}>
            <div style={logoCircle}>P</div>
            <div style={logoTextGroup}>
                <h1 style={logoName}>Pepe RWA</h1>
                <span style={logoVersion}>Mainnet v1.0</span>
            </div>
        </div>
        
        <div style={navGroup}>
            <button onClick={() => setActiveTab('market')} style={activeTab === 'market' ? navBtnActive : navBtn}>🏛 Marketplace</button>
            <button onClick={() => setActiveTab('portfolio')} style={activeTab === 'portfolio' ? navBtnActive : navBtn}>📊 Dashboard</button>
            <button onClick={() => setActiveTab('pwa')} style={activeTab === 'pwa' ? navBtnActive : navBtn}>💎 $PWA Token</button>
            <button onClick={() => setActiveTab('legal')} style={activeTab === 'legal' ? navBtnActive : navBtn}>⚖ Legal Docs</button>
        </div>

        <div style={sidebarUser}>
            {walletAddress ? (
                <div style={statusCard}>
                    <p style={statusLabel}>Pepe Identity</p>
                    <div style={statusRow}>
                        <div style={dot(kycStatus)}></div>
                        <span style={addressText}>{walletAddress.slice(0,6)}...{walletAddress.slice(-4)}</span>
                    </div>
                </div>
            ) : (
                <button onClick={connectWallet} style={connectBtn}>Connect Wallet</button>
            )}
        </div>
      </nav>

      {/* Main Content */}
      <main style={mainStyle}>
        <header style={headerStyle}>
            <div style={headerLeft}>
                <h2 style={pageTitle}>{activeTab.toUpperCase()}</h2>
                <p style={pageSub}>{activeTab === 'market' ? 'Institutional Grade Real World Assets' : 'Manage your Pepe Ecosystem assets'}</p>
            </div>
            <div style={headerStats}>
                <div style={hStatItem}><p>USDC</p><strong>${parseFloat(balance).toFixed(2)}</strong></div>
                <div style={hStatItem}><p>$PWA</p><strong style={{color: '#00ff88'}}>{pwaBalance}</strong></div>
            </div>
        </header>

        <section style={contentWrapper}>
            {activeTab === 'market' && (
                <div style={grid}>
                    {properties.map(p => (
                        <div key={p.id} style={cardStyle} onClick={() => setSelectedProperty(p)}>
                            <div style={cardImgArea}>
                                <img src={p.image} style={cardImg} alt="" />
                                <div style={apyBadge}>{p.apy}% APY</div>
                            </div>
                            <div style={cardBody}>
                                <h3 style={cardTitle}>{p.title}</h3>
                                <p style={cardAddr}>📍 {p.address}</p>
                                <div style={metricRow}>
                                    <div style={metric}><span>IRR</span><strong>{p.irr}</strong></div>
                                    <div style={metric}><span>Liquidity</span><strong style={{color: '#00ff88'}}>{p.liquidity}</strong></div>
                                    <div style={metric}><span>Risk</span><strong>{p.riskLevel}</strong></div>
                                </div>
                                <div style={progressContainer}>
                                    <div style={progressLabel}><span>Funding</span><span>{((p.soldTokens / p.totalTokens) * 100).toFixed(1)}%</span></div>
                                    <div style={progressBar}><div style={{...progressFill, width: `${(p.soldTokens / p.totalTokens) * 100}%`}}></div></div>
                                </div>
                                <div style={cardFooter}>
                                    <div style={priceGroup}><p>Price per Unit</p><strong>${p.tokenPrice} USDC</strong></div>
                                    <button onClick={(e) => {e.stopPropagation(); invest(100);}} disabled={loading || !kycStatus} style={investBtn}>Invest Now</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'portfolio' && (
                <div style={dashboardGrid}>
                    <div style={statBox}>
                        <p>Total Asset Value</p>
                        <h2>${(parseFloat(tokenBalance) * 100 + parseFloat(balance)).toLocaleString()} <small>USDC</small></h2>
                        <span style={{color: '#00ff88'}}>+4.2% Total Growth</span>
                    </div>
                    <div style={statBox}>
                        <p>Real Estate Units</p>
                        <h2>{tokenBalance} <small>Units</small></h2>
                        <span>Active Holdings: {properties.length}</span>
                    </div>
                    <div style={{...statBox, background: 'linear-gradient(135deg, #00D084 0%, #008855 100%)', color: '#fff'}}>
                        <p style={{color: '#fff', opacity: 0.8}}>Claimable Yield</p>
                        <h2 style={{color: '#fff'}}>${parseFloat(claimableRent).toFixed(4)} <small>USDC</small></h2>
                        <button onClick={claimRewards} disabled={loading || parseFloat(claimableRent) <= 0} style={whiteBtn}>Claim Yield</button>
                    </div>

                    <div style={wideTable}>
                        <h3 style={tableHeading}>Recent PepeChain Transactions</h3>
                        <table style={table}>
                            <thead><tr><th style={th}>Activity</th><th style={th}>Entity</th><th style={th}>Volume</th><th style={th}>Timestamp</th><th style={th}>Status</th></tr></thead>
                            <tbody>
                                {transactions.map(tx => (
                                    <tr key={tx.id} style={tr}>
                                        <td style={td}><strong>{tx.type}</strong></td>
                                        <td style={td}>{tx.user.slice(0,12)}...</td>
                                        <td style={td}>{tx.amount}</td>
                                        <td style={td}>{new Date(tx.date).toLocaleTimeString()}</td>
                                        <td style={td}><span style={statusTag}>Verified</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'pwa' && (
                <div style={pwaSwapContainer}>
                    <div style={swapCard}>
                        <h2 style={{margin: '0 0 10px 0'}}>Get $PWA Token</h2>
                        <p style={{color: '#94a3b8', fontSize: '14px', marginBottom: '30px'}}>Powering the world's most advanced RWA ecosystem.</p>
                        
                        <div style={inputGroup}>
                            <label>You Pay (USDC)</label>
                            <input type="number" defaultValue="100" style={swapInput} />
                        </div>
                        <div style={swapArrow}>↓</div>
                        <div style={inputGroup}>
                            <label>You Receive ($PWA)</label>
                            <div style={swapResult}>1,000 PWA</div>
                        </div>

                        <button onClick={() => buyPwa(100)} disabled={loading} style={swapBtn}>
                            {loading ? "Processing..." : "Swap USDC for $PWA"}
                        </button>

                        <div style={pwaInfo}>
                            <div style={pwaInfoItem}><span>Rate</span><strong>1 USDC = 10 PWA</strong></div>
                            <div style={pwaInfoItem}><span>Utility</span><strong>Governance, Staking, Fee Discounts</strong></div>
                        </div>
                    </div>
                </div>
            )}

            {!kycStatus && walletAddress && (
                <div style={kycAlert}>
                    <div style={{flex: 1}}>
                        <h3>Verification Required</h3>
                        <p>Regulatory compliance is key. Complete your Pepe-KYC to unlock institutional asset markets.</p>
                    </div>
                    <button onClick={completeKyc} disabled={loading} style={kycActionBtn}>Verify Identity</button>
                </div>
            )}
        </section>
      </main>

      {/* Detail Modal */}
      {selectedProperty && (
          <div style={modalOverlay} onClick={() => setSelectedProperty(null)}>
              <div style={modalContent} onClick={e => e.stopPropagation()}>
                  <header style={modalHeader}>
                      <h2>{selectedProperty.title}</h2>
                      <button onClick={() => setSelectedProperty(null)} style={closeBtn}>✕</button>
                  </header>
                  <div style={modalBody}>
                      <img src={selectedProperty.image} style={modalImg} alt="" />
                      <div style={modalDesc}>
                          <h3>Property Strategy</h3>
                          <p>{selectedProperty.details.description}</p>
                      </div>
                      <div style={tagCloud}>
                          {selectedProperty.details.tags.map(t => <span key={t} style={tag}>#{t}</span>)}
                      </div>
                      <div style={modalLegal}>
                          <p>Custodian: <strong>{selectedProperty.legal.trustee}</strong></p>
                          <a href={selectedProperty.legal.valuationReport} style={{color: '#00ff88'}}>Download Audit Report (PDF)</a>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {message && <div style={toastStyle}>{message}</div>}
    </div>
  );
}

// --- STYLES (Professional Dark Theme) ---
const globalStyle = { backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', color: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" };
const sidebarStyle = { width: '280px', backgroundColor: '#1e293b', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', padding: '40px 20px', position: 'fixed', height: '100vh' };
const logoContainer = { display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '60px', padding: '0 10px' };
const logoCircle = { width: '45px', height: '45px', borderRadius: '12px', background: 'linear-gradient(135deg, #00ff88 0%, #008855 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '24px', fontWeight: 'bold', color: '#0f172a' };
const logoName = { fontSize: '22px', fontWeight: '800', margin: 0, color: '#fff' };
const logoVersion = { fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' };
const navGroup = { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 };
const navBtn = { textAlign: 'left', padding: '14px 20px', borderRadius: '12px', border: 'none', backgroundColor: 'transparent', color: '#94a3b8', fontSize: '15px', fontWeight: '600', cursor: 'pointer', transition: '0.2s' };
const navBtnActive = { ...navBtn, backgroundColor: '#00ff8815', color: '#00ff88' };
const sidebarUser = { marginTop: 'auto' };
const statusCard = { backgroundColor: '#334155', padding: '15px', borderRadius: '16px' };
const statusRow = { display: 'flex', alignItems: 'center', gap: '10px' };
const addressText = { fontSize: '13px', color: '#cbd5e1', fontFamily: 'monospace' };
const connectBtn = { width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#00ff88', color: '#0f172a', fontWeight: 'bold', cursor: 'pointer' };

const mainStyle = { marginLeft: '280px', flex: 1, padding: '40px 60px' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '50px' };
const pageTitle = { fontSize: '32px', margin: '0 0 5px 0', letterSpacing: '-1px' };
const pageSub = { color: '#64748b', fontSize: '16px' };
const headerStats = { display: 'flex', gap: '30px' };
const hStatItem = { textAlign: 'right' };

const contentWrapper = { display: 'flex', flexDirection: 'column', gap: '40px' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '30px' };
const cardStyle = { backgroundColor: '#1e293b', borderRadius: '24px', overflow: 'hidden', border: '1px solid #334155', transition: '0.3s', cursor: 'pointer' };
const cardImgArea = { height: '220px', position: 'relative' };
const cardImg = { width: '100%', height: '100%', objectFit: 'cover' };
const apyBadge = { position: 'absolute', top: '20px', right: '20px', backgroundColor: '#00ff88', color: '#0f172a', padding: '6px 14px', borderRadius: '50px', fontWeight: 'bold', fontSize: '13px' };
const cardBody = { padding: '25px' };
const cardTitle = { fontSize: '20px', margin: '0 0 8px 0' };
const cardAddr = { color: '#64748b', fontSize: '14px', marginBottom: '20px' };
const metricRow = { display: 'flex', justifyContent: 'space-between', marginBottom: '25px', backgroundColor: '#0f172a', padding: '15px', borderRadius: '16px' };
const metric = { display: 'flex', flexDirection: 'column', fontSize: '12px', color: '#64748b' };
const progressContainer = { marginBottom: '25px' };
const progressBar = { height: '8px', backgroundColor: '#334155', borderRadius: '10px' };
const progressFill = { height: '100%', backgroundColor: '#00ff88', borderRadius: '10px' };
const cardFooter = { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #334155', paddingTop: '20px' };
const investBtn = { background: '#00ff8815', color: '#00ff88', border: '1px solid #00ff88', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' };

const dashboardGrid = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '30px' };
const statBox = { backgroundColor: '#1e293b', padding: '30px', borderRadius: '24px', border: '1px solid #334155' };
const whiteBtn = { marginTop: '20px', width: '100%', padding: '12px', border: 'none', borderRadius: '12px', background: '#fff', color: '#008855', fontWeight: 'bold', cursor: 'pointer' };
const wideTable = { gridColumn: 'span 3', backgroundColor: '#1e293b', padding: '30px', borderRadius: '24px' };
const table = { width: '100%', borderCollapse: 'collapse', textAlign: 'left' };
const th = { color: '#64748b', padding: '15px', borderBottom: '1px solid #334155' };
const td = { padding: '15px', borderBottom: '1px solid #0f172a' };
const statusTag = { padding: '4px 12px', backgroundColor: '#00ff8815', color: '#00ff88', borderRadius: '50px', fontSize: '12px' };

const pwaSwapContainer = { display: 'flex', justifyContent: 'center', paddingTop: '40px' };
const swapCard = { backgroundColor: '#1e293b', padding: '40px', borderRadius: '32px', width: '100%', maxWidth: '450px', border: '1px solid #334155', textAlign: 'center' };
const swapInput = { width: '100%', padding: '18px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '16px', color: '#fff', fontSize: '20px', fontWeight: 'bold', textAlign: 'center' };
const swapResult = { padding: '18px', backgroundColor: '#0f172a15', border: '1px dashed #334155', borderRadius: '16px', fontSize: '20px', color: '#00ff88', fontWeight: 'bold' };
const swapBtn = { width: '100%', padding: '18px', borderRadius: '16px', border: 'none', background: 'linear-gradient(90deg, #00ff88 0%, #00d084 100%)', color: '#0f172a', fontWeight: '800', fontSize: '16px', marginTop: '30px', cursor: 'pointer' };

const kycAlert = { display: 'flex', alignItems: 'center', backgroundColor: '#fbbf2415', border: '1px solid #fbbf24', padding: '20px 30px', borderRadius: '20px', gap: '30px' };
const kycActionBtn = { background: '#fbbf24', color: '#0f172a', border: 'none', padding: '12px 30px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' };

const modalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#000000bb', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const modalContent = { backgroundColor: '#1e293b', width: '90%', maxWidth: '700px', borderRadius: '32px', overflow: 'hidden' };
const modalHeader = { padding: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' };
const modalImg = { width: '100%', height: '300px', objectFit: 'cover' };
const dot = (v) => ({ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: v ? '#00ff88' : '#ef4444', boxShadow: v ? '0 0 10px #00ff88' : 'none' });
const toastStyle = { position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#fff', color: '#0f172a', padding: '14px 40px', borderRadius: '16px', fontWeight: 'bold', zIndex: 10000, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' };

export default App;
