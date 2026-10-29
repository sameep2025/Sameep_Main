"use client";

import { useEffect, useState } from "react";
import "./ItemGstConfiguration.css";

function authenticatedFetch(url, options = {}) {
  const sessionVendorId = localStorage.getItem("vendorSessionVendorId");
  const vendorToken = sessionVendorId
    ? localStorage.getItem(`vendorToken:${sessionVendorId}`)
    : "";
  const token = vendorToken || localStorage.getItem("authToken");
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function formatRate(bps) {
  return Number.isInteger(bps) ? `${bps / 100}%` : "Not set";
}

export default function ItemGstConfiguration({
  vendorId,
  itemId,
  itemSource,
  suggestedItemType = "SERVICE",
}) {
  const [state, setState] = useState({ loading: true, configured: false });
  const [useDefault, setUseDefault] = useState(true);
  const [itemType, setItemType] = useState(suggestedItemType);
  const [rate, setRate] = useState("");
  const [classificationCode, setClassificationCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ loading: true, configured: false });
      setMessage("");
      setMessageType("");
      try {
        const queryType = encodeURIComponent(suggestedItemType);
        const response = await authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/vendor/gst-item-overrides/${vendorId}/item/${itemSource}/${itemId}?itemType=${queryType}`
        );
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || "Unable to load item GST settings");
        }
        if (cancelled) return;
        const data = payload.data;
        const override = data.override;
        const nextType = override?.itemType || suggestedItemType;
        setState({ ...data, loading: false, configured: data.vendorGstConfigured === true });
        setUseDefault(!override);
        setItemType(nextType);
        setRate(override ? String(override.gstRateBps / 100) : "");
        setClassificationCode(override?.classificationCode || "");
      } catch (error) {
        if (!cancelled) {
          setState({ loading: false, configured: false, loadError: error.message });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [itemId, itemSource, suggestedItemType, vendorId]);

  if (state.loading || !state.configured) return null;

  const inheritedRate = state.vendorDefaults?.gstRateBps;
  const inheritedCode =
    itemType === "SERVICE"
      ? state.vendorDefaults?.defaultSac || state.vendorDefaults?.sac || ""
      : "";
  const effectiveRate = useDefault ? inheritedRate : Math.round(Number(rate) * 100);
  const effectiveCode = useDefault ? inheritedCode : classificationCode;

  async function save() {
    setSaving(true);
    setMessage("");
    setMessageType("");
    try {
      let response;
      if (useDefault) {
        if (!state.override) {
          setMessage("This item already uses the vendor default GST settings");
          setMessageType("info");
          return;
        }
        response = await authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/vendor/gst-item-overrides/${vendorId}/${state.override.id}`,
          { method: "DELETE" }
        );
      } else {
        const rateNumber = Number(rate);
        if (!Number.isFinite(rateNumber)) throw new Error("Enter a valid GST percentage");
        const body = {
          itemSource,
          itemId,
          itemType,
          gstRateBps: Math.round(rateNumber * 100),
          classificationCode,
        };
        response = await authenticatedFetch(
          state.override
            ? `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/vendor/gst-item-overrides/${vendorId}/${state.override.id}`
            : `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/vendor/gst-item-overrides/${vendorId}`,
          { method: state.override ? "PATCH" : "POST", body: JSON.stringify(body) }
        );
      }

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to save item GST settings");
      }
      const override = useDefault ? null : payload.data.override;
      setState((current) => ({ ...current, override }));
      setMessage("Item GST Settings Saved Successfully");
      setMessageType("success");
    } catch (error) {
      setMessage(error.message || "Unable to save item GST settings");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="item-gst-settings">
      <summary>GST Configuration <span>Optional</span></summary>
      <div className="item-gst-settings-body">
        <label className="item-gst-choice">
          <input
            type="radio"
            name={`gst-mode-${itemId}`}
            checked={useDefault}
            onChange={() => setUseDefault(true)}
          />
          Use Default GST Settings
        </label>
        <label className="item-gst-choice">
          <input
            type="radio"
            name={`gst-mode-${itemId}`}
            checked={!useDefault}
            onChange={() => setUseDefault(false)}
          />
          Custom GST Settings
        </label>

        {!useDefault ? (
          <div className="item-gst-grid">
            <label>
              Item Type
              <select
                value={itemType}
                onChange={(event) => {
                  setItemType(event.target.value);
                  setClassificationCode("");
                  setMessage("");
                  setMessageType("");
                }}
              >
                <option value="SERVICE">Service</option>
                <option value="PRODUCT">Product</option>
              </select>
            </label>
            <label>
              GST Percentage
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
              />
            </label>
            <label>
              {itemType === "PRODUCT" ? "HSN (Optional)" : "SAC (Optional)"}
              <input
                inputMode="numeric"
                value={classificationCode}
                onChange={(event) => setClassificationCode(event.target.value.replace(/\D/g, ""))}
                maxLength={8}
              />
            </label>
          </div>
        ) : null}

        <div className="item-gst-effective">
          Effective GST: <strong>{formatRate(effectiveRate)}</strong>
          <span>{itemType === "PRODUCT" ? "HSN" : "SAC"}: {effectiveCode || "Not set"}</span>
        </div>
        {message ? (
          <div className={`item-gst-message ${messageType}`} role="status">{message}</div>
        ) : null}
        <button type="button" className="item-gst-save" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Item GST Settings"}
        </button>
      </div>
    </details>
  );
}
