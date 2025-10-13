require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const mongoose = require('mongoose');
const categoryRoutes = require('./routes/categoryRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const masterRoutes = require('./routes/masterRoutes');


const app = express();
connectDB();

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

const customerRoutes = require('./routes/customerRoutes');
app.use('/api/customers', customerRoutes);

const vendorPricingRoutes = require('./routes/vendorPricing');
app.use('/api/vendorPricing', vendorPricingRoutes);

const modelRoutes = require("./routes/modelRoutes");
app.use("/api/models", modelRoutes);


// Debug: DB connection info
app.get('/api/_debug/db', (req, res) => {
  const conn = mongoose.connection;
  res.json({
    readyState: conn.readyState, // 1 = connected
    dbName: conn.db ? conn.db.databaseName : null,
    host: conn.host,
    user: conn.user || null,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack || err.message);
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});

app.listen(5000, () => console.log('Server running on port 5000'));
