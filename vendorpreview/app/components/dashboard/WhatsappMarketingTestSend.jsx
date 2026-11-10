"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import "./WhatsappMarketingTestSend.css";

function apiUrl(vendorId, path) {
  return `${API_BASE_URL}/api/vendor/whatsapp-marketing/${encodeURIComponent(vendorId)}${path}`;
}

async function request(vendorId, path, options = {}) {
  const response = await fetch(apiUrl(vendorId, path), {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...getVendorAuthHeaders(vendorId),
      ...(options.headers || {}),
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.message || "Test message request failed");
  return json.data || {};
}

function renderPreview(snapshot, values) {
  let message = String(snapshot?.messageBody || "");
  for (const [key, value] of Object.entries(values)) {
    message = message.split(`{{${key}}}`).join(String(value || ""));
  }
  return message;
}

export default function WhatsappMarketingTestSend({ vendorId, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [salonName, setSalonName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [offerDetails, setOfferDetails] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [recentSends, setRecentSends] = useState([]);

  async function loadRecentSends() {
    const data = await request(vendorId, "/marketing-test-sends");
    setRecentSends(data.testSends || []);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      request(vendorId, "/campaign-templates"),
      request(vendorId, "/marketing-test-sends"),
    ])
      .then(([data, history]) => {
        if (cancelled) return;
        const nextTemplates = data.templates || [];
        setTemplates(nextTemplates);
        setSalonName(data.vendorDisplayName || "");
        setTemplateId(nextTemplates[0]?.id || "");
        setRecentSends(history.testSends || []);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "Unable to load approved templates");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [vendorId]);

  const template = templates.find((item) => item.id === templateId);
  const snapshot = template?.templateSnapshot;
  const variables = new Set(snapshot?.variableOrder || []);
  const preview = renderPreview(snapshot, {
    customer_name: customerName,
    offer_details: offerDetails,
    salon_name: salonName,
  });

  async function sendTest(event) {
    event.preventDefault();
    if (!confirmed) {
      setError("Confirm that this test number is explicitly authorized.");
      return;
    }
    if (!window.confirm("Send this approved WhatsApp template to the authorized test number?")) return;
    try {
      setSending(true);
      setError("");
      setResult(null);
      const data = await request(vendorId, "/marketing-test-sends", {
        method: "POST",
        body: JSON.stringify({
          templateId,
          recipientPhoneNumber: phone,
          customerName,
          offerDetails,
          confirmedAuthorized: true,
        }),
      });
      setResult(data.testSend || null);
      setRecentSends((current) => [data.testSend, ...current.filter((item) => item.id !== data.testSend?.id)].filter(Boolean).slice(0, 20));
    } catch (sendError) {
      setError(sendError.message || "Unable to send test message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="wa-test-overlay" role="dialog" aria-modal="true" aria-labelledby="wa-test-title">
      <div className="wa-test-card">
        <header>
          <div><span>Controlled test</span><h2 id="wa-test-title">Send Test Message</h2></div>
          <button type="button" aria-label="Close test message" onClick={onClose} disabled={sending}>×</button>
        </header>
        {error ? <div className="wa-test-alert error">{error}</div> : null}
        {result ? <div className="wa-test-alert success">Meta accepted the test message for {result.recipientMasked}. Status: {result.status}.</div> : null}
        {loading ? <p className="wa-test-loading">Loading approved templates...</p> : (
          <form className="wa-test-layout" onSubmit={sendTest}>
            <div className="wa-test-fields">
              {!templates.length ? <p className="wa-test-empty">An approved Meta marketing template is required before sending a test.</p> : null}
              <label>Approved Meta template<select value={templateId} onChange={(event) => setTemplateId(event.target.value)} required><option value="">Select template</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.internalName}</option>)}</select></label>
              <label>Authorized test number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+919876543210" autoComplete="tel" required /></label>
              {variables.has("customer_name") ? <label>Test customer name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={100} required /></label> : null}
              {variables.has("offer_details") ? <label>Offer details<input value={offerDetails} onChange={(event) => setOfferDetails(event.target.value)} maxLength={240} required /></label> : null}
              <label className="wa-test-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I confirm this number is authorized to receive this one test message.</label>
              <div className="wa-test-history">
                <div><strong>Recent test delivery</strong><button type="button" onClick={() => loadRecentSends().catch((historyError) => setError(historyError.message))}>Refresh</button></div>
                {recentSends.length ? recentSends.map((item) => <p key={item.id}><span>{item.recipientMasked}</span><b className={`status-${String(item.status || "accepted").toLowerCase()}`}>{item.status}</b></p>) : <small>No test messages sent yet.</small>}
              </div>
            </div>
            <div className="wa-test-preview-wrap">
              <span>Personalized preview</span>
              <div className="wa-test-preview">
                {snapshot?.headerType === "IMAGE" && snapshot.primaryMedia?.url ? <img src={snapshot.primaryMedia.url} alt="Approved test message header" /> : null}
                {snapshot?.headerType === "DOCUMENT" && snapshot.primaryMedia?.url ? <a href={snapshot.primaryMedia.url} target="_blank" rel="noreferrer"><strong>PDF brochure</strong><small>{snapshot.primaryMedia.originalName || "Open brochure"}</small></a> : null}
                <p>{preview || "Select an approved template to preview the message."}</p>
              </div>
            </div>
            <footer>
              <button type="button" onClick={onClose} disabled={sending}>Cancel</button>
              <button type="submit" disabled={sending || !templateId || !templates.length}>{sending ? "Sending..." : "Confirm & Send Test"}</button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
