const TARGET = Object.freeze({
  vendorName: "Manea Salon Sainikpuri",
  wabaId: "4402848216525508",
  phoneNumberId: "1335446439659507",
});

const RECOVERY_AUTHORIZATION = "AUTHORIZE-MANEA-PIN-RECOVERY-1335446439659507";
const READINESS_FIELDS = [
  "id",
  "status",
  "platform_type",
  "code_verification_status",
  "account_mode",
  "is_pin_enabled",
].join(",");

function blocked(code, diagnostics = {}) {
  return { result: "BLOCKED", code, diagnostics };
}

function passed(code, diagnostics = {}) {
  return { result: "PASS", code, diagnostics };
}

function sanitizeMetaError(error) {
  const meta = error?.response?.data?.error || {};
  return {
    httpStatus: error?.response?.status || null,
    code: meta.code || error?.code || "",
    subcode: meta.error_subcode || "",
    type: meta.type || "",
  };
}

function isAmbiguousTimeout(error) {
  return (
    error?.code === "ECONNABORTED" ||
    error?.code === "ETIMEDOUT" ||
    /timeout/i.test(String(error?.message || ""))
  );
}

function isReady(status) {
  return (
    String(status?.id || "") === TARGET.phoneNumberId &&
    String(status?.status || "").toUpperCase() === "CONNECTED" &&
    String(status?.platform_type || "").toUpperCase() === "CLOUD_API" &&
    String(status?.code_verification_status || "").toUpperCase() === "VERIFIED" &&
    String(status?.account_mode || "").toUpperCase() === "LIVE" &&
    status?.is_pin_enabled === true
  );
}

function sanitizeReadiness(status) {
  return {
    idMatches: String(status?.id || "") === TARGET.phoneNumberId,
    status: String(status?.status || ""),
    platformType: String(status?.platform_type || ""),
    codeVerificationStatus: String(status?.code_verification_status || ""),
    accountMode: String(status?.account_mode || ""),
    isPinEnabled:
      typeof status?.is_pin_enabled === "boolean" ? status.is_pin_enabled : null,
  };
}

async function loadRecoveryContext({ findMatches, decryptPin }) {
  let matches;
  try {
    matches = await findMatches(TARGET);
  } catch (error) {
    return { report: blocked("vendor_lookup_failed") };
  }

  if (!Array.isArray(matches) || matches.length !== 1) {
    return {
      report: blocked("vendor_match_count_invalid", {
        matchCount: Array.isArray(matches) ? matches.length : 0,
      }),
    };
  }

  const match = matches[0];
  const config = match?.vendor?.whatsappBusiness || {};
  const identifiersMatch =
    String(config.wabaId || "") === TARGET.wabaId &&
    String(config.phoneNumberId || "") === TARGET.phoneNumberId;
  if (!identifiersMatch) {
    return { report: blocked("vendor_identifiers_mismatch") };
  }

  const pinEncrypted = String(config.metaRegistration?.pinEncrypted || "");
  if (!pinEncrypted) {
    return { report: blocked("encrypted_pin_missing") };
  }

  let pin;
  try {
    pin = String(await decryptPin(pinEncrypted));
  } catch (error) {
    return { report: blocked("pin_decryption_failed") };
  }

  if (!/^\d{6}$/.test(pin)) {
    return { report: blocked("pin_format_invalid") };
  }

  return {
    pin,
    report: passed("preflight_complete", {
      matchCount: 1,
      collection: String(match.collection || ""),
      vendorNameMatches:
        String(match.vendor?.businessName || "").trim().toLowerCase() ===
        TARGET.vendorName.toLowerCase(),
      identifiersMatch: true,
      encryptedPinPresent: true,
      pinDecryptable: true,
      pinFormatValid: true,
    }),
  };
}

async function runPreflight(dependencies) {
  const context = await loadRecoveryContext(dependencies);
  return context.report;
}

async function verifyReadiness(getReadiness) {
  try {
    const status = await getReadiness({
      phoneNumberId: TARGET.phoneNumberId,
      fields: READINESS_FIELDS,
    });
    return {
      accessible: true,
      ready: isReady(status),
      fields: sanitizeReadiness(status),
    };
  } catch (error) {
    return {
      accessible: false,
      ready: false,
      meta: sanitizeMetaError(error),
    };
  }
}

async function runRecovery(dependencies, options = {}) {
  if (options.authorization !== RECOVERY_AUTHORIZATION) {
    return blocked("explicit_authorization_required");
  }

  const context = await loadRecoveryContext(dependencies);
  if (context.report.result !== "PASS") return context.report;

  try {
    const ownership = await dependencies.verifyOwnership({
      wabaId: TARGET.wabaId,
      phoneNumberId: TARGET.phoneNumberId,
    });
    if (ownership?.matchCount !== 1) {
      return blocked("meta_asset_ownership_unverified", {
        matchCount: Number(ownership?.matchCount || 0),
      });
    }
  } catch (error) {
    return blocked("meta_asset_ownership_check_failed", sanitizeMetaError(error));
  }

  const initialReadiness = await verifyReadiness(dependencies.getReadiness);
  if (!initialReadiness.accessible) {
    return blocked("meta_initial_readiness_unavailable", { readiness: initialReadiness });
  }
  if (initialReadiness.ready) {
    return passed("meta_pin_already_ready", {
      metaPostAttempts: 0,
      readiness: initialReadiness,
    });
  }

  try {
    const response = await dependencies.setPin({
      phoneNumberId: TARGET.phoneNumberId,
      pin: context.pin,
    });
    if (response?.success !== true) {
      return blocked("meta_pin_update_unconfirmed", {
        httpStatus: response?.httpStatus || null,
      });
    }
  } catch (error) {
    if (!isAmbiguousTimeout(error)) {
      return blocked("meta_pin_update_failed", sanitizeMetaError(error));
    }

    const timeoutReadiness = await verifyReadiness(dependencies.getReadiness);
    return timeoutReadiness.ready
      ? passed("meta_pin_update_verified_after_timeout", {
          metaPostAttempts: 1,
          readiness: timeoutReadiness,
        })
      : blocked("meta_pin_update_timeout_ambiguous", {
          metaPostAttempts: 1,
          readiness: timeoutReadiness,
        });
  }

  const readiness = await verifyReadiness(dependencies.getReadiness);
  return readiness.ready
    ? passed("meta_pin_update_verified", { metaPostAttempts: 1, readiness })
    : blocked("meta_pin_update_not_ready", { metaPostAttempts: 1, readiness });
}

function createMetaClient({ axiosClient, accessToken, graphApiVersion, timeoutMs = 15000 }) {
  const version = String(graphApiVersion || "v26.0").replace(/^\/+|\/+$/g, "");
  const baseUrl = `https://graph.facebook.com/${version}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  return {
    async verifyOwnership({ wabaId, phoneNumberId }) {
      const response = await axiosClient.get(
        `${baseUrl}/${encodeURIComponent(wabaId)}/phone_numbers`,
        {
          headers,
          params: { fields: "id", limit: 100 },
          timeout: timeoutMs,
        }
      );
      const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
      return {
        matchCount: rows.filter((row) => String(row?.id || "") === phoneNumberId).length,
      };
    },
    async setPin({ phoneNumberId, pin }) {
      const response = await axiosClient.post(
        `${baseUrl}/${encodeURIComponent(phoneNumberId)}`,
        { pin },
        { headers, timeout: timeoutMs }
      );
      return {
        success: response?.data?.success === true,
        httpStatus: response?.status || null,
      };
    },
    async getReadiness({ phoneNumberId, fields }) {
      const response = await axiosClient.get(
        `${baseUrl}/${encodeURIComponent(phoneNumberId)}`,
        { headers, params: { fields }, timeout: timeoutMs }
      );
      return response?.data || {};
    },
  };
}

module.exports = {
  READINESS_FIELDS,
  RECOVERY_AUTHORIZATION,
  TARGET,
  createMetaClient,
  isReady,
  runPreflight,
  runRecovery,
};
