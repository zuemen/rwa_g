const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { issueNonce, messageFor, requireWalletSignature, requireAdminKey } = require('./auth');

const app = express();

// CORS 白名單：預設只允許本機開發用的 Vite port，可用 ALLOWED_ORIGINS 覆寫。
// 先前是 app.use(cors()) 全開，任何網站都能代使用者打這些端點。
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    // 同源／curl 等沒有 Origin 標頭的請求放行；跨站則需在白名單內
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed'));
  },
}));
app.use(express.json({ limit: '100kb' }));

app.get('/', (req, res) => res.send('Pepe RWA API is running...'));

const contractsPath = path.join(__dirname, '..', 'deployed-contracts.json');
let contractData;
try {
    contractData = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));
} catch (e) {
    contractData = { addresses: {}, abis: {} }; // Fallback
}

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
// 私鑰一律從環境變數讀。預設值是 Anvil 公開測試帳號 #0（本機開發用，人盡皆知），
// 絕不可在測試網／主網沿用 —— 請設定 DEPLOYER_PRIVATE_KEY。
const ANVIL_DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || ANVIL_DEV_KEY;
if (PRIVATE_KEY === ANVIL_DEV_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('正式環境必須設定 DEPLOYER_PRIVATE_KEY，不可使用 Anvil 測試私鑰');
  }
  console.warn('[WARN] 未設定 DEPLOYER_PRIVATE_KEY，使用 Anvil 本機測試私鑰。');
}
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// 模擬 PWA 代幣餘額與價格 (1 USDC = 10 PWA)
let pwaBalances = {};
const PWA_PRICE = 0.1; 

const properties = [
  {
    id: 1,
    title: "Pepe Tower - 信義金融旗艦",
    address: "台北市信義區松智路 15 號",
    image: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&q=80&w=1400",
    totalValuationUSDC: 40000000,
    tokenPrice: 100, 
    totalTokens: 400000,
    soldTokens: 312000,
    apy: 8.4,
    irr: "12.5%",
    riskLevel: "Low",
    liquidity: "High",
    details: {
        description: "Pepe RWA 的旗艦物件，位於台北 101 旁。該標的已由全球知名避險基金預租 10 年，現金流極度穩定。",
        constructionDate: "2020-01-01",
        tags: ["Core Asset", "Stable Yield", "Prime Location"]
    },
    legal: {
        trustee: "Pepe Custody Bank",
        valuationReport: "https://ipfs.io/ipfs/Qm..."
    }
  },
  {
    id: 2,
    title: "Green Meme 科技園區 - 貳號標的",
    address: "新竹科學園區研發六路",
    image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1400",
    totalValuationUSDC: 15000000,
    tokenPrice: 50,
    totalTokens: 300000,
    soldTokens: 45000,
    apy: 11.2,
    irr: "15.8%",
    riskLevel: "Medium",
    liquidity: "Moderate",
    details: {
        description: "專為高成長科技企業設計的辦公空間，具備極高的資本增值潛力與彈性的空間規劃。",
        constructionDate: "2022-05-12",
        tags: ["Growth", "Tech Hub", "Value-Add"]
    },
    legal: {
        trustee: "Meme Trust Services",
        valuationReport: "https://ipfs.io/ipfs/Qn..."
    }
  }
];

let transactions = [
    { id: 1, type: 'PEPE_LAUNCH', user: 'Founder', amount: 'Initial Liquidity', date: new Date().toISOString(), status: 'SUCCESS' }
];

app.get('/api/config', (req, res) => res.json(contractData));
app.get('/api/properties', (req, res) => res.json(properties));
app.get('/api/transactions', (req, res) => res.json(transactions));

// 取得一次性 nonce，供錢包簽章驗證使用
app.post('/api/auth/nonce', (req, res) => {
  const { address } = req.body || {};
  const nonce = issueNonce(address);
  if (!nonce) return res.status(400).json({ error: '地址格式錯誤' });
  const normalized = ethers.getAddress(address);
  res.json({ nonce, message: messageFor(normalized, nonce) });
});

// 購買 PWA 平台幣
app.post('/api/pwa/buy', requireWalletSignature, async (req, res) => {
    const address = req.verifiedAddress;
    const { usdcAmount } = req.body;
    const pwaAmount = usdcAmount * 10;
    pwaBalances[address] = (pwaBalances[address] || 0) + pwaAmount;
    
    transactions.unshift({
        id: transactions.length + 1,
        type: 'BUY $PWA',
        user: address,
        amount: `${pwaAmount} PWA`,
        date: new Date().toISOString(),
        status: 'SUCCESS'
    });
    
    res.json({ success: true, balance: pwaBalances[address], message: `成功兌換 ${pwaAmount} $PWA！` });
});

app.get('/api/pwa/balance/:address', (req, res) => {
    res.json({ balance: pwaBalances[req.params.address] || 0 });
});

app.post('/api/kyc', requireWalletSignature, async (req, res) => {
  const address = req.verifiedAddress;
  try {
    const registry = new ethers.Contract(contractData.addresses.IdentityRegistry, contractData.abis.IdentityRegistry, wallet);
    const usdc = new ethers.Contract(contractData.addresses.MockUSDC, contractData.abis.MockUSDC, wallet);
    
    const isVerified = await registry.checkIdentity(address);
    if (!isVerified) {
      await (await registry.registerIdentity(address)).wait();
    }
    await (await usdc.mint(address, ethers.parseUnits("50000", 18))).wait();
    
    transactions.unshift({ id: transactions.length + 1, type: 'KYC & AIRDROP', user: address, amount: '50,000 USDC', date: new Date().toISOString(), status: 'SUCCESS' });
    res.json({ success: true, message: "認證成功！已發放 50,000 USDC 投資金。" });
  } catch (error) { res.status(500).json({ error: "KYC Failed" }); }
});

app.post('/api/buy', requireWalletSignature, async (req, res) => {
  const address = req.verifiedAddress;
  const { amount } = req.body;
  try {
     const property = new ethers.Contract(contractData.addresses.PropertyToken, contractData.abis.PropertyToken, wallet);
     const amountBn = ethers.parseUnits(amount.toString(), 18);
     await (await property.transfer(address, amountBn)).wait();
     
     transactions.unshift({ id: transactions.length + 1, type: 'INVEST', user: address, amount: `${amount} Units`, date: new Date().toISOString(), status: 'SUCCESS' });
     res.json({ success: true, message: `認購成功！資產已上鏈。` });
  } catch (error) { res.status(500).json({ error: "Purchase Failed" }); }
});

app.get('/api/rewards/:address', async (req, res) => {
    try {
        const distributor = new ethers.Contract(contractData.addresses.RentalDistributor, contractData.abis.RentalDistributor, wallet);
        const reward = await distributor.earnable(req.params.address);
        res.json({ claimable: ethers.formatUnits(reward, 18) });
    } catch (e) { res.json({ claimable: "0" }); }
});

app.post('/api/admin/distribute-rent', requireAdminKey, async (req, res) => {
    try {
        const distributor = new ethers.Contract(contractData.addresses.RentalDistributor, contractData.abis.RentalDistributor, wallet);
        await (await distributor.distributeRent(ethers.parseUnits("25000", 18))).wait();
        res.json({ success: true, message: "收益派發成功！" });
    } catch (e) { res.status(500).json({ error: "Distribute failed" }); }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Pepe RWA Backend running on port ${PORT}`));
