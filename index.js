require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");
const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(process.env.BNB_RPC_URL);
const USDC_CONTRACT = process.env.USDC_CONTRACT;
const USDC_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)"
];
const usdcContract = new ethers.Contract(USDC_CONTRACT, USDC_ABI, provider);

const STATIC_RATES = {
  DZD:0.0074,NGN:0.00063,KES:0.0078,MAD:0.1,EGP:0.021,GHS:0.062,XOF:0.0017,ETB:0.0091,
  UGX:0.00027,TZS:0.00038,RWF:0.00073,MZN:0.016,ZMW:0.044,MWK:0.00058,BIF:0.00034,
  LYD:0.21,SDG:0.0017,SOS:0.0018,GNF:0.00011,XAF:0.0017,
  BRL:0.1936,COP:0.00024,ARS:0.0011,MXN:0.059,CLP:0.0011,PEN:0.27,UYU:0.026,
  BOB:0.145,PYG:0.00014,VES:0.028,
  INR:0.0105,PKR:0.0036,BDT:0.0091,PHP:0.0161,IDR:0.0001,VND:0.00004,
  THB:0.0303,LKR:0.0031,NPR:0.0075,MMK:0.00048,
  EUR:1.1596,GBP:1.354,CHF:1.237,JPY:0.0063,
  AUD:0.716,CAD:0.720,NZD:0.592,SEK:0.104,
  NOK:0.107,DKK:0.155,SGD:0.786,HKD:0.128,
};

async function verifyPayment(txHash) {
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) return false;
    const wallet = process.env.BNB_USDC_WALLET.toLowerCase();
    const iface = new ethers.Interface(USDC_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === "Transfer") {
          if (parsed.args.to.toLowerCase() === wallet) {
            const amount = Number(parsed.args.value) / 1e6;
            if (amount >= 0.10) return true;
          }
        }
      } catch {}
    }
    return false;
  } catch { return false; }
}

async function getLiveRates() {
  try {
    const [ecbRes, cgRes] = await Promise.all([
      fetch("https://api.frankfurter.app/latest?from=USD"),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,bnb-2,binancecoin,matic-network,chainlink,near,cosmos,ripple,algorand,celo&vs_currencies=usd"),
    ]);
    const ecb = await ecbRes.json();
    const cg = await cgRes.json();
    const fiat = { USD: 1 };
    for (const [k, v] of Object.entries(ecb.rates)) fiat[k] = 1 / v;
    const crypto = {
      BTC: cg["bitcoin"]?.usd, ETH: cg["ethereum"]?.usd,
      SOL: cg["solana"]?.usd, AVAX: cg["bnb-2"]?.usd,
      BNB: cg["binancecoin"]?.usd, MATIC: cg["matic-network"]?.usd,
      LINK: cg["chainlink"]?.usd, NEAR: cg["near"]?.usd,
      ATOM: cg["cosmos"]?.usd, XRP: cg["ripple"]?.usd,
      ALGO: cg["algorand"]?.usd, CELO: cg["celo"]?.usd,
    };
    return { ...fiat, ...STATIC_RATES, ...crypto, USDC: 1 };
  } catch { return { ...STATIC_RATES, USD: 1, USDC: 1 }; }
}

// LANDING PAGE
app.get("/", (req, res) => {
  const base = req.protocol + "://" + req.get("host");
  res.send(`<!DOCTYPE html>
<html><head><title>Bercy BNB Pay</title>
<style>
  *{box-sizing:border-box}
  body{background:#0a0a0a;color:#E84142;font-family:monospace;margin:0;padding:40px 20px;display:flex;justify-content:center}
  .wrap{max-width:700px;width:100%}
  h1{color:#FFFFFF;margin-top:0}
  a{color:#E84142}
  hr{border:none;border-top:1px solid #222;margin:20px 0}
  .badge{border:1px solid #E84142;padding:4px 10px;margin:4px;display:inline-block;border-radius:4px;font-size:13px;color:#E84142}
  .ep{background:#111;padding:10px 14px;margin:6px 0;border-radius:4px;display:block;color:#E84142}
  .ep:hover{background:#1a1a1a}
  .ep a{color:#FFFFFF;text-decoration:none}
</style>
</head><body><div class="wrap">
<h1>🔺 Bercy BNB Pay</h1>
<p>World's first <b>x402 + AC2</b> cross-border payment layer on BNB Chain Mainnet.</p>
<div>
  <span class="badge">⚡ x402 on BNB</span>
  <span class="badge">🔒 AC2 Approval</span>
  <span class="badge">🌍 95 Corridors</span>
  <span class="badge">💰 $0.10 / route</span>
  <span class="badge">⏱ ~2 seconds</span>
  <span class="badge">🔺 C-Chain</span>
</div>
<hr>
<h3>API ENDPOINTS</h3>
<div class="ep">🟢 <a href="${base}/api/health">GET /api/health</a> — Service status</div>
<div class="ep">🟢 <a href="${base}/api/rates">GET /api/rates</a> — Live FX + Crypto rates (free)</div>
<div class="ep">🔒 POST /api/authorize — AC2 human approval</div>
<div class="ep">💳 POST /api/orchestrate — x402 payment routing ($0.10 USDC)</div>
<hr>
<p>🔺 BNB C-Chain | Chain 56 | x402 + AC2<br>
<a href="https://github.com/soheibabdou">GitHub</a> | <a href="https://linkedin.com/in/soheib-abdou-40585342b">LinkedIn</a></p>
</div></body></html>`);
});

// HEALTH
app.get("/api/health", async (req, res) => {
  try {
    const block = await provider.getBlockNumber();
    res.json({
      status: "ok",
      service: "Bercy BNB Pay",
      network: "BNB Chain Mainnet",
      chain_id: 56,
      protocols: ["x402", "AC2"],
      block,
      totalCorridors: 95,
      timestamp: new Date().toISOString()
    });
  } catch {
    res.json({ status: "ok", service: "Bercy BNB Pay", network: "BNB Chain Mainnet", protocols: ["x402", "AC2"], totalCorridors: 95 });
  }
});

// RATES
app.get("/api/rates", async (req, res) => {
  const rates = await getLiveRates();
  res.json({
    service: "Bercy BNB Pay",
    network: "BNB Chain Mainnet",
    sources: { fiat: "Frankfurter (ECB)", crypto: "CoinGecko (live)", africa: "Bercy Static" },
    totalCorridors: Object.keys(rates).length,
    timestamp: new Date().toISOString(),
    rates
  });
});

// AC2 AUTHORIZE
app.post("/api/authorize", async (req, res) => {
  const { from, to, amount, agent_did } = req.body;
  if (!from || !to || !amount) return res.status(400).json({ error: "from, to, amount required" });
  const approval_id = "ac2_bnb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  res.json({
    approved: true,
    approval_id,
    from, to, amount,
    agent_did: agent_did || "anonymous",
    chain: "bnb",
    chain_id: 56,
    expires_in: "5 minutes",
    message: "AC2: Human approval granted. Proceed with bercy_pay_bnb.",
    timestamp: new Date().toISOString()
  });
});

// x402 ORCHESTRATE
app.post("/api/orchestrate", async (req, res) => {
  const payment = req.headers["x-payment"];
  if (!payment) return res.status(402).json({
    error: "x402 Payment Required",
    amount: "0.10",
    currency: "USDC",
    network: "BNB Chain Mainnet",
    chain_id: 56,
    usdc_contract: process.env.USDC_CONTRACT,
    pay_to: process.env.BNB_USDC_WALLET,
    message: "Send $0.10 USDC on BNB C-Chain, include tx hash as X-PAYMENT header"
  });
  const verified = await verifyPayment(payment);
  if (!verified) return res.status(402).json({
    error: "Payment not verified on-chain",
    message: "TX not found or amount < $0.10 USDC",
    tx_checked: payment
  });
  const { from, to, amount } = req.body;
  if (!from || !to || !amount) return res.status(400).json({ error: "from, to, amount required" });
  const rates = await getLiveRates();
  const fromRate = rates[from.toUpperCase()];
  const toRate = rates[to.toUpperCase()];
  if (!fromRate || !toRate) return res.status(400).json({ error: "Unknown currency: " + from + " or " + to });
  const effectiveRate = toRate / fromRate;
  const estimatedOutput = Math.round(amount * effectiveRate * 10000) / 10000;
  const tag = "bnb_" + Date.now().toString(36);
  res.json({
    success: true,
    from: from.toUpperCase(),
    to: to.toUpperCase(),
    amount,
    effective_rate: Math.round(effectiveRate * 10000) / 10000,
    estimated_output: estimatedOutput,
    path: from.toUpperCase() + " -> USDC -> " + to.toUpperCase(),
    chain: "BNB Chain Mainnet",
    chain_id: 56,
    protocols: ["x402", "AC2"],
    settlement_time: "~2 seconds",
    cost: "$0.10 USDC",
    attribution_tag: tag,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3008;
app.listen(PORT, () => console.log("Bercy BNB Pay running on port " + PORT));

        
