require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const categoryRoutes = require('./routes/categoryRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const masterRoutes = require('./routes/masterRoutes');
const comboRoutes = require('./routes/comboRoutes');
const dummyComboRoutes = require('./routes/dummyComboRoutes');
const customerRoutes = require('./routes/customerRoutes');
const vendorPricingRoutes = require('./routes/vendorPricing');
const modelRoutes = require('./routes/modelRoutes');
const dummyCategoryRoutes = require('./routes/dummyCategoryRoutes');

const app = express();

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
app.use(cors());
app.use(express.json());


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
app.use('/api/categories', categoryRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/masters', masterRoutes);
app.use('/api/combos', comboRoutes);
app.use('/api/dummy-combos', dummyComboRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vendorPricing', vendorPricingRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/dummy-categories', dummyCategoryRoutes);

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
app.listen(5000, () => console.log('Server running on port 5000'));