"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import {
  MARKETING_PLACEHOLDERS,
  MARKETING_PURPOSES,
  getMarketingPurposeLabel,
  renderMarketingTemplatePreview,
  validateMarketingDraft,
} from "./whatsappMarketingTemplate.mjs";
import "./WhatsappMarketingDashboard.css";
import WhatsappCampaignComposer from "./WhatsappCampaignComposer";
import WhatsappMarketingTestSend from "./WhatsappMarketingTestSend";

const EMPTY_FORM = {
  internalName: "",
  purpose: "PROMOTIONAL_OFFER",
  messageBody: "Hi {{customer_name}}, {{offer_details}} at {{salon_name}}.",
  media: {
    images: [],
    brochure: null,
    primary: { type: "NONE", key: "" },
  },
  language: "en",
};

function emptyForm() {
  return {
    ...EMPTY_FORM,
    media: { images: [], brochure: null, primary: { type: "NONE", key: "" } },
  };
}

function normalizeMedia(template = {}) {
  if (template.media) {
    return {
      images: Array.isArray(template.media.images) ? template.media.images : [],
      brochure: template.media.brochure || null,
      primary: template.media.primary || { type: "NONE", key: "" },
    };
  }
  return template.image
    ? {
        images: [template.image],
        brochure: null,
        primary: { type: "IMAGE", key: template.image.key },
      }
    : { images: [], brochure: null, primary: { type: "NONE", key: "" } };
}

function getPrimaryMedia(media) {
  if (media?.primary?.type === "IMAGE") {
    return media.images?.find((item) => item.key === media.primary.key) || null;
  }
  if (media?.primary?.type === "DOCUMENT") return media.brochure || null;
  return null;
}

async function readResponse(response, fallback) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) {
    const error = new Error(json?.message || fallback);
    error.code = json?.code || "";
    error.status = response.status;
    throw error;
  }
  return json;
}

function marketingApiUrl(vendorId, path = "") {
  return `${API_BASE_URL}/api/vendor/whatsapp-marketing/${encodeURIComponent(vendorId)}${path}`;
}

async function fetchMarketingTemplates(vendorId) {
  const response = await fetch(marketingApiUrl(vendorId, "/templates"), {
    cache: "no-store",
    headers: getVendorAuthHeaders(vendorId),
  });
  const json = await readResponse(response, "Unable to load marketing templates");
  return json.data?.templates || [];
}

async function fetchCampaignDrafts(vendorId) {
  const response = await fetch(marketingApiUrl(vendorId, "/campaigns"), {
    cache: "no-store",
    headers: getVendorAuthHeaders(vendorId),
  });
  const json = await readResponse(response, "Unable to load campaign drafts");
  return json.data?.campaigns || [];
}

export default function WhatsappMarketingDashboard({ vendorId }) {
  const messageRef = useRef(null);
  const [capability, setCapability] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [operationId, setOperationId] = useState("");
  const [campaignDrafts, setCampaignDrafts] = useState([]);
  const [editingCampaignId, setEditingCampaignId] = useState("");
  const [testSendOpen, setTestSendOpen] = useState(false);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(marketingApiUrl(vendorId, "/capability"), {
          cache: "no-store",
          headers: getVendorAuthHeaders(vendorId),
        });
        const json = await readResponse(response, "Unable to verify WhatsApp Marketing access");
        if (cancelled) return;
        const nextCapability = json.data || null;
        setCapability(nextCapability);
        if (nextCapability?.eligible) {
          const [nextTemplates, nextCampaigns] = await Promise.all([
            fetchMarketingTemplates(vendorId),
            fetchCampaignDrafts(vendorId),
          ]);
          if (!cancelled) {
            setTemplates(nextTemplates);
            setCampaignDrafts(nextCampaigns);
          }
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Unable to load WhatsApp Marketing");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  function openCreate() {
    setEditingId("");
    setForm(emptyForm());
    setError("");
    setNotice("");
    setEditorOpen(true);
  }

  function openEdit(template) {
    setEditingId(template.id);
    setForm({
      internalName: template.internalName || "",
      purpose: template.purpose || "GENERAL_MARKETING",
      messageBody: template.messageBody || "",
      media: normalizeMedia(template),
      language: template.language || "en",
    });
    setError("");
    setNotice("");
    setEditorOpen(true);
  }

  function insertPlaceholder(placeholder) {
    const input = messageRef.current;
    const body = form.messageBody || "";
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? body.length;
    setForm((current) => ({
      ...current,
      messageBody: `${body.slice(0, start)}${placeholder}${body.slice(end)}`,
    }));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }

  async function uploadOneMedia(file) {
    const data = new FormData();
    data.append("media", file);
    const response = await fetch(marketingApiUrl(vendorId, "/media"), {
      method: "POST",
      headers: getVendorAuthHeaders(vendorId),
      body: data,
    });
    const json = await readResponse(response, "Unable to upload marketing media");
    return json.data?.media || null;
  }

  async function deleteTemporaryMedia(media) {
    if (!media?.uploadToken) return;
    const response = await fetch(marketingApiUrl(vendorId, "/media"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...getVendorAuthHeaders(vendorId),
      },
      body: JSON.stringify({ media }),
    });
    await readResponse(response, "Unable to remove uploaded media");
  }

  async function uploadImages(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const available = 5 - (form.media.images?.length || 0);
    if (files.length > available) {
      setError(`You can add ${available} more offer image${available === 1 ? "" : "s"}.`);
      return;
    }
    const uploaded = [];
    try {
      setUploading(true);
      setError("");
      for (const file of files) uploaded.push(await uploadOneMedia(file));
      setForm((current) => ({
        ...current,
        media: { ...current.media, images: [...current.media.images, ...uploaded].filter(Boolean) },
      }));
    } catch (uploadError) {
      await Promise.allSettled(uploaded.map(deleteTemporaryMedia));
      setError(uploadError.message || "Unable to upload offer images");
    } finally {
      setUploading(false);
    }
  }

  async function uploadBrochure(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let uploaded = null;
    try {
      setUploading(true);
      setError("");
      uploaded = await uploadOneMedia(file);
      if (form.media.brochure?.uploadToken) await deleteTemporaryMedia(form.media.brochure);
      setForm((current) => ({
        ...current,
        media: { ...current.media, brochure: uploaded },
      }));
    } catch (uploadError) {
      if (uploaded?.uploadToken) await Promise.allSettled([deleteTemporaryMedia(uploaded)]);
      setError(uploadError.message || "Unable to upload PDF brochure");
    } finally {
      setUploading(false);
    }
  }

  async function removeMedia(kind, media) {
    try {
      setError("");
      await deleteTemporaryMedia(media);
      setForm((current) => {
        const removingPrimary = current.media.primary.key === media.key;
        return {
          ...current,
          media: {
            ...current.media,
            images: kind === "image"
              ? current.media.images.filter((item) => item.key !== media.key)
              : current.media.images,
            brochure: kind === "brochure" ? null : current.media.brochure,
            primary: removingPrimary ? { type: "NONE", key: "" } : current.media.primary,
          },
        };
      });
    } catch (removeError) {
      setError(removeError.message || "Unable to remove media");
    }
  }

  async function closeEditor() {
    if (uploading || saving) return;
    const temporary = [...(form.media.images || []), form.media.brochure]
      .filter((item) => item?.uploadToken);
    await Promise.allSettled(temporary.map(deleteTemporaryMedia));
    setEditorOpen(false);
  }

  async function saveDraft(event) {
    event.preventDefault();
    const validationError = validateMarketingDraft(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      setSaving(true);
      setError("");
      setNotice("");
      const response = await fetch(
        marketingApiUrl(vendorId, editingId ? `/templates/${encodeURIComponent(editingId)}` : "/templates"),
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify(form),
        }
      );
      const json = await readResponse(response, "Unable to save template draft");
      setTemplates(await fetchMarketingTemplates(vendorId));
      setEditorOpen(false);
      setNotice(json.message || "Template draft saved");
    } catch (saveError) {
      setError(saveError.message || "Unable to save template draft");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft(template) {
    if (!window.confirm(`Delete the draft “${template.internalName}”?`)) return;
    try {
      setError("");
      const response = await fetch(marketingApiUrl(vendorId, `/templates/${encodeURIComponent(template.id)}`), {
        method: "DELETE",
        headers: getVendorAuthHeaders(vendorId),
      });
      const json = await readResponse(response, "Unable to delete template draft");
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      if (previewTemplate?.id === template.id) setPreviewTemplate(null);
      setNotice(json.message || "Template draft deleted");
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete template draft");
    }
  }

  async function runTemplateAction(template, action, fallback) {
    try {
      setOperationId(template.id);
      setError("");
      setNotice("");
      const response = await fetch(
        marketingApiUrl(
          vendorId,
          `/templates/${encodeURIComponent(template.id)}/${action}`
        ),
        { method: "POST", headers: getVendorAuthHeaders(vendorId) }
      );
      const json = await readResponse(response, fallback);
      const updated = json.data?.template;
      setTemplates((current) => current.map((item) => (
        item.id === template.id && updated ? updated : item
      )));
      setNotice(json.message || fallback);
      return updated;
    } catch (actionError) {
      setError(actionError.message || fallback);
      return null;
    } finally {
      setOperationId("");
    }
  }

  async function submitForApproval(template) {
    if (!window.confirm(`Submit “${template.internalName}” to Meta for approval?`)) return;
    await runTemplateAction(template, "submit", "Unable to submit template to Meta");
  }

  async function refreshApprovalStatus(template) {
    await runTemplateAction(template, "refresh-status", "Unable to refresh Meta status");
  }

  async function reviseRejected(template) {
    const updated = await runTemplateAction(
      template,
      "revise",
      "Unable to start template revision"
    );
    if (updated) openEdit(updated);
  }

  const previewBody = renderMarketingTemplatePreview(form.messageBody);
  const primaryMedia = getPrimaryMedia(form.media);

  if (loading) {
    return <section className="wa-marketing-panel state">Loading WhatsApp Marketing...</section>;
  }

  if (!capability?.eligible) {
    const disabled = capability?.reason === "feature_disabled";
    return (
      <section className="wa-marketing-panel unavailable">
        <span className="wa-marketing-kicker">WhatsApp Marketing</span>
        <h2>{disabled ? "Marketing is not enabled yet" : "Active subscription required"}</h2>
        <p>
          {disabled
            ? "This module is safely disabled in this environment."
            : "WhatsApp Marketing template tools are available with an active subscription."}
        </p>
        {error ? <div className="wa-marketing-alert error">{error}</div> : null}
      </section>
    );
  }

  return (
    <section className="wa-marketing-panel">
      <header className="wa-marketing-hero">
        <div>
          <span className="wa-marketing-kicker">Growth tools</span>
          <h2>WhatsApp Marketing</h2>
          <p>Create reusable templates and submit them to your connected Meta account for approval.</p>
        </div>
        <div className="wa-marketing-hero-actions">
          <button type="button" className="wa-marketing-secondary" onClick={() => setTestSendOpen(true)}>Send Test Message</button>
          <button type="button" className="wa-marketing-primary" onClick={openCreate}>Create Template</button>
        </div>
      </header>

      {error ? <div className="wa-marketing-alert error">{error}</div> : null}
      {notice ? <div className="wa-marketing-alert success">{notice}</div> : null}

      {!templates.length ? (
        <div className="wa-marketing-empty">
          <h3>No marketing templates yet</h3>
          <p>Create your first draft for an offer, reminder, or customer update.</p>
          <button type="button" className="wa-marketing-secondary" onClick={openCreate}>
            Create your first template
          </button>
        </div>
      ) : (
        <div className="wa-marketing-list">
          {templates.map((template) => (
            <article className="wa-marketing-template-card" key={template.id}>
              <div className="wa-marketing-template-copy">
                <div className="wa-marketing-template-heading">
                  <h3>{template.internalName}</h3>
                  <span className={`status-${String(template.status || "DRAFT").toLowerCase()}`}>
                    {template.status || "DRAFT"}
                  </span>
                </div>
                <p>{getMarketingPurposeLabel(template.purpose)}</p>
                {template.status === "REJECTED" && template.metaTemplate?.rejectionReason ? (
                  <p className="wa-marketing-rejection">
                    Meta feedback: {template.metaTemplate.rejectionReason}
                  </p>
                ) : null}
                <small>
                  Updated {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString("en-IN") : "recently"}
                </small>
              </div>
              <div className="wa-marketing-card-actions">
                <button type="button" onClick={() => setPreviewTemplate(template)}>Preview</button>
                {template.status === "DRAFT" ? (
                  <>
                    <button type="button" onClick={() => openEdit(template)}>Edit</button>
                    <button
                      type="button"
                      onClick={() => submitForApproval(template)}
                      disabled={operationId === template.id}
                    >
                      {operationId === template.id ? "Submitting..." : "Submit to Meta"}
                    </button>
                    <button type="button" className="danger" onClick={() => deleteDraft(template)}>Delete</button>
                  </>
                ) : null}
                {["SUBMITTING", "PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED"].includes(template.status) ? (
                  <button
                    type="button"
                    onClick={() => refreshApprovalStatus(template)}
                    disabled={operationId === template.id}
                  >
                    {operationId === template.id ? "Checking..." : "Refresh Status"}
                  </button>
                ) : null}
                {template.status === "REJECTED" ? (
                  <button
                    type="button"
                    onClick={() => reviseRejected(template)}
                    disabled={operationId === template.id}
                  >
                    Revise
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="wa-marketing-campaign-drafts">
        <div>
          <span className="wa-marketing-kicker">Phase 3A</span>
          <h3>Campaign Drafts</h3>
          <p>Recipients and approved content are saved here. Sending is not enabled.</p>
        </div>
        {campaignDrafts.length ? (
          <div className="wa-marketing-campaign-list">
            {campaignDrafts.map((campaign) => (
              <button type="button" key={campaign.id} onClick={() => setEditingCampaignId(campaign.id)}>
                <strong>{campaign.campaignName}</strong>
                <span>{campaign.counts?.eligible || 0} eligible of {campaign.counts?.selected || 0}</span>
                <small>Updated {campaign.updatedAt ? new Date(campaign.updatedAt).toLocaleDateString("en-IN") : "recently"}</small>
              </button>
            ))}
          </div>
        ) : <p className="wa-marketing-campaign-empty">Create a campaign from Customer Analytics after selecting customers.</p>}
      </section>

      {editorOpen ? (
        <div className="wa-marketing-modal" role="dialog" aria-modal="true" aria-labelledby="wa-marketing-editor-title">
          <div className="wa-marketing-modal-card editor">
            <div className="wa-marketing-modal-head">
              <div>
                <span className="wa-marketing-kicker">Draft template</span>
                <h3 id="wa-marketing-editor-title">{editingId ? "Edit Template" : "Create Template"}</h3>
              </div>
              <button type="button" className="wa-marketing-close" aria-label="Close template editor" onClick={closeEditor} disabled={uploading || saving}>×</button>
            </div>

            <form className="wa-marketing-editor-grid" onSubmit={saveDraft}>
              <div className="wa-marketing-fields">
                <label>
                  Internal template name
                  <input
                    value={form.internalName}
                    maxLength={80}
                    onChange={(event) => setForm((current) => ({ ...current, internalName: event.target.value }))}
                    placeholder="Festive facial offer"
                    required
                  />
                </label>
                <label>
                  Purpose
                  <select
                    value={form.purpose}
                    onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))}
                  >
                    {MARKETING_PURPOSES.map((purpose) => (
                      <option value={purpose.value} key={purpose.value}>{purpose.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Message
                  <textarea
                    ref={messageRef}
                    value={form.messageBody}
                    maxLength={1024}
                    rows={8}
                    onChange={(event) => setForm((current) => ({ ...current, messageBody: event.target.value }))}
                    required
                  />
                  <small>{form.messageBody.length}/1024 characters</small>
                </label>
                <div className="wa-marketing-placeholders" aria-label="Insert personalization">
                  {MARKETING_PLACEHOLDERS.map((placeholder) => (
                    <button type="button" key={placeholder} onClick={() => insertPlaceholder(placeholder)}>
                      {placeholder}
                    </button>
                  ))}
                </div>
                <div className="wa-marketing-media-field">
                  <div className="wa-marketing-media-head">
                    <div>
                      <strong>Offer Images &amp; Brochures</strong>
                      <small>Up to 5 JPEG, PNG, or WebP images (5 MB each) and one PDF (10 MB).</small>
                    </div>
                    <div className="wa-marketing-media-uploaders">
                      <label className="wa-marketing-upload">
                        {uploading ? "Uploading..." : "Add images"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={uploadImages}
                          disabled={uploading || form.media.images.length >= 5}
                        />
                      </label>
                      <label className="wa-marketing-upload">
                        {uploading ? "Uploading..." : form.media.brochure ? "Replace PDF" : "Add PDF"}
                        <input type="file" accept="application/pdf" onChange={uploadBrochure} disabled={uploading} />
                      </label>
                    </div>
                  </div>

                  <fieldset className="wa-marketing-primary-media">
                    <legend>Primary WhatsApp media</legend>
                    <label>
                      <input
                        type="radio"
                        name="primaryMarketingMedia"
                        checked={form.media.primary.type === "NONE"}
                        onChange={() => setForm((current) => ({
                          ...current,
                          media: { ...current.media, primary: { type: "NONE", key: "" } },
                        }))}
                      />
                      Text only
                    </label>
                    {form.media.images.map((image, index) => (
                      <div className="wa-marketing-media-tile" key={image.key}>
                        <label>
                          <input
                            type="radio"
                            name="primaryMarketingMedia"
                            checked={form.media.primary.type === "IMAGE" && form.media.primary.key === image.key}
                            onChange={() => setForm((current) => ({
                              ...current,
                              media: { ...current.media, primary: { type: "IMAGE", key: image.key } },
                            }))}
                          />
                          Primary image {index + 1}
                        </label>
                        <img src={image.url} alt={`Offer image ${index + 1}`} />
                        <div>
                          <a href={image.url} target="_blank" rel="noreferrer">Preview</a>
                          <button type="button" onClick={() => removeMedia("image", image)}>Remove</button>
                        </div>
                      </div>
                    ))}
                    {form.media.brochure ? (
                      <div className="wa-marketing-document-row">
                        <label>
                          <input
                            type="radio"
                            name="primaryMarketingMedia"
                            checked={form.media.primary.type === "DOCUMENT"}
                            onChange={() => setForm((current) => ({
                              ...current,
                              media: {
                                ...current.media,
                                primary: { type: "DOCUMENT", key: current.media.brochure.key },
                              },
                            }))}
                          />
                          Use PDF brochure
                        </label>
                        <span>{form.media.brochure.originalName || "Offer brochure.pdf"}</span>
                        <div>
                          <a href={form.media.brochure.url} target="_blank" rel="noreferrer">Open PDF</a>
                          <button type="button" onClick={() => removeMedia("brochure", form.media.brochure)}>Remove</button>
                        </div>
                      </div>
                    ) : null}
                  </fieldset>
                </div>
              </div>

              <div className="wa-marketing-preview-wrap">
                <span>Live preview</span>
                <div className="wa-marketing-phone-preview">
                  {form.media.primary.type === "IMAGE" && primaryMedia?.url ? (
                    <img src={primaryMedia.url} alt="Selected promotional header preview" />
                  ) : null}
                  {form.media.primary.type === "DOCUMENT" && primaryMedia ? (
                    <a className="wa-marketing-document-preview" href={primaryMedia.url} target="_blank" rel="noreferrer">
                      <strong>PDF brochure</strong>
                      <span>{primaryMedia.originalName || "Open brochure"}</span>
                    </a>
                  ) : null}
                  <p>{previewBody || "Your message preview will appear here."}</p>
                  <time>10:30</time>
                </div>
              </div>

              <div className="wa-marketing-editor-actions">
                <button type="button" className="wa-marketing-secondary" onClick={closeEditor} disabled={uploading || saving}>Cancel</button>
                <button type="submit" className="wa-marketing-primary" disabled={saving || uploading}>
                  {saving ? "Saving..." : "Save Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {previewTemplate ? (
        <div className="wa-marketing-modal" role="dialog" aria-modal="true" aria-label="Marketing template preview">
          <div className="wa-marketing-modal-card preview-only">
            <div className="wa-marketing-modal-head">
              <div><span className="wa-marketing-kicker">{previewTemplate.status || "DRAFT"} preview</span><h3>{previewTemplate.internalName}</h3></div>
              <button type="button" className="wa-marketing-close" aria-label="Close preview" onClick={() => setPreviewTemplate(null)}>×</button>
            </div>
            <div className="wa-marketing-phone-preview large">
              {normalizeMedia(previewTemplate).primary.type === "IMAGE" && getPrimaryMedia(normalizeMedia(previewTemplate))?.url ? (
                <img src={getPrimaryMedia(normalizeMedia(previewTemplate)).url} alt="Promotional header preview" />
              ) : null}
              {normalizeMedia(previewTemplate).primary.type === "DOCUMENT" && getPrimaryMedia(normalizeMedia(previewTemplate)) ? (
                <a
                  className="wa-marketing-document-preview"
                  href={getPrimaryMedia(normalizeMedia(previewTemplate)).url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>PDF brochure</strong>
                  <span>{getPrimaryMedia(normalizeMedia(previewTemplate)).originalName || "Open brochure"}</span>
                </a>
              ) : null}
              <p>{renderMarketingTemplatePreview(previewTemplate.messageBody)}</p>
              <time>10:30</time>
            </div>
          </div>
        </div>
      ) : null}
      {editingCampaignId ? (
        <WhatsappCampaignComposer
          vendorId={vendorId}
          campaignId={editingCampaignId}
          onClose={() => setEditingCampaignId("")}
          onSaved={async () => setCampaignDrafts(await fetchCampaignDrafts(vendorId))}
        />
      ) : null}
      {testSendOpen ? <WhatsappMarketingTestSend vendorId={vendorId} onClose={() => setTestSendOpen(false)} /> : null}
    </section>
  );
}
