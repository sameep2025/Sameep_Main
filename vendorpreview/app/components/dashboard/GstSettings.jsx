"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import GstTestInvoicePreview from "./GstTestInvoicePreview";
import "./GstSettings.css";

const INDIAN_STATES = [
  ["01", "Jammu and Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"],
  ["04", "Chandigarh"], ["05", "Uttarakhand"], ["06", "Haryana"],
  ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"],
  ["10", "Bihar"], ["11", "Sikkim"], ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"], ["14", "Manipur"], ["15", "Mizoram"],
  ["16", "Tripura"], ["17", "Meghalaya"], ["18", "Assam"],
  ["19", "West Bengal"], ["20", "Jharkhand"], ["21", "Odisha"],
  ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"], ["24", "Gujarat"],
  ["25", "Daman and Diu"], ["26", "Dadra and Nagar Haveli and Daman and Diu"],
  ["27", "Maharashtra"], ["28", "Andhra Pradesh (legacy code)"],
  ["29", "Karnataka"], ["30", "Goa"], ["31", "Lakshadweep"],
  ["32", "Kerala"], ["33", "Tamil Nadu"], ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"], ["36", "Telangana"],
  ["37", "Andhra Pradesh"], ["38", "Ladakh"], ["97", "Other Territory"],
  ["99", "Centre Jurisdiction"],
];

const EMPTY_FORM = {
  gstin: "",
  legalBusinessName: "",
  registeredAddress: "",
  registeredStateCode: "",
  defaultGstRatePercent: "0",
  defaultSac: "",
  pricingMode: "inclusive",
};

// UTGST applies to Union Territories without a legislature. Legacy code 25 is
// retained because the settings API accepts historical GST registrations.
const UTGST_STATE_CODES = new Set(["04", "25", "26", "31", "35", "38", "97"]);

function gstRateBpsToPercent(value) {
  const bps = Number.isInteger(value) ? value : 0;
  return String(Number((bps / 100).toFixed(2)));
}

function gstPercentToBps(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const percentage = Number(normalized);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  return Math.round(percentage * 100);
}

function getGstErrorFields(code) {
  const fields = {
    invalid_gstin: ["gstin"],
    gstin_state_code_mismatch: ["gstin", "registeredStateCode"],
    invalid_legal_business_name: ["legalBusinessName"],
    invalid_registered_address: ["registeredAddress"],
    invalid_registered_state_code: ["registeredStateCode"],
    invalid_default_gst_rate_bps: ["defaultGstRatePercent"],
    invalid_default_sac: ["defaultSac"],
    invalid_pricing_mode: ["pricingMode"],
  };
  return fields[code] || [];
}

function getLocalTaxLabel(stateCode) {
  const normalized = String(stateCode || "").trim();
  if (!normalized) return "SGST / UTGST";
  return UTGST_STATE_CODES.has(normalized) ? "UTGST" : "SGST";
}

function formatGstPercent(value) {
  return `${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 3,
  })}%`;
}

function calculateGstPriceIllustration(rateBps, pricingMode) {
  const listedPricePaise = 100000;
  const validRateBps = Number.isInteger(rateBps) ? rateBps : 0;
  if (pricingMode === "exclusive") {
    const gstPaise = Math.round((listedPricePaise * validRateBps) / 10000);
    return {
      listedPricePaise,
      gstPaise,
      customerPaysPaise: listedPricePaise + gstPaise,
    };
  }
  const taxablePaise = Math.round(
    (listedPricePaise * 10000) / (10000 + validRateBps)
  );
  return {
    listedPricePaise,
    gstPaise: listedPricePaise - taxablePaise,
    customerPaysPaise: listedPricePaise,
  };
}

function formatIllustrationCurrency(paise) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function validateGstForm(form) {
  const errors = {};
  const gstin = String(form.gstin || "").trim().toUpperCase();
  const stateCode = String(form.registeredStateCode || "").trim();
  const sac = String(form.defaultSac || "").trim();

  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    errors.gstin = "Enter a valid 15-character GSTIN.";
  } else if (gstin && stateCode && gstin.slice(0, 2) !== stateCode) {
    errors.gstin = "GSTIN state code must match the registered state.";
    errors.registeredStateCode = "Registered state must match the GSTIN state code.";
  }
  if (String(form.legalBusinessName || "").trim().length > 150) {
    errors.legalBusinessName = "Legal business name cannot exceed 150 characters.";
  }
  if (String(form.registeredAddress || "").trim().length > 500) {
    errors.registeredAddress = "Registered address cannot exceed 500 characters.";
  }
  if (sac && !/^\d{4,8}$/.test(sac)) {
    errors.defaultSac = "SAC must contain 4 to 8 digits.";
  }
  if (gstPercentToBps(form.defaultGstRatePercent) === null) {
    errors.defaultGstRatePercent = "Enter a GST percentage from 0 to 100 with up to 2 decimals.";
  }
  if (form.pricingMode !== "inclusive" && form.pricingMode !== "exclusive") {
    errors.pricingMode = "Select inclusive or exclusive pricing.";
  }
  return errors;
}

function settingsToForm(settings = {}) {
  return {
    gstin: String(settings.gstin || ""),
    legalBusinessName: String(settings.legalBusinessName || ""),
    registeredAddress: String(settings.registeredAddress || ""),
    registeredStateCode: String(settings.registeredStateCode || ""),
    defaultGstRatePercent: gstRateBpsToPercent(settings.defaultGstRateBps),
    defaultSac: String(settings.defaultSac || ""),
    pricingMode: settings.pricingMode === "exclusive" ? "exclusive" : "inclusive",
  };
}

export default function GstSettings({ vendorId, onBack }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [draftConfigured, setDraftConfigured] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [activation, setActivation] = useState({ enabled: false });
  const [activationSaving, setActivationSaving] = useState(false);

  useEffect(() => {
    if (!vendorId) {
      setLoading(false);
      setLoadError("Vendor information is unavailable.");
      return undefined;
    }

    let cancelled = false;
    async function loadSettings() {
      try {
        setLoading(true);
        setLoadError("");
        const response = await fetch(
          `${API_BASE_URL}/api/vendor/gst-settings/${encodeURIComponent(vendorId)}`,
          { cache: "no-store", headers: getVendorAuthHeaders(vendorId) }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || "Unable to load GST settings");
        if (!cancelled) {
          setForm(settingsToForm(data?.data?.gstSettings));
          setDraftConfigured(data?.data?.draftConfigured === true);
          setActivation({
            enabled: data?.data?.activation?.enabled === true,
          });
        }
      } catch (error) {
        if (!cancelled) setLoadError(error?.message || "Unable to load GST settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (field === "gstin" || field === "registeredStateCode") {
        return { ...current, gstin: "", registeredStateCode: "" };
      }
      return { ...current, [field]: "" };
    });
    setStatusMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validateGstForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatusMessage("Please correct the highlighted fields.");
      return;
    }

    try {
      setSaving(true);
      setFieldErrors({});
      setStatusMessage("");
      const response = await fetch(
        `${API_BASE_URL}/api/vendor/gst-settings/${encodeURIComponent(vendorId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify({
            gstin: form.gstin.trim().toUpperCase(),
            legalBusinessName: form.legalBusinessName.trim(),
            registeredAddress: form.registeredAddress.trim(),
            registeredStateCode: form.registeredStateCode,
            defaultGstRateBps: gstPercentToBps(form.defaultGstRatePercent),
            defaultSac: form.defaultSac.trim(),
            pricingMode: form.pricingMode,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        const fields = getGstErrorFields(data?.code);
        if (fields.length > 0) {
          setFieldErrors(
            Object.fromEntries(fields.map((field) => [field, data?.message || "Invalid value"]))
          );
        }
        throw new Error(data?.message || "Unable to save GST settings");
      }
      setForm(settingsToForm(data?.data?.gstSettings));
      setDraftConfigured(data?.data?.draftConfigured === true);
      setActivation({
        enabled: data?.data?.activation?.enabled === true,
      });
      setStatusMessage("GST Draft Saved Successfully");
    } catch (error) {
      setStatusMessage(error?.message || "Unable to save GST settings");
    } finally {
      setSaving(false);
    }
  };

  const handleActivationChange = async (enabled) => {
    try {
      setActivationSaving(true);
      setStatusMessage("");
      const response = await fetch(
        `${API_BASE_URL}/api/vendor/gst-settings/${encodeURIComponent(vendorId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getVendorAuthHeaders(vendorId) },
          body: JSON.stringify({ enabled }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Unable to update GST activation");
      setActivation({
        enabled: data?.data?.activation?.enabled === true,
      });
      setStatusMessage(enabled ? "GST Billing Enabled" : "GST Billing Disabled");
    } catch (error) {
      setStatusMessage(error?.message || "Unable to update GST activation");
    } finally {
      setActivationSaving(false);
    }
  };

  const inputClass = (field) =>
    `gst-settings-input${fieldErrors[field] ? " gst-settings-input-error" : ""}`;
  const rateBps = gstPercentToBps(form.defaultGstRatePercent) ?? 0;
  const localTaxLabel = getLocalTaxLabel(form.registeredStateCode);
  const priceIllustration = calculateGstPriceIllustration(rateBps, form.pricingMode);

  return (
    <section className="gst-settings-panel" aria-labelledby="gst-settings-title">
      <button className="dashboard-back-btn" type="button" onClick={onBack}>
        Back To Profile
      </button>

      <div className="gst-settings-heading">
        <div>
          <p className="gst-settings-eyebrow">Tax Settings</p>
          <h2 id="gst-settings-title">GST Settings</h2>
          <p>Set up your GST details. GST will be applied to bills only after GST Billing is activated.</p>
        </div>
        <span className="gst-settings-draft-status">
          {activation.enabled ? "GST Billing Enabled" : "GST Billing Disabled"}
        </span>
      </div>

      {loading ? (
        <div className="gst-settings-state">Loading GST settings...</div>
      ) : loadError ? (
        <div className="gst-settings-state gst-settings-state-error" role="alert">
          {loadError}
        </div>
      ) : (
        <form className="gst-settings-form" onSubmit={handleSubmit} noValidate>
          <div className="gst-settings-grid">
            <label className="gst-settings-field">
              <span>GSTIN</span>
              <input
                className={inputClass("gstin")}
                value={form.gstin}
                maxLength={15}
                autoCapitalize="characters"
                placeholder="36ABCDE1234F1Z5"
                onChange={(event) => updateField("gstin", event.target.value.toUpperCase())}
              />
              {fieldErrors.gstin && <small role="alert">{fieldErrors.gstin}</small>}
            </label>

            <label className="gst-settings-field">
              <span>Legal Business Name</span>
              <input
                className={inputClass("legalBusinessName")}
                value={form.legalBusinessName}
                maxLength={150}
                onChange={(event) => updateField("legalBusinessName", event.target.value)}
              />
              {fieldErrors.legalBusinessName && <small role="alert">{fieldErrors.legalBusinessName}</small>}
            </label>

            <label className="gst-settings-field gst-settings-field-wide">
              <span>Registered Business Address</span>
              <textarea
                className={inputClass("registeredAddress")}
                value={form.registeredAddress}
                maxLength={500}
                rows={3}
                onChange={(event) => updateField("registeredAddress", event.target.value)}
              />
              {fieldErrors.registeredAddress && <small role="alert">{fieldErrors.registeredAddress}</small>}
            </label>

            <label className="gst-settings-field">
              <span>Registered State</span>
              <select
                className={inputClass("registeredStateCode")}
                value={form.registeredStateCode}
                onChange={(event) => updateField("registeredStateCode", event.target.value)}
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map(([code, name]) => (
                  <option key={code} value={code}>{code} — {name}</option>
                ))}
              </select>
              {fieldErrors.registeredStateCode && <small role="alert">{fieldErrors.registeredStateCode}</small>}
            </label>

            <label className="gst-settings-field">
              <span>Default GST Percentage</span>
              <div className="gst-settings-rate-wrap">
                <input
                  className={inputClass("defaultGstRatePercent")}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  value={form.defaultGstRatePercent}
                  onChange={(event) => updateField("defaultGstRatePercent", event.target.value)}
                />
                <span aria-hidden="true">%</span>
              </div>
              {fieldErrors.defaultGstRatePercent && <small role="alert">{fieldErrors.defaultGstRatePercent}</small>}
              <em>Enter the GST rate applicable to your services. Confirm the correct rate with your accountant.</em>
              <div className="gst-settings-illustration" aria-live="polite">
                <strong>Tax breakdown illustration</strong>
                <div className="gst-settings-illustration-columns">
                  <div>
                    <span>Same-state supply</span>
                    <b>CGST: {formatGstPercent(rateBps / 200)}</b>
                    <b>{localTaxLabel}: {formatGstPercent(rateBps / 200)}</b>
                  </div>
                  <div>
                    <span>Inter-state supply</span>
                    <b>IGST: {formatGstPercent(rateBps / 100)}</b>
                  </div>
                </div>
                <p>Illustration only. Actual tax type is determined during billing using the applicable place-of-supply rules.</p>
              </div>
            </label>

            <label className="gst-settings-field">
              <span>Default SAC Code (Optional)</span>
              <input
                className={inputClass("defaultSac")}
                value={form.defaultSac}
                maxLength={8}
                inputMode="numeric"
                placeholder="999723"
                onChange={(event) => updateField("defaultSac", event.target.value.replace(/\D/g, ""))}
              />
              {fieldErrors.defaultSac && <small role="alert">{fieldErrors.defaultSac}</small>}
              <em>SAC (Service Accounting Code) identifies the type of service for GST purposes. Add it before issuing a compliant GST tax invoice.</em>
            </label>

            <label className="gst-settings-field">
              <span>GST Pricing</span>
              <select
                className={inputClass("pricingMode")}
                value={form.pricingMode}
                onChange={(event) => updateField("pricingMode", event.target.value)}
              >
                <option value="inclusive">GST Inclusive</option>
                <option value="exclusive">GST Exclusive</option>
              </select>
              <em>Draft preference only. Existing service prices will not be changed.</em>
              {fieldErrors.pricingMode && <small role="alert">{fieldErrors.pricingMode}</small>}
              <div className="gst-settings-illustration" aria-live="polite">
                <strong>₹1,000 service price illustration</strong>
                <div className="gst-settings-price-lines">
                  <span>
                    <b>Listed price</b>
                    <b>{formatIllustrationCurrency(priceIllustration.listedPricePaise)}</b>
                  </span>
                  <span>
                    <b>GST {form.pricingMode === "exclusive" ? "added" : "included"}</b>
                    <b>{formatIllustrationCurrency(priceIllustration.gstPaise)}</b>
                  </span>
                  <span>
                    <b>Customer pays</b>
                    <b>{formatIllustrationCurrency(priceIllustration.customerPaysPaise)}</b>
                  </span>
                </div>
                <p>Illustration only. This does not calculate or issue a GST invoice.</p>
              </div>
            </label>
          </div>

          <div className="gst-settings-activation">
            <div>
              <strong>Enable GST Billing</strong>
              <span>
                {activation.enabled ? "GST billing is enabled" : "GST billing is disabled"}
              </span>
              <p>Activation affects future billing sessions only. Historical bills remain unchanged.</p>
            </div>
            <label className="gst-settings-toggle">
              <input
                type="checkbox"
                checked={activation.enabled}
                disabled={!draftConfigured || activationSaving}
                onChange={(event) => handleActivationChange(event.target.checked)}
              />
              <span aria-hidden="true" />
            </label>
          </div>

          <div className="gst-settings-actions">
            <p className={/successfully/i.test(statusMessage) ? "gst-settings-success" : "gst-settings-message"} aria-live="polite">
              {statusMessage}
            </p>
            <button className="gst-settings-save" type="submit" disabled={saving}>
              {saving ? "Saving Draft..." : "Save GST Draft"}
            </button>
            {draftConfigured ? (
              <button className="gst-settings-preview" type="button" onClick={() => setShowInvoicePreview(true)}>
                Preview GST Invoice
              </button>
            ) : null}
          </div>
        </form>
      )}
      {showInvoicePreview ? (
        <GstTestInvoicePreview vendorId={vendorId} onClose={() => setShowInvoicePreview(false)} />
      ) : null}
    </section>
  );
}
