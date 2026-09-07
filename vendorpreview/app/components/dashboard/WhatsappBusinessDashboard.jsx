"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../config";
import "./WhatsappBusinessDashboard.css";

const CONNECTED_STATUSES = new Set(["connected", "template_pending", "ready"]);
const TEMPLATE_STATUS_LABELS = {
  not_configured: "Not Set Up",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  error: "Error",
};
const SAMPLE_FIELD_LABELS = {
  vendorName: "Business Name",
  billAmount: "Bill Amount",
  earned: "Points Earned",
  redeemed: "Points Redeemed",
  finalPaid: "Final Paid",
  balance: "Loyalty Balance",
  billUrl: "Bill URL",
};

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

function getAuthHeaders(vendorId) {
  const token = getVendorAuthToken(vendorId);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseApiResponse(res, fallbackMessage) {
  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.success) {
    const message = json?.message || fallbackMessage;
    console.error("WhatsApp Business API error", {
      status: res.status,
      statusText: res.statusText,
      message,
      code: json?.code,
    });
    throw new Error(`${message} (${res.status})`);
  }

  return json;
}

function formatStatus(value) {
  return String(value || "not_connected")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusTone(status) {
  if (status === "ready" || status === "connected") return "ready";
  if (status === "template_pending" || status === "connecting") return "pending";
  if (status === "error") return "error";
  return "idle";
}

function isPhoneRegistrationReady(status) {
  return status === "registered" || status === "active";
}

function getTemplateStatusLabel(status) {
  return TEMPLATE_STATUS_LABELS[status] || formatStatus(status || "not_configured");
}

function getTemplateStatusTone(status) {
  if (status === "approved") return "ready";
  if (status === "pending") return "pending";
  if (status === "rejected" || status === "error") return "error";
  return "idle";
}

function isDevMode() {
  return process.env.NODE_ENV !== "production";
}

function debugTestSend(message, data) {
  if (isDevMode()) {
    console.debug(message, data);
  }
}

function normalizePhoneNumber(value) {
  const cleaned = String(value || "").trim().replace(/[\s()-]/g, "");
  if (!cleaned) return "";
  const digits = cleaned.replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return cleaned;
  return cleaned.startsWith("+") ? `+${digits}` : `+${digits}`;
}

function isValidInternationalPhone(value) {
  return /^\+?[1-9]\d{7,14}$/.test(value);
}

function getWhatsappConnectBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_WHATSAPP_CONNECT_BASE_URL;
  if (configured && configured.trim()) {
    return configured.trim().replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

function getHasWhatsappConnectLauncher() {
  return Boolean(getWhatsappConnectBaseUrl());
}

export default function WhatsappBusinessDashboard({ vendorId }) {
  const [config, setConfig] = useState(null);
  const [dashboardMode, setDashboardMode] = useState("overview");
  const [templateLibrary, setTemplateLibrary] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [recipientPhoneNumber, setRecipientPhoneNumber] = useState("");
  const [testResult, setTestResult] = useState("");
  const [testSendError, setTestSendError] = useState("");
  const [loading, setLoading] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      if (!vendorId) {
        setLoading(false);
        setConfig(null);
        setError("Vendor session was not found. Please log in again.");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const configRes = await fetch(
          `${API_BASE_URL}/api/vendor/whatsapp-business?vendorId=${encodeURIComponent(vendorId)}`,
          {
            cache: "no-store",
            headers: getAuthHeaders(vendorId),
          }
        );

        const json = await parseApiResponse(
          configRes,
          "Unable to load WhatsApp Business settings"
        );

        if (!cancelled) {
          setConfig(json.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("WhatsApp Business settings fetch failed", err);
          setConfig(null);
          setError(err.message || "Unable to load WhatsApp Business settings");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const postWhatsappBusinessAction = async (action, payload = {}) => {
    if (!vendorId || actionLoading) return;

    try {
      setActionLoading(action);
      setError("");
      setMessage("");

      const res = await fetch(`${API_BASE_URL}/api/vendor/whatsapp-business/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(vendorId),
        },
        body: JSON.stringify({ vendorId, ...payload }),
      });

      const json = await parseApiResponse(
        res,
        "Unable to update WhatsApp Business settings"
      );

      setConfig(json.data || null);
      setMessage(json.message || "WhatsApp Business settings updated");
      return json;
    } catch (err) {
      console.error("WhatsApp Business action failed", err);
      setError(err.message || "Unable to update WhatsApp Business settings");
      return null;
    } finally {
      setActionLoading("");
    }
  };

  const fetchTemplateLibrary = async () => {
    if (!vendorId) return;

    try {
      setTemplateLoading(true);
      setError("");
      setMessage("");

      const res = await fetch(
        `${API_BASE_URL}/api/vendor/whatsapp-business/templates?vendorId=${encodeURIComponent(vendorId)}`,
        {
          cache: "no-store",
          headers: getAuthHeaders(vendorId),
        }
      );
      const json = await parseApiResponse(res, "Unable to load WhatsApp templates");

      setTemplateLibrary(json.data?.templates || []);
      setSelectedTemplate(null);
      setDashboardMode("library");
    } catch (err) {
      console.error("WhatsApp template library fetch failed", err);
      setError(err.message || "Unable to load WhatsApp templates");
    } finally {
      setTemplateLoading(false);
    }
  };

  const fetchTemplatePreview = async (templateKey) => {
    if (!vendorId || !templateKey) return;

    try {
      setTemplateLoading(true);
      setError("");
      setMessage("");

      const res = await fetch(
        `${API_BASE_URL}/api/vendor/whatsapp-business/templates/${encodeURIComponent(templateKey)}?vendorId=${encodeURIComponent(vendorId)}`,
        {
          cache: "no-store",
          headers: getAuthHeaders(vendorId),
        }
      );
      const json = await parseApiResponse(res, "Unable to load WhatsApp template preview");

      setSelectedTemplate(json.data || null);
      setTestPanelOpen(false);
      setRecipientPhoneNumber("");
      setTestResult("");
      setTestSendError("");
      setDashboardMode("preview");
    } catch (err) {
      console.error("WhatsApp template preview fetch failed", err);
      setError(err.message || "Unable to load WhatsApp template preview");
    } finally {
      setTemplateLoading(false);
    }
  };

  const postTemplateAction = async (templateKey, action) => {
    if (!vendorId || !templateKey || actionLoading) return;

    try {
      setActionLoading(action);
      setError("");
      setMessage("");

      const res = await fetch(
        `${API_BASE_URL}/api/vendor/whatsapp-business/templates/${encodeURIComponent(templateKey)}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(vendorId),
          },
          body: JSON.stringify({ vendorId }),
        }
      );
      const json = await parseApiResponse(res, "Unable to update WhatsApp template");

      setSelectedTemplate(json.data || null);
      setMessage(json.message || "WhatsApp template updated");
      await fetchTemplateLibrary();
      setSelectedTemplate(json.data || null);
      setTestResult("");
      setTestSendError("");
      setDashboardMode("preview");
    } catch (err) {
      console.error("WhatsApp template action failed", err);
      setError(err.message || "Unable to update WhatsApp template");
    } finally {
      setActionLoading("");
    }
  };

  const sendTestMessage = async () => {
    const templateKey = selectedTemplate?.template?.key || "";
    const normalizedRecipient = normalizePhoneNumber(recipientPhoneNumber);

    debugTestSend("[WA Test Send UI]", {
      buttonClicked: true,
      hasRecipient: Boolean(recipientPhoneNumber),
      normalizedRecipientPresent: Boolean(normalizedRecipient),
      templateKey: templateKey || "BILL_STANDARD",
    });

    if (actionLoading) return;

    if (!vendorId) {
      setTestSendError("Vendor session was not found. Please log in again.");
      return;
    }

    if (!templateKey) {
      setTestSendError("Template details were not loaded. Please reopen Standard Bill and try again.");
      return;
    }

    if (!isValidInternationalPhone(normalizedRecipient)) {
      setTestSendError("Enter a valid WhatsApp number including country code, for example +919381520396.");
      return;
    }

    try {
      setActionLoading("test-send");
      setError("");
      setMessage("");
      setTestResult("");
      setTestSendError("");

      debugTestSend("[WA Test Send UI] validation passed, starting request", {
        templateKey,
        hasRecipient: true,
      });

      const res = await fetch(
        `${API_BASE_URL}/api/vendor/whatsapp-business/meta/templates/${encodeURIComponent(templateKey)}/test-send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(vendorId),
          },
          body: JSON.stringify({
            vendorId,
            recipientPhoneNumber: normalizedRecipient,
          }),
        }
      );
      debugTestSend("[WA Test Send UI] response", {
        status: res.status,
      });
      const json = await parseApiResponse(res, "Unable to send WhatsApp test message");

      setTestResult(json.message || "Test message submitted successfully.");
    } catch (err) {
      console.error("WhatsApp test message failed", err);
      setTestSendError(err.message || "Unable to send WhatsApp test message");
    } finally {
      setActionLoading("");
    }
  };

  const launchCentralMetaSignup = async () => {
    if (!vendorId || actionLoading) return;

    const connectBaseUrl = getWhatsappConnectBaseUrl();
    const connectWindow =
      typeof window !== "undefined" && connectBaseUrl
        ? window.open("about:blank", "_blank")
        : null;

    if (connectWindow) {
      connectWindow.opener = null;
    }

    try {
      setActionLoading("connect");
      setError("");
      setMessage("");
      setConfig((prev) => ({
        ...(prev || {}),
        provider: "msg91",
        enabled: false,
        connectionStatus: "connecting",
      }));

      const returnUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}?viewMode=whatsapp-business-dashboard`
          : "";
      const prepareRes = await fetch(`${API_BASE_URL}/api/vendor/whatsapp-business/meta/connect-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(vendorId),
        },
        body: JSON.stringify({ vendorId, returnUrl }),
      });

      const json = await parseApiResponse(prepareRes, "Unable to start WhatsApp setup");
      const connectToken = json?.data?.connectToken;

      if (!connectToken || !connectBaseUrl) {
        throw new Error("WhatsApp setup link could not be created");
      }

      const connectUrl = new URL("/whatsapp-connect", connectBaseUrl);
      connectUrl.searchParams.set("connectToken", connectToken);

      if (connectWindow && !connectWindow.closed) {
        connectWindow.location.href = connectUrl.toString();
      } else if (typeof window !== "undefined") {
        window.open(connectUrl.toString(), "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      if (connectWindow && !connectWindow.closed) {
        connectWindow.close();
      }
      console.error("WhatsApp Business setup launch failed", err);
      setError(
        "Your WhatsApp Business connection could not be completed. YNOT will continue sending bills from the YNOT WhatsApp number."
      );
      setConfig((prev) => ({
        ...(prev || {}),
        provider: "msg91",
        enabled: false,
        connectionStatus: "error",
      }));
    } finally {
      setActionLoading("");
    }
  };

  const handleDisconnect = () => {
    const shouldDisconnect = window.confirm(
      "Disconnect this WhatsApp Business setup and continue using YNOT's WhatsApp number?"
    );

    if (shouldDisconnect) {
      postWhatsappBusinessAction("disconnect");
    }
  };

  const status = config?.connectionStatus || "not_connected";
  const isConnected = CONNECTED_STATUSES.has(status);
  const statusTone = getStatusTone(status);
  const hasConnectLauncher = getHasWhatsappConnectLauncher();
  const phoneRegistrationStatus = config?.phoneRegistrationStatus || "unknown";
  const shouldShowPhoneRegistration =
    isConnected && !isPhoneRegistrationReady(phoneRegistrationStatus);
  const selectedTemplateStatus =
    selectedTemplate?.vendorTemplate?.status || "not_configured";
  const canSubmitSelectedTemplate = selectedTemplateStatus === "not_configured";
  const canCheckSelectedTemplateStatus = selectedTemplateStatus !== "not_configured";
  const sampleData = selectedTemplate?.preview?.sampleData || {};
  const sampleFields = selectedTemplate?.preview?.variables || [];

  return (
    <section className="whatsapp-business-panel">
      <div className="whatsapp-business-hero">
        <div>
          <div className="whatsapp-business-eyebrow">WhatsApp Business</div>
          <h2 className="whatsapp-business-title">
            {isConnected ? "WhatsApp Business" : "Connect Your WhatsApp Business"}
          </h2>
          <p className="whatsapp-business-description">
            Send YNOT bills and customer messages from your own WhatsApp Business number.
          </p>
        </div>

        <div className={`whatsapp-business-status whatsapp-business-status-${statusTone}`}>
          {formatStatus(status)}
        </div>
      </div>

      {loading ? (
        <div className="whatsapp-business-state">Loading WhatsApp Business settings...</div>
      ) : (
        <>
          {error && <div className="whatsapp-business-alert error">{error}</div>}
          {message && <div className="whatsapp-business-alert success">{message}</div>}
          {!hasConnectLauncher && !isConnected && (
            <div className="whatsapp-business-alert warning">
              WhatsApp connection launcher is not configured. Add the central WhatsApp
              connect URL to enable the connection flow.
            </div>
          )}
          {shouldShowPhoneRegistration && (
            <div className="whatsapp-business-alert warning">
              WhatsApp number registration is pending.
            </div>
          )}

          {isConnected && dashboardMode === "overview" ? (
            <div className="whatsapp-business-grid">
              <div className="whatsapp-business-card">
                <span>Business</span>
                <strong>{config?.displayName || "Not available yet"}</strong>
              </div>
              <div className="whatsapp-business-card">
                <span>Connected Number</span>
                <strong>{config?.displayPhoneNumber || "Not available yet"}</strong>
              </div>
              <div className="whatsapp-business-card">
                <span>Connection Status</span>
                <strong>{formatStatus(status)}</strong>
              </div>
              <div className="whatsapp-business-card">
                <span>Billing Template</span>
                <strong>
                  {config?.templateStatus === "not_configured"
                    ? "Not configured yet"
                    : config?.templateStatus || "Not configured yet"}
                </strong>
              </div>
              <div className="whatsapp-business-card">
                <span>Phone Registration</span>
                <strong>{formatStatus(phoneRegistrationStatus)}</strong>
              </div>
            </div>
          ) : null}

          {isConnected && dashboardMode === "library" ? (
            <div className="whatsapp-template-section">
              <div className="whatsapp-template-section-header">
                <div>
                  <h3>Template Library</h3>
                  <p>Choose a YNOT-approved message type for your connected WhatsApp number.</p>
                </div>
                <button
                  type="button"
                  className="whatsapp-business-button secondary compact"
                  onClick={() => setDashboardMode("overview")}
                >
                  Back
                </button>
              </div>

              <h4>Billing & Customer Updates</h4>
              {templateLoading ? (
                <div className="whatsapp-business-state">Loading templates...</div>
              ) : (
                <div className="whatsapp-template-list">
                  {templateLibrary.map((item) => {
                    const itemStatus = item.vendorTemplate?.status || "not_configured";
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className="whatsapp-template-card"
                        onClick={() => fetchTemplatePreview(item.key)}
                      >
                        <div>
                          <strong>{item.displayName}</strong>
                          <span>{formatStatus(item.metaCategory)}</span>
                          <p>
                            Send the customer&apos;s bill and YNOT loyalty/reward information
                            from the business&apos;s connected WhatsApp number.
                          </p>
                        </div>
                        <em className={`whatsapp-template-status ${getTemplateStatusTone(itemStatus)}`}>
                          {getTemplateStatusLabel(itemStatus)}
                        </em>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {isConnected && dashboardMode === "preview" && selectedTemplate ? (
            <div className="whatsapp-template-section">
              <div className="whatsapp-template-section-header">
                <div>
                  <h3>{selectedTemplate.template.displayName}</h3>
                  <p>
                    This template will be submitted to Meta for approval for your connected
                    WhatsApp Business account.
                  </p>
                </div>
                <button
                  type="button"
                  className="whatsapp-business-button secondary compact"
                  onClick={() => setDashboardMode("library")}
                >
                  Back
                </button>
              </div>

              <div className="whatsapp-template-meta-grid">
                <div>
                  <span>Template</span>
                  <strong>{selectedTemplate.template.displayName}</strong>
                </div>
                <div>
                  <span>Purpose</span>
                  <strong>{formatStatus(selectedTemplate.template.purpose)}</strong>
                </div>
                <div>
                  <span>Category</span>
                  <strong>{formatStatus(selectedTemplate.template.metaCategory)}</strong>
                </div>
                <div>
                  <span>Language</span>
                  <strong>English</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{getTemplateStatusLabel(selectedTemplateStatus)}</strong>
                </div>
              </div>

              <div className="whatsapp-template-preview">
                <span>Sample message</span>
                <p>{selectedTemplate.preview?.sampleMessage}</p>
              </div>

              {selectedTemplateStatus === "approved" && (
                <div className="whatsapp-business-alert success">
                  Standard Bill is approved and ready for test. Production billing is not enabled yet.
                </div>
              )}
              {selectedTemplateStatus === "pending" && (
                <div className="whatsapp-business-alert warning">
                  Standard Bill is pending Meta approval. Use Check Status to refresh the latest result.
                </div>
              )}
              {selectedTemplateStatus === "rejected" && (
                <div className="whatsapp-business-alert error">
                  {selectedTemplate.vendorTemplate?.lastError
                    ? `Meta rejection reason: ${selectedTemplate.vendorTemplate.lastError}`
                    : "Standard Bill was rejected by Meta. A controlled resubmit path can be added next."}
                </div>
              )}
              {selectedTemplateStatus === "error" && (
                <div className="whatsapp-business-alert error">
                  Standard Bill needs attention before it can be used for testing.
                </div>
              )}

              <div className="whatsapp-business-actions">
                {canSubmitSelectedTemplate && (
                  <button
                    type="button"
                    className="whatsapp-business-button primary"
                    disabled={Boolean(actionLoading)}
                    onClick={() => postTemplateAction(selectedTemplate.template.key, "submit")}
                  >
                    {actionLoading === "submit" ? "Submitting..." : "Submit for Approval"}
                  </button>
                )}
                {canCheckSelectedTemplateStatus && (
                  <button
                    type="button"
                    className="whatsapp-business-button secondary"
                    disabled={Boolean(actionLoading)}
                    onClick={() => postTemplateAction(selectedTemplate.template.key, "check-status")}
                  >
                    {actionLoading === "check-status" ? "Checking..." : "Check Status"}
                  </button>
                )}
                {selectedTemplateStatus === "approved" && (
                  <button
                    type="button"
                    className="whatsapp-business-button primary"
                    disabled={Boolean(actionLoading)}
                    onClick={() => {
                      setTestPanelOpen(true);
                      setError("");
                      setMessage("");
                      setTestResult("");
                      setTestSendError("");
                    }}
                  >
                    Send Test Message
                  </button>
                )}
              </div>

              {testPanelOpen && selectedTemplateStatus === "approved" && (
                <div className="whatsapp-test-panel">
                  <div className="whatsapp-template-section-header">
                    <div>
                      <h3>Send Test Message</h3>
                      <p>
                        Send this approved template from the connected WhatsApp number to a test recipient.
                        Production billing remains disabled.
                      </p>
                    </div>
                  </div>

                  <label className="whatsapp-test-field">
                    <span>Recipient WhatsApp Number</span>
                    <input
                      type="tel"
                      value={recipientPhoneNumber}
                      placeholder="Example: +919381520396"
                      onChange={(event) => setRecipientPhoneNumber(event.target.value)}
                    />
                    <small>Use one full international number, including country code.</small>
                  </label>

                  <div className="whatsapp-test-sample">
                    <h4>Sample Template Values</h4>
                    <div className="whatsapp-test-sample-grid">
                      {sampleFields.map((variable) => (
                        <div key={variable.key}>
                          <span>{SAMPLE_FIELD_LABELS[variable.sourceField] || variable.displayName}</span>
                          <strong>{sampleData[variable.sourceField] || ""}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  {testResult && (
                    <div className="whatsapp-business-alert success">{testResult}</div>
                  )}
                  {testSendError && (
                    <div className="whatsapp-business-alert error">{testSendError}</div>
                  )}

                  <div className="whatsapp-business-actions">
                    <button
                      type="button"
                      className="whatsapp-business-button primary"
                      disabled={Boolean(actionLoading)}
                      onClick={sendTestMessage}
                    >
                      {actionLoading === "test-send" ? "Sending..." : "Send Test"}
                    </button>
                    <button
                      type="button"
                      className="whatsapp-business-button secondary"
                      disabled={Boolean(actionLoading)}
                      onClick={() => {
                        setTestPanelOpen(false);
                        setRecipientPhoneNumber("");
                        setTestResult("");
                        setTestSendError("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {!isConnected ? (
            <div className="whatsapp-business-empty-card">
              <h3>Use your own WhatsApp number</h3>
              <p>
                YNOT will continue sending billing messages through the approved MSG91 setup
                until your Meta WhatsApp Business connection is fully ready.
              </p>
            </div>
          ) : null}

          {dashboardMode === "overview" && (
            <div className="whatsapp-business-actions">
            {isConnected ? (
              <>
	                <button
	                  type="button"
	                  className="whatsapp-business-button primary"
	                  disabled={Boolean(actionLoading) || templateLoading}
	                  onClick={fetchTemplateLibrary}
	                >
	                  {templateLoading ? "Loading..." : "Continue Setup"}
	                </button>
                {shouldShowPhoneRegistration && (
                  <button
                    type="button"
                    className="whatsapp-business-button secondary"
                    disabled={Boolean(actionLoading)}
                    onClick={() => postWhatsappBusinessAction("meta/register-phone")}
                  >
                    {actionLoading === "meta/register-phone"
                      ? "Registering..."
                      : "Register WhatsApp Number"}
                  </button>
                )}
                <button
                  type="button"
                  className="whatsapp-business-button secondary"
                  disabled={Boolean(actionLoading)}
                  onClick={handleDisconnect}
                >
                  {actionLoading === "disconnect" ? "Disconnecting..." : "Disconnect"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="whatsapp-business-button primary"
                disabled={Boolean(actionLoading) || !hasConnectLauncher}
                onClick={launchCentralMetaSignup}
              >
                {actionLoading === "connect" ? "Connecting..." : "Connect WhatsApp"}
              </button>
            )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
