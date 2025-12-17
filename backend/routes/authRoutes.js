const express = require("express");
const { google } = require("googleapis");
const jwt = require("jsonwebtoken");
const GoogleUser = require("../models/GoogleUser");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/auth/google/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Start Google OAuth login
router.get("/auth/google/login", async (req, res) => {
  try {
    const { vendorId, categoryId } = req.query || {};

    const oauth2Client = getOAuthClient();

    const scopes = [
      "openid",
      "profile",
      "email",
    ];

    const state = JSON.stringify({
      vendorId: vendorId ? String(vendorId) : null,
      categoryId: categoryId ? String(categoryId) : null,
    });

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
      state,
    });

    return res.redirect(url);
  } catch (err) {
    console.error("[AUTH] /auth/google/login error:", err);
    return res.status(500).send("Failed to start Google login");
  }
});

// OAuth callback: Google redirects here after user login
router.get("/auth/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).send("Missing code");

    let parsedState = {};
    try {
      parsedState = state ? JSON.parse(state) : {};
    } catch (e) {
      parsedState = {};
    }

    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const me = await oauth2.userinfo.get();
    const profile = me && me.data ? me.data : {};

    const googleId = String(profile.id || "");
    if (!googleId) {
      return res.status(400).send("No Google user id in profile");
    }

    const email = profile.email || "";
    const name = profile.name || "";
    const picture = profile.picture || "";

    let doc = await GoogleUser.findOne({ googleId });
    if (!doc) {
      doc = new GoogleUser({
        googleId,
        email,
        name,
        picture,
        rawProfile: profile,
      });
    } else {
      doc.email = email;
      doc.name = name;
      doc.picture = picture;
      doc.rawProfile = profile;
    }

    await doc.save();

    const googleAuthToken = jwt.sign(
      { googleId },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const safeState = {
      vendorId: parsedState.vendorId || null,
      categoryId: parsedState.categoryId || null,
    };

    const redirectBase = process.env.PREVIEW_BASE_URL || process.env.REACT_APP_PREVIEW_BASE_URL || process.env.NEXT_PUBLIC_PREVIEW_BASE_URL;
    if (!redirectBase) {
      return res.send(
        `<html><body style="font-family: sans-serif; text-align: center; padding-top: 40px;">
          <h2>Google login success</h2>
          <p>Stored Google user: <b>${name || email || "Unknown"}</b></p>
          <p>No PREVIEW_BASE_URL configured on backend. Please close this window and return manually.</p>
          <pre style="text-align: left; max-width: 480px; margin: 16px auto; padding: 12px; background: #f3f4f6; border-radius: 8px; font-size: 12px;">${JSON.stringify({ googleId, email, name, state: safeState }, null, 2)}</pre>
        </body></html>`
      );
    }

    const params = new URLSearchParams();
    if (safeState.vendorId) params.set("vendorId", String(safeState.vendorId));
    if (safeState.categoryId) params.set("categoryId", String(safeState.categoryId));
    params.set("googleName", encodeURIComponent(name || ""));
    params.set("googleEmail", encodeURIComponent(email || ""));
    params.set("googleAuthToken", String(googleAuthToken || ""));

    const url = `${redirectBase.replace(/\/$/, "")}/preview/${encodeURIComponent(String(safeState.vendorId || ""))}/${encodeURIComponent(String(safeState.categoryId || ""))}?${params.toString()}`;
    return res.redirect(url);
  } catch (err) {
    console.error("[AUTH] /auth/google/callback error:", err);
    return res.status(500).send("Failed to complete Google login");
  }
});

module.exports = router;
