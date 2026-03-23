import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';

function App() {
  const [properties, setProperties] = useState([]);
  const [config, setConfig] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [kycStatus, setKycStatus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [balance, setBalance] = useState("0");
  const [tokenBalance, setTokenBalance] = useState("0");
  const [claimableRent, setClaimableRent] = useState("0");
  const [activeTab, setActiveTab] = useState('marketplace');
  const [selectedProperty, setSelectedProperty] = useState(null);

  useEffect(() => { 
    fetchProperties(); 
    fetchConfig();
    fetchTransactions();
    fetchAdminStats();
  }, []);

  useEffect(() => {
    if (walletAddress && config) {
      checkBalances(walletAddress);
      const interval = setInterval(() => {
        checkBalances(walletAddress);
        fetchTransactions();
        fetchAdminStats();
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

  const fetchAdminStats = async () => {
    try {
        const res = await axios.get('http://localhost:3001/api/admin/stats');
        setAdminStats(res.data);
    } catch (e) { console.warn("Admin stats unavailable"); }
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
    
    const { addresses } = config;
    const usdcAddr = addresses.MockUSDC;
    const tokenAddr = addresses.PropertyToken;
    const registryAddr = addresses.IdentityRegistry;
    
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const registryAbi = ["function checkIdentity(address) view returns (bool)"];
    
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
    } catch(e) { console.warn("Syncing..."); }
  };

  const completeKyc = async () => {
    setLoading(true);
    try {
        const res = await axios.post('http://localhost:3001/api/kyc', { address: walletAddress });
        setMessage(res.data.message);
        await checkBalances(walletAddress);
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
    } catch (e) { setMessage("交易失敗"); }
    setLoading(false);
  };

  const claimRent = async () => {
    if (!config) return;
    setLoading(true);
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const distributor = new ethers.Contract(config.addresses.RentalDistributor, ["function claimRent() external"], signer);
        await (await distributor.claimRent()).wait();
        setMessage("收益提領成功！");
        await checkBalances(walletAddress);
    } catch (e) { setMessage("提領失敗"); }
    setLoading(false);
  };

  const distributeRentAdmin = async () => {
    setLoading(true);
    try {
        const res = await axios.post('http://localhost:3001/api/admin/distribute-rent');
        setMessage(res.data.message);
        fetchAdminStats();
    } catch (e) { setMessage("分派失敗"); }
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
              <p style={brandSub}>Institutional Real Estate Tokenization</p>
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
          <div style={sideSection}>
            <p style={sideLabel}>投資服務</p>
            <button onClick={() => setActiveTab('marketplace')} style={activeTab === 'marketplace' ? activeSideBtn : sideBtn}>🏛️ 投資市場</button>
            <button onClick={() => setActiveTab('portfolio')} style={activeTab === 'portfolio' ? activeSideBtn : sideBtn}>📈 我的資產</button>
          </div>
          <div style={sideSection}>
            <p style={sideLabel}>合規與管理</p>
            <button onClick={() => setActiveTab('legal')} style={activeTab === 'legal' ? activeSideBtn : sideBtn}>📜 法規披露</button>
            <button onClick={() => setActiveTab('admin')} style={activeTab === 'admin' ? activeSideBtn : sideBtn}>⚙️ 平台管理</button>
          </div>
          
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
                <h2 style={{fontSize: '28px', margin: '0 0 10px 0'}}>精選 RWA 物件市場</h2>
                <p style={{color: '#6b7280'}}>所有物件皆經過第三方受託銀行信託，確保資產安全性與合規性。</p>
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
                  <div key={p.id} style={pCard} onClick={() => setSelectedProperty(p)}>
                    <div style={pImgArea}>
                        <img src={p.image} style={pImg} alt="" />
                        <div style={pBadge}>受託：{p.legal.trustee}</div>
                    </div>
                    <div style={pBody}>
                        <h3 style={pTitle}>{p.title}</h3>
                        <p style={pAddr}>📍 {p.address}</p>
                        
                        <div style={pMetaGrid}>
                            <div style={pMetaItem}><span>預估收益率</span><strong style={{color: '#10b981'}}>{p.apy}%</strong></div>
                            <div style={pMetaItem}><span>建物用途</span><strong>{p.legal.usage}</strong></div>
                            <div style={pMetaItem}><span>資產總值</span><strong>{p.totalValuationTWD}</strong></div>
                            <div style={pMetaItem}><span>起投金額</span><strong>${p.tokenPrice} USDC</strong></div>
                        </div>

                        <div style={pProgress}>
                            <div style={pProgressInfo}><span>認購進度</span><span>{((p.soldTokens / p.totalTokens) * 100).toFixed(1)}%</span></div>
                            <div style={pProgressTrack}><div style={{...pProgressFill, width: `${(p.soldTokens / p.totalTokens) * 100}%`}}></div></div>
                        </div>

                        <div style={pFooter}>
                            <button onClick={(e) => { e.stopPropagation(); buyTokens(100); }} disabled={loading || !kycStatus} style={buyBtn}>立即認購</button>
                            <span style={{fontSize: '12px', color: '#9ca3af'}}>點擊查看詳情</span>
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
                        <h2>{parseFloat(tokenBalance).toLocaleString()} <small>Units</small></h2>
                        <span style={{fontSize: '12px', color: '#6b7280'}}>佔比 0.25%</span>
                    </div>
                    <div style={statCard}>
                        <p>累計收益 (USDC)</p>
                        <h2>${parseFloat(balance).toLocaleString()}</h2>
                        <span style={{color: '#10b981', fontSize: '12px'}}>+2.4% MoM</span>
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
                                <th style={tdStyle}>類型</th>
                                <th style={tdStyle}>用戶</th>
                                <th style={tdStyle}>金額/單位</th>
                                <th style={tdStyle}>時間</th>
                                <th style={tdStyle}>狀態</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.slice(0, 8).map(tx => (
                                <tr key={tx.id} style={trStyle}>
                                    <td style={tdStyle}><strong>{tx.type}</strong></td>
                                    <td style={tdStyle}>{tx.user.substring(0, 10)}...</td>
                                    <td style={tdStyle}>{tx.amount}</td>
                                    <td style={tdStyle}>{new Date(tx.date).toLocaleString()}</td>
                                    <td style={tdStyle}><span style={statusBadge}>{tx.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          )}

          {activeTab === 'admin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                <div style={heroBanner}>
                    <h2 style={{fontSize: '28px', margin: '0 0 10px 0'}}>平台管理中心</h2>
                    <p style={{color: '#6b7280'}}>僅供授權管理員執行系統級操作與收益分派。</p>
                </div>

                <div style={portfolioGrid}>
                    <div style={statCard}>
                        <p>全平台代幣供應量</p>
                        <h2>{parseFloat(adminStats?.totalPlatformSupply || 0).toLocaleString()}</h2>
                    </div>
                    <div style={statCard}>
                        <p>分潤合約儲備 (USDC)</p>
                        <h2>${parseFloat(adminStats?.distributorReserve || 0).toLocaleString()}</h2>
                    </div>
                    <div style={statCard}>
                        <p>活躍投資人</p>
                        <h2>{adminStats?.activeInvestors || 0} <small>位</small></h2>
                    </div>
                </div>

                <div style={adminActionCard}>
                    <div style={{flex: 1}}>
                        <h3>💰 每月收益分派</h3>
                        <p>系統將自動依照持份比例，將信託專戶中的租金收益分發給所有代幣持有人。</p>
                    </div>
                    <button onClick={distributeRentAdmin} disabled={loading} style={adminBtn}>執行收益分派</button>
                </div>
            </div>
          )}

          {activeTab === 'legal' && (
            <div style={legalPage}>
                <h2 style={{marginBottom: '30px'}}>台灣 RWA 不動產代幣化法規說明</h2>
                <div style={legalSection}>
                    <h4>1. 法律架構：不動產投資信託 (Trust Structure)</h4>
                    <p>本平台物件皆採「信託架構」設計。資產名義所有權歸屬於受託銀行（如：兆豐、中信等），確保發行方破產時，投資人權益受到破產隔離保護。</p>
                </div>
                <div style={legalSection}>
                    <h4>2. 資訊披露與估價</h4>
                    <p>依據內政部規定，每半年由兩家以上合格之估價師事務所進行資產重估，報告皆會同步於鏈上 (IPFS) 存證。</p>
                </div>
                <div style={warningBox}>⚠️ 投資警語：不動產投資涉及風險，認購前請詳閱公開說明書。</div>
            </div>
          )}
        </main>
      </div>

      {/* 物件詳情彈窗 */}
      {selectedProperty && (
          <div style={modalOverlay} onClick={() => setSelectedProperty(null)}>
              <div style={modalContent} onClick={e => e.stopPropagation()}>
                  <div style={modalHeader}>
                      <h2>{selectedProperty.title}</h2>
                      <button onClick={() => setSelectedProperty(null)} style={closeBtn}>✕</button>
                  </div>
                  <div style={modalBody}>
                      <img src={selectedProperty.image} style={modalImg} alt="" />
                      <div style={modalSection}>
                          <h3>物件描述</h3>
                          <p>{selectedProperty.details.description}</p>
                      </div>
                      <div style={modalGrid}>
                          <div style={modalInfoItem}><span>建築結構</span><strong>{selectedProperty.legal.structure}</strong></div>
                          <div style={modalInfoItem}><span>坪數</span><strong>{selectedProperty.legal.pings} 坪</strong></div>
                          <div style={modalInfoItem}><span>竣工日期</span><strong>{selectedProperty.details.constructionDate}</strong></div>
                          <div style={modalInfoItem}><span>最後估價日</span><strong>{selectedProperty.details.lastValuationDate}</strong></div>
                      </div>
                      <div style={modalSection}>
                          <h3>法律與合規文件</h3>
                          <div style={docLinkCard}>
                              <span>📜 估價報告書 (Valuation Report)</span>
                              <a href={selectedProperty.legal.valuationReport} target="_blank" rel="noreferrer">查看原文</a>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {message && <div style={toastStyle}>{message}</div>}
    </div>
  );
}

// 樣式定義 (Institutional Look)
const appContainer = { backgroundColor: '#f4f7f6', minHeight: '100vh', color: '#1f2937', fontFamily: '"PingFang TC", "Microsoft JhengHei", sans-serif' };
const navbarStyle = { height: '80px', backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 1000 };
const navInner = { maxWidth: '1400px', margin: '0 auto', height: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' };
const logoArea = { display: 'flex', alignItems: 'center', gap: '15px' };
const logoIcon = { fontSize: '32px' };
const brandName = { margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#008855' };
const brandSub = { margin: 0, fontSize: '11px', color: '#9ca3af', letterSpacing: '1px' };
const navActions = { display: 'flex', alignItems: 'center' };
const primaryBtn = { backgroundColor: '#008855', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' };
const walletBadge = { backgroundColor: '#f3f4f6', padding: '10px 18px', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', border: '1px solid #e5e7eb' };
const dot = (active) => ({ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: active ? '#10b981' : '#ef4444' });

const layoutInner = { maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 'calc(100vh - 80px)' };
const sidebarStyle = { padding: '30px 15px', borderRight: '1px solid #e5e7eb', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', gap: '20px' };
const sideSection = { display: 'flex', flexDirection: 'column', gap: '5px' };
const sideLabel = { fontSize: '12px', color: '#9ca3af', fontWeight: 'bold', padding: '0 15px', marginBottom: '5px' };
const sideBtn = { textAlign: 'left', border: 'none', padding: '12px 15px', borderRadius: '10px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '15px', color: '#4b5563', transition: 'all 0.2s' };
const activeSideBtn = { ...sideBtn, backgroundColor: '#f0fdf4', color: '#059669', fontWeight: 'bold' };
const sidebarFooter = { marginTop: 'auto', padding: '20px', backgroundColor: '#f9fafb', borderRadius: '12px' };

const contentStyle = { padding: '40px 50px' };
const heroBanner = { marginBottom: '40px' };
const kycBox = { backgroundColor: '#008855', color: '#fff', padding: '20px 30px', borderRadius: '16px', display: 'flex', alignItems: 'center', marginBottom: '40px', boxShadow: '0 10px 25px -5px rgba(0, 136, 85, 0.3)' };
const kycBtn = { backgroundColor: '#fff', color: '#008855', border: 'none', padding: '10px 25px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' };

const propertyList = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '30px' };
const pCard = { backgroundColor: '#fff', borderRadius: '20px', overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', cursor: 'pointer', transition: 'transform 0.2s' };
const pImgArea = { height: '240px', position: 'relative' };
const pImg = { width: '100%', height: '100%', objectFit: 'cover' };
const pBadge = { position: 'absolute', top: '15px', right: '15px', backgroundColor: 'rgba(255,255,255,0.9)', padding: '5px 12px', borderRadius: '50px', fontSize: '11px', fontWeight: 'bold' };
const pBody = { padding: '25px' };
const pTitle = { margin: '0 0 10px 0', fontSize: '19px', color: '#111827' };
const pAddr = { color: '#6b7280', fontSize: '13px', marginBottom: '20px' };
const pMetaGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' };
const pMetaItem = { display: 'flex', flexDirection: 'column', fontSize: '12px', color: '#9ca3af' };
const pProgress = { marginBottom: '25px' };
const pProgressInfo = { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px', color: '#4b5563' };
const pProgressTrack = { height: '6px', backgroundColor: '#f3f4f6', borderRadius: '10px' };
const pProgressFill = { height: '100%', backgroundColor: '#008855' };
const pFooter = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f4f6', paddingTop: '20px' };
const buyBtn = { backgroundColor: '#008855', color: '#fff', border: 'none', padding: '10px 25px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' };

const portfolioGrid = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '25px' };
const statCard = { padding: '25px', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb' };
const claimBtnStyle = { marginTop: '15px', width: '100%', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#fff', color: '#008855', fontWeight: 'bold', cursor: 'pointer' };

const tableCard = { backgroundColor: '#fff', padding: '25px', borderRadius: '16px', border: '1px solid #e5e7eb', overflowX: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', textAlign: 'left' };
const thStyle = { borderBottom: '2px solid #f3f4f6', color: '#9ca3af', padding: '15px' };
const trStyle = { borderBottom: '1px solid #f3f4f6' };
const tdStyle = { padding: '15px' };
const statusBadge = { backgroundColor: '#f0fdf4', color: '#16a34a', padding: '4px 10px', borderRadius: '50px', fontSize: '12px', fontWeight: 'bold' };

const adminActionCard = { backgroundColor: '#fff', padding: '30px', borderRadius: '16px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '20px' };
const adminBtn = { backgroundColor: '#111827', color: '#fff', border: 'none', padding: '15px 30px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' };

const legalPage = { maxWidth: '900px', backgroundColor: '#fff', padding: '40px', borderRadius: '20px', border: '1px solid #e5e7eb' };
const legalSection = { marginBottom: '25px' };
const warningBox = { padding: '20px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', borderRadius: '10px', fontSize: '13px' };

const modalOverlay = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const modalContent = { backgroundColor: '#fff', width: '90%', maxWidth: '800px', maxHeight: '90vh', borderRadius: '24px', overflowY: 'auto', position: 'relative' };
const modalHeader = { padding: '25px 30px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: '#fff' };
const modalBody = { padding: '30px' };
const modalImg = { width: '100%', height: '300px', objectFit: 'cover', borderRadius: '16px', marginBottom: '25px' };
const modalGrid = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '30px' };
const modalInfoItem = { display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '14px', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' };
const modalSection = { marginBottom: '30px' };
const docLinkCard = { display: 'flex', justifyContent: 'space-between', backgroundColor: '#f9fafb', padding: '15px 20px', borderRadius: '12px', alignItems: 'center' };
const closeBtn = { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#9ca3af' };

const toastStyle = { position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#111827', color: '#fff', padding: '12px 30px', borderRadius: '50px', zIndex: 10000 };

export default App;
