import { useCallback, useEffect, useState } from "react";
import API from "../api";

const formatValue = (value) => {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "Not available";
  return String(value).replaceAll("_", " ");
};

const formatDate = (value) => {
  if (!value) return "Not checked";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not checked" : date.toLocaleString();
};

const unavailablePinResult = {
  result: "BLOCKED",
  status: "not_checked",
  severity: "warning",
  title: "Stored PIN Validation Unavailable",
  message: "Stored PIN validation could not be completed.",
};

const normalizePinResult = (value) => ({
  ...unavailablePinResult,
  ...(value || {}),
});

function Detail({ label, value, mono = false }) {
  return (
    <div style={styles.detail}>
      <span style={styles.label}>{label}</span>
      <strong style={{ ...styles.value, ...(mono ? styles.mono : {}) }}>{formatValue(value)}</strong>
    </div>
  );
}

export default function WhatsappIntegrationModal({ vendor, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pinResult, setPinResult] = useState(null);
  const [validatingPin, setValidatingPin] = useState(false);

  const load = useCallback(async () => {
    if (!vendor?._id) return;
    setLoading(true);
    setError("");
    setPinResult(null);
    try {
      const response = await API.get(`/api/admin/vendors/${vendor._id}/whatsapp-integration`);
      setData(response.data?.data || null);
    } catch (requestError) {
      setError(requestError?.response?.data?.code || "Unable to load WhatsApp integration");
    } finally {
      setLoading(false);
    }
  }, [vendor?._id]);

  useEffect(() => {
    load();
  }, [load]);

  const validatePin = async () => {
    setValidatingPin(true);
    setPinResult(null);
    try {
      const response = await API.post(
        `/api/admin/vendors/${vendor._id}/whatsapp-integration/pin-preflight`
      );
      setPinResult(normalizePinResult(response.data));
    } catch (requestError) {
      setPinResult(normalizePinResult(requestError?.response?.data));
    } finally {
      setValidatingPin(false);
    }
  };

  const live = data?.liveMeta || {};
  const metaPinStatus = live.accessible && typeof live.isPinEnabled === "boolean"
    ? live.isPinEnabled
    : "Unknown";
  const storedPinStatus = pinResult?.status === "valid"
    ? "Valid"
    : pinResult?.status === "missing"
      ? "Missing"
      : pinResult?.status === "invalid"
        ? "Invalid"
        : "Not Checked";
  const pinResultStyle = pinResult?.severity === "success"
    ? styles.success
    : pinResult?.severity === "info"
      ? styles.info
      : pinResult?.severity === "error"
        ? styles.error
        : styles.warning;
  return (
    <div style={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="whatsapp-title">
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>ADMIN CONTROL</div>
            <h2 id="whatsapp-title" style={styles.title}>WhatsApp Integration</h2>
            <div style={styles.subtitle}>{vendor?.businessName || "Selected vendor"}</div>
          </div>
          <button type="button" onClick={onClose} style={styles.close} aria-label="Close">×</button>
        </header>

        <div style={styles.body}>
          {loading ? <div style={styles.notice}>Checking stored and live Meta status...</div> : null}
          {error ? <div style={styles.error}>{formatValue(error)}</div> : null}
          {!loading && !error && data ? (
            <>
              <div style={styles.statusLine}>
                <span style={live.accessible ? styles.goodDot : styles.warnDot} />
                {live.accessible ? "Live Meta status verified" : `Live Meta status unavailable: ${formatValue(live.code)}`}
              </div>

              <div style={styles.grid}>
                <Detail label="Provider" value={data.connection?.provider} />
                <Detail label="Connected phone" value={data.connection?.displayPhoneNumber} />
                <Detail label="WABA ID" value={data.connection?.wabaId} mono />
                <Detail label="Phone Number ID" value={data.connection?.phoneNumberId} mono />
                <Detail label="Connection" value={data.connection?.status} />
                <Detail label="Registration" value={data.registration?.status} />
                <Detail label="Meta PIN enabled" value={metaPinStatus} />
                <Detail label="Stored PIN validation" value={storedPinStatus} />
                <Detail label="Meta phone status" value={live.phoneStatus} />
                <Detail label="Messaging readiness" value={live.accessible ? live.messagingReadiness?.status : data.messagingReadiness?.status} />
                <Detail label="Display-name readiness" value={live.accessible ? live.displayNameReadiness?.status : data.displayNameReadiness?.status} />
                <Detail label="Billing template" value={data.billingTemplate?.status} />
                <Detail label="Test message" value={data.testMessage?.status} />
                <Detail label="Own-number billing" value={data.billingActivation?.state?.label} />
                <Detail label="Last checked" value={formatDate(data.lastCheckedAt)} />
              </div>

              {pinResult ? (
                <div style={pinResultStyle} role="status">
                  <strong style={styles.resultTitle}>{pinResult.title}</strong>
                  <span>{pinResult.message}</span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <footer style={styles.footer}>
          <button type="button" onClick={load} disabled={loading} style={styles.secondaryButton}>
            {loading ? "Refreshing..." : "Refresh Meta Status"}
          </button>
          <button type="button" onClick={validatePin} disabled={validatingPin || loading || !data} style={styles.primaryButton}>
            {validatingPin ? "Validating..." : "Validate Stored PIN"}
          </button>
          <button type="button" disabled title="Planned for Phase 2" style={styles.disabledButton}>Recover Registration</button>
          <button type="button" disabled title="Planned for Phase 2" style={styles.disabledButton}>View Recovery History</button>
        </footer>
      </section>
    </div>
  );
}

const styles = {
  backdrop: { position: "fixed", inset: 0, zIndex: 1800, background: "rgba(15, 23, 42, 0.72)", display: "grid", placeItems: "center", padding: 16 },
  modal: { width: "min(920px, 100%)", maxHeight: "calc(100vh - 32px)", overflow: "hidden", display: "flex", flexDirection: "column", background: "#f8fafc", borderRadius: 16, boxShadow: "0 24px 70px rgba(15, 23, 42, 0.35)" },
  header: { display: "flex", justifyContent: "space-between", gap: 20, padding: "20px 22px", background: "linear-gradient(135deg, #0f172a, #164e63)", color: "#fff" },
  eyebrow: { fontSize: 11, letterSpacing: "0.14em", color: "#67e8f9", fontWeight: 800 },
  title: { margin: "4px 0", fontSize: 25 },
  subtitle: { color: "#cbd5e1", overflowWrap: "anywhere" },
  close: { width: 38, height: 38, flex: "0 0 auto", border: "1px solid rgba(255,255,255,.3)", borderRadius: 10, background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 25, cursor: "pointer" },
  body: { padding: 20, overflowY: "auto" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  detail: { minWidth: 0, padding: 13, border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff" },
  label: { display: "block", marginBottom: 5, color: "#64748b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" },
  value: { display: "block", color: "#0f172a", fontSize: 14, overflowWrap: "anywhere", textTransform: "capitalize" },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", textTransform: "none" },
  statusLine: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, color: "#334155", fontWeight: 700 },
  goodDot: { width: 10, height: 10, borderRadius: "50%", background: "#16a34a" },
  warnDot: { width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" },
  notice: { padding: 14, borderRadius: 10, background: "#e0f2fe", color: "#075985" },
  success: { marginTop: 14, padding: 12, borderRadius: 10, background: "#dcfce7", color: "#166534" },
  info: { marginTop: 14, padding: 12, borderRadius: 10, background: "#e0f2fe", color: "#075985" },
  warning: { marginTop: 14, padding: 12, borderRadius: 10, background: "#fef3c7", color: "#92400e" },
  error: { marginTop: 14, padding: 12, borderRadius: 10, background: "#fee2e2", color: "#991b1b" },
  resultTitle: { display: "block", marginBottom: 3 },
  footer: { display: "flex", flexWrap: "wrap", gap: 10, padding: "15px 20px", borderTop: "1px solid #e2e8f0", background: "#fff" },
  primaryButton: { padding: "9px 13px", border: 0, borderRadius: 8, background: "#0e7490", color: "#fff", fontWeight: 700, cursor: "pointer" },
  secondaryButton: { padding: "9px 13px", border: "1px solid #0e7490", borderRadius: 8, background: "#ecfeff", color: "#155e75", fontWeight: 700, cursor: "pointer" },
  disabledButton: { padding: "9px 13px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#e2e8f0", color: "#64748b", fontWeight: 700, cursor: "not-allowed" },
};
