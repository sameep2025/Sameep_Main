"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { useVendor } from "../../context/VendorContext";
import "./LoyaltySettings.css";

function getVendorAuthToken(vendorId) {
  if (typeof window === "undefined") return "";
  const vendorToken = vendorId ? localStorage.getItem(`vendorToken:${vendorId}`) : "";
  return (
    vendorToken ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("token") ||
    ""
  );
}

function getVendorAuthHeaders(vendorId) {
  const token = getVendorAuthToken(vendorId);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function LoyaltySettings({ vendorId, rootCategoryId, onBack }) {
  const [loadingRule, setLoadingRule] = useState(false);
  const [loadingBillingPreferences, setLoadingBillingPreferences] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [percentPer100, setPercentPer100] = useState(0);
  const [expiryDays, setExpiryDays] = useState(0);
  const [sendWhatsAppBill, setSendWhatsAppBill] = useState(true);
  const { setVendorInfo } = useVendor();

  useEffect(() => {
    if (!vendorId) return;

    let cancelled = false;

    const fetchRule = async () => {
      try {
        setLoadingRule(true);
        const res = await fetch(
          `${API_BASE_URL}/api/loyalty/vendor-rule/${encodeURIComponent(vendorId)}`,
          { cache: "no-store" }
        );

        if (!res.ok) {
          throw new Error("Failed to load loyalty rule");
        }

        const data = await res.json();
        if (cancelled) return;

        if (data?.success && data?.data) {
          const rule = data.data;
          setIsEnabled(typeof rule.isEnabled === "boolean" ? rule.isEnabled : false);
          setPercentPer100(Number(rule?.earn?.percentPer100 ?? 0));
          setExpiryDays(Number(rule?.expiry?.expiryDays ?? 0));
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch loyalty rule", error);
          setIsEnabled(false);
          setPercentPer100(0);
          setExpiryDays(0);
        }
      } finally {
        if (!cancelled) {
          setLoadingRule(false);
        }
      }
    };

    fetchRule();

    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    let cancelled = false;

    const fetchBillingPreferences = async () => {
      try {
        setLoadingBillingPreferences(true);
        const res = await fetch(
          `${API_BASE_URL}/api/vendor-billing-preferences/${encodeURIComponent(vendorId)}`,
          {
            cache: "no-store",
            headers: getVendorAuthHeaders(vendorId),
          }
        );

        if (!res.ok) {
          throw new Error("Failed to load billing preferences");
        }

        const data = await res.json();
        if (cancelled) return;

        setSendWhatsAppBill(data?.data?.billingPreferences?.sendWhatsAppBill !== false);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch billing preferences", error);
          setSendWhatsAppBill(true);
        }
      } finally {
        if (!cancelled) {
          setLoadingBillingPreferences(false);
        }
      }
    };

    fetchBillingPreferences();

    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const saveLoyaltyRule = async () => {
    if (!vendorId) return;

    try {
      setSavingRule(true);
      setSaveMessage("");

      const payload = {
        vendorId,
        categoryId: rootCategoryId,
        isEnabled,
        earn: {
          percentPer100,
        },
        expiry: {
          expiryDays,
        },
      };

      const loyaltySave = fetch(`${API_BASE_URL}/api/loyalty/vendor-rule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const billingPreferencesSave = fetch(
        `${API_BASE_URL}/api/vendor-billing-preferences/${encodeURIComponent(vendorId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify({ sendWhatsAppBill }),
        }
      );

      const [loyaltyRes, billingPreferencesRes] = await Promise.all([
        loyaltySave,
        billingPreferencesSave,
      ]);

      if (!loyaltyRes.ok) {
        const text = await loyaltyRes.text();
        console.error("Loyalty save API error:", text);
        throw new Error("Failed to save loyalty rule");
      }

      if (!billingPreferencesRes.ok) {
        const text = await billingPreferencesRes.text();
        console.error("Billing preferences save API error:", text);
        throw new Error("Failed to save billing preferences");
      }

      setVendorInfo((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          billingPreferences: {
            ...(prev.billingPreferences || {}),
            sendWhatsAppBill,
          },
          loyaltyRule: {
            isEnabled,
            earn: { percentPer100 },
            expiry: { expiryDays },
          },
        };
      });
      setSaveMessage("Saved successfully");
    } catch (error) {
      console.error("Failed to save loyalty rule", error);
      setSaveMessage("Unable to save settings");
    } finally {
      setSavingRule(false);
    }
  };

  return (
    <div className="loyalty-settings-overlay">
      <div className="loyalty-settings-shell">
        <div className="loyalty-settings-header">
          <button type="button" className="loyalty-settings-nav-btn" onClick={onBack}>
            <span aria-hidden="true">←</span>
            <span>Back</span>
          </button>
          <div className="loyalty-settings-title-wrap">
            <div className="loyalty-settings-title">Loyalty Settings</div>
            <div className="loyalty-settings-subtitle">
              Configure earning percentage, point expiry, and program status.
            </div>
          </div>
        </div>

        <div className="loyalty-settings-panel">
          {loadingRule || loadingBillingPreferences ? (
            <div className="loyalty-settings-state">Loading loyalty settings...</div>
          ) : (
            <>
              <div className="loyalty-settings-grid">
                <div className="loyalty-settings-card loyalty-settings-card-wide">
                  <div className="loyalty-settings-label">Program Status</div>
                  <div className="loyalty-settings-toggle-row">
                    <span className="loyalty-settings-toggle-text">
                      {isEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <label className="loyalty-settings-switch">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(event) => setIsEnabled(event.target.checked)}
                      />
                      <span className="loyalty-settings-switch-track">
                        <span className="loyalty-settings-switch-thumb" />
                      </span>
                    </label>
                  </div>
                </div>

                <div className="loyalty-settings-card">
                  <div className="loyalty-settings-label">Earn Percentage</div>
                  <div className="loyalty-input-wrapper">
                    <span className="loyalty-input-prefix">%</span>
                    <input
                      type="number"
                      className="loyalty-settings-input"
                      value={percentPer100}
                      onChange={(event) => setPercentPer100(Number(event.target.value) || 0)}
                    />
                  </div>
                  <div className="loyalty-settings-help">% points per Rs 100 spent</div>
                </div>

                <div className="loyalty-settings-card">
                  <div className="loyalty-settings-label">Expiry Days</div>
                  <div className="loyalty-input-wrapper">
                    <span className="loyalty-input-prefix">Days</span>
                    <input
                      type="number"
                      className="loyalty-settings-input"
                      value={expiryDays}
                      onChange={(event) => setExpiryDays(Number(event.target.value) || 0)}
                    />
                  </div>
                  <div className="loyalty-settings-help">Point expiry duration in days</div>
                </div>

                <div className="loyalty-settings-card loyalty-settings-card-wide loyalty-settings-whatsapp-card">
                  <div className="loyalty-settings-label">WhatsApp Bill</div>
                  <div className="loyalty-settings-toggle-row loyalty-settings-whatsapp-row">
                    <div className="loyalty-settings-whatsapp-copy">
                      <span className="loyalty-settings-toggle-text">
                        Send Automatically
                      </span>
                      <div className="loyalty-settings-help">
                        Send completed bills to customers on WhatsApp.
                      </div>
                      {!sendWhatsAppBill ? (
                        <div className="loyalty-settings-help">
                          Bills and rewards will still be available in My Bills & Rewards.
                        </div>
                      ) : null}
                    </div>
                    <div className="loyalty-settings-whatsapp-control">
                      <span className="loyalty-settings-whatsapp-status">
                        {sendWhatsAppBill ? "ON" : "OFF"}
                      </span>
                      <label className="loyalty-settings-switch">
                        <input
                          type="checkbox"
                          checked={sendWhatsAppBill}
                          onChange={(event) => setSendWhatsAppBill(event.target.checked)}
                        />
                        <span className="loyalty-settings-switch-track">
                          <span className="loyalty-settings-switch-thumb" />
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {saveMessage ? (
                <div className="loyalty-settings-message">{saveMessage}</div>
              ) : null}

              <div className="loyalty-settings-actions">
                <button
                  type="button"
                  className="loyalty-settings-save-btn"
                  onClick={saveLoyaltyRule}
                  disabled={savingRule}
                >
                  {savingRule ? "Saving..." : "Save Settings"}
                </button>
                <button
                  type="button"
                  className="loyalty-settings-secondary-btn"
                  onClick={onBack}
                >
                  Return to Dashboard
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
