import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';

function App() {
  const [properties, setProperties] = useState([]);
  const [config, setConfig] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [walletAddress, setWalletAddress] = useState("");
  const [kycStatus, setKycStatus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [balance, setBalance] = useState("0");
  const [tokenBalance, setTokenBalance] = useState("0");
  const [claimableRent, setClaimableRent] = useState("0");
  const [activeTab, setActiveTab] = useState('marketplace');

  useEffect(() => { 
    fetchProperties(); 
    fetchConfig();
    fetchTransactions();
  }, []);

  useEffect(() => {
    if (walletAddress && config) {
      checkBalances(walletAddress);
      const interval = setInterval(() => {
        checkBalances(walletAddress);
        fetchTransactions();
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [walletAddress, config]);

  const fetchProperties = async () => {
    const res = await axios.get('http://localhost:3001/api/properties');
    setProperties(res.data);
  };

  const fetchConfig = async () => {
    try {
        const res = await axios.get('http://localhost:3001/api/config');
        setConfig(res.data);
    } catch (e) { console.error("Failed to fetch config", e); }
  };

  const fetchTransactions = async () => {
    try {
        const res = await axios.get('http://localhost:3001/api/transactions');
        setTransactions(res.data);
    } catch (e) { console.error("Failed to fetch transactions", e); }
  };

  const connectWallet = async () => {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            setWalletAddress(accounts[0]);
        } catch (e) { setMessage("連線失敗"); }
    } else { setMessage("請安裝 MetaMask"); }
  };

  const checkBalances = async (address) => {
    if (!config) return;
    const provider = new ethers.BrowserProvider(window.ethereum);
    
    const { addresses, abis } = config;
    const usdcAddr = addresses.MockUSDC;
    const tokenAddr = addresses.PropertyToken;
    const registryAddr = addresses.IdentityRegistry;
    
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const registryAbi = abis.IdentityRegistry;
    
    try {
        const usdc = new ethers.Contract(usdcAddr, abi, provider);
        const property = new ethers.Contract(tokenAddr, abi, provider);
        const registry = new ethers.Contract(registryAddr, registryAbi, provider);

        const [uBal, pBal, isV] = await Promise.all([
            usdc.balanceOf(address),
            property.balanceOf(address),
            registry.checkIdentity(address)
        ]);

        setBalance(ethers.formatUnits(uBal, 18));
        setTokenBalance(ethers.formatUnits(pBal, 18));
        setKycStatus(isV);

        const res = await axios.get(`http://localhost:3001/api/rewards/${address}`);
        setClaimableRent(res.data.claimable);
    } catch(e) { console.warn("Balance check delayed: deploying..."); }
  };

  const completeKyc = async () => {
    setLoading(true);
    try {
        const res = await axios.post('http://localhost:3001/api/kyc', { address: walletAddress });
        setMessage(res.data.message);
        await checkBalances(walletAddress);
        fetchTransactions();
    } catch (e) { setMessage("認證失敗"); }
    setLoading(false);
  };

  const buyTokens = async (qty) => {
    if (!kycStatus) return setMessage("請先完成線上實名認證");
    setLoading(true);
    try {
        const res = await axios.post('http://localhost:3001/api/buy', { address: walletAddress, amount: qty });
        setMessage(res.data.message);
        await checkBalances(walletAddress);
        fetchTransactions();
    } catch (e) { setMessage("交易失敗"); }
    setLoading(false);
  };

  const claimRent = async () => {
    if (!config) return;
    setLoading(true);
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const distributor = new ethers.Contract(
            config.addresses.RentalDistributor, 
            ["function claimRent() external"], 
            signer
        );
        await (await distributor.claimRent()).wait();
        setMessage("收益提領成功！");
        await checkBalances(walletAddress);
        fetchTransactions();
    } catch (e) { setMessage("提領失敗"); }
    setLoading(false);
  };

  return (
    <div style={appContainer}>
      {/* 頂部導覽 */}
      <nav style={navbarStyle}>
        <div style={navInner}>
          <div style={logoArea}>
            <span style={logoIcon}>🏦</span>
            <div style={logoText}>
              <h1 style={brandName}>樂居鏈 RWA </h1>
              <p style={brandSub}>不動產碎片化投資領航者</p>
            </div>
          </div>
          <div style={navActions}>
            {walletAddress ? (
                <div style={walletBadge}>
                    <div style={dot(kycStatus)}></div>
                    <span>{walletAddress.substring(0, 6)}...{walletAddress.slice(-4)}</span>
                </div>
            ) : (
                <button onClick={connectWallet} style={primaryBtn}>連接 Web3 錢包</button>
            )}
          </div>
        </div>
      </nav>

      <div style={layoutInner}>
        {/* 側邊導覽 */}
        <aside style={sidebarStyle}>
          <button onClick={() => setActiveTab('marketplace')} style={activeTab === 'marketplace' ? activeSideBtn : sideBtn}>🏛️ 投資市場</button>
          <button onClick={() => setActiveTab('portfolio')} style={activeTab === 'portfolio' ? activeSideBtn : sideBtn}>📈 我的資產</button>
          <button onClick={() => setActiveTab('legal')} style={activeTab === 'legal' ? activeSideBtn : sideBtn}>📜 法規披露</button>
          
          <div style={sidebarFooter}>
            <p>即時匯率</p>
            <h3>1 USDC ≈ 31.8 TWD</h3>
          </div>
        </aside>

        {/* 主內容區 */}
        <main style={contentStyle}>
          {activeTab === 'marketplace' && (
            <>
              <div style={heroBanner}>
                <h2>台北 101 生活圈精選商辦</h2>
                <p>參與全台最精華地段的不動產收益，起投僅需 100 美元。</p>
              </div>

              {walletAddress && !kycStatus && (
                <div style={kycBox}>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 5px 0' }}>🔐 依據台灣 STO 規範：身分查核</h4>
                        <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>
                            房地產代幣涉及證券性質，投資前必須完成實名認證 (KYC) 與洗錢防制 (AML) 流程。
                        </p>
                    </div>
                    <button onClick={completeKyc} disabled={loading} style={kycBtn}>立即線上認證</button>
                </div>
              )}

              <div style={propertyList}>
                {properties.map(p => (
                  <div key={p.id} style={pCard}>
                    <div style={pImgArea}>
                        <img src={p.image} style={pImg} alt="" />
                        <div style={pBadge}>受託銀行：{p.legal.trustee}</div>
                    </div>
                    <div style={pBody}>
                        <h3 style={pTitle}>{p.title}</h3>
                        <p style={pAddr}>📍 {p.address}</p>
                        
                        <div style={pMetaGrid}>
                            <div style={pMetaItem}><span>預估收益率</span><strong style={{color: '#10b981'}}>{p.apy}%</strong></div>
                            <div style={pMetaItem}><span>土地分區</span><strong>{p.legal.landZoning}</strong></div>
                            <div style={pMetaItem}><span>建物用途</span><strong>{p.legal.usage}</strong></div>
                            <div style={pMetaItem}><span>資產總值</span><strong>{p.totalValuationTWD}</strong></div>
                        </div>

                        <div style={pProgress}>
                            <div style={pProgressInfo}><span>募資進度</span><span>{((p.soldTokens / p.totalTokens) * 100).toFixed(1)}%</span></div>
                            <div style={pProgressTrack}><div style={{...pProgressFill, width: `${(p.soldTokens / p.totalTokens) * 100}%`}}></div></div>
                        </div>

                        <div style={pFooter}>
                            <div style={pPrice}>
                                <span>認購單價</span>
                                <h3>${p.tokenPrice} <small>USDC</small></h3>
                            </div>
                            <button onClick={() => buyTokens(500)} disabled={loading || !kycStatus} style={buyBtn}>立即參與認購</button>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'portfolio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                <div style={portfolioGrid}>
                    <div style={statCard}>
                        <p>持有單位</p>
                        <h2>{parseFloat(tokenBalance).toLocaleString()} <small>單位</small></h2>
                        <span>佔比 0.25%</span>
                    </div>
                    <div style={statCard}>
                        <p>累計收益</p>
                        <h2>${parseFloat(balance).toLocaleString()} <small>USDC</small></h2>
                        <span style={{color: '#10b981'}}>+2.4% MoM</span>
                    </div>
                    <div style={{...statCard, backgroundColor: '#008855', color: '#fff'}}>
                        <p style={{color: '#fff', opacity: 0.8}}>可提領租金 (USDC)</p>
                        <h2 style={{color: '#fff'}}>${parseFloat(claimableRent).toFixed(4)}</h2>
                        <button onClick={claimRent} disabled={loading || parseFloat(claimableRent) <= 0} style={claimBtnStyle}>撥款至錢包</button>
                    </div>
                </div>

                <div style={tableCard}>
                    <h3 style={{ marginBottom: '20px' }}>近期交易活動</h3>
                    <table style={tableStyle}>
                        <thead>
                            <tr style={thStyle}>
                                <th>類型</th>
                                <th>用戶</th>
                                <th>金額/單位</th>
                                <th>時間</th>
                                <th>狀態</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map(tx => (
                                <tr key={tx.id} style={trStyle}>
                                    <td>{tx.type}</td>
                                    <td>{tx.user.substring(0, 10)}...</td>
                                    <td>{tx.amount}</td>
                                    <td>{new Date(tx.date).toLocaleString()}</td>
                                    <td><span style={statusBadge}>{tx.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          )}

          {activeTab === 'legal' && (
            <div style={legalPage}>
                <h2>台灣 RWA 不動產代幣化法規說明</h2>
                <section style={legalSection}>
                    <h4>1. 法律架構：不動產投資信託 (Trust Structure)</h4>
                    <p>本平台物件皆採「信託架構」設計。資產名義所有權歸屬於受託銀行（如：兆豐、中信等），確保發行方破產時，投資人權益受到破產隔離保護。</p>
                </section>
                <section style={legalSection}>
                    <h4>2. 資訊披露與估價</h4>
                    <p>依據內政部規定，每半年由兩家以上合格之估價師事務所進行資產重估，報告皆會同步於鏈上 (IPFS) 存證。</p>
                </section>
                <div style={warningBox}>⚠️ 投資警語：不動產投資涉及風險，認購前請詳閱公開說明書。</div>
            </div>
          )}
        </main>
      </div>

      {message && <div style={toastStyle}>{message}</div>}
    </div>
  );
}

// 樣式系統 (Institutional Look)
const appContainer = { backgroundColor: '#f9fafc', minHeight: '100vh', color: '#1f2937', fontFamily: '"PingFang TC", "Microsoft JhengHei", sans-serif' };
const navbarStyle = { height: '80px', backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 1000 };
const navInner = { maxWidth: '1400px', margin: '0 auto', height: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' };
const logoArea = { display: 'flex', alignItems: 'center', gap: '15px' };
const logoIcon = { fontSize: '32px' };
const brandName = { margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#008855' };
const brandSub = { margin: 0, fontSize: '11px', color: '#9ca3af', letterSpacing: '1px' };
const navActions = { display: 'flex', alignItems: 'center' };
const primaryBtn = { backgroundColor: '#008855', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' };
const walletBadge = { backgroundColor: '#f3f4f6', padding: '10px 18px', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', border: '1px solid #e5e7eb' };
const dot = (active) => ({ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: active ? '#10b981' : '#ef4444' });

const layoutInner = { maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 'calc(100vh - 80px)' };
const sidebarStyle = { padding: '40px 20px', borderRight: '1px solid #e5e7eb', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', gap: '10px' };
const sideBtn = { textAlign: 'left', border: 'none', padding: '15px 20px', borderRadius: '10px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '15px', color: '#4b5563', transition: 'all 0.2s' };
const activeSideBtn = { ...sideBtn, backgroundColor: '#f0fdf4', color: '#059669', fontWeight: 'bold' };
const sidebarFooter = { marginTop: 'auto', padding: '20px', backgroundColor: '#f9fafb', borderRadius: '12px' };

const contentStyle = { padding: '40px 50px' };
const heroBanner = { marginBottom: '40px' };
const kycBox = { backgroundColor: '#008855', color: '#fff', padding: '20px 30px', borderRadius: '16px', display: 'flex', alignItems: 'center', marginBottom: '40px', boxShadow: '0 10px 25px -5px rgba(0, 136, 85, 0.3)' };
const kycBtn = { backgroundColor: '#fff', color: '#008855', border: 'none', padding: '10px 25px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' };

const propertyList = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '30px' };
const pCard = { backgroundColor: '#fff', borderRadius: '20px', overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', transition: 'transform 0.3s ease' };
const pImgArea = { height: '260px', position: 'relative' };
const pImg = { width: '100%', height: '100%', objectFit: 'cover' };
const pBadge = { position: 'absolute', top: '20px', right: '20px', backgroundColor: 'rgba(255,255,255,0.9)', padding: '6px 15px', borderRadius: '50px', fontSize: '12px', fontWeight: '600' };
const pBody = { padding: '30px' };
const pTitle = { margin: '0 0 10px 0', fontSize: '20px', color: '#111827' };
const pAddr = { color: '#6b7280', fontSize: '14px', marginBottom: '25px' };
const pMetaGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' };
const pMetaItem = { display: 'flex', flexDirection: 'column', fontSize: '13px', color: '#9ca3af' };
const pProgress = { marginBottom: '30px' };
const pProgressInfo = { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px', color: '#4b5563' };
const pProgressTrack = { height: '6px', backgroundColor: '#f3f4f6', borderRadius: '10px', overflow: 'hidden' };
const pProgressFill = { height: '100%', backgroundColor: '#008855' };
const pFooter = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f4f6', paddingTop: '25px' };
const pPrice = { display: 'flex', flexDirection: 'column' };
const buyBtn = { backgroundColor: '#008855', color: '#fff', border: 'none', padding: '15px 30px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' };

const portfolioGrid = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '30px' };
const statCard = { padding: '30px', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e5e7eb' };
const claimBtnStyle = { marginTop: '20px', width: '100%', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#fff', color: '#008855', fontWeight: 'bold', cursor: 'pointer' };

const tableCard = { backgroundColor: '#fff', padding: '30px', borderRadius: '20px', border: '1px solid #e5e7eb' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', textAlign: 'left' };
const thStyle = { borderBottom: '2px solid #f3f4f6', color: '#9ca3af', fontSize: '13px' };
const trStyle = { borderBottom: '1px solid #f3f4f6', fontSize: '14px' };
const statusBadge = { backgroundColor: '#f0fdf4', color: '#16a34a', padding: '4px 10px', borderRadius: '50px', fontSize: '12px', fontWeight: 'bold' };

const legalPage = { maxWidth: '800px', backgroundColor: '#fff', padding: '50px', borderRadius: '24px', border: '1px solid #e5e7eb' };
const legalSection = { marginBottom: '30px' };
const warningBox = { marginTop: '50px', padding: '20px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', borderRadius: '12px', fontSize: '13px' };
const toastStyle = { position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#111827', color: '#fff', padding: '14px 40px', borderRadius: '50px', zIndex: 10000, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' };

export default App;
