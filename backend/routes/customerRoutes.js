const express = require("express");
const axios = require("axios");
const Customer = require("../models/Customer");

const router = express.Router();

const MSG91_AUTH = process.env.MSG91_AUTHKEY;
const MSG91_SENDER = process.env.MSG91_SENDER;

if (!MSG91_AUTH) console.warn("MSG91_AUTHKEY not set in .env");
if (!MSG91_SENDER) console.warn("MSG91_SENDER not set in .env");

// helper to build full number
const buildFull = (countryCode, phone) => `${countryCode}${phone.replace(/\D/g, "")}`;

// helper: log duration
function logApi(req, res, label) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms ${label || ""}`);
  });
}

/* ---------------- 1) Request OTP ---------------- */
router.post("/request-otp", async (req, res) => {
  logApi(req, res, "request-otp");
  try {
    const { countryCode, phone } = req.body;
    if (!countryCode || !phone) {
      return res.status(400).json({ message: "countryCode and phone required" });
    }

    const mobile = buildFull(countryCode, phone);

    const sendResp = await axios.post(
      "https://control.msg91.com/api/v5/otp",
      {
        mobile,
        otp_length: 6,
        sender: MSG91_SENDER,
        template_id: "63e1e445d6fc0560d933a5e2", // replace with your template id
      },
      {
        headers: { authkey: MSG91_AUTH, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    console.log("MSG91 OTP Response:", sendResp.data);

    if (sendResp.data.type && sendResp.data.type === "success") {
      return res.json({ message: "OTP sent" });
    }

    return res.status(400).json({ message: sendResp.data.message || "Failed to send OTP" });
  } catch (err) {
    console.error("request-otp error:", err?.response?.data || err.message);
    const msg = err?.response?.data?.message || "Failed to request OTP";
    res.status(500).json({ message: msg });
  }
});

/* ---------------- 2) Verify OTP ---------------- */
router.post("/verify-otp", async (req, res) => {
  logApi(req, res, "verify-otp");
  try {
    const { countryCode, phone, otp } = req.body;
    if (!countryCode || !phone || !otp) {
      return res.status(400).json({ message: "countryCode, phone and otp required" });
    }

    const mobile = buildFull(countryCode, phone);

    const verifyResp = await axios.post(
      "https://control.msg91.com/api/v5/otp/verify",
      { mobile, otp },
      {
        headers: { authkey: MSG91_AUTH, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    console.log("MSG91 Verify Response:", verifyResp.data);

    if (verifyResp.data.type && verifyResp.data.type === "success") {
      // create customer if not exists
      const fullNumber = mobile;
      let customer = await Customer.findOne({ fullNumber });
      if (!customer) {
        customer = new Customer({ countryCode, phone, fullNumber });
        await customer.save();
      }
      return res.json({ message: "verified", customer });
    }

    return res.status(400).json({ message: verifyResp.data.message || "OTP verify failed" });
  } catch (err) {
    console.error("verify-otp error:", err?.response?.data || err.message);
    const msg = err?.response?.data?.message || "Failed to verify OTP";
    res.status(500).json({ message: msg });
  }
});

/* ---------------- 3) List customers ---------------- */
router.get("/", async (req, res) => {
  logApi(req, res, "list-customers");
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
  } catch (err) {
    console.error("GET /api/customers error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
