// ╔══════════════════════════════════════════════════════════════════╗
// ║         NEW KRISHNA SWEETS — BACKEND (server.js)                ║
// ║         Powered by Sai Shuru Nexus                              ║
// ║                                                                 ║
// ║  HOW TO RUN LOCALLY:                                            ║
// ║    1. npm install                                               ║
// ║    2. Create .env file with: MONGO_URI=your_mongodb_uri         ║
// ║    3. node server.js                                            ║
// ║                                                                 ║
// ║  WHAT THIS FILE DOES:                                           ║
// ║    - Connects to MongoDB Atlas                                  ║
// ║    - Provides REST API for Bills, Products, Categories          ║
// ║    - Runs on port 5000                                          ║
// ╚══════════════════════════════════════════════════════════════════╝

const express   = require("express");
const mongoose  = require("mongoose");
const cors      = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── MongoDB Connection ─────────────────────────────────────────────
// Replace the string below with your MongoDB Atlas URI
// OR set MONGO_URI in your .env file / Render environment variables
mongoose.connect(
  process.env.MONGO_URI || "mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/nks_billing?retryWrites=true&w=majority",
  { useNewUrlParser: true, useUnifiedTopology: true }
)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ MongoDB Error:", err));

// ══════════════════════════════════════════════════════════════════
// DATABASE SCHEMAS
// ══════════════════════════════════════════════════════════════════

// Category (Sweets, Mixture, Bread, etc.)
const CategorySchema = new mongoose.Schema({
  label:  { type: String, required: true },
  emoji:  { type: String, default: "🛍️" },
  color:  { type: String, default: "#c9972b" },
  order:  { type: Number, default: 0 },
}, { timestamps: true });
const Category = mongoose.model("Category", CategorySchema);

// Product (Laddu, Murukku, etc.)
const ProductSchema = new mongoose.Schema({
  name:  { type: String, required: true },
  ta:    { type: String, default: "" },
  price: { type: Number, required: true },
  unit:  { type: String, enum: ["kg","pcs"], default: "kg" },
  catId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
}, { timestamps: true });
const Product = mongoose.model("Product", ProductSchema);

// Bill (each sale transaction)
const BillSchema = new mongoose.Schema({
  billId:    { type: String, required: true, unique: true },
  items: [{
    name:       String,
    ta:         String,
    catId:      String,
    displayQty: String,
    total:      Number,
  }],
  total:     { type: Number, required: true },
  itemCount: { type: Number, default: 0 },
}, { timestamps: true });
const Bill = mongoose.model("Bill", BillSchema);

// ── Bill ID Generator: NKS-YYYYMMDD-XXXX ──────────────────────────
function genBillId() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
  const uid  = Math.floor(1000 + Math.random() * 9000);
  return `NKS-${date}-${uid}`;
}

// ══════════════════════════════════════════════════════════════════
// API ROUTES — CATEGORIES
// ══════════════════════════════════════════════════════════════════

// GET all categories
app.get("/api/categories", async (req, res) => {
  try {
    const cats = await Category.find().sort({ order: 1, createdAt: 1 });
    res.json({ success: true, data: cats });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST add new category
app.post("/api/categories", async (req, res) => {
  try {
    const { label, emoji, color } = req.body;
    if (!label) return res.status(400).json({ success: false, message: "Label required" });
    const count = await Category.countDocuments();
    const cat = new Category({ label, emoji: emoji||"🛍️", color: color||"#c9972b", order: count });
    await cat.save();
    res.json({ success: true, data: cat });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE a category (also deletes its products)
app.delete("/api/categories/:id", async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    await Product.deleteMany({ catId: req.params.id });
    res.json({ success: true, message: "Category deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// API ROUTES — PRODUCTS
// ══════════════════════════════════════════════════════════════════

// GET all products (grouped by category)
app.get("/api/products", async (req, res) => {
  try {
    const prods = await Product.find().populate("catId");
    const grouped = {};
    prods.forEach(p => {
      const cid = p.catId?._id?.toString() || p.catId?.toString();
      if (!grouped[cid]) grouped[cid] = [];
      grouped[cid].push({
        _id: p._id, id: p._id.toString(),
        name: p.name, ta: p.ta,
        price: p.price, unit: p.unit, catId: cid,
      });
    });
    res.json({ success: true, data: grouped });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST add new product
app.post("/api/products", async (req, res) => {
  try {
    const { name, ta, price, unit, catId } = req.body;
    if (!name || !price || !catId)
      return res.status(400).json({ success: false, message: "name, price, catId required" });
    const prod = new Product({ name, ta: ta||"", price: parseFloat(price), unit: unit||"kg", catId });
    await prod.save();
    res.json({ success: true, data: prod });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE a product
app.delete("/api/products/:id", async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Product deleted" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// API ROUTES — BILLS
// ══════════════════════════════════════════════════════════════════

// POST create a new bill
app.post("/api/bills", async (req, res) => {
  try {
    const { items, total } = req.body;
    if (!items?.length) return res.status(400).json({ success: false, message: "Items required" });
    const billId = genBillId();
    const bill = new Bill({ billId, items, total, itemCount: items.length });
    await bill.save();
    res.json({ success: true, data: bill });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET all bills (with optional filter: today / week / month / all)
app.get("/api/bills", async (req, res) => {
  try {
    const { filter } = req.query;
    let dateFilter = {};
    const now = new Date();
    if (filter === "today") {
      const start = new Date(now); start.setHours(0,0,0,0);
      dateFilter = { createdAt: { $gte: start } };
    } else if (filter === "week") {
      const start = new Date(now); start.setDate(start.getDate()-7);
      dateFilter = { createdAt: { $gte: start } };
    } else if (filter === "month") {
      const start = new Date(now); start.setDate(start.getDate()-30);
      dateFilter = { createdAt: { $gte: start } };
    }
    const bills = await Bill.find(dateFilter).sort({ createdAt: -1 });
    res.json({ success: true, data: bills });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET single bill by full ID (NKS-YYYYMMDD-XXXX)
app.get("/api/bills/:billId", async (req, res) => {
  try {
    const bill = await Bill.findOne({ billId: req.params.billId });
    if (!bill) return res.status(404).json({ success: false, message: "Bill not found" });
    res.json({ success: true, data: bill });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET bill by last 4 digits (customer portal search)
// Example: GET /api/bills/lookup/3456
// Automatically builds: NKS-YYYYMMDD-3456 for today
app.get("/api/bills/lookup/:last4", async (req, res) => {
  try {
    const { last4 } = req.params;
    const d = new Date();
    const p = n => String(n).padStart(2,"0");
    const today = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
    const billId = `NKS-${today}-${last4}`;
    const bill = await Bill.findOne({ billId });
    if (!bill) return res.status(404).json({ success: false, message: "Bill not found" });
    res.json({ success: true, data: bill });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// API ROUTES — ANALYTICS
// ══════════════════════════════════════════════════════════════════

// GET daily sales data (last N days)
app.get("/api/analytics/daily", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const result = [];
    const now = new Date();
    for (let i = days-1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate()-i);
      const start = new Date(d); start.setHours(0,0,0,0);
      const end   = new Date(d); end.setHours(23,59,59,999);
      const bills = await Bill.find({ createdAt: { $gte: start, $lte: end } });
      const p2 = n => String(n).padStart(2,"0");
      result.push({
        date:  `${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}`,
        label: d.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}),
        total: bills.reduce((s,b) => s+b.total, 0),
        count: bills.length,
      });
    }
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── Start Server ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 NKS Billing Server running on port ${PORT}`));
