require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const axios = require('axios');

const connectDB = require('./config/db');
const categoryRoutes = require('./routes/categoryRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const masterRoutes = require('./routes/masterRoutes');
const comboRoutes = require('./routes/comboRoutes');
const dummyComboRoutes = require('./routes/dummyComboRoutes');
const vendorComboPricingRoutes = require('./routes/vendorComboPricingRoutes');
const customerRoutes = require('./routes/customerRoutes');
const vendorPricingRoutes = require('./routes/vendorPricing');
const modelRoutes = require('./routes/modelRoutes');
const dummyCategoryRoutes = require('./routes/dummyCategoryRoutes');
const dummyVendorRoutes = require('./routes/dummyVendorRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const appConfigRoutes = require('./routes/appConfigRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');

const app = express();

// Behind a load balancer/proxy (e.g., ALB), trust proxy so protocol and IP are correct
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

// On DB ready, drop unintended unique indexes on 'masters' so duplicates are allowed
mongoose.connection.once('open', async () => {
    try {
        const collection = mongoose.connection.collection('masters');
        const indexes = await collection.indexes();
        const toDrop = indexes
            .filter(ix => ix.unique && (ix.key?.name === 1 || (ix.key?.name === 1 && ix.key?.type === 1)))
            .map(ix => ix.name);
        for (const idxName of toDrop) {
            try {
                await collection.dropIndex(idxName);
                console.log(`Dropped index ${idxName} on masters`);
            } catch (e) {
                console.warn(`Failed to drop index ${idxName}: ${e.message}`);
            }
        }
    } catch (e) {
        console.warn(`Index check on masters failed: ${e.message}`);
    }
});

// Middleware
// CORS: allow cross-origin; explicitly mirror Origin and ensure preflight responses
const allowedHeaders = [
  'Content-Type',
  'Authorization',
  'Accept',
  'Origin',
  'X-Requested-With',
  'x-root-category-id',
  'x-vendor-id',
  'x-actor-role',
];

app.use(cors({
  origin: true,
  methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
  allowedHeaders,
  credentials: false,
  optionsSuccessStatus: 200,
}));
// Explicit headers to cover any non-standard error paths and ensure headers are present
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
// Increase body size limits to handle base64 data URLs for images in dummy vendor profilePictures
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ limit: '8mb', extended: true }));


// Simple request logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    });
    next();
});

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Serve static files from /uploads
app.use('/uploads', express.static(uploadsDir));

// Routes
app.get('/', (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
// Proxy route to fetch country codes without CORS issues on the frontend
// Uses restcountries.com and derives dial codes dynamically (no hardcoded list)
app.get('/api/countries/codes', async (req, res, next) => {
    try {
        const response = await axios.get('https://restcountries.com/v3.1/all?fields=name,idd');
        const countries = Array.isArray(response.data) ? response.data : [];

        const data = countries
            .map(c => {
                const name = c?.name?.common;
                const root = c?.idd?.root || '';
                const suffixes = Array.isArray(c?.idd?.suffixes) ? c.idd.suffixes : [];

                if (!name || !root || !suffixes.length) return null;

                const dial_code = `${root}${suffixes[0]}`;
                return { name, dial_code };
            })
            .filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json({ data });
    } catch (err) {
        console.error('Failed to fetch countries from restcountries.com:', {
            message: err.message,
            code: err.code,
            status: err.response?.status,
        });

        res.status(502).json({
            message: 'Failed to fetch countries data',
        });
    }
});
app.use('/api/categories', categoryRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/masters', masterRoutes);
app.use('/api/combos', comboRoutes);
app.use('/api/dummy-combos', dummyComboRoutes);
app.use('/api/vendor-combo-pricing', vendorComboPricingRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vendorPricing', vendorPricingRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/dummy-categories', dummyCategoryRoutes);
app.use('/api/dummy-vendors', dummyVendorRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api', uploadRoutes);
app.use('/api/app-config', appConfigRoutes);
app.use('/api/audit-logs', auditLogRoutes);

// Debug: DB connection info
app.get('/api/_debug/db', (req, res) => {
    const conn = mongoose.connection;
    res.json({
        readyState: conn.readyState,
        dbName: conn.db ? conn.db.databaseName : null,
        host: conn.host,
        user: conn.user || null,
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack || err.message);
    res.status(500).json({
        message: "Internal Server Error",
        error: err.message
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
