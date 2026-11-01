"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { useVendor } from "@/app/context/VendorContext";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import "./EnquiriesDashboard.css";

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(value) {
  const amount = Number(value || 0);
  if (!amount) return "Not specified";
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function formatCompactAmount(value) {
  const amount = Number(value || 0);
  if (!amount) return "";
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function getEnquiryPhone(enquiry) {
  return String(enquiry?.phone || enquiry?.customerId || "").trim();
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "new") return "new";
  if (normalized === "viewed" || normalized === "enquiry viewed") return "viewed";
  return normalized;
}

function getStatusLabel(value) {
  const normalized = normalizeStatus(value);
  if (normalized === "viewed") return "Viewed";
  if (normalized === "new") return "New";
  return String(value || "New").trim() || "New";
}

function normalizePaymentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (["created", "paid", "cancelled", "failed_verification"].includes(normalized)) {
    return normalized;
  }
  return normalized;
}

function getPaymentStatusLabel(value) {
  const normalized = normalizePaymentStatus(value);
  if (normalized === "created") return "Payment Pending";
  if (normalized === "paid") return "Paid";
  if (normalized === "cancelled") return "Payment Cancelled";
  if (normalized === "failed_verification") return "Payment Failed";
  return normalized ? String(value).trim() : "";
}

function normalizeWhatsappStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "pending";
  if (["sent", "failed", "skipped"].includes(normalized)) return normalized;
  return "pending";
}

function getWhatsappStatusLabel(value) {
  const normalized = normalizeWhatsappStatus(value);
  if (normalized === "sent") return "Alert Sent";
  if (normalized === "failed") return "Alert Failed";
  if (normalized === "skipped") return "Alert Skipped";
  return "Alert Pending";
}

function isReadableDateField(key, value) {
  const keyText = String(key || "").trim().toLowerCase();
  const valueText = String(value || "").trim();
  if (!valueText) return false;

  const keyLooksDateLike =
    keyText.includes("date") ||
    keyText.includes("time") ||
    keyText.includes("slot") ||
    keyText.includes("appointment");

  const valueLooksDateLike =
    /^\d{4}-\d{2}-\d{2}(t|\s)\d{2}:\d{2}/i.test(valueText) ||
    /^\d{4}-\d{2}-\d{2}$/.test(valueText);

  return keyLooksDateLike && valueLooksDateLike;
}

function formatDetailValue(key, value) {
  if (Array.isArray(value)) {
    return value.map((item) => formatDetailValue(key, item)).join(", ");
  }

  const text = String(value ?? "").trim();
  if (!text) return "-";

  if (isReadableDateField(key, text)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return formatDateOnly(text) || text;
    }

    return formatDateTime(text) || text;
  }

  return text;
}

function getCartItemDisplayName(item) {
  const path = Array.isArray(item?.categoryPath) ? item.categoryPath : Array.isArray(item?.nodePath) ? item.nodePath : [];
  const normalizedPath = path.map((segment) => String(segment || "").trim()).filter(Boolean);
  const hierarchyLabel = normalizedPath.length > 0 ? normalizedPath.join(" - ") : "";
  const itemLabel = String(item?.label || "").trim();
  const name = String(item?.name || item?.serviceName || "").trim();
  const unitLabel = String(item?.unitLabel || "").trim();

  if (hierarchyLabel) return hierarchyLabel;
  if (itemLabel) return itemLabel;

  if (name && unitLabel && !name.toLowerCase().includes(unitLabel.toLowerCase())) {
    return `${name} - ${unitLabel}`;
  }

  if (name) return name;

  return "Service";
}

function getEnquiryDisplayTitle(enquiry, fallbackLabel = "Enquiry") {
  const metaItems = Array.isArray(enquiry?.meta?.cartItems) ? enquiry.meta.cartItems : [];
  if (metaItems.length > 0) {
    const firstItemName = getCartItemDisplayName(metaItems[0]);
    return metaItems.length > 1 ? `${firstItemName} +${metaItems.length - 1} more` : firstItemName;
  }

  return String(enquiry?.serviceName || fallbackLabel).trim() || fallbackLabel;
}

function getCartItemMetaLine(item) {
  const itemCode = String(item?.itemCode || "").trim();
  const unitLabel = String(item?.unitLabel || "").trim();
  const displayName = getCartItemDisplayName(item).toLowerCase();
  const parts = [];

  if (itemCode) parts.push(itemCode);
  if (unitLabel && !displayName.includes(unitLabel.toLowerCase())) {
    parts.push(unitLabel);
  }

  return parts.join(" • ");
}

function getServiceSummary(enquiry) {
  const metaItems = Array.isArray(enquiry?.meta?.cartItems) ? enquiry.meta.cartItems : [];
  if (metaItems.length > 0) {
    return metaItems.map((item) => getCartItemDisplayName(item)).join(", ");
  }

  const inventoryNames = Array.isArray(enquiry?.attributes?.inventoryNames)
    ? enquiry.attributes.inventoryNames.filter(Boolean)
    : [];
  if (inventoryNames.length > 0) return inventoryNames.join(", ");

  const inventoryName = String(enquiry?.attributes?.inventoryName || "").trim();
  if (inventoryName) return inventoryName;

  const categoryPath = Array.isArray(enquiry?.categoryPath)
    ? enquiry.categoryPath.filter(Boolean).join(" / ")
    : "";
  if (categoryPath) return categoryPath;

  return String(enquiry?.serviceName || "").trim() || "Service enquiry";
}

function getCartItemDiscountAmount(item) {
  const qty = Number(item?.qty || 0) || 1;
  const unitPrice = Number(item?.price || 0) || 0;
  const mrp = Number(item?.mrp || 0) || 0;
  const grossTotal = mrp > 0 ? mrp * qty : unitPrice * qty;
  const netTotal = Number(item?.total || 0) || unitPrice * qty;

  return Math.max(grossTotal - netTotal, 0);
}

function getCartItemMrpTotal(item) {
  const qty = Number(item?.qty || 0) || 1;
  const unitPrice = Number(item?.price || 0) || 0;
  const mrp = Number(item?.mrp || 0) || 0;
  return (mrp > 0 ? mrp : unitPrice) * qty;
}

function getEnquiryDiscountAmount(enquiry) {
  const metaItems = Array.isArray(enquiry?.meta?.cartItems) ? enquiry.meta.cartItems : [];
  if (metaItems.length > 0) {
    return metaItems.reduce((sum, item) => sum + getCartItemDiscountAmount(item), 0);
  }

  return 0;
}

function getEnquiryMrpAmount(enquiry) {
  const metaItems = Array.isArray(enquiry?.meta?.cartItems) ? enquiry.meta.cartItems : [];
  if (metaItems.length > 0) {
    return metaItems.reduce((sum, item) => {
      const qty = Number(item?.qty || 0) || 1;
      const unitPrice = Number(item?.price || 0) || 0;
      const mrp = Number(item?.mrp || 0) || 0;
      const grossTotal = mrp > 0 ? mrp * qty : unitPrice * qty;
      return sum + grossTotal;
    }, 0);
  }

  const netAmount = Number(enquiry?.price || 0) || 0;
  const discountAmount = getEnquiryDiscountAmount(enquiry);
  return netAmount + discountAmount;
}

function getAttributeRows(enquiry) {
  const attributes = enquiry?.attributes && typeof enquiry.attributes === "object"
    ? enquiry.attributes
    : {};

  return Object.entries(attributes).filter(([key, value]) => {
    if (!key) return false;
    if (key === "inventoryName" || key === "inventoryNames") return false;
    if (value == null) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return String(value).trim() !== "";
  });
}

function isOrderLikeEnquiry(enquiry, selectedTemplateKey = "") {
  const template = String(enquiry?.meta?.template || "").trim().toLowerCase();
  const enquiryType = String(enquiry?.meta?.enquiryType || "").trim().toLowerCase();
  const hasCartItems = Array.isArray(enquiry?.meta?.cartItems) && enquiry.meta.cartItems.length > 0;
  const normalizedTemplateKey = String(selectedTemplateKey || "").trim().toLowerCase();

  return (
    template === "ecommerce-preview" ||
    enquiryType === "order" ||
    enquiryType === "order_request" ||
    (normalizedTemplateKey === "ecommerce" && hasCartItems)
  );
}

function isRazorpayManagedOrder(enquiry) {
  return (
    String(enquiry?.meta?.checkoutProvider || "").trim().toLowerCase() === "razorpay" ||
    String(enquiry?.payment?.provider || "").trim().toLowerCase() === "razorpay"
  );
}

function isPaidRazorpayOrder(enquiry) {
  return normalizePaymentStatus(enquiry?.payment?.status) === "paid";
}

function getDashboardCopy(isOrderMode) {
  if (isOrderMode) {
    return {
      singular: "Order",
      plural: "Orders",
      recentLabel: "Recent Orders",
      recentMeta: "Last 10 days",
      monthLabel: "This Month",
      monthMeta: "Current month",
      pastLabel: "Past Orders",
      pastMeta: "Older orders",
      loading: "Loading orders...",
      empty: "No orders found in this section.",
      requestedSection: "Ordered Items",
      detailsSection: "Order Details",
      emptyDetails: "No additional details were captured for this order.",
      selectPrompt: "Select an order to review the details.",
      totalValue: "Order Value",
      customerCall: "Call Customer",
    };
  }

  return {
    singular: "Enquiry",
    plural: "Enquiries",
    recentLabel: "Recent Enquiries",
    recentMeta: "Last 10 days",
    monthLabel: "This Month",
    monthMeta: "Current month",
    pastLabel: "Past Enquiries",
    pastMeta: "Older enquiries",
    loading: "Loading enquiries...",
    empty: "No enquiries found in this section.",
    requestedSection: "Requested Services",
    detailsSection: "Enquiry Details",
    emptyDetails: "No additional details were captured for this enquiry.",
    selectPrompt: "Select an enquiry to review the details.",
    totalValue: "Total Value",
    customerCall: "Call Customer",
  };
}

export default function EnquiriesDashboard({ vendorId, categoryId }) {
  const { vendorInfo } = useVendor() || {};
  const [activeTab, setActiveTab] = useState("recent");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [enquiries, setEnquiries] = useState([]);
  const [selectedEnquiryId, setSelectedEnquiryId] = useState("");
  const [mobileDetailEnquiryId, setMobileDetailEnquiryId] = useState("");
  const [updatingStatusId, setUpdatingStatusId] = useState("");

  useEffect(() => {
    if (!vendorId || !categoryId) return;

    let cancelled = false;

    async function loadEnquiries() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_BASE_URL}/api/enquiries?vendorId=${encodeURIComponent(vendorId)}&categoryId=${encodeURIComponent(categoryId)}`,
          { headers: getVendorAuthHeaders(vendorId) }
        );
        const data = await response.json().catch(() => []);

        if (!response.ok) {
          throw new Error(data?.message || "Failed to load enquiries");
        }

        if (cancelled) return;

        const list = (Array.isArray(data) ? data : [])
          .slice()
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        setEnquiries(list);
        setSelectedEnquiryId(list[0]?._id || "");
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError?.message || "Failed to load enquiries");
          setEnquiries([]);
          setSelectedEnquiryId("");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEnquiries();

    return () => {
      cancelled = true;
    };
  }, [categoryId, vendorId]);

  const isOrderMode = useMemo(() => {
    const selectedTemplateKey = vendorInfo?.selectedTemplateKey || "";
    return (
      String(selectedTemplateKey || "").trim().toLowerCase() === "ecommerce" ||
      enquiries.some((enquiry) => isOrderLikeEnquiry(enquiry, selectedTemplateKey))
    );
  }, [enquiries, vendorInfo?.selectedTemplateKey]);

  const groupedEnquiries = useMemo(() => {
    const baseList = enquiries.filter((item) => {
      if (!isOrderMode) return true;
      if (!isOrderLikeEnquiry(item, vendorInfo?.selectedTemplateKey || "")) return true;
      if (!isRazorpayManagedOrder(item)) return true;
      return isPaidRazorpayOrder(item);
    });

    const now = new Date();
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(now.getDate() - 10);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      recent: baseList.filter((item) => {
        const createdAt = new Date(item?.createdAt || 0);
        return !Number.isNaN(createdAt.getTime()) && createdAt >= tenDaysAgo;
      }),
      month: baseList.filter((item) => {
        const createdAt = new Date(item?.createdAt || 0);
        return !Number.isNaN(createdAt.getTime()) && createdAt >= startOfMonth;
      }),
      past: baseList.filter((item) => {
        const createdAt = new Date(item?.createdAt || 0);
        return !Number.isNaN(createdAt.getTime()) && createdAt < startOfMonth;
      }),
    };
  }, [enquiries, isOrderMode, vendorInfo?.selectedTemplateKey]);

  const copy = useMemo(() => getDashboardCopy(isOrderMode), [isOrderMode]);

  const activeEnquiries = useMemo(
    () => groupedEnquiries[activeTab] || [],
    [activeTab, groupedEnquiries]
  );

  useEffect(() => {
    if (activeEnquiries.some((item) => item?._id === selectedEnquiryId)) return;
    setSelectedEnquiryId(activeEnquiries[0]?._id || "");
  }, [activeEnquiries, selectedEnquiryId]);

  const selectedEnquiry = activeEnquiries.find((item) => item?._id === selectedEnquiryId) || null;
  const mobileDetailEnquiry =
    activeEnquiries.find((item) => item?._id === mobileDetailEnquiryId) || null;

  function renderEnquiryDetail(enquiry, options = {}) {
    if (!enquiry) {
      return (
        <div className="enquiries-dashboard-empty">
          {copy.selectPrompt}
        </div>
      );
    }

    const phone = getEnquiryPhone(enquiry);
    const isOrderLike = isOrderLikeEnquiry(enquiry, vendorInfo?.selectedTemplateKey || "");
    const usesRazorpay = isRazorpayManagedOrder(enquiry);
    const detailRowsForEnquiry = getAttributeRows(enquiry);
    const cartItemsForEnquiry = Array.isArray(enquiry?.meta?.cartItems)
      ? enquiry.meta.cartItems
      : [];
    const statusLabel =
      isOrderLike && usesRazorpay
        ? getPaymentStatusLabel(enquiry?.payment?.status) || getStatusLabel(enquiry?.status)
        : getStatusLabel(enquiry?.status);
    const whatsappStatus = getWhatsappStatusLabel(enquiry?.meta?.vendorWhatsappStatus);
    const whatsappTone = normalizeWhatsappStatus(enquiry?.meta?.vendorWhatsappStatus);
    const whatsappError = String(enquiry?.meta?.vendorWhatsappError || "").trim();
    const orderValue = Number(enquiry?.price || 0) || 0;
    const discountAmount = getEnquiryDiscountAmount(enquiry);
    const mrpAmount = getEnquiryMrpAmount(enquiry);

    return (
      <>
        <div className="enquiries-dashboard-detail-top">
          <div>
            <div className="enquiries-dashboard-detail-title">
              {getEnquiryDisplayTitle(enquiry, copy.singular)}
            </div>
            <div className="enquiries-dashboard-detail-date">
              {formatDateTime(enquiry?.createdAt)}
            </div>
          </div>

          <div className="enquiries-dashboard-detail-top-actions">
            {options.showClose ? (
              <button
                type="button"
                className="enquiries-dashboard-detail-close"
                onClick={options.onClose}
              >
                Close
              </button>
            ) : null}

            {phone ? (
              <a
                className="enquiries-dashboard-call-btn"
                href={`tel:${phone}`}
              >
                {copy.customerCall}
              </a>
            ) : null}
          </div>
        </div>

        <div className="enquiries-dashboard-meta-grid">
          <div className="enquiries-dashboard-meta-card">
            <span>Customer</span>
            <strong>{phone || "Not available"}</strong>
          </div>
          {isOrderLike ? (
            <div className="enquiries-dashboard-meta-card">
              <span>Total MRP</span>
              <strong>{formatAmount(mrpAmount)}</strong>
            </div>
          ) : (
            <div className="enquiries-dashboard-meta-card">
              <span>{copy.totalValue}</span>
              <strong>{formatAmount(enquiry?.price)}</strong>
            </div>
          )}
          {isOrderLike ? (
            <div className="enquiries-dashboard-meta-card">
              <span>Discount Given</span>
              <strong>{discountAmount > 0 ? formatAmount(discountAmount) : "Rs 0"}</strong>
            </div>
          ) : null}
          <div className="enquiries-dashboard-meta-card">
            <span>{isOrderLike ? "Net Payable" : copy.totalValue}</span>
            <strong>{formatAmount(orderValue)}</strong>
          </div>
          <div className="enquiries-dashboard-meta-card">
            <span>Status</span>
            <strong>
              <span className={`enquiries-dashboard-status-badge is-${
                isOrderLike && usesRazorpay
                  ? normalizePaymentStatus(enquiry?.payment?.status) || normalizeStatus(enquiry?.status)
                  : normalizeStatus(enquiry?.status)
              }`}>
                {statusLabel}
              </span>
              {!isOrderLike && updatingStatusId === enquiry?._id ? (
                <span className="enquiries-dashboard-status-note">Updating...</span>
              ) : null}
            </strong>
          </div>
          <div className="enquiries-dashboard-meta-card">
            <span>Vendor WhatsApp</span>
            <strong>
              <span className={`enquiries-dashboard-status-badge is-${whatsappTone}`}>
                {whatsappStatus}
              </span>
              {whatsappError ? (
                <span className="enquiries-dashboard-status-note">
                  {whatsappError}
                </span>
              ) : null}
            </strong>
          </div>
        </div>

        <div className="enquiries-dashboard-section">
          <div className="enquiries-dashboard-section-title">{copy.requestedSection}</div>
          {cartItemsForEnquiry.length > 0 ? (
            <div className="enquiries-dashboard-services">
              {cartItemsForEnquiry.map((item, index) => (
                <div
                  key={`${item?.cartKey || item?.itemId || item?.name || index}-${index}`}
                  className="enquiries-dashboard-service-row"
                >
                  <div className="enquiries-dashboard-service-copy">
                    <strong>{getCartItemDisplayName(item) || (isOrderMode ? "Item" : "Service")}</strong>
                    <span>
                      Qty {Number(item?.qty || 0) || 1}
                      {getCartItemMetaLine(item) ? ` • ${getCartItemMetaLine(item)}` : ""}
                    </span>
                    {isOrderMode && (Number(item?.mrp) > 0 || Number(item?.discountPercent) > 0 || getCartItemDiscountAmount(item) > 0) ? (
                      <div className="enquiries-dashboard-service-tags">
                        {Number(item?.mrp) > 0 ? (
                          <span className="enquiries-dashboard-service-tag">
                            MRP {formatCompactAmount(getCartItemMrpTotal(item))}
                          </span>
                        ) : null}
                        {Number(item?.discountPercent) > 0 ? (
                          <span className="enquiries-dashboard-service-tag">
                            {Number(item.discountPercent)}% off
                          </span>
                        ) : null}
                        {getCartItemDiscountAmount(item) > 0 ? (
                          <span className="enquiries-dashboard-service-tag">
                            Discount {formatCompactAmount(getCartItemDiscountAmount(item))}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <span className="enquiries-dashboard-service-price">
                    {formatAmount(item?.total || item?.price)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="enquiries-dashboard-copy">
              {getServiceSummary(enquiry)}
            </div>
          )}
        </div>

        <div className="enquiries-dashboard-section">
          <div className="enquiries-dashboard-section-title">{copy.detailsSection}</div>
          {detailRowsForEnquiry.length > 0 ? (
            <div className="enquiries-dashboard-details-grid">
              {detailRowsForEnquiry.map(([key, value]) => (
                <div key={key} className="enquiries-dashboard-detail-card">
                  <span>{key}</span>
                  <strong>
                    {formatDetailValue(key, value)}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="enquiries-dashboard-copy">
              {copy.emptyDetails}
            </div>
          )}
        </div>
      </>
    );
  }

  useEffect(() => {
    const enquiryId = selectedEnquiry?._id;
    if (!enquiryId) return;
    if (isOrderLikeEnquiry(selectedEnquiry, vendorInfo?.selectedTemplateKey || "")) return;

    const normalizedStatus = normalizeStatus(selectedEnquiry?.status);
    if (normalizedStatus === "viewed") return;

    let cancelled = false;

    async function markAsViewed() {
      try {
        setUpdatingStatusId(enquiryId);

        const response = await fetch(`${API_BASE_URL}/api/enquiries/${encodeURIComponent(enquiryId)}/status`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify({ status: "Viewed" }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;

        setEnquiries((prev) =>
          prev.map((item) => (item?._id === enquiryId ? { ...item, ...data, status: "Viewed" } : item))
        );
      } catch {
        // Keep the UI resilient even if the status update fails.
      } finally {
        if (!cancelled) {
          setUpdatingStatusId((current) => (current === enquiryId ? "" : current));
        }
      }
    }

    markAsViewed();

    return () => {
      cancelled = true;
    };
  }, [selectedEnquiry, vendorId, vendorInfo?.selectedTemplateKey]);

  return (
    <div className="enquiries-dashboard">
      <div className="enquiries-dashboard-tabs">
        {[
          { key: "recent", label: copy.recentLabel, meta: copy.recentMeta },
          { key: "month", label: copy.monthLabel, meta: copy.monthMeta },
          { key: "past", label: copy.pastLabel, meta: copy.pastMeta },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`enquiries-dashboard-tab ${activeTab === tab.key ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span>{tab.label}</span>
            <strong>{groupedEnquiries[tab.key]?.length || 0}</strong>
            <small>{tab.meta}</small>
          </button>
        ))}
      </div>

      {loading ? <div className="enquiries-dashboard-empty">{copy.loading}</div> : null}
      {error ? <div className="enquiries-dashboard-empty">{error}</div> : null}

      {!loading && !error ? (
        activeEnquiries.length === 0 ? (
          <div className="enquiries-dashboard-empty">{copy.empty}</div>
        ) : (
          <div className="enquiries-dashboard-layout">
            <div className="enquiries-dashboard-list">
              {activeEnquiries.map((enquiry) => {
                const phone = getEnquiryPhone(enquiry);
                const isActive = enquiry?._id === selectedEnquiryId;
                const isOrderLike = isOrderLikeEnquiry(enquiry, vendorInfo?.selectedTemplateKey || "");
                const usesRazorpay = isRazorpayManagedOrder(enquiry);
                const statusLabel =
                  isOrderLike && usesRazorpay
                    ? getPaymentStatusLabel(enquiry?.payment?.status) || getStatusLabel(enquiry?.status)
                    : getStatusLabel(enquiry?.status);
                const statusTone =
                  isOrderLike && usesRazorpay
                    ? normalizePaymentStatus(enquiry?.payment?.status) || normalizeStatus(enquiry?.status)
                    : normalizeStatus(enquiry?.status);
                const whatsappStatusLabel = getWhatsappStatusLabel(enquiry?.meta?.vendorWhatsappStatus);
                const whatsappStatusTone = normalizeWhatsappStatus(enquiry?.meta?.vendorWhatsappStatus);
                const selectEnquiry = () => setSelectedEnquiryId(enquiry?._id || "");

                return (
                  <div
                    key={enquiry?._id || `${phone}-${enquiry?.createdAt}`}
                    role="button"
                    tabIndex={0}
                    className={`enquiries-dashboard-row ${isActive ? "is-active" : ""} is-${statusTone}`}
                    onClick={selectEnquiry}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectEnquiry();
                      }
                    }}
                  >
                    <div className="enquiries-dashboard-row-top">
                      <span className="enquiries-dashboard-row-title">
                        {getEnquiryDisplayTitle(enquiry, copy.singular)}
                      </span>
                      <div className="enquiries-dashboard-row-meta">
                        <span className={`enquiries-dashboard-status-badge is-${statusTone}`}>
                          {statusLabel}
                        </span>
                        <span className="enquiries-dashboard-row-date">
                          {formatDateTime(enquiry?.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="enquiries-dashboard-row-subtitle">
                      {phone || "Phone not available"}
                    </div>
                    <div className="enquiries-dashboard-row-badges">
                      <span className={`enquiries-dashboard-status-badge is-${whatsappStatusTone}`}>
                        {whatsappStatusLabel}
                      </span>
                    </div>
                    <div className="enquiries-dashboard-row-summary">
                      {getServiceSummary(enquiry)}
                    </div>
                    <div className="enquiries-dashboard-row-actions">
                      <button
                        type="button"
                        className="enquiries-dashboard-view-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          selectEnquiry();
                          setMobileDetailEnquiryId(enquiry?._id || "");
                        }}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="enquiries-dashboard-detail">
              {renderEnquiryDetail(selectedEnquiry)}
            </div>
          </div>
        )
      ) : null}

      {mobileDetailEnquiry ? (
        <div
          className="enquiries-dashboard-mobile-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${copy.singular} details`}
          onClick={() => setMobileDetailEnquiryId("")}
        >
          <div
            className="enquiries-dashboard-mobile-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            {renderEnquiryDetail(mobileDetailEnquiry, {
              showClose: true,
              onClose: () => setMobileDetailEnquiryId(""),
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
