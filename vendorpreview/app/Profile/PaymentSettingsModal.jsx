"use client";

import "./Business.css";
import { useEffect, useState } from "react";
import { getVendorAuthHeaders } from "../utils/vendorAuth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function PaymentSettingsModal({
  vendorId,
  businessName,
  onClose,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    paymentEnabled: false,
    provider: "razorpay",
    accountName: "",
    mode: "test",
    environments: {
      test: {
        keyId: "",
        keySecret: "",
        keySecretMasked: "",
        hasKeySecret: false,
      },
      live: {
        keyId: "",
        keySecret: "",
        keySecretMasked: "",
        hasKeySecret: false,
      },
    },
  });

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      if (!vendorId) return;
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/api/vendor-payment-config/${vendorId}`, {
          headers: getVendorAuthHeaders(vendorId),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || "Failed to load payment settings");
        }
        if (cancelled) return;

        const config = data?.config || {};
        const razorpay = config?.razorpay || {};
        const environments = razorpay?.environments || {};
        setForm((current) => ({
          ...current,
          paymentEnabled: Boolean(config.paymentEnabled),
          provider: String(config.provider || "razorpay") || "razorpay",
          accountName: String(razorpay.accountName || ""),
          mode: String(razorpay.mode || "test"),
          environments: {
            test: {
              keyId: String(environments?.test?.keyId || ""),
              keySecret: "",
              keySecretMasked: String(environments?.test?.keySecretMasked || ""),
              hasKeySecret: Boolean(environments?.test?.hasKeySecret),
            },
            live: {
              keyId: String(environments?.live?.keyId || ""),
              keySecret: "",
              keySecretMasked: String(environments?.live?.keySecretMasked || ""),
              hasKeySecret: Boolean(environments?.live?.hasKeySecret),
            },
          },
        }));
      } catch (error) {
        console.error("Failed to load payment settings", error);
        alert(error.message || "Failed to load payment settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const handleSave = async () => {
    if (!vendorId) {
      alert("Vendor ID missing");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`${API_BASE_URL}/api/vendor-payment-config/${vendorId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getVendorAuthHeaders(vendorId),
        },
        body: JSON.stringify({
          paymentEnabled: form.paymentEnabled,
          provider: "razorpay",
          razorpay: {
            accountName: form.accountName.trim(),
            mode: form.mode,
            environments: {
              test: {
                keyId: form.environments.test.keyId.trim(),
                keySecret: form.environments.test.keySecret.trim(),
              },
              live: {
                keyId: form.environments.live.keyId.trim(),
                keySecret: form.environments.live.keySecret.trim(),
              },
            },
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to save payment settings");
      }
      alert("Payment settings saved");
      onClose?.();
    } catch (error) {
      console.error("Failed to save payment settings", error);
      alert(error.message || "Failed to save payment settings");
    } finally {
      setSaving(false);
    }
  };

  const activeMode = form.mode === "live" ? "live" : "test";
  const activeEnvironment = form.environments[activeMode];
  const activeModeLabel = activeMode === "live" ? "Live" : "Test";

  return (
    <div className="popup-overlay">
      <div className="popup-card business-hours-theme payment-settings-modal">
        <h2 className="popup-title">Payment Settings</h2>
        <p className="popup-subtitle">{businessName}</p>

        <div className="payment-settings-body">
          {loading ? (
            <div className="payment-settings-loading">Loading payment settings...</div>
          ) : (
            <div className="payment-settings-form">
            <label className="payment-settings-toggle">
              <input
                type="checkbox"
                  checked={form.paymentEnabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      paymentEnabled: event.target.checked,
                    }))
                  }
              />
              Enable Razorpay for ecommerce checkout
            </label>

            <div className="branding-contact-section">
              <label className="branding-label">Mode</label>
              <select
                className="branding-text-input"
                value={form.mode}
                onChange={(event) =>
                  setForm((current) => ({ ...current, mode: event.target.value }))
                }
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </div>

            <div className="branding-contact-section">
              <label className="branding-label">{activeModeLabel} Razorpay Key ID</label>
              <input
                className="branding-text-input"
                type="text"
                placeholder={activeMode === "live" ? "rzp_live_xxxxx" : "rzp_test_xxxxx"}
                value={activeEnvironment.keyId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    environments: {
                      ...current.environments,
                      [activeMode]: {
                        ...current.environments[activeMode],
                        keyId: event.target.value,
                      },
                    },
                  }))
                }
              />
            </div>

            <div className="branding-contact-section">
              <label className="branding-label">{activeModeLabel} Razorpay Key Secret</label>
              <input
                className="branding-text-input"
                type="password"
                placeholder={
                  activeEnvironment.hasKeySecret
                    ? `Stored: ${activeEnvironment.keySecretMasked}`
                    : `Enter ${activeModeLabel.toLowerCase()} Razorpay key secret`
                }
                value={activeEnvironment.keySecret}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    environments: {
                      ...current.environments,
                      [activeMode]: {
                        ...current.environments[activeMode],
                        keySecret: event.target.value,
                      },
                    },
                  }))
                }
              />
            </div>

              <div className="branding-contact-section">
                <label className="branding-label">Checkout Display Name</label>
                <input
                  className="branding-text-input"
                  type="text"
                  placeholder="Shown in Razorpay checkout"
                  value={form.accountName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, accountName: event.target.value }))
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="popup-footer">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-save primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
