require("dotenv").config();

const { assertJwtConfiguration } = require("./utils/jwtSecrets");
assertJwtConfiguration();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const axios = require("axios");

const connectDB = require("./config/db");
const { corsOrigin } = require("./utils/corsPolicy");
const {
  isTrustedProxyAddress,
  safeErrorForLog,
  sanitizeErrorResponses,
  securityHeaders,
} = require("./utils/httpSecurity");

// 🔹 IMPORTANT: load model ONCE before routes
require("./models/VendorPriceNode");
require("./models/VendorServiceTaxOverride");

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
const adminWhatsappIntegrationRoutes = require("./routes/adminWhatsappIntegrationRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const vendorPaymentConfigRoutes = require("./routes/vendorPaymentConfigRoutes");
const vendorBillingPreferencesRoutes = require("./routes/vendorBillingPreferencesRoutes");
const vendorGstSettingsRoutes = require("./routes/vendorGstSettingsRoutes");
const vendorItemGstOverrideRoutes = require("./routes/vendorItemGstOverrideRoutes");
const vendorGstPreviewRoutes = require("./routes/vendorGstPreviewRoutes");
const vendorGstReportRoutes = require("./routes/vendorGstReportRoutes");
const vendorMembershipPlanRoutes = require("./routes/vendorMembershipPlanRoutes");
const vendorCustomerMembershipRoutes = require("./routes/vendorCustomerMembershipRoutes");
const vendorPrepaidWalletRoutes = require("./routes/vendorPrepaidWalletRoutes");
const vendorWhatsappBusinessRoutes = require("./routes/vendorWhatsappBusinessRoutes");
const vendorWhatsappMarketingRoutes = require("./routes/vendorWhatsappMarketingRoutes");
const metaWhatsappWebhookRoutes = require("./routes/metaWhatsappWebhookRoutes");
const customerPortalRoutes = require("./routes/customerPortalRoutes");
const publicVendorHighlightsRoutes = require("./routes/publicVendorHighlightsRoutes");
const vendorSubscriptionRoutes = require("./routes/vendorSubscriptionRoutes");

const vendorPriceNodeRoutes = require(
  path.resolve(__dirname, "routes", "vendorPriceNodeRoutes")
);

// --------------------
// App init
// --------------------
const app = express();
app.disable("x-powered-by");

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

app.use(
  cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders,
    credentials: false,
  })
);
app.use(securityHeaders);
app.use(sanitizeErrorResponses);

// Trust only the private/loopback reverse proxies used by Elastic Beanstalk.
app.set("trust proxy", isTrustedProxyAddress);

// --------------------
// Connect DB
// --------------------
connectDB();

// --------------------
// Logger
// --------------------
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      `${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`
    );
  });
  next();
});

// Meta must receive the untouched bytes before the universal JSON parser.
app.use("/api/webhooks/meta", metaWhatsappWebhookRoutes);

// --------------------
// Body parsing
// --------------------
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ limit: "8mb", extended: true }));

// --------------------
// Static uploads
// --------------------
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use("/uploads", express.static(uploadsDir));

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
app.use("/api/customer-portal", customerPortalRoutes);
app.use("/api/public-vendors", publicVendorHighlightsRoutes);
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
app.use("/api/vendor/whatsapp-marketing", vendorWhatsappMarketingRoutes);
app.use("/api", require("./routes/vendorFlowRoutes"));
app.use("/api/billing", billingRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/trust", trustProfileRoutes);
app.use("/api/location", require("./routes/locationRoutes"));
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
app.use("/api/vendor-billing-preferences", vendorBillingPreferencesRoutes);
app.use("/api/vendor/gst-settings", vendorGstSettingsRoutes);
app.use("/api/vendor/gst-item-overrides", vendorItemGstOverrideRoutes);
app.use("/api/vendor/gst-preview", vendorGstPreviewRoutes);
app.use("/api/vendor/gst-reports", vendorGstReportRoutes);
app.use("/api/vendor/membership-plans", vendorMembershipPlanRoutes);
app.use("/api/vendor/customer-memberships", vendorCustomerMembershipRoutes);
app.use("/api/vendor/prepaid-wallets", vendorPrepaidWalletRoutes);
app.use("/api/vendor/subscription", vendorSubscriptionRoutes);
// Vendor Dashboard APIs
app.use("/api/vendor/dashboard", require("./routes/vendorDashboardRoutes"));
app.use("/api/vendor/dashboard", require("./routes/customerAnalyticsRoutes"));
app.use("/api/vendor/dashboard", require("./routes/vendorCustomerRoutes"));
app.use("/api/admin", adminRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes);
app.use("/api/admin/digital-score", adminDigitalScoreRoutes);
app.use("/api/admin", adminWhatsappIntegrationRoutes);

// ⭐ Vendor price nodes
app.use("/api/vendor-price-nodes", vendorPriceNodeRoutes);

// Auth (keep last)
app.use("/", authRoutes);

// --------------------
// Error handler
// --------------------
app.use((err, req, res, next) => {
  const statusCode = Number(err?.statusCode) || 500;
  console.error("Unhandled request error", safeErrorForLog(err));
  res.status(statusCode).json({ message: statusCode === 403 ? "Origin not allowed" : "Internal Server Error" });
});

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 5001;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
