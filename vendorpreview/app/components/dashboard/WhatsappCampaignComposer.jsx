"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import "./WhatsappCampaignComposer.css";

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
  if (!response.ok || !json.success) throw new Error(json.message || "Campaign request failed");
  return json.data || {};
}

function reasonLabel(reason) {
  const labels = {
    INVALID_PHONE: "Invalid phone",
    DUPLICATE_PHONE: "Duplicate phone",
    MARKETING_OPT_OUT: "Opted out",
    MARKETING_CONSENT_REQUIRED: "Consent not recorded",
    MISSING_CUSTOMER_NAME: "Customer name required",
    MISSING_SALON_NAME: "Salon name unavailable",
    MISSING_OFFER_DETAILS: "Offer details required",
  };
  return labels[reason] || String(reason || "").replaceAll("_", " ").toLowerCase();
}

export default function WhatsappCampaignComposer({
  vendorId,
  initialSelection = null,
  campaignId = "",
  onClose,
  onSaved,
}) {
  const [templates, setTemplates] = useState([]);
  const [selection, setSelection] = useState(initialSelection);
  const [campaignName, setCampaignName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [offerDetails, setOfferDetails] = useState("");
  const [recipients, setRecipients] = useState([]);
  const [counts, setCounts] = useState({ selected: 0, eligible: 0, ineligible: 0, excluded: 0 });
  const [previewCustomerId, setPreviewCustomerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const templateData = await request(vendorId, "/campaign-templates");
        if (cancelled) return;
        setTemplates(templateData.templates || []);
        if (campaignId) {
          const data = await request(vendorId, `/campaigns/${encodeURIComponent(campaignId)}`);
          if (cancelled) return;
          const campaign = data.campaign;
          setCampaignName(campaign.campaignName || "");
          setTemplateId(campaign.templateId || "");
          setOfferDetails(campaign.offerDetails || "");
          setSelection({
            mode: campaign.selection.mode,
            segment: campaign.sourceSegment.segment,
            filters: campaign.sourceSegment.filters,
            selectedCustomerIds: campaign.selection.selectedCustomerIds,
            excludedCustomerIds: campaign.selection.excludedCustomerIds,
          });
          setRecipients(campaign.recipients || []);
          setCounts(campaign.counts || {});
          setPreviewCustomerId(campaign.recipients?.[0]?.customerId || "");
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Unable to load campaign builder");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [campaignId, vendorId]);

  async function resolveRecipients(nextSelection = selection, nextTemplateId = templateId) {
    if (!nextSelection) return;
    try {
      setResolving(true);
      setError("");
      const data = await request(vendorId, "/campaign-recipient-preview", {
        method: "POST",
        body: JSON.stringify({
          selection: nextSelection,
          templateId: nextTemplateId || undefined,
          offerDetails,
        }),
      });
      setRecipients(data.recipients || []);
      setCounts(data.counts || {});
      setPreviewCustomerId((current) => (
        data.recipients?.some((item) => item.customerId === current)
          ? current
          : data.recipients?.[0]?.customerId || ""
      ));
    } catch (resolveError) {
      setError(resolveError.message || "Unable to resolve recipients");
    } finally {
      setResolving(false);
    }
  }

  useEffect(() => {
    if (!loading && !campaignId && selection) resolveRecipients(selection, templateId);
    // Initial analytics selection is resolved once; subsequent changes use explicit actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function removeRecipient(customerId) {
    const nextSelection = {
      ...selection,
      selectedCustomerIds: selection.mode === "EXPLICIT"
        ? (selection.selectedCustomerIds || []).filter((id) => id !== customerId)
        : selection.selectedCustomerIds || [],
      excludedCustomerIds: [...new Set([...(selection.excludedCustomerIds || []), customerId])],
    };
    setSelection(nextSelection);
    resolveRecipients(nextSelection, templateId);
  }

  async function saveDraft() {
    if (!campaignName.trim()) {
      setError("Enter a campaign name.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const data = await request(
        vendorId,
        campaignId ? `/campaigns/${encodeURIComponent(campaignId)}` : "/campaigns",
        {
          method: campaignId ? "PATCH" : "POST",
          body: JSON.stringify({ campaignName, templateId, offerDetails, selection }),
        }
      );
      onSaved?.(data.campaign);
      onClose?.();
    } catch (saveError) {
      setError(saveError.message || "Unable to save campaign draft");
    } finally {
      setSaving(false);
    }
  }

  const selectedTemplate = templates.find((template) => template.id === templateId);
  const needsOfferDetails = selectedTemplate?.templateSnapshot?.variableOrder?.includes("offer_details");
  const previewRecipient = recipients.find((item) => item.customerId === previewCustomerId) || recipients[0];

  return (
    <div className="wa-campaign-overlay" role="dialog" aria-modal="true" aria-labelledby="wa-campaign-title">
      <div className="wa-campaign-card">
        <header>
          <div>
            <span>Campaign draft</span>
            <h2 id="wa-campaign-title">{campaignId ? "Edit Campaign" : "Create Marketing Campaign"}</h2>
          </div>
          <button type="button" aria-label="Close campaign builder" onClick={onClose}>×</button>
        </header>
        {error ? <div className="wa-campaign-error">{error}</div> : null}
        {loading ? <div className="wa-campaign-state">Loading campaign...</div> : (
          <div className="wa-campaign-body">
            <section className="wa-campaign-fields">
              <label>Campaign name<input value={campaignName} maxLength={100} onChange={(event) => setCampaignName(event.target.value)} /></label>
              <label>
                Approved WhatsApp template
                <select
                  value={templateId}
                  onChange={(event) => {
                    setTemplateId(event.target.value);
                    resolveRecipients(selection, event.target.value);
                  }}
                >
                  <option value="">Attach an approved template later</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.internalName}</option>)}
                </select>
              </label>
              {!templates.length ? (
                <p className="wa-campaign-guidance">Your campaign can be saved as a draft. Select an approved WhatsApp template when it becomes available.</p>
              ) : null}
              {needsOfferDetails ? (
                <label>Offer details<input value={offerDetails} maxLength={240} onChange={(event) => setOfferDetails(event.target.value)} placeholder="20% off this week" /></label>
              ) : null}
              <button type="button" className="wa-campaign-secondary" onClick={() => resolveRecipients()} disabled={resolving}>
                {resolving ? "Checking recipients..." : "Refresh Eligibility & Preview"}
              </button>
            </section>

            <section className="wa-campaign-summary">
              <strong>{selection?.segment?.replaceAll("_", " ") || "Customer"} segment</strong>
              <div><span>Selected <b>{counts.selected || 0}</b></span><span>Eligible <b>{counts.eligible || 0}</b></span><span>Ineligible <b>{counts.ineligible || 0}</b></span><span>Excluded <b>{counts.excluded || 0}</b></span></div>
            </section>

            <section className="wa-campaign-layout">
              <div className="wa-campaign-recipients">
                <h3>Final recipients</h3>
                {recipients.map((recipient) => (
                  <div className={`wa-campaign-recipient ${recipient.eligible ? "eligible" : "ineligible"}`} key={recipient.customerId}>
                    <button type="button" onClick={() => setPreviewCustomerId(recipient.customerId)}>
                      <strong>{recipient.displayName || recipient.normalizedPhone || "Customer"}</strong>
                      <small>{recipient.normalizedPhone ? `+${recipient.normalizedPhone}` : "Invalid phone"}</small>
                      {!recipient.eligible ? <em>{recipient.exclusionReasons.map(reasonLabel).join(", ")}</em> : <em>Eligible</em>}
                    </button>
                    <button type="button" aria-label={`Remove ${recipient.displayName || "customer"}`} onClick={() => removeRecipient(recipient.customerId)}>Remove</button>
                  </div>
                ))}
                {!recipients.length ? <p>No recipients selected.</p> : null}
              </div>
              <div className="wa-campaign-preview">
                <h3>Customer preview</h3>
                {selectedTemplate?.templateSnapshot?.headerType === "IMAGE" && selectedTemplate.templateSnapshot.primaryMedia?.url ? (
                  <img src={selectedTemplate.templateSnapshot.primaryMedia.url} alt="Approved promotional header" />
                ) : null}
                {selectedTemplate?.templateSnapshot?.headerType === "DOCUMENT" ? (
                  <a href={selectedTemplate.templateSnapshot.primaryMedia?.url} target="_blank" rel="noreferrer">PDF brochure: {selectedTemplate.templateSnapshot.primaryMedia?.originalName || "Open document"}</a>
                ) : null}
                <p>{previewRecipient?.preview || "Select a template and recipient to preview the approved message."}</p>
              </div>
            </section>
          </div>
        )}
        <footer>
          <button type="button" className="wa-campaign-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="wa-campaign-primary" onClick={saveDraft} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Campaign Draft"}
          </button>
        </footer>
      </div>
    </div>
  );
}

