const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const contractsPath = path.join(__dirname, '..', 'deployed-contracts.json');
let contractData = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));

const RPC_URL = "http://127.0.0.1:8545";
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; 
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const registryContract = new ethers.Contract(contractData.addresses.IdentityRegistry, contractData.abis.IdentityRegistry, wallet);
const propertyContract = new ethers.Contract(contractData.addresses.PropertyToken, contractData.abis.PropertyToken, wallet);
const distributorContract = new ethers.Contract(contractData.addresses.RentalDistributor, contractData.abis.RentalDistributor, wallet);
const usdcContract = new ethers.Contract(contractData.addresses.MockUSDC, contractData.abis.MockUSDC, wallet);

const properties = [
  {
    id: 1,
    title: "信義經貿金融大樓 (分次認購第 A1 號)",
    address: "台北市信義區松智路 15 號",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1400",
    totalValuationTWD: "NT$ 12.5 億",
    totalValuationUSDC: 40000000,
    tokenPrice: 100, // 每單位 100 USDC
    totalTokens: 400000,
    soldTokens: 215000,
    apy: 6.8,
    legal: {
        legalForm: "不動產投資信託 (Trust Structure)",
        trustee: "兆豐國際商業銀行 (模擬)",
        landZoning: "第二種商業區",
        usage: "辦公室 / 商業用",
        structure: "SRC 鋼骨混凝土",
        pings: 582.4,
        floor: "15F / 30F",
        valuationReport: "https://example.com/valuation-2024.pdf"
    },
    contractAddress: contractData.addresses.PropertyToken
  }
];

let transactions = [
    { id: 1, type: 'KYC', user: 'Admin', amount: 'N/A', date: new Date().toISOString(), status: 'SUCCESS' }
];

app.get('/api/properties', (req, res) => res.json(properties));

app.get('/api/config', (req, res) => {
  res.json({
    addresses: contractData.addresses,
    abis: contractData.abis
  });
});

app.get('/api/transactions', (req, res) => res.json(transactions));

app.post('/api/kyc', async (req, res) => {
  const { address } = req.body;
  try {
    const isVerified = await registryContract.checkIdentity(address);
    if (!isVerified) {
      await (await registryContract.registerIdentity(address)).wait();
    }
    await (await usdcContract.mint(address, ethers.parseUnits("10000", 18))).wait();
    
    transactions.unshift({
        id: transactions.length + 1,
        type: 'KYC & Mint',
        user: address,
        amount: '10,000 USDC',
        date: new Date().toISOString(),
        status: 'SUCCESS'
    });

    res.json({ success: true, message: "認證成功！已發放 10,000 USDC 測試金。" });
  } catch (error) {
    res.status(500).json({ error: "KYC Failed" });
  }
});

app.post('/api/buy', async (req, res) => {
  const { address, amount } = req.body;
  try {
     const amountBn = ethers.parseUnits(amount.toString(), 18);
     await (await propertyContract.transfer(address, amountBn)).wait();
     
     transactions.unshift({
        id: transactions.length + 1,
        type: 'BUY TOKEN',
        user: address,
        amount: `${amount} Units`,
        date: new Date().toISOString(),
        status: 'SUCCESS'
    });

     res.json({ success: true, message: `認購成功！已轉入 ${amount} 單位代幣。` });
  } catch (error) {
     res.status(500).json({ error: "購買失敗，請檢查網路。" });
  }
});

app.post('/api/admin/distribute-rent', async (req, res) => {
    try {
        const amount = ethers.parseUnits("15000", 18);
        await (await distributorContract.distributeRent(amount)).wait();
        res.json({ success: true, message: "本月租金收益已分派。" });
    } catch (e) {
        res.status(500).json({ error: "Distribute failed" });
    }
});

app.get('/api/rewards/:address', async (req, res) => {
    try {
        const reward = await distributorContract.earnable(req.params.address);
        res.json({ claimable: ethers.formatUnits(reward, 18) });
    } catch (e) {
        res.status(500).json({ error: "Query failed" });
    }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
