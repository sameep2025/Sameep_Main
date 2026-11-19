const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const { getTokenFromRequest, validateCustomerSession } = require("./authMiddleware");
const { validateAdminTokenFromRequest } = require("./adminAuthMiddleware");
const {
  consumeOnboardingBypassAuthorization,
} = require("../services/onboardingBypassService");

function normalizeId(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

async function customerOwnsVendor(customerId, vendorId) {
  const normalizedCustomerId = normalizeId(customerId);
  const normalizedVendorId = normalizeId(vendorId);
  if (
    !mongoose.Types.ObjectId.isValid(normalizedCustomerId) ||
    !mongoose.Types.ObjectId.isValid(normalizedVendorId)
  ) {
    return false;
  }

  const dummyVendor = await DummyVendor.exists({
    _id: normalizedVendorId,
    customerId: normalizedCustomerId,
  });
  if (dummyVendor) return true;

  const vendor = await Vendor.exists({
    _id: normalizedVendorId,
    customerId: normalizedCustomerId,
  });
  return Boolean(vendor);
}

async function validateVendorWriteRequest(req, vendorId) {
  const normalizedVendorId = normalizeId(vendorId);
  if (!normalizedVendorId) {
    return { ok: false, status: 400, message: "Vendor ID is required" };
  }

  const adminResult = validateAdminTokenFromRequest(req);
  if (adminResult.ok) {
    return {
      ok: true,
      authType: "admin",
      vendorId: normalizedVendorId,
      admin: adminResult.admin,
    };
  }

  const token = getTokenFromRequest(req);
  const sessionResult = await validateCustomerSession(token);
  if (sessionResult.ok) {
    req.vendorSessionAuth = sessionResult;
  }
  if (!sessionResult.ok) {
    return {
      ok: false,
      status: 401,
      message: "Vendor session invalid or expired",
      code: sessionResult.code || "invalid_session",
    };
  }

  const sessionVendorId = normalizeId(sessionResult.vendorId);
  if (sessionVendorId && sessionVendorId !== normalizedVendorId) {
    return {
      ok: false,
      status: 403,
      message: "Session does not match this vendor",
      code: "vendor_mismatch",
    };
  }

  const ownsVendor = await customerOwnsVendor(sessionResult.customerId, normalizedVendorId);
  if (!ownsVendor) {
    return {
      ok: false,
      status: 403,
      message: "Vendor owner session required",
      code: "vendor_owner_required",
    };
  }

  return {
    ok: true,
    authType: "vendor",
    vendorId: normalizedVendorId,
    customerId: sessionResult.customerId,
    sessionId: sessionResult.sessionId,
  };
}

async function validateVendorRequestFromExistingAuth(req, requestedVendorId = "") {
  const token = getTokenFromRequest(req);

  const adminResult = validateAdminTokenFromRequest(req);
  if (adminResult.ok) {
    const normalizedVendorId = normalizeId(requestedVendorId);
    if (!normalizedVendorId) {
      return { ok: false, status: 400, message: "Vendor ID is required" };
    }

    return {
      ok: true,
      authType: "admin",
      vendorId: normalizedVendorId,
      admin: adminResult.admin,
    };
  }

  const sessionResult = await validateCustomerSession(token);
  if (!sessionResult.ok) {
    return {
      ok: false,
      status: 401,
      message: "Vendor session invalid or expired",
      code: sessionResult.code || "invalid_session",
    };
  }

  const sessionVendorId = normalizeId(sessionResult.vendorId);
  const normalizedRequestedVendorId = normalizeId(requestedVendorId);
  const vendorId = sessionVendorId || normalizedRequestedVendorId;

  if (!vendorId) {
    return {
      ok: false,
      status: 400,
      message: "Vendor ID is required",
      code: "vendor_id_required",
    };
  }

  if (sessionVendorId && normalizedRequestedVendorId && sessionVendorId !== normalizedRequestedVendorId) {
    return {
      ok: false,
      status: 403,
      message: "Session does not match this vendor",
      code: "vendor_mismatch",
    };
  }

  const ownsVendor = await customerOwnsVendor(sessionResult.customerId, vendorId);
  if (!ownsVendor) {
    return {
      ok: false,
      status: 403,
      message: "Vendor owner session required",
      code: "vendor_owner_required",
    };
  }

  req.vendorSessionAuth = sessionResult;

  return {
    ok: true,
    authType: "vendor",
    vendorId,
    customerId: sessionResult.customerId,
    sessionId: sessionResult.sessionId,
  };
}

function requireVendorAccessFromExistingAuth(resolveRequestedVendorId) {
  return async (req, res, next) => {
    try {
      const requestedVendorId =
        typeof resolveRequestedVendorId === "function"
          ? await resolveRequestedVendorId(req)
          : resolveRequestedVendorId;
      const result = await validateVendorRequestFromExistingAuth(req, requestedVendorId);

      if (!result.ok) {
        return res.status(result.status || 403).json({
          success: false,
          message: result.message || "Vendor access denied",
          code: result.code || "forbidden",
        });
      }

      req.vendorWriteAuth = result;
      return next();
    } catch (error) {
      console.error("Vendor auth error:", error.message || error);
      return res.status(500).json({
        success: false,
        message: "Failed to validate vendor access",
        code: "vendor_auth_error",
      });
    }
  };
}

function requireVendorWriteAccess(resolveVendorId) {
  return async (req, res, next) => {
    try {
      const vendorId =
        typeof resolveVendorId === "function" ? await resolveVendorId(req) : resolveVendorId;
      const result = await validateVendorWriteRequest(req, vendorId);
      if (!result.ok) {
        return res.status(result.status || 403).json({
          message: result.message || "Vendor write access denied",
          code: result.code || "forbidden",
        });
      }

      req.vendorWriteAuth = result;
      return next();
    } catch (error) {
      console.error("Vendor write auth error:", error.message || error);
      return res.status(500).json({ message: "Failed to validate vendor write access" });
    }
  };
}

function requireVendorParamWriteAccess(paramName = "vendorId") {
  return requireVendorWriteAccess((req) => req.params[paramName]);
}

function requireVendorBodyWriteAccess(fieldName = "vendorId") {
  return requireVendorWriteAccess((req) => req.body?.[fieldName]);
}

function requireVendorCreationAccess(req, res, next) {
  const adminResult = validateAdminTokenFromRequest(req);
  if (adminResult.ok) {
    req.vendorWriteAuth = {
      ok: true,
      authType: "admin",
      admin: adminResult.admin,
    };
    return next();
  }

  return (async () => {
    const onboardingAuthorization = normalizeId(req.body?.onboardingAuthorization);
    if (onboardingAuthorization) {
      const onboardingSession = await consumeOnboardingBypassAuthorization({
        authorization: onboardingAuthorization,
        countryCode: req.body?.onboardingCountryCode,
        phone: req.body?.phone,
      });
      if (!onboardingSession) {
        return res.status(401).json({
          message: "Onboarding authorization is invalid, expired, or already used",
          code: "invalid_onboarding_authorization",
        });
      }

      req.body = {
        ...(req.body || {}),
        customerId: normalizeId(onboardingSession.userId),
      };
      delete req.body.onboardingAuthorization;
      delete req.body.onboardingCountryCode;
      req.vendorWriteAuth = {
        ok: true,
        authType: "onboarding_bypass",
        customerId: normalizeId(onboardingSession.userId),
        sessionId: normalizeId(onboardingSession._id),
        session: onboardingSession,
      };
      return next();
    }

    const sessionResult = await validateCustomerSession(getTokenFromRequest(req));
    if (!sessionResult.ok) {
      return res.status(401).json({
        message: "Vendor session invalid or expired",
        code: sessionResult.code || "invalid_session",
      });
    }

    const requestedCustomerId = normalizeId(req.body?.customerId);
    if (requestedCustomerId && requestedCustomerId !== normalizeId(sessionResult.customerId)) {
      return res.status(403).json({
        message: "Session does not match this customer",
        code: "customer_mismatch",
      });
    }

    req.body = {
      ...(req.body || {}),
      customerId: normalizeId(sessionResult.customerId),
    };
    req.vendorWriteAuth = {
      ok: true,
      authType: "vendor",
      customerId: normalizeId(sessionResult.customerId),
      sessionId: sessionResult.sessionId,
    };
    return next();
  })().catch((error) => {
    console.error("Vendor creation auth error:", error.message || error);
    return res.status(500).json({ message: "Failed to validate vendor creation access" });
  });
}

function requireOwnedDocumentVendorAccess(Model, idParam = "id") {
  return requireVendorWriteAccess(async (req) => {
    const id = req.params[idParam];
    if (!mongoose.Types.ObjectId.isValid(id)) return "";
    const doc = await Model.findById(id).select("vendorId").lean();
    req.vendorOwnedDocument = doc || null;
    return doc?.vendorId || "";
  });
}

module.exports = {
  requireVendorAccessFromExistingAuth,
  validateVendorWriteRequest,
  validateVendorRequestFromExistingAuth,
  requireVendorWriteAccess,
  requireVendorParamWriteAccess,
  requireVendorBodyWriteAccess,
  requireVendorCreationAccess,
  requireOwnedDocumentVendorAccess,
};
