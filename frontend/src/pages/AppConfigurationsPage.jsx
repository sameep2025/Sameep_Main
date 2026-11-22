import React, { useState, useEffect } from "react";
import API from "../api";
import PromotionalPostersConfig from "../components/PromotionalPostersConfig";

const WHATSAPP_BILLING_VARIABLE_OPTIONS = [
  { value: "customerName", label: "Customer Name" },
  { value: "vendorName", label: "Vendor Name" },
  { value: "billAmount", label: "Bill Amount" },
  { value: "earned", label: "Points Earned" },
  { value: "redeemed", label: "Points Redeemed" },
  { value: "finalPaid", label: "Final Paid" },
  { value: "balance", label: "Loyalty Balance" },
  { value: "billUrl", label: "Bill URL" },
  { value: "billPath", label: "Bill Path" },
];

const TEMPLATE_PROFILE_PRESETS = {
  legacy_7_param: {
    bodyVariables: [
      "customerName",
      "vendorName",
      "billAmount",
      "earned",
      "redeemed",
      "finalPaid",
      "balance",
    ],
    buttonUrlVariable: "",
  },
  bill_url_7_param: {
    bodyVariables: [
      "vendorName",
      "billAmount",
      "earned",
      "redeemed",
      "finalPaid",
      "balance",
      "billUrl",
    ],
    buttonUrlVariable: "",
  },
  view_bill_dynamic_url: {
    bodyVariables: [
      "vendorName",
      "billAmount",
      "earned",
      "redeemed",
      "finalPaid",
      "balance",
    ],
    buttonUrlVariable: "billPath",
  },
};

const WHATSAPP_BILLING_TEMPLATE_LIBRARY_KEY = "whatsapp_billing_template_library_v1";
const WHATSAPP_ENQUIRY_TEMPLATE_LIBRARY_KEY = "whatsapp_enquiry_template_library_v1";
const DEFAULT_WHATSAPP_ENQUIRY_TEMPLATE_BODY =
  "You have received a new enquiry. Open Dashboard > Enquiries to review the details and respond.";

function AppConfigurationsPage() {
  const [availableHours, setAvailableHours] = useState([]);
  const [selectedHour, setSelectedHour] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newHour, setNewHour] = useState("");
  const [adminPasscode, setAdminPasscode] = useState("");
  const [adminPasscodeConfigured, setAdminPasscodeConfigured] = useState(false);
  const [savingAdminPasscode, setSavingAdminPasscode] = useState(false);
  const [adminPasscodeError, setAdminPasscodeError] = useState("");
  const [adminPasscodeMessage, setAdminPasscodeMessage] = useState("");
  const [publicSiteContact, setPublicSiteContact] = useState({
    addressLine1: "",
    addressLine2: "",
    phone: "",
  });
  const [savingPublicSiteContact, setSavingPublicSiteContact] = useState(false);
  const [publicSiteContactMessage, setPublicSiteContactMessage] = useState("");
  const [whatsAppBillingConfig, setWhatsAppBillingConfig] = useState({
    templateProfile: "legacy_7_param",
    templateName: "",
    language: "en",
    buttonIndex: 0,
    publicBillBaseUrl: "",
    ttlDays: 30,
    bodyVariables: TEMPLATE_PROFILE_PRESETS.legacy_7_param.bodyVariables,
    buttonUrlVariable: "",
  });
  const [savingWhatsAppBilling, setSavingWhatsAppBilling] = useState(false);
  const [whatsAppBillingMessage, setWhatsAppBillingMessage] = useState("");
  const [templateLibrary, setTemplateLibrary] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateDraftName, setTemplateDraftName] = useState("");
  const [whatsAppEnquiryConfig, setWhatsAppEnquiryConfig] = useState({
    templateName: "vendor_enquiry",
    language: "en",
    body: DEFAULT_WHATSAPP_ENQUIRY_TEMPLATE_BODY,
  });
  const [enquiryTemplateLibrary, setEnquiryTemplateLibrary] = useState([]);
  const [selectedEnquiryTemplateId, setSelectedEnquiryTemplateId] = useState("");
  const [enquiryTemplateDraftName, setEnquiryTemplateDraftName] = useState("vendor_enquiry");
  const [whatsAppEnquiryMessage, setWhatsAppEnquiryMessage] = useState("");
  const [savingWhatsAppEnquiry, setSavingWhatsAppEnquiry] = useState(false);
  const requiresPublicBillBaseUrl =
    whatsAppBillingConfig.templateProfile === "view_bill_dynamic_url" ||
    whatsAppBillingConfig.templateProfile === "bill_url_7_param";

  const persistTemplateLibrary = (nextTemplates) => {
    setTemplateLibrary(nextTemplates);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        WHATSAPP_BILLING_TEMPLATE_LIBRARY_KEY,
        JSON.stringify(nextTemplates)
      );
    }
  };

  const buildTemplateSnapshot = (forcedId) => ({
    id: forcedId || selectedTemplateId || `tpl_${Date.now()}`,
    name: (templateDraftName || whatsAppBillingConfig.templateName || "Untitled Template").trim(),
    config: {
      ...whatsAppBillingConfig,
      bodyVariables: Array.isArray(whatsAppBillingConfig.bodyVariables)
        ? [...whatsAppBillingConfig.bodyVariables]
        : [],
    },
    updatedAt: new Date().toISOString(),
  });

  const persistEnquiryTemplateLibrary = (nextTemplates) => {
    setEnquiryTemplateLibrary(nextTemplates);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        WHATSAPP_ENQUIRY_TEMPLATE_LIBRARY_KEY,
        JSON.stringify(nextTemplates)
      );
    }
  };

  const buildEnquiryTemplateSnapshot = (forcedId) => ({
    id: forcedId || selectedEnquiryTemplateId || `enquiry_tpl_${Date.now()}`,
    name: (
      enquiryTemplateDraftName ||
      whatsAppEnquiryConfig.templateName ||
      "Untitled Enquiry Template"
    ).trim(),
    config: {
      ...whatsAppEnquiryConfig,
    },
    updatedAt: new Date().toISOString(),
  });

  // Load config from backend on mount
  useEffect(() => {
    const fetchConfig = async () => {
      if (typeof window !== "undefined") {
        try {
          const rawTemplates = localStorage.getItem(WHATSAPP_BILLING_TEMPLATE_LIBRARY_KEY);
          const parsedTemplates = rawTemplates ? JSON.parse(rawTemplates) : [];
          if (Array.isArray(parsedTemplates)) {
            setTemplateLibrary(parsedTemplates);
          }
        } catch (err) {
          console.error("Failed to load WhatsApp billing template library", err);
        }

        try {
          const rawEnquiryTemplates = localStorage.getItem(
            WHATSAPP_ENQUIRY_TEMPLATE_LIBRARY_KEY
          );
          const parsedEnquiryTemplates = rawEnquiryTemplates
            ? JSON.parse(rawEnquiryTemplates)
            : [];
          if (Array.isArray(parsedEnquiryTemplates)) {
            setEnquiryTemplateLibrary(parsedEnquiryTemplates);
          }
        } catch (err) {
          console.error("Failed to load WhatsApp enquiry template library", err);
        }
      }

      try {
        const res = await API.get("/api/app-config/session-validity");
        const { availableHours: hrs = [], selectedHour: sel = null } = res.data || {};
        setAvailableHours(Array.isArray(hrs) ? hrs : []);
        setSelectedHour(typeof sel === "number" ? sel : null);
      } catch (err) {
        console.error("Failed to load session validity config", err);
      }

      try {
        const res = await API.get("/api/app-config/admin-passcode");
        setAdminPasscodeConfigured(Boolean(res.data?.configured));
        setAdminPasscode("");
      } catch (err) {
        console.error("Failed to load admin passcode status", err);
      }

      try {
        const res = await API.get("/api/app-config/public-site-contact");
        setPublicSiteContact({
          addressLine1: res.data?.addressLine1 || "",
          addressLine2: res.data?.addressLine2 || "",
          phone: res.data?.phone || "",
        });
      } catch (err) {
        console.error("Failed to load public site contact", err);
      }

      try {
        const res = await API.get("/api/app-config/whatsapp-billing");
        setWhatsAppBillingConfig({
          templateProfile: res.data?.templateProfile || "legacy_7_param",
          templateName: res.data?.templateName || "",
          language: res.data?.language || "en",
          buttonIndex: Number(res.data?.buttonIndex || 0),
          publicBillBaseUrl: res.data?.publicBillBaseUrl || "",
          ttlDays: Number(res.data?.ttlDays || 30),
          bodyVariables:
            Array.isArray(res.data?.bodyVariables) && res.data.bodyVariables.length > 0
              ? res.data.bodyVariables
              : TEMPLATE_PROFILE_PRESETS[res.data?.templateProfile || "legacy_7_param"]
                  ?.bodyVariables || TEMPLATE_PROFILE_PRESETS.legacy_7_param.bodyVariables,
          buttonUrlVariable:
            res.data?.buttonUrlVariable ||
            TEMPLATE_PROFILE_PRESETS[res.data?.templateProfile || "legacy_7_param"]
              ?.buttonUrlVariable ||
            "",
        });
        setTemplateDraftName(res.data?.templateName || "");
      } catch (err) {
        console.error("Failed to load WhatsApp billing config", err);
      }

      try {
        const res = await API.get("/api/app-config/whatsapp-enquiry");
        setWhatsAppEnquiryConfig({
          templateName: res.data?.templateName || "vendor_enquiry",
          language: res.data?.language || "en",
          body: res.data?.body || DEFAULT_WHATSAPP_ENQUIRY_TEMPLATE_BODY,
        });
        setEnquiryTemplateDraftName(res.data?.templateName || "vendor_enquiry");
      } catch (err) {
        console.error("Failed to load WhatsApp enquiry config", err);
      }
    };

    fetchConfig();
  }, []);

  const handleSaveAdminPasscode = async () => {
    const code = (adminPasscode || "").trim();
    if (!/^\d{4}$/.test(code)) {
      setAdminPasscodeError("Passcode must be a 4-digit number");
      return;
    }
    setAdminPasscodeError("");
    setAdminPasscodeMessage("");
    try {
      setSavingAdminPasscode(true);
      await API.post("/api/app-config/admin-passcode", { adminPasscode: code });
      setAdminPasscode("");
      setAdminPasscodeConfigured(true);
      setAdminPasscodeMessage("Passcode saved securely.");
    } catch (err) {
      console.error("Failed to save admin passcode", err);
      setAdminPasscodeError("Failed to save passcode");
    } finally {
      setSavingAdminPasscode(false);
    }
  };

  const handleSavePublicSiteContact = async () => {
    try {
      setSavingPublicSiteContact(true);
      setPublicSiteContactMessage("");
      await API.post("/api/app-config/public-site-contact", publicSiteContact);
      setPublicSiteContactMessage("Contact details saved.");
    } catch (err) {
      console.error("Failed to save public site contact", err);
      setPublicSiteContactMessage("Failed to save contact details.");
    } finally {
      setSavingPublicSiteContact(false);
    }
  };

  const handleSaveWhatsAppBilling = async () => {
    try {
      setSavingWhatsAppBilling(true);
      setWhatsAppBillingMessage("");
      await API.post("/api/app-config/whatsapp-billing", {
        templateProfile: whatsAppBillingConfig.templateProfile || "legacy_7_param",
        templateName: (whatsAppBillingConfig.templateName || "").trim(),
        language: (whatsAppBillingConfig.language || "en").trim() || "en",
        buttonIndex: Number(whatsAppBillingConfig.buttonIndex || 0),
        publicBillBaseUrl: (whatsAppBillingConfig.publicBillBaseUrl || "").trim(),
        ttlDays: Number(whatsAppBillingConfig.ttlDays || 30),
        bodyVariables: Array.isArray(whatsAppBillingConfig.bodyVariables)
          ? whatsAppBillingConfig.bodyVariables
          : [],
        buttonUrlVariable: whatsAppBillingConfig.buttonUrlVariable || "",
      });
      setWhatsAppBillingMessage("WhatsApp billing configuration saved.");
    } catch (err) {
      console.error("Failed to save WhatsApp billing config", err);
      setWhatsAppBillingMessage(
        err?.response?.data?.message || "Failed to save WhatsApp billing configuration."
      );
    } finally {
      setSavingWhatsAppBilling(false);
    }
  };

  const handleTemplateProfileChange = (nextProfile) => {
    const preset = TEMPLATE_PROFILE_PRESETS[nextProfile] || TEMPLATE_PROFILE_PRESETS.legacy_7_param;
    setWhatsAppBillingConfig((prev) => ({
      ...prev,
      templateProfile: nextProfile,
      bodyVariables: preset.bodyVariables,
      buttonUrlVariable: preset.buttonUrlVariable,
    }));
  };

  const handleLoadTemplate = (templateId) => {
    const selectedTemplate = templateLibrary.find((template) => template.id === templateId);
    if (!selectedTemplate?.config) return;

    setSelectedTemplateId(selectedTemplate.id);
    setTemplateDraftName(selectedTemplate.name || selectedTemplate.config.templateName || "");
    setWhatsAppBillingConfig({
      ...selectedTemplate.config,
      bodyVariables: Array.isArray(selectedTemplate.config.bodyVariables)
        ? [...selectedTemplate.config.bodyVariables]
        : [],
    });
    setWhatsAppBillingMessage(`Loaded template "${selectedTemplate.name || selectedTemplate.config.templateName}".`);
  };

  const handleSaveTemplateAsNew = () => {
    const snapshot = buildTemplateSnapshot(`tpl_${Date.now()}`);
    const nextTemplates = [snapshot, ...templateLibrary];
    persistTemplateLibrary(nextTemplates);
    setSelectedTemplateId(snapshot.id);
    setTemplateDraftName(snapshot.name);
    setWhatsAppBillingMessage(`Saved template "${snapshot.name}" in this admin browser.`);
  };

  const handleUpdateSelectedTemplate = () => {
    if (!selectedTemplateId) {
      setWhatsAppBillingMessage("Select or save a template first.");
      return;
    }

    const snapshot = buildTemplateSnapshot(selectedTemplateId);
    const nextTemplates = templateLibrary.map((template) =>
      template.id === selectedTemplateId ? snapshot : template
    );
    persistTemplateLibrary(nextTemplates);
    setTemplateDraftName(snapshot.name);
    setWhatsAppBillingMessage(`Updated template "${snapshot.name}" in this admin browser.`);
  };

  const handleDeleteTemplate = (templateId) => {
    const nextTemplates = templateLibrary.filter((template) => template.id !== templateId);
    persistTemplateLibrary(nextTemplates);
    if (selectedTemplateId === templateId) {
      setSelectedTemplateId("");
    }
  };

  const handleBodyVariableChange = (index, value) => {
    setWhatsAppBillingConfig((prev) => {
      const nextBodyVariables = Array.isArray(prev.bodyVariables) ? [...prev.bodyVariables] : [];
      nextBodyVariables[index] = value;
      return {
        ...prev,
        bodyVariables: nextBodyVariables,
      };
    });
  };

  const handleLoadEnquiryTemplate = (templateId) => {
    const selectedTemplate = enquiryTemplateLibrary.find((template) => template.id === templateId);
    if (!selectedTemplate?.config) return;

    setSelectedEnquiryTemplateId(selectedTemplate.id);
    setEnquiryTemplateDraftName(
      selectedTemplate.name || selectedTemplate.config.templateName || ""
    );
    setWhatsAppEnquiryConfig({
      templateName: selectedTemplate.config.templateName || "vendor_enquiry",
      language: selectedTemplate.config.language || "en",
      body: selectedTemplate.config.body || DEFAULT_WHATSAPP_ENQUIRY_TEMPLATE_BODY,
    });
    setWhatsAppEnquiryMessage(
      `Loaded enquiry template "${selectedTemplate.name || selectedTemplate.config.templateName}".`
    );
  };

  const handleSaveEnquiryTemplateAsNew = () => {
    const snapshot = buildEnquiryTemplateSnapshot(`enquiry_tpl_${Date.now()}`);
    const nextTemplates = [snapshot, ...enquiryTemplateLibrary];
    persistEnquiryTemplateLibrary(nextTemplates);
    setSelectedEnquiryTemplateId(snapshot.id);
    setEnquiryTemplateDraftName(snapshot.name);
    setWhatsAppEnquiryMessage(`Saved enquiry template "${snapshot.name}" in this admin browser.`);
  };

  const handleUpdateSelectedEnquiryTemplate = () => {
    if (!selectedEnquiryTemplateId) {
      setWhatsAppEnquiryMessage("Select or save an enquiry template first.");
      return;
    }

    const snapshot = buildEnquiryTemplateSnapshot(selectedEnquiryTemplateId);
    const nextTemplates = enquiryTemplateLibrary.map((template) =>
      template.id === selectedEnquiryTemplateId ? snapshot : template
    );
    persistEnquiryTemplateLibrary(nextTemplates);
    setEnquiryTemplateDraftName(snapshot.name);
    setWhatsAppEnquiryMessage(
      `Updated enquiry template "${snapshot.name}" in this admin browser.`
    );
  };

  const handleDeleteEnquiryTemplate = (templateId) => {
    const nextTemplates = enquiryTemplateLibrary.filter((template) => template.id !== templateId);
    persistEnquiryTemplateLibrary(nextTemplates);
    if (selectedEnquiryTemplateId === templateId) {
      setSelectedEnquiryTemplateId("");
    }
  };

  const handleSaveWhatsAppEnquiry = async () => {
    try {
      setSavingWhatsAppEnquiry(true);
      setWhatsAppEnquiryMessage("");
      await API.post("/api/app-config/whatsapp-enquiry", {
        enabled: true,
        templateName: (whatsAppEnquiryConfig.templateName || "").trim(),
        language: (whatsAppEnquiryConfig.language || "en").trim() || "en",
        body: (whatsAppEnquiryConfig.body || "").trim(),
      });
      setWhatsAppEnquiryMessage("WhatsApp enquiry configuration saved.");
    } catch (err) {
      console.error("Failed to save WhatsApp enquiry config", err);
      setWhatsAppEnquiryMessage(
        err?.response?.data?.message || "Failed to save WhatsApp enquiry configuration."
      );
    } finally {
      setSavingWhatsAppEnquiry(false);
    }
  };

  const saveConfig = async (hours, selected) => {
    try {
      await API.post("/api/app-config/session-validity", {
        availableHours: hours,
        selectedHour: selected,
      });
    } catch (err) {
      console.error("Failed to save session validity config", err);
    }
  };

  const handleSaveHour = () => {
    const value = Number(newHour);
    if (!value || value <= 0) {
      return;
    }

    if (!availableHours.includes(value)) {
      const updated = [...availableHours, value].sort((a, b) => a - b);
      setAvailableHours(updated);
      const newSelected = selectedHour != null ? selectedHour : value;
      setSelectedHour(newSelected);
      saveConfig(updated, newSelected);
    } else {
      const newSelected = selectedHour != null ? selectedHour : value;
      setSelectedHour(newSelected);
      saveConfig(availableHours, newSelected);
    }

    setNewHour("");
    setShowModal(false);
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px", color: "#333" }}>
        App Configurations
      </h1>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "20px",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <h2 style={{ fontSize: "18px", marginBottom: "10px", color: "#00AEEF" }}>
          Session Management
        </h2>
        <p style={{ marginBottom: "15px", color: "#555" }}>
          Configure how long a customer session should remain active before
          requiring a new OTP login.
        </p>

        <div style={{ marginBottom: "15px" }}>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              padding: "8px 14px",
              borderRadius: "4px",
              border: "1px solid #00AEEF",
              background: "#00AEEF",
              color: "#fff",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            + Add Session Hour
          </button>
        </div>

        {availableHours.length > 0 && (
          <div style={{ marginBottom: "10px" }}>
            {availableHours.map((hour) => (
              <label key={hour} style={{ marginRight: "16px", fontSize: "14px" }}>
                <input
                  type="radio"
                  name="sessionHour"
                  value={hour}
                  checked={selectedHour === hour}
                  onChange={() => {
                    setSelectedHour(hour);
                    saveConfig(availableHours, hour);
                  }}
                  style={{ marginRight: "4px" }}
                />
                {hour} hrs
              </label>
            ))}
          </div>
        )}

        {selectedHour && (
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#555" }}>
            Selected session validity: <strong>{selectedHour} hrs</strong>
          </div>
        )}
      </div>

      {/* Admin Passcode */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "20px",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <h2 style={{ fontSize: "18px", marginBottom: "10px", color: "#00AEEF" }}>
          Admin Passcode
        </h2>
        <p style={{ marginBottom: "15px", color: "#555" }}>
          Set a 4-digit passcode used for sensitive admin actions. This can be
          changed at any time.
        </p>
        <p style={{ marginBottom: "10px", color: "#555", fontSize: "13px" }}>
          Status: {adminPasscodeConfigured ? "Configured" : "Not configured"}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <input
            type="password"
            maxLength={4}
            value={adminPasscode}
            placeholder="••••"
            autoComplete="new-password"
            aria-label="New admin passcode"
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              setAdminPasscode(v.slice(0, 4));
            }}
            style={{
              width: "80px",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              textAlign: "center",
              letterSpacing: "4px",
              fontWeight: "bold",
            }}
          />
          <button
            type="button"
            onClick={handleSaveAdminPasscode}
            disabled={savingAdminPasscode}
            style={{
              padding: "8px 14px",
              borderRadius: "4px",
              border: "1px solid #00AEEF",
              background: savingAdminPasscode ? "#93c5fd" : "#00AEEF",
              color: "#fff",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            {savingAdminPasscode ? "Saving..." : "Save Passcode"}
          </button>
        </div>
        {adminPasscodeError && (
          <div style={{ color: "#b91c1c", fontSize: "13px" }}>{adminPasscodeError}</div>
        )}
        {adminPasscodeMessage && (
          <div style={{ color: "#166534", fontSize: "13px" }}>{adminPasscodeMessage}</div>
        )}
      </div>

      <PromotionalPostersConfig />

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "20px",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <h2 style={{ fontSize: "18px", marginBottom: "10px", color: "#00AEEF" }}>
          Public Contact Details
        </h2>
        <p style={{ marginBottom: "15px", color: "#555" }}>
          Configure the address and phone number used by public-facing YNOT pages.
        </p>

        <div style={{ display: "grid", gap: "12px", maxWidth: "520px" }}>
          <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
            <span>Address line 1</span>
            <input
              type="text"
              value={publicSiteContact.addressLine1}
              onChange={(e) =>
                setPublicSiteContact((prev) => ({
                  ...prev,
                  addressLine1: e.target.value,
                }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
            <span>Address line 2</span>
            <input
              type="text"
              value={publicSiteContact.addressLine2}
              onChange={(e) =>
                setPublicSiteContact((prev) => ({
                  ...prev,
                  addressLine2: e.target.value,
                }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
            <span>Phone number</span>
            <input
              type="text"
              value={publicSiteContact.phone}
              onChange={(e) =>
                setPublicSiteContact((prev) => ({
                  ...prev,
                  phone: e.target.value,
                }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
            <button
              type="button"
              onClick={handleSavePublicSiteContact}
              disabled={savingPublicSiteContact}
              style={{
                padding: "10px 14px",
                borderRadius: "4px",
                border: "1px solid #00AEEF",
                background: savingPublicSiteContact ? "#93c5fd" : "#00AEEF",
                color: "#fff",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              {savingPublicSiteContact ? "Saving..." : "Save Contact Details"}
            </button>

            {publicSiteContactMessage ? (
              <span
                style={{
                  fontSize: "13px",
                  color: publicSiteContactMessage.includes("Failed")
                    ? "#b91c1c"
                    : "#166534",
                }}
              >
                {publicSiteContactMessage}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "20px",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <h2 style={{ fontSize: "18px", marginBottom: "10px", color: "#00AEEF" }}>
          WhatsApp Enquiry Alerts
        </h2>
        <p style={{ marginBottom: "15px", color: "#555" }}>
          Prepare the approved vendor enquiry template and keep room for additional templates later.
        </p>

        <div style={{ display: "grid", gap: "12px", maxWidth: "640px" }}>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "14px",
              background: "#f8fafc",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "14px", color: "#333", fontWeight: 600 }}>
                Template Library
              </span>
              <input
                type="text"
                value={enquiryTemplateDraftName}
                onChange={(e) => setEnquiryTemplateDraftName(e.target.value)}
                placeholder="Template label for admin use"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  background: "#fff",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSaveEnquiryTemplateAsNew}
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid #0284c7",
                  background: "#0284c7",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Save As New
              </button>
              <button
                type="button"
                onClick={handleUpdateSelectedEnquiryTemplate}
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid #94a3b8",
                  background: "#fff",
                  color: "#334155",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Update Selected
              </button>
            </div>

            {enquiryTemplateLibrary.length > 0 ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {enquiryTemplateLibrary.map((template) => (
                  <div
                    key={template.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      border:
                        template.id === selectedEnquiryTemplateId
                          ? "1px solid #38bdf8"
                          : "1px solid #e5e7eb",
                      background: "#fff",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#1f2937" }}>
                        {template.name || template.config?.templateName || "Untitled Enquiry Template"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {template.config?.templateName || "No template name"} ·{" "}
                        {template.config?.language || "en"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleLoadEnquiryTemplate(template.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "4px",
                          border: "1px solid #22c55e",
                          background: "#22c55e",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEnquiryTemplate(template.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "4px",
                          border: "1px solid #ef4444",
                          background: "#fff",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                Save reusable WhatsApp enquiry templates here for quick switching in this admin
                browser. Backend save wiring can be added next.
              </p>
            )}
          </div>

          <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
            <span>Template name</span>
            <input
              type="text"
              value={whatsAppEnquiryConfig.templateName}
              onChange={(e) =>
                setWhatsAppEnquiryConfig((prev) => ({
                  ...prev,
                  templateName: e.target.value,
                }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333", maxWidth: "220px" }}>
            <span>Language</span>
            <input
              type="text"
              value={whatsAppEnquiryConfig.language}
              onChange={(e) =>
                setWhatsAppEnquiryConfig((prev) => ({
                  ...prev,
                  language: e.target.value,
                }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
            <span>Message body</span>
            <textarea
              rows={4}
              value={whatsAppEnquiryConfig.body}
              onChange={(e) =>
                setWhatsAppEnquiryConfig((prev) => ({
                  ...prev,
                  body: e.target.value,
                }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </label>

          <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
            Current default: static vendor alert with no variables. This UI is intentionally ready
            for multiple enquiry templates later.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
            <button
              type="button"
              onClick={handleSaveWhatsAppEnquiry}
              disabled={savingWhatsAppEnquiry}
              style={{
                padding: "10px 14px",
                borderRadius: "4px",
                border: "1px solid #00AEEF",
                background: savingWhatsAppEnquiry ? "#93c5fd" : "#00AEEF",
                color: "#fff",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              {savingWhatsAppEnquiry ? "Saving..." : "Save WhatsApp Enquiry"}
            </button>
          </div>

          {whatsAppEnquiryMessage ? (
            <span
              style={{
                fontSize: "13px",
                color:
                  whatsAppEnquiryMessage.includes("Failed") ||
                  whatsAppEnquiryMessage.includes("required")
                    ? "#b91c1c"
                    : whatsAppEnquiryMessage.includes("Select")
                    ? "#b45309"
                    : "#166534",
              }}
            >
              {whatsAppEnquiryMessage}
            </span>
          ) : null}
        </div>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "20px",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <h2 style={{ fontSize: "18px", marginBottom: "10px", color: "#00AEEF" }}>
          WhatsApp Billing
        </h2>
        <p style={{ marginBottom: "15px", color: "#555" }}>
          Configure the approved bill template and secure bill link used in WhatsApp.
        </p>

        <div style={{ display: "grid", gap: "12px", maxWidth: "640px" }}>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "14px",
              background: "#f8fafc",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "14px", color: "#333", fontWeight: 600 }}>
                Template Library
              </span>
              <input
                type="text"
                value={templateDraftName}
                onChange={(e) => setTemplateDraftName(e.target.value)}
                placeholder="Template label for admin use"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  background: "#fff",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSaveTemplateAsNew}
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid #0284c7",
                  background: "#0284c7",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Save As New
              </button>
              <button
                type="button"
                onClick={handleUpdateSelectedTemplate}
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  border: "1px solid #94a3b8",
                  background: "#fff",
                  color: "#334155",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Update Selected
              </button>
            </div>

            {templateLibrary.length > 0 ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {templateLibrary.map((template) => (
                  <div
                    key={template.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      border:
                        template.id === selectedTemplateId
                          ? "1px solid #38bdf8"
                          : "1px solid #e5e7eb",
                      background: "#fff",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#1f2937" }}>
                        {template.name || template.config?.templateName || "Untitled Template"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {template.config?.templateName || "No template name"} ·{" "}
                        {template.config?.templateProfile || "legacy_7_param"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleLoadTemplate(template.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "4px",
                          border: "1px solid #22c55e",
                          background: "#22c55e",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(template.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "4px",
                          border: "1px solid #ef4444",
                          background: "#fff",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                Save reusable WhatsApp billing templates here for quick switching in this admin
                browser. The active config is still saved separately below.
              </p>
            )}
          </div>

          <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
            <span>Template profile</span>
            <select
              value={whatsAppBillingConfig.templateProfile}
              onChange={(e) => handleTemplateProfileChange(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                background: "#fff",
              }}
            >
              <option value="legacy_7_param">Legacy Bill (7 params, no button)</option>
              <option value="bill_url_7_param">Bill URL In Body (7 params, no button)</option>
              <option value="view_bill_dynamic_url">View Bill Button (6 params + URL button)</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
            <span>Template name</span>
            <input
              type="text"
              value={whatsAppBillingConfig.templateName}
              onChange={(e) =>
                setWhatsAppBillingConfig((prev) => ({
                  ...prev,
                  templateName: e.target.value,
                }))
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
              <span>Language</span>
              <input
                type="text"
                value={whatsAppBillingConfig.language}
                onChange={(e) =>
                  setWhatsAppBillingConfig((prev) => ({
                    ...prev,
                    language: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
              <span>Button index</span>
              <input
                type="number"
                min="0"
                value={whatsAppBillingConfig.buttonIndex}
                onChange={(e) =>
                  setWhatsAppBillingConfig((prev) => ({
                    ...prev,
                    buttonIndex: e.target.value,
                  }))
                }
                disabled={whatsAppBillingConfig.templateProfile !== "view_bill_dynamic_url"}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
              <span>Link validity (days)</span>
              <input
                type="number"
                min="1"
                value={whatsAppBillingConfig.ttlDays}
                onChange={(e) =>
                  setWhatsAppBillingConfig((prev) => ({
                    ...prev,
                    ttlDays: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                }}
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
            <span>Public bill base URL</span>
            <input
              type="text"
              value={whatsAppBillingConfig.publicBillBaseUrl}
              onChange={(e) =>
                setWhatsAppBillingConfig((prev) => ({
                  ...prev,
                  publicBillBaseUrl: e.target.value,
                }))
              }
              placeholder="https://your-preview-domain.com"
              disabled={!requiresPublicBillBaseUrl}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            />
          </label>

          <div style={{ display: "grid", gap: "10px" }}>
            <span style={{ fontSize: "14px", color: "#333" }}>Body variable order</span>
            {Array.isArray(whatsAppBillingConfig.bodyVariables)
              ? whatsAppBillingConfig.bodyVariables.map((variableName, index) => (
                  <label
                    key={`billing-body-variable-${index}`}
                    style={{ display: "grid", gap: "6px", fontSize: "13px", color: "#555" }}
                  >
                    <span>{`Variable ${index + 1}`}</span>
                    <select
                      value={variableName}
                      onChange={(e) => handleBodyVariableChange(index, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        background: "#fff",
                      }}
                    >
                      {WHATSAPP_BILLING_VARIABLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))
              : null}
          </div>

          {whatsAppBillingConfig.templateProfile === "view_bill_dynamic_url" ? (
            <label style={{ display: "grid", gap: "6px", fontSize: "14px", color: "#333" }}>
              <span>Button URL variable</span>
              <select
                value={whatsAppBillingConfig.buttonUrlVariable || "billPath"}
                onChange={(e) =>
                  setWhatsAppBillingConfig((prev) => ({
                    ...prev,
                    buttonUrlVariable: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  background: "#fff",
                }}
              >
                <option value="billPath">Bill Path</option>
                <option value="billUrl">Bill URL</option>
              </select>
            </label>
          ) : null}

          <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
            {whatsAppBillingConfig.templateProfile === "view_bill_dynamic_url"
              ? "Use this profile for templates like bill_production that have 6 body variables and a Visit Website button with a dynamic URL."
              : whatsAppBillingConfig.templateProfile === "bill_url_7_param"
              ? "Use this profile for templates like bill_prod that have 7 body variables including the bill URL in the message body. Public bill base URL is required."
              : "Use this profile for templates like bill that have 7 body variables and no button."}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
            <button
              type="button"
              onClick={handleSaveWhatsAppBilling}
              disabled={savingWhatsAppBilling}
              style={{
                padding: "10px 14px",
                borderRadius: "4px",
                border: "1px solid #00AEEF",
                background: savingWhatsAppBilling ? "#93c5fd" : "#00AEEF",
                color: "#fff",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              {savingWhatsAppBilling ? "Saving..." : "Save WhatsApp Billing"}
            </button>

            {whatsAppBillingMessage ? (
              <span
                style={{
                  fontSize: "13px",
                  color: whatsAppBillingMessage.includes("Failed")
                    ? "#b91c1c"
                    : "#166534",
                }}
              >
                {whatsAppBillingMessage}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "20px",
              borderRadius: "8px",
              width: "320px",
              boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                marginBottom: "10px",
                color: "#333",
              }}
            >
              Add Session Hour
            </h3>
            <label style={{ fontSize: "14px", display: "block", marginBottom: "6px" }}>
              Enter hours
            </label>
            <input
              type="number"
              min="1"
              value={newHour}
              onChange={(e) => setNewHour(e.target.value)}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                marginBottom: "12px",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setNewHour("");
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  background: "#f5f5f5",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveHour}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid #00AEEF",
                  background: "#00AEEF",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppConfigurationsPage;
