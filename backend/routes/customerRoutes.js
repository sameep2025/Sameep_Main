const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");
const Session = require("../models/Session");
const LoginHistory = require("../models/LoginHistory");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const { getSessionValidityHours } = require("../utils/sessionConfig");
const { getAdminPasscode } = require("../utils/adminConfig");

const router = express.Router();

const MSG91_AUTH = process.env.MSG91_AUTHKEY;
const MSG91_SENDER = process.env.MSG91_SENDER;
const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

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
    const deviceInfo = req.headers["user-agent"] || "";

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

/* ---------------- 1b) Admin impersonation login (no OTP) ---------------- */
router.post("/admin-impersonate", async (req, res) => {
  logApi(req, res, "admin-impersonate");
  try {
    const { passcode, vendorId, categoryId } = req.body || {};
    const code = typeof passcode === "string" ? passcode.trim() : "";

    const expected = await getAdminPasscode("1234");
    if (!/^\d{4}$/.test(code) || code !== expected) {
      return res.status(401).json({ message: "Invalid admin passcode" });
    }
    const hours = await getSessionValidityHours(4);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);

    // Log admin impersonation as a login event for the underlying vendor's customer (if available)
    try {
      if (vendorId) {
        let customerIdForHistory = null;
        const vendor = await Vendor.findById(vendorId).lean().catch(() => null);
        if (vendor && vendor.customerId) {
          customerIdForHistory = vendor.customerId;
        } else {
          const dummyVendor = await DummyVendor.findById(vendorId).lean().catch(() => null);
          if (dummyVendor && dummyVendor.customerId) {
            customerIdForHistory = dummyVendor.customerId;
          }
        }

        if (customerIdForHistory) {
          // Expire any existing active history rows for this customer first
          try {
            const activeHist = await LoginHistory.find({ userId: customerIdForHistory, status: "active" });
            for (const h of activeHist) {
              if (!h.logoutTime) h.logoutTime = now;
              h.status = "expired";
              await h.save();
            }
          } catch (histErr) {
            console.error("Failed to expire existing LoginHistory on admin impersonation:", histErr?.message || histErr);
          }

          // Terminate any existing active sessions for this customer in the same vendor/category scope
          try {
            const sessFilter = {
              userId: customerIdForHistory,
              isActive: true,
            };
            if (vendorId) sessFilter.vendorId = String(vendorId);
            if (categoryId) sessFilter.categoryId = String(categoryId);

            const activeSess = await Session.find(sessFilter);
            for (const s of activeSess) {
              const logoutTime = now;
              await Session.updateOne({ _id: s._id }, { $set: { isActive: false, expiryTime: logoutTime } });

              const existingHist = await LoginHistory.findOne({
                userId: customerIdForHistory,
                loginTime: s.loginTime,
                expiryTime: s.expiryTime,
              });

              if (existingHist) {
                if (!existingHist.logoutTime) existingHist.logoutTime = logoutTime;
                existingHist.status = "expired";
                await existingHist.save();
              } else {
                await LoginHistory.create({
                  userId: customerIdForHistory,
                  loginTime: s.loginTime,
                  expiryTime: s.expiryTime || logoutTime,
                  logoutTime,
                  deviceInfo: s.deviceInfo || "",
                  status: "expired",
                });
              }
            }
          } catch (sessErr) {
            console.error("Failed to terminate existing sessions on admin impersonation:", sessErr?.message || sessErr);
          }

          await LoginHistory.create({
            userId: customerIdForHistory,
            loginTime: now,
            expiryTime: expiresAt,
            logoutTime: null,
            deviceInfo: `Admin impersonation for vendor ${String(vendorId)}`,
            status: "active",
          });
        }
      }
    } catch (e) {
      console.error("Failed to record admin impersonation login history:", e?.message || e);
    }

    let token = null;
    try {
      if (customerIdForHistory) {
        const session = await Session.create({
          userId: customerIdForHistory,
          vendorId: vendorId ? String(vendorId) : "",
          categoryId: categoryId ? String(categoryId) : "",
          loginTime: now,
          expiryTime: expiresAt,
          isActive: true,
          deviceInfo: `Admin impersonation for vendor ${String(vendorId)}`,
        });

        const payload = {
          customerId: String(customerIdForHistory),
          vendorId: vendorId ? String(vendorId) : "",
          categoryId: categoryId ? String(categoryId) : "",
          sessionId: String(session._id),
        };
        token = jwt.sign(payload, JWT_SECRET, { expiresIn: `${hours}h` });
        if (token) {
          await Session.updateOne({ _id: session._id }, { $set: { token } });
        }
      }
    } catch (sessCreateErr) {
      console.error("Failed to create admin session/token:", sessCreateErr?.message || sessCreateErr);
    }

    return res.json({
      message: "ok",
      role: "admin",
      vendorId: vendorId || null,
      categoryId: categoryId || null,
      expiresAt,
      token,
    });
  } catch (err) {
    console.error("POST /api/customers/admin-impersonate error:", err.message || err);
    res.status(500).json({ message: "Failed to login as admin" });
  }
});

/* ---------------- 4b) Session status via JWT token ---------------- */
router.post("/session-status-token", async (req, res) => {
  logApi(req, res, "customer-session-status-token");
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ message: "token required" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.json({ status: "invalid_token" });
    }

    const customerId = decoded.customerId;
    const vendorId = decoded.vendorId || "";
    const categoryId = decoded.categoryId || "";
    if (!customerId) return res.status(400).json({ message: "Invalid token payload" });

    const now = new Date();
    const filter = { userId: customerId, isActive: true };
    if (vendorId) filter.vendorId = String(vendorId);
    if (categoryId) filter.categoryId = String(categoryId);

    const session = await Session.findOne(filter)
      .sort({ loginTime: -1 })
      .lean();

    if (!session) {
      return res.json({ status: "no_session" });
    }

    if (session.expiryTime && new Date(session.expiryTime) > now) {
      return res.json({
        status: "active",
        loginTime: session.loginTime,
        expiryTime: session.expiryTime,
        deviceInfo: session.deviceInfo || "",
      });
    }

    // Expired: move to login history if not already recorded, then deactivate
    const existing = await LoginHistory.findOne({
      userId: customerId,
      loginTime: session.loginTime,
      expiryTime: session.expiryTime,
    }).lean();

    if (!existing) {
      await LoginHistory.create({
        userId: customerId,
        loginTime: session.loginTime,
        expiryTime: session.expiryTime,
        logoutTime: session.expiryTime,
        deviceInfo: session.deviceInfo || "",
        status: "expired",
      });
    }

    await Session.updateOne({ _id: session._id }, { $set: { isActive: false } });
    return res.json({ status: "expired" });
  } catch (err) {
    console.error("POST /api/customers/session-status-token error:", err.message);
    res.status(500).json({ message: "Failed to load session status from token" });
  }
});

/* ---------------- 4c) Explicit logout via JWT token ---------------- */
router.post("/logout", async (req, res) => {
  logApi(req, res, "customer-logout-token");
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ message: "token required" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ message: "Invalid token" });
    }

    const customerId = decoded.customerId;
    const sessionId = decoded.sessionId || null;
    if (!customerId) return res.status(400).json({ message: "Invalid token payload" });

    const now = new Date();

    // Deactivate session if present
    try {
      if (sessionId) {
        await Session.updateOne({ _id: sessionId }, { $set: { isActive: false, expiryTime: now } });
      }
    } catch (sessErr) {
      console.error("Failed to deactivate session on logout:", sessErr?.message || sessErr);
    }

    // Update latest active LoginHistory for this user
    try {
      const hist = await LoginHistory.findOne({ userId: customerId, status: "active" })
        .sort({ loginTime: -1 });
      if (hist) {
        hist.logoutTime = now;
        hist.status = "expired";
        await hist.save();
      }
    } catch (histErr) {
      console.error("Failed to update LoginHistory on logout:", histErr?.message || histErr);
    }

    return res.json({ message: "logged_out" });
  } catch (err) {
    console.error("POST /api/customers/logout error:", err.message || err);
    res.status(500).json({ message: "Failed to logout" });
  }
});

/* ---------------- 2) Verify OTP ---------------- */
router.post("/verify-otp", async (req, res) => {
  logApi(req, res, "verify-otp");
  try {
    const { countryCode, phone, otp, vendorId, categoryId } = req.body;
    if (!countryCode || !phone || !otp) {
      return res.status(400).json({ message: "countryCode, phone and otp required" });
    }

    const mobile = buildFull(countryCode, phone);
    const deviceInfo = req.headers["user-agent"] || "";

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

      // Determine role based on DummyVendor linkage (business account),
      // scoped to the current category when available so that a vendor
      // from another category does not appear as vendor here.
      let role = "guest";
      let displayName = "Guest";
      try {
        const vendorQuery = { customerId: customer._id };
        if (categoryId) {
          vendorQuery.categoryId = categoryId;
        }
        const dummyVendor = await DummyVendor.findOne(vendorQuery).lean();
        if (dummyVendor && dummyVendor.businessName) {
          role = "vendor";
          displayName = dummyVendor.businessName;
        }
      } catch (roleErr) {
        console.error(
          "Failed to resolve vendor role for customer",
          customer._id.toString(),
          roleErr?.message || roleErr
        );
      }

      // Session management: create a new session using app-config validity
      try {
        const hours = await getSessionValidityHours(4); // default 4h if not configured
        const now = new Date();
        const expiryTime = new Date(now.getTime() + hours * 60 * 60 * 1000);

        // Terminate ANY existing active sessions for this customer in the same vendor/category scope
        const sessionFilter = {
          userId: customer._id,
          isActive: true,
        };
        if (vendorId) sessionFilter.vendorId = String(vendorId);
        if (categoryId) sessionFilter.categoryId = String(categoryId);

        const activeSessions = await Session.find(sessionFilter);
        for (const s of activeSessions) {
          try {
            const logoutTime = now;
            await Session.updateOne({ _id: s._id }, { $set: { isActive: false, expiryTime: logoutTime } });

            const existingHist = await LoginHistory.findOne({
              userId: customer._id,
              loginTime: s.loginTime,
              expiryTime: s.expiryTime,
            });

            if (existingHist) {
              if (!existingHist.logoutTime) existingHist.logoutTime = logoutTime;
              existingHist.status = "expired";
              await existingHist.save();
            } else {
              await LoginHistory.create({
                userId: customer._id,
                loginTime: s.loginTime,
                expiryTime: s.expiryTime || logoutTime,
                logoutTime,
                deviceInfo: s.deviceInfo || "",
                status: "expired",
              });
            }
          } catch (sessErr) {
            console.error("Failed to terminate existing session on new OTP login:", sessErr?.message || sessErr);
          }
        }

        // Also expire any other active LoginHistory rows for this customer (e.g., previous admin logins)
        try {
          const activeHist = await LoginHistory.find({ userId: customer._id, status: "active" });
          for (const h of activeHist) {
            if (!h.logoutTime) h.logoutTime = now;
            h.status = "expired";
            await h.save();
          }
        } catch (histErr) {
          console.error("Failed to expire existing LoginHistory on new OTP login:", histErr?.message || histErr);
        }

        // Create a new active session
        const session = await Session.create({
          userId: customer._id,
          vendorId: vendorId ? String(vendorId) : "",
          categoryId: categoryId ? String(categoryId) : "",
          loginTime: now,
          expiryTime,
          isActive: true,
          deviceInfo,
        });

        try {
          await LoginHistory.create({
            userId: customer._id,
            loginTime: now,
            expiryTime,
            logoutTime: null,
            deviceInfo: deviceInfo || "",
            status: "active",
          });
        } catch (lhErr) {
          console.error("Failed to create initial LoginHistory after OTP verify:", lhErr?.message || lhErr);
        }

        // Issue a JWT auth token scoped to this customer + vendor + category + session
        let token = null;
        try {
          const payload = {
            customerId: String(customer._id),
            vendorId: vendorId ? String(vendorId) : "",
            categoryId: categoryId ? String(categoryId) : "",
            sessionId: String(session._id),
          };
          // Align token expiry with session expiry in hours
          const hours = await getSessionValidityHours(4);
          token = jwt.sign(payload, JWT_SECRET, { expiresIn: `${hours}h` });

          // Persist token on the session document for audit/debug
          if (token) {
            await Session.updateOne({ _id: session._id }, { $set: { token } });
            session.token = token;
          }
        } catch (jwtErr) {
          console.error("Failed to generate JWT token after OTP verify:", jwtErr?.message || jwtErr);
        }

        return res.json({ message: "verified", customer, session, token, role, displayName });
      } catch (sessionErr) {
        console.error("Session creation error after OTP verify:", sessionErr?.message || sessionErr);
        // Still return verified customer even if session logic fails
        return res.json({ message: "verified", customer, role, displayName });
      }
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

/* ---------------- 4) Current session status for a customer ---------------- */
router.get("/:id/session-status", async (req, res) => {
  logApi(req, res, "customer-session-status");
  try {
    const { id } = req.params;
    const { vendorId, categoryId } = req.query;
    if (!id) return res.status(400).json({ message: "Customer id required" });

    const now = new Date();
    const filter = { userId: id, isActive: true };
    if (vendorId) filter.vendorId = String(vendorId);
    if (categoryId) filter.categoryId = String(categoryId);

    const session = await Session.findOne(filter)
      .sort({ loginTime: -1 })
      .lean();

    if (!session) {
      return res.json({ status: "no_session" });
    }

    if (session.expiryTime && new Date(session.expiryTime) > now) {
      return res.json({
        status: "active",
        loginTime: session.loginTime,
        expiryTime: session.expiryTime,
        deviceInfo: session.deviceInfo || "",
      });
    }

    // Expired session: move to login history if not already recorded, then deactivate
    const existing = await LoginHistory.findOne({
      userId: id,
      loginTime: session.loginTime,
      expiryTime: session.expiryTime,
    }).lean();

    if (!existing) {
      await LoginHistory.create({
        userId: id,
        loginTime: session.loginTime,
        expiryTime: session.expiryTime,
        deviceInfo: session.deviceInfo || "",
        status: "expired",
      });
    }

    await Session.updateOne({ _id: session._id }, { $set: { isActive: false } });
    return res.json({ status: "expired" });
  } catch (err) {
    console.error("GET /api/customers/:id/session-status error:", err.message);
    res.status(500).json({ message: "Failed to load session status" });
  }
});

/* ---------------- 5) Login history for a customer ---------------- */
router.get("/:id/login-history", async (req, res) => {
  logApi(req, res, "customer-login-history");
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Customer id required" });

    const now = new Date();

    // Normalize any LoginHistory rows that are still marked active but already past expiry
    try {
      const staleHistory = await LoginHistory.find({
        userId: id,
        status: "active",
      });
      for (const h of staleHistory) {
        if (h.expiryTime && new Date(h.expiryTime) <= now) {
          h.status = "expired";
          if (!h.logoutTime) h.logoutTime = h.expiryTime;
          await h.save();
        }
      }
    } catch (histErr) {
      console.error("Failed to normalize login history rows:", histErr?.message || histErr);
    }

    // Move all expired active sessions for this user into LoginHistory and deactivate them.
    const activeSessions = await Session.find({ userId: id, isActive: true }).lean();

    for (const s of activeSessions) {
      if (s.expiryTime && new Date(s.expiryTime) <= now) {
        const exists = await LoginHistory.findOne({
          userId: id,
          loginTime: s.loginTime,
          expiryTime: s.expiryTime,
        }).lean();

        if (!exists) {
          await LoginHistory.create({
            userId: id,
            loginTime: s.loginTime,
            expiryTime: s.expiryTime,
            logoutTime: s.expiryTime,
            deviceInfo: s.deviceInfo || "",
            status: "expired",
          });
        }

        await Session.updateOne({ _id: s._id }, { $set: { isActive: false } });
      }
    }

    // Reload history after normalizing expired sessions
    const history = await LoginHistory.find({ userId: id })
      .sort({ loginTime: -1 })
      .lean();

    // Also include current active sessions (if any) as rows with status "active"
    const stillActive = await Session.find({ userId: id, isActive: true })
      .sort({ loginTime: -1 })
      .lean();

    const activeRows = stillActive
      .filter((s) => s.expiryTime && new Date(s.expiryTime) > now)
      .map((s) => ({
        _id: `active-${s._id}`,
        userId: id,
        loginTime: s.loginTime,
        expiryTime: s.expiryTime,
        deviceInfo: s.deviceInfo || "",
        status: "active",
      }));

    const combined = [...activeRows, ...history];

    res.json(combined);
  } catch (err) {
    console.error("GET /api/customers/:id/login-history error:", err.message);
    res.status(500).json({ message: "Failed to load login history" });
  }
});

module.exports = router;
