require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const axios = require("axios");

const connectDB = require("./config/db");

// 🔹 IMPORTANT: load model ONCE before routes
require("./models/VendorPriceNode");

// --------------------
// Route imports
// --------------------
const categoryRoutes = require("./routes/categoryRoutes");
const vendorRoutes = require("./routes/vendorRoutes");
const masterRoutes = require("./routes/masterRoutes");
const comboRoutes = require("./routes/comboRoutes");
const dummyComboRoutes = require("./routes/dummyComboRoutes");
const vendorComboPricingRoutes = require("./routes/vendorComboPricingRoutes");
const customerRoutes = require("./routes/customerRoutes");
const vendorPricingRoutes = require("./routes/vendorPricing");
const modelRoutes = require("./routes/modelRoutes");
const dummyCategoryRoutes = require("./routes/dummyCategoryRoutes");
const dummyVendorRoutes = require("./routes/dummyVendorRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const appConfigRoutes = require("./routes/appConfigRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const enquiryRoutes = require("./routes/enquiryRoutes");
const authRoutes = require("./routes/authRoutes");
const googlePlacesRoutes = require("./routes/googlePlacesRoutes");
const setupProgressRoutes = require("./routes/setupProgressRoutes");
const vendorFlowRoutes = require("./routes/vendorFlowRoutes");
const billingRoutes = require("./routes/billingRoutes");
const loyaltyRoutes = require("./routes/loyaltyRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminAnalyticsRoutes = require("./routes/adminAnalyticsRoutes");
const trustProfileRoutes = require("./routes/trustProfileRoutes");
const locationRoutes = require("./routes/locationRoutes");
const categoryTreeRoutes = require("./routes/categoryTreeRoutes");
const vendorResourceRoutes = require("./routes/vendorResourceRoutes");
const vendorCustomPackageRoutes = require("./routes/vendorCustomPackageRoutes");
const previewTemplateRoutes = require("./routes/previewTemplateRoutes");
const onboardingMenuRoutes = require("./routes/onboardingMenuRoutes");
const vendorMenuRoutes = require("./routes/vendorMenuRoutes");
const menuImageLibraryRoutes = require("./routes/menuImageLibraryRoutes");
const vendorGalleryRoutes = require("./routes/vendorGalleryRoutes");
const siteAnalyticsRoutes = require("./routes/siteAnalyticsRoutes");
const digitalScoreRoutes = require("./routes/digitalScoreRoutes");
const adminDigitalScoreRoutes = require("./routes/adminDigitalScoreRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const vendorPaymentConfigRoutes = require("./routes/vendorPaymentConfigRoutes");
const vendorWhatsappBusinessRoutes = require("./routes/vendorWhatsappBusinessRoutes");
const metaWhatsappWebhookRoutes = require("./routes/metaWhatsappWebhookRoutes");

const vendorPriceNodeRoutes = require(
  path.resolve(__dirname, "routes", "vendorPriceNodeRoutes")
);

// --------------------
// App init
// --------------------
const app = express();

// --------------------
// ✅ SAFE UNIVERSAL CORS CONFIG (LOCAL + AWS + OLD ADMIN)
// --------------------
const allowedHeaders = [
  "Content-Type",
  "Authorization",
  "Accept",
  "Origin",
  "X-Requested-With",
  "x-root-category-id",
  "x-vendor-id",
  "x-actor-role",
];

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:4000",
  "https://newsameep.go-kar.net",
  "https://main.d2vss5b9fy3xv.amplifyapp.com",
  "https://main.d18xuzvz5wtiup.amplifyapp.com",
  "https://main.d3t45ap4sbsqgp.amplifyapp.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow Postman / mobile apps
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // 🚀 TEMP SAFE MODE — allow unknown origins
      return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders,
    credentials: false,
  })
);

// Trust proxy (important behind Amplify / nginx)
app.set("trust proxy", 1);

// --------------------
// Connect DB
// --------------------
connectDB();

// --------------------
// Body parsing
// --------------------
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ limit: "8mb", extended: true }));

// --------------------
// Logger
// --------------------
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`
    );
  });
  next();
});

// --------------------
// Static uploads
// --------------------
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use("/uploads", express.static(uploadsDir));

// Meta webhooks need access to the raw request body for signature validation.
app.use("/api/webhooks/meta", metaWhatsappWebhookRoutes);

// --------------------
// Health
// --------------------
app.get("/", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) =>
  res.status(200).json({ status: "ok" })
);

// --------------------
// API ROUTES
// --------------------
// Static routes must come before dynamic routes in Express to avoid route shadowing.
app.use("/api", categoryTreeRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/masters", masterRoutes);
app.use("/api/combos", comboRoutes);
app.use("/api/dummy-combos", dummyComboRoutes);
app.use("/api/vendor-combo-pricing", vendorComboPricingRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/vendorPricing", vendorPricingRoutes);
app.use("/api/models", modelRoutes);
app.use("/api/dummy-categories", dummyCategoryRoutes);
app.use("/api/dummy-vendors", dummyVendorRoutes);
app.use("/api/enquiries", enquiryRoutes);
app.use("/api", uploadRoutes);
app.use("/api/app-config", appConfigRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/google/places", googlePlacesRoutes);
app.use("/api/setup-progress", setupProgressRoutes);
app.use("/api/vendor-flow", vendorFlowRoutes);
app.use("/api/vendor/whatsapp-business", vendorWhatsappBusinessRoutes);
app.use("/api", require("./routes/vendorFlowRoutes"));
app.use("/api/billing", billingRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/trust", trustProfileRoutes);
app.use("/api/location", require("./routes/locationRoutes"));
app.use("/api/test", require("./routes/test"));
app.use("/api/vendor-resources", vendorResourceRoutes);
app.use("/api/vendor-custom-packages", vendorCustomPackageRoutes);
app.use("/api/preview-templates", previewTemplateRoutes);
app.use("/api/onboarding", onboardingMenuRoutes);
app.use("/api/vendor-menu", vendorMenuRoutes);
app.use("/api/menu-image-library", menuImageLibraryRoutes);
app.use("/api/vendor-gallery", vendorGalleryRoutes);
app.use("/api/site-analytics", siteAnalyticsRoutes);
app.use("/api/digital-score", digitalScoreRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/vendor-payment-config", vendorPaymentConfigRoutes);
// Vendor Dashboard APIs
app.use("/api/vendor/dashboard", require("./routes/vendorDashboardRoutes"));
app.use("/api/vendor/dashboard", require("./routes/customerAnalyticsRoutes"));
app.use("/api/vendor/dashboard", require("./routes/vendorCustomerRoutes"));
app.use("/api/admin", adminRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes);
app.use("/api/admin/digital-score", adminDigitalScoreRoutes);

// ⭐ Vendor price nodes
app.use("/api/vendor-price-nodes", vendorPriceNodeRoutes);

// Auth (keep last)
app.use("/", authRoutes);

// --------------------
// Debug DB
// --------------------
app.get("/api/_debug/db", (req, res) => {
  const conn = mongoose.connection;
  res.json({
    readyState: conn.readyState,
    dbName: conn.db?.databaseName,
    host: conn.host,
  });
});

// --------------------
// Error handler
// --------------------
app.use((err, req, res, next) => {
  console.error(err.stack || err.message);
  res.status(500).json({
    message: "Internal Server Error",
    error: err.message,
  });
});

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 5001;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
