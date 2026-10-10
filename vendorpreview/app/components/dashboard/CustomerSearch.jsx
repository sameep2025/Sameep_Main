"use client";

import { useMemo, useState } from "react";
import "./RevenuePanels.css";
import { printReceiptSnapshot } from "../../utils/receiptPrint";

const CUSTOMER_SEARCH_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const CANCELLATION_REASONS = [
  { value: "DUPLICATE_BILL", label: "Duplicate Bill" },
  { value: "WRONG_CUSTOMER", label: "Wrong Customer" },
  { value: "WRONG_AMOUNT", label: "Wrong Amount" },
  { value: "WRONG_SERVICES", label: "Wrong Services" },
  { value: "PAYMENT_CANCELLED", label: "Payment Cancelled" },
  { value: "OTHER", label: "Other" },
];

const RESULT_VIEWS = {
  CUSTOMER: "CUSTOMER",
  WALK_IN: "WALK_IN",
};

function formatDateTime(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatItemMeta(item) {
  const parts = [];

  if (Number(item?.qty || 0) > 0) {
    parts.push(`Qty ${item.qty}`);
  }

  if (Array.isArray(item?.nodePath) && item.nodePath.length > 0) {
    parts.push(item.nodePath.join(" / "));
  }

  return parts.join(" • ");
}

function formatItemResource(item) {
  return String(item?.resourceName || "").trim();
}

function getCancellationReasonLabel(reason) {
  return CANCELLATION_REASONS.find((item) => item.value === reason)?.label || reason || "";
}

function getVendorAuthHeaders(vendorId) {
  if (typeof window === "undefined") return {};
  const token =
    (vendorId ? localStorage.getItem(`vendorToken:${vendorId}`) : "") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("token") ||
    "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isVendorConfirmCancellationBill(bill) {
  return bill?.requiresOtp === false || bill?.cancellationMethod === "VENDOR_CONFIRM";
}

function buildReceiptSnapshotFromBillDetail(detail) {
  const totals = detail?.totals || {};
  return {
    vendorName: String(detail?.vendor?.businessName || "YNOT Vendor").trim(),
    vendorPhone: String(detail?.vendor?.phone || "").trim(),
    vendorAddress: String(detail?.vendor?.address || "").trim(),
    completedAt: detail?.completedAt || detail?.createdAt || new Date().toISOString(),
    billingSessionId: String(detail?.billingSessionId || detail?.billId || ""),
    status: String(detail?.status || "COMPLETED"),
    cancelledAt: detail?.cancellation?.cancelledAt || "",
    customerLabel: detail?.customer?.label || "Walk-in",
    items: (detail?.items || []).map((item) => ({
      name: String(item.name || "Item"),
      qty: Number(item.qty || 0),
      price: Number(item.price || 0),
      total: Number(item.total || 0),
    })),
    grossAmount: Number(totals.grossAmount ?? totals.billValue ?? 0),
    discountAmount: Number(totals.discountAmount || 0),
    rewardsRedeemed: Number(totals.rewardsRedeemed || 0),
    netCollected: Number(totals.netCollected || 0),
    paymentMode: String(detail?.paymentMode || "ONLINE"),
  };
}

export default function CustomerSearch({ vendorId }) {
  const [phone, setPhone] = useState("");
  const [activeView, setActiveView] = useState("");
  const [loading, setLoading] = useState(false);
  const [customerData, setCustomerData] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [walkInBills, setWalkInBills] = useState([]);
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkInHasLoaded, setWalkInHasLoaded] = useState(false);
  const [walkInError, setWalkInError] = useState("");
  const [walkInAmbiguousCount, setWalkInAmbiguousCount] = useState(0);
  const [expandedBills, setExpandedBills] = useState({});
  const [billDetail, setBillDetail] = useState(null);
  const [billDetailLoading, setBillDetailLoading] = useState(false);
  const [billActionMessage, setBillActionMessage] = useState("");
  const [billActionError, setBillActionError] = useState("");
  const [resendingBillId, setResendingBillId] = useState("");
  const [cancelModal, setCancelModal] = useState({
    open: false,
    bill: null,
    reason: "DUPLICATE_BILL",
    note: "",
    otp: "",
    otpToken: "",
    phoneMasked: "",
    step: "reason",
    loading: false,
    error: "",
  });

  const sections = useMemo(() => {
    const customer = customerData?.customer || {};
    const loyalty = customerData?.loyalty || {};
    const retention = customerData?.retention || {};

    return {
      overview: [
        { label: "Phone", value: customer.phone ?? "-" },
        { label: "Total Visits", value: customer.totalVisits ?? "-" },
        {
          label: "Total Spend",
          value: customer.totalSpend != null ? currencyFmt.format(Number(customer.totalSpend || 0)) : "-",
        },
        {
          label: "Average Bill",
          value: customer.avgBill != null ? currencyFmt.format(Number(customer.avgBill || 0)) : "-",
        },
        {
          label: "Last Visit",
          value: customer.lastVisit ? formatDateTime(customer.lastVisit) : "-",
        },
      ],
      loyalty: [
        { label: "Available Points", value: loyalty.availablePoints ?? "-" },
        { label: "Total Points Earned", value: loyalty.earned ?? "-" },
        { label: "Total Points Redeemed", value: loyalty.redeemed ?? "-" },
        { label: "Expired Points", value: loyalty.expiredPoints ?? "-" },
        { label: "Expiring Soon", value: loyalty.expiringSoonPoints ?? "-" },
      ],
      retention: [
        { label: "Total Customers", value: retention.totalCustomers ?? "-" },
        { label: "Returning Customers", value: retention.returningCustomers ?? "-" },
        {
          label: "Retention Score",
          value: retention.retentionScore != null ? `${retention.retentionScore}%` : "-",
        },
      ],
    };
  }, [customerData]);

  const sortedWalkInBills = useMemo(() => {
    return walkInBills
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.completedAt || b.transactionDate) -
          new Date(a.createdAt || a.completedAt || a.transactionDate)
      );
  }, [walkInBills]);

  const bills = useMemo(() => {
    const rawBills = Array.isArray(customerData?.bills) ? customerData.bills : [];
    return rawBills
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.transactionDate) -
          new Date(a.createdAt || a.transactionDate)
      );
  }, [customerData]);

  const handleSearch = async () => {
    if (!vendorId || phone.length !== 10) {
      setCustomerData(null);
      setHasSearched(false);
      setErrorMessage("");
      setActiveView("");
      return;
    }

    try {
      setActiveView(RESULT_VIEWS.CUSTOMER);
      setLoading(true);
      setHasSearched(true);
      setErrorMessage("");
      setWalkInError("");
      setBillActionMessage("");
      setBillActionError("");
      const formattedPhone = `91${phone.trim()}`;
      const res = await fetch(
        `${CUSTOMER_SEARCH_API_BASE_URL}/api/vendor/dashboard/customer?vendorId=${encodeURIComponent(vendorId)}&phone=${encodeURIComponent(formattedPhone)}&range=all`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        throw new Error("Failed to search customer");
      }

      const json = await res.json();
      const payload = json?.data && typeof json.data === "object" ? json.data : json;
      setCustomerData(payload?.customer ? payload : null);
      setExpandedBills({});
    } catch (error) {
      console.error("Failed to fetch customer data", error);
      setCustomerData(null);
      setExpandedBills({});
      setErrorMessage("Unable to fetch customer data.");
      setActiveView(RESULT_VIEWS.CUSTOMER);
    } finally {
      setLoading(false);
    }
  };

  const loadWalkInBills = async () => {
    if (!vendorId) return;

    try {
      setActiveView(RESULT_VIEWS.WALK_IN);
      setWalkInLoading(true);
      setWalkInHasLoaded(true);
      setWalkInError("");
      setErrorMessage("");
      setBillActionMessage("");
      setBillActionError("");
      setExpandedBills({});
      const res = await fetch(
        `${CUSTOMER_SEARCH_API_BASE_URL}/api/billing/walk-in/recent?vendorId=${encodeURIComponent(vendorId)}&limit=20`,
        {
          cache: "no-store",
          headers: {
            ...getVendorAuthHeaders(vendorId),
          },
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Unable to load walk-in bills");
      }

      setWalkInBills(Array.isArray(json?.data?.bills) ? json.data.bills : []);
      setWalkInAmbiguousCount(Number(json?.data?.ambiguousCount || 0));
    } catch (error) {
      console.error("Failed to load walk-in bills", error);
      setWalkInBills([]);
      setWalkInError(error.message || "Unable to load walk-in bills.");
    } finally {
      setWalkInLoading(false);
    }
  };

  const toggleBill = (billKey) => {
    setExpandedBills((prev) => ({
      ...prev,
      [billKey]: !prev[billKey],
    }));
  };

  const loadBillDetail = async (billId, { printAfterLoad = false } = {}) => {
    if (!billId) return null;

    try {
      setBillDetailLoading(true);
      setBillActionMessage("");
      setBillActionError("");
      const res = await fetch(
        `${CUSTOMER_SEARCH_API_BASE_URL}/api/billing/${encodeURIComponent(billId)}/vendor-detail`,
        {
          cache: "no-store",
          headers: {
            ...getVendorAuthHeaders(vendorId),
          },
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Unable to load bill details");
      }

      const detail = json.data;
      setBillDetail(detail);
      if (printAfterLoad) {
        printReceiptSnapshot(buildReceiptSnapshotFromBillDetail(detail));
      }
      return detail;
    } catch (error) {
      console.error("Failed to load bill detail", error);
      setBillActionError(error.message || "Unable to load bill details.");
      return null;
    } finally {
      setBillDetailLoading(false);
    }
  };

  const handlePrintBill = async (billId) => {
    const detail =
      billDetail?.billId === String(billId) || billDetail?.billingSessionId === String(billId)
        ? billDetail
        : await loadBillDetail(billId);

    if (detail) {
      printReceiptSnapshot(buildReceiptSnapshotFromBillDetail(detail));
    }
  };

  const handleResendBill = async (billId) => {
    if (!billId) return;

    try {
      setResendingBillId(String(billId));
      setBillActionMessage("");
      setBillActionError("");
      const res = await fetch(
        `${CUSTOMER_SEARCH_API_BASE_URL}/api/billing/${encodeURIComponent(billId)}/resend-whatsapp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Unable to resend WhatsApp bill");
      }
      setBillActionMessage("Bill resent on WhatsApp.");
    } catch (error) {
      console.error("Failed to resend bill", error);
      setBillActionError(error.message || "Unable to resend WhatsApp bill.");
    } finally {
      setResendingBillId("");
    }
  };

  const openCancelModal = (bill) => {
    setBillActionMessage("");
    setBillActionError("");
    setCancelModal({
      open: true,
      bill,
      reason: "DUPLICATE_BILL",
      note: "",
      otp: "",
      otpToken: "",
      phoneMasked: "",
      step: "reason",
      loading: false,
      error: "",
    });
  };

  const closeCancelModal = () => {
    setCancelModal((current) => ({ ...current, open: false, loading: false }));
  };

  const updateCancelledBillLocally = (billId) => {
    setCustomerData((current) => {
      if (!current?.bills) return current;
      return {
        ...current,
        bills: current.bills.map((bill) =>
          String(bill.billId) === String(billId)
            ? {
                ...bill,
                status: "CANCELLED",
                canCancel: false,
                cancellationReason: cancelModal.reason,
                cancellationNote: cancelModal.note,
                cancelledAt: new Date().toISOString(),
              }
            : bill
        ),
      };
    });

    setWalkInBills((current) =>
      current.map((bill) =>
        String(bill.billId) === String(billId)
          ? {
              ...bill,
              status: "CANCELLED",
              canCancel: false,
              cancellationReason: cancelModal.reason,
              cancellationNote: cancelModal.note,
              cancelledAt: new Date().toISOString(),
            }
          : bill
      )
    );

    setBillDetail((current) =>
      current && String(current.billId) === String(billId)
        ? {
            ...current,
            status: "CANCELLED",
            cancellation: {
              ...(current.cancellation || {}),
              reason: cancelModal.reason,
              note: cancelModal.note,
              cancelledAt: new Date().toISOString(),
              canCancel: false,
            },
          }
        : current
    );
  };

  const cancelWalkInByVendorConfirm = async () => {
    const billId = cancelModal.bill?.billId;
    if (!billId || cancelModal.loading) return;
    const note = cancelModal.note.trim();

    if (cancelModal.reason === "OTHER" && !note) {
      setCancelModal((current) => ({
        ...current,
        error: "Please enter a cancellation note for Other.",
      }));
      return;
    }

    const confirmed = window.confirm(
      "No customer mobile number was recorded for this walk-in bill. Cancel this bill without customer OTP?"
    );
    if (!confirmed) return;

    try {
      setCancelModal((current) => ({ ...current, loading: true, error: "" }));
      const res = await fetch(
        `${CUSTOMER_SEARCH_API_BASE_URL}/api/billing/${encodeURIComponent(billId)}/cancel/vendor-confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify({
            reason: cancelModal.reason,
            note,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Unable to cancel walk-in bill");
      }

      updateCancelledBillLocally(billId);
      setBillActionMessage("Walk-in bill cancelled successfully.");
      setCancelModal((current) => ({ ...current, loading: false, open: false }));
      loadWalkInBills();
    } catch (error) {
      setCancelModal((current) => ({
        ...current,
        loading: false,
        error: error.message || "Unable to cancel walk-in bill.",
      }));
    }
  };

  const requestCancelOtp = async () => {
    const billId = cancelModal.bill?.billId;
    if (!billId || cancelModal.loading) return;
    const note = cancelModal.note.trim();

    if (cancelModal.reason === "OTHER" && !note) {
      setCancelModal((current) => ({
        ...current,
        error: "Please enter a cancellation note for Other.",
      }));
      return;
    }

    try {
      setCancelModal((current) => ({ ...current, loading: true, error: "" }));
      const res = await fetch(
        `${CUSTOMER_SEARCH_API_BASE_URL}/api/billing/${encodeURIComponent(billId)}/cancel/request-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify({
            reason: cancelModal.reason,
            note,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Unable to request cancellation OTP");
      }

      setCancelModal((current) => ({
        ...current,
        loading: false,
        step: "otp",
        otpToken: json?.data?.cancelOtpAttemptToken || "",
        phoneMasked: json?.data?.phoneMasked || "",
        error: "",
      }));
    } catch (error) {
      setCancelModal((current) => ({
        ...current,
        loading: false,
        error: error.message || "Unable to request cancellation OTP.",
      }));
    }
  };

  const verifyCancelOtp = async () => {
    const billId = cancelModal.bill?.billId;
    const otp = cancelModal.otp.replace(/\D/g, "").slice(0, 6);
    if (!billId || cancelModal.loading) return;

    if (otp.length !== 6) {
      setCancelModal((current) => ({ ...current, error: "Enter the 6-digit OTP." }));
      return;
    }

    try {
      setCancelModal((current) => ({ ...current, loading: true, error: "" }));
      const res = await fetch(
        `${CUSTOMER_SEARCH_API_BASE_URL}/api/billing/${encodeURIComponent(billId)}/cancel/verify-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify({
            otp,
            cancelOtpAttemptToken: cancelModal.otpToken,
            reason: cancelModal.reason,
            note: cancelModal.note.trim(),
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Unable to cancel bill");
      }

      updateCancelledBillLocally(billId);
      setBillActionMessage("Bill cancelled successfully.");
      setCancelModal((current) => ({ ...current, loading: false, open: false }));
    } catch (error) {
      setCancelModal((current) => ({
        ...current,
        loading: false,
        error: error.message || "Unable to cancel bill.",
      }));
    }
  };

  const cancelModalUsesVendorConfirm = isVendorConfirmCancellationBill(cancelModal.bill);

  return (
    <section className="revenue-panel">
      <div className="revenue-panel-header">
        <div className="revenue-panel-title">Customer Search</div>
        <div className="revenue-panel-subtitle">
          Search by mobile number to inspect customer, loyalty, and retention details.
        </div>
      </div>

      <div className="revenue-panel-search-row">
        <div className="revenue-panel-phone-input">
          <div className="revenue-panel-phone-prefix">+91</div>
          <input
            className="revenue-panel-input revenue-panel-input-phone"
            value={phone}
            onChange={(event) =>
              setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
            }
            placeholder="Enter 10-digit mobile number"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        <button
          type="button"
          className="revenue-panel-button"
          onClick={handleSearch}
          disabled={loading || phone.length !== 10}
        >
          {loading ? "Searching..." : "Search"}
        </button>
        <button
          type="button"
          className="revenue-panel-button secondary"
          onClick={loadWalkInBills}
          disabled={walkInLoading}
        >
          {walkInLoading ? "Loading walk-ins..." : "Recent Walk-in Bills"}
        </button>
      </div>

      {activeView === RESULT_VIEWS.WALK_IN && walkInError ? (
        <div className="revenue-panel-action-error">{walkInError}</div>
      ) : null}

      {activeView === RESULT_VIEWS.WALK_IN && walkInHasLoaded ? (
        <div className="revenue-panel-section">
          <div className="revenue-panel-section-title">
            Recent Walk-in Bills
            <span className="revenue-panel-section-note">No customer mobile recorded</span>
          </div>
          {walkInAmbiguousCount > 0 ? (
            <div className="revenue-panel-action-note revenue-panel-walkin-note">
              {walkInAmbiguousCount} older phone-less bill
              {walkInAmbiguousCount === 1 ? "" : "s"} need customer OTP or manual review because
              the original billing mode is ambiguous.
            </div>
          ) : null}
          {sortedWalkInBills.length === 0 ? (
            <div className="revenue-panel-empty">
              {walkInLoading ? "Loading walk-in bills..." : "No recent phone-less walk-in bills found."}
            </div>
          ) : (
            <div className="revenue-panel-list">
              {sortedWalkInBills.map((bill, index) => {
                const billKey = bill.billId || `walk-in-${index}`;
                const isExpanded = expandedBills[billKey] === true;
                const billItems = Array.isArray(bill.items) ? bill.items : [];
                const isCancelled = bill.status === "CANCELLED";

                return (
                  <div key={billKey} className="revenue-panel-list-item">
                    <div className="revenue-panel-bill-content">
                      <div className="revenue-panel-list-main">
                        {currencyFmt.format(
                          Number(bill.total || bill.amount || bill.totalAmount || 0)
                        )}
                      </div>
                      <div className="revenue-panel-list-sub">
                        {formatDateTime(bill.completedAt || bill.createdAt || bill.transactionDate)}
                      </div>
                      {isCancelled ? (
                        <div className="revenue-panel-status-badge cancelled">CANCELLED</div>
                      ) : null}
                      <div className="revenue-panel-list-sub">
                        {billItems
                          .map((item) => item.name)
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </div>

                      {isExpanded && billItems.length > 0 ? (
                        <div className="revenue-panel-items-list">
                          {billItems.map((item, itemIndex) => (
                            <div
                              key={`${billKey}-item-${item.itemId || item.name || itemIndex}`}
                              className="revenue-panel-item-row"
                            >
                              <div>
                                <div className="revenue-panel-item-name">
                                  {item.name || "Unnamed Item"}
                                </div>
                                <div className="revenue-panel-item-meta">
                                  {formatItemMeta(item)}
                                </div>
                                {formatItemResource(item) ? (
                                  <div className="revenue-panel-item-resource">
                                    Handled by {formatItemResource(item)}
                                  </div>
                                ) : null}
                              </div>
                              <div className="revenue-panel-item-value">
                                {currencyFmt.format(Number(item.total || item.price || 0))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="revenue-panel-bill-actions">
                      <div className="revenue-panel-list-value">Walk-in</div>
                      {billItems.length > 0 ? (
                        <button
                          type="button"
                          className="revenue-panel-expand-btn"
                          onClick={() => toggleBill(billKey)}
                        >
                          {isExpanded ? "Hide items" : "View items"}
                        </button>
                      ) : null}
                      <div className="revenue-panel-bill-menu">
                        <button
                          type="button"
                          className="revenue-panel-expand-btn revenue-panel-action-btn"
                          onClick={() => loadBillDetail(bill.billId)}
                          disabled={billDetailLoading}
                        >
                          View Bill
                        </button>
                        <button
                          type="button"
                          className="revenue-panel-expand-btn revenue-panel-action-btn"
                          onClick={() => handlePrintBill(bill.billId)}
                          disabled={billDetailLoading}
                        >
                          Reprint
                        </button>
                        {isCancelled ? null : bill.canCancel ? (
                          <button
                            type="button"
                            className="revenue-panel-expand-btn revenue-panel-action-btn danger"
                            onClick={() => openCancelModal(bill)}
                          >
                            Cancel Bill
                          </button>
                        ) : (
                          <span className="revenue-panel-action-note">
                            Cancellation unavailable
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {billActionMessage ? (
            <div className="revenue-panel-action-message">{billActionMessage}</div>
          ) : null}
          {billActionError ? (
            <div className="revenue-panel-action-error">{billActionError}</div>
          ) : null}
        </div>
      ) : null}

      {activeView === RESULT_VIEWS.CUSTOMER && errorMessage ? (
        <div className="revenue-panel-empty">{errorMessage}</div>
      ) : activeView === RESULT_VIEWS.CUSTOMER && customerData ? (
        <>
          <div className="revenue-panel-section">
            <div className="revenue-panel-section-title">Customer Overview</div>
            <div className="revenue-panel-customer-grid">
              {sections.overview.map((item) => (
                <div key={item.label} className="revenue-panel-customer-card">
                  <div className="revenue-panel-customer-label">{item.label}</div>
                  <div className="revenue-panel-customer-value">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="revenue-panel-section">
            <div className="revenue-panel-section-title">Loyalty Summary</div>
            <div className="revenue-panel-customer-grid">
              {sections.loyalty.map((item) => (
                <div key={item.label} className="revenue-panel-customer-card">
                  <div className="revenue-panel-customer-label">{item.label}</div>
                  <div className="revenue-panel-customer-value">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="revenue-panel-section">
            <div className="revenue-panel-section-title">Customer Retention</div>
            <div className="revenue-panel-customer-grid">
              {sections.retention.map((item) => (
                <div key={item.label} className="revenue-panel-customer-card">
                  <div className="revenue-panel-customer-label">{item.label}</div>
                  <div className="revenue-panel-customer-value">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="revenue-panel-section">
            <div className="revenue-panel-section-title">Billing History</div>
            {bills.length === 0 ? (
              <div className="revenue-panel-empty">No bills found for this customer.</div>
            ) : (
              <div className="revenue-panel-list">
                {bills.map((bill, index) => {
                  const billKey = bill.billId || `${bill.phone}-${index}`;
                  const isExpanded = expandedBills[billKey] === true;
                  const billItems = Array.isArray(bill.items) ? bill.items : [];
                  const isCancelled = bill.status === "CANCELLED";

                  return (
                    <div
                      key={billKey}
                      className="revenue-panel-list-item"
                    >
                      <div className="revenue-panel-bill-content">
                        <div className="revenue-panel-list-main">
                          {currencyFmt.format(
                            Number(bill.total || bill.amount || bill.totalAmount || 0)
                          )}
                        </div>
                        <div className="revenue-panel-list-sub">
                          {formatDateTime(bill.createdAt || bill.transactionDate)}
                        </div>
                        {isCancelled ? (
                          <div className="revenue-panel-status-badge cancelled">
                            CANCELLED
                          </div>
                        ) : null}
                        <div className="revenue-panel-list-sub">
                          {billItems
                            .map((item) => item.name)
                            .filter(Boolean)
                            .join(", ") || "-"}
                        </div>

                        {isExpanded && billItems.length > 0 ? (
                          <div className="revenue-panel-items-list">
                            {billItems.map((item, itemIndex) => (
                              <div
                                key={`${billKey}-item-${item.itemId || item.name || itemIndex}`}
                                className="revenue-panel-item-row"
                              >
                                <div>
                                  <div className="revenue-panel-item-name">{item.name || "Unnamed Item"}</div>
                                  <div className="revenue-panel-item-meta">{formatItemMeta(item)}</div>
                                  {formatItemResource(item) ? (
                                    <div className="revenue-panel-item-resource">
                                      Handled by {formatItemResource(item)}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="revenue-panel-item-value">
                                  {currencyFmt.format(Number(item.total || item.price || 0))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="revenue-panel-bill-actions">
                        <div className="revenue-panel-list-value">
                          +{Number(bill.earned || bill.pointsEarned || 0)} pts
                        </div>
                        {Number(bill.redeemed || 0) > 0 ? (
                          <div className="revenue-panel-list-sub">
                            Redeemed {Number(bill.redeemed || 0)} pts
                          </div>
                        ) : null}
                        {billItems.length > 0 ? (
                          <button
                            type="button"
                            className="revenue-panel-expand-btn"
                            onClick={() => toggleBill(billKey)}
                          >
                            {isExpanded ? "Hide items" : "View items"}
                          </button>
                        ) : null}
                        <div className="revenue-panel-bill-menu">
                          <button
                            type="button"
                            className="revenue-panel-expand-btn revenue-panel-action-btn"
                            onClick={() => loadBillDetail(bill.billId)}
                            disabled={billDetailLoading}
                          >
                            View Bill
                          </button>
                          <button
                            type="button"
                            className="revenue-panel-expand-btn revenue-panel-action-btn"
                            onClick={() => handlePrintBill(bill.billId)}
                            disabled={billDetailLoading}
                          >
                            Reprint
                          </button>
                          <button
                            type="button"
                            className="revenue-panel-expand-btn revenue-panel-action-btn"
                            onClick={() => handleResendBill(bill.billId)}
                            disabled={isCancelled || resendingBillId === String(bill.billId)}
                          >
                            {resendingBillId === String(bill.billId) ? "Sending..." : "Resend WhatsApp"}
                          </button>
                          {isCancelled ? null : bill.canCancel ? (
                            <button
                              type="button"
                              className="revenue-panel-expand-btn revenue-panel-action-btn danger"
                              onClick={() => openCancelModal(bill)}
                            >
                              Cancel Bill
                            </button>
                          ) : (
                            <span className="revenue-panel-action-note">
                              Cancellation period expired
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
	              </div>
            )}
            {billActionMessage ? (
              <div className="revenue-panel-action-message">{billActionMessage}</div>
            ) : null}
            {billActionError ? (
              <div className="revenue-panel-action-error">{billActionError}</div>
            ) : null}
          </div>
        </>
      ) : activeView === RESULT_VIEWS.CUSTOMER && hasSearched && !loading ? (
        <div className="revenue-panel-empty">
          No customer data found for this phone number.
        </div>
      ) : !activeView ? (
        <div className="revenue-panel-empty">
          Enter a mobile number and search to view customer details.
        </div>
      ) : null}
      {billDetail ? (
        <div className="revenue-panel-bill-modal-overlay" onClick={() => setBillDetail(null)}>
          <div
            className="revenue-panel-bill-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="revenue-panel-bill-modal-header">
              <div>
                <div className="revenue-panel-section-title">Bill Details</div>
                <div className="revenue-panel-list-sub">
                  {formatDateTime(billDetail.completedAt || billDetail.createdAt)}
                </div>
              </div>
              <button
                type="button"
                className="revenue-panel-modal-close"
                onClick={() => setBillDetail(null)}
                aria-label="Close bill details"
              >
                ×
              </button>
            </div>

            <div className="revenue-panel-bill-detail-grid">
              <div>
                <span>Bill ID</span>
                <strong>{String(billDetail.billId || "").slice(-8).toUpperCase()}</strong>
              </div>
              <div>
                <span>Customer</span>
                <strong>{billDetail.customer?.label || "Walk-in"}</strong>
              </div>
              <div>
                <span>Payment</span>
                <strong>{billDetail.paymentMode === "CASH" ? "Cash" : "Online"}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{billDetail.status === "CANCELLED" ? "CANCELLED" : "COMPLETED"}</strong>
              </div>
            </div>

            {billDetail.status === "CANCELLED" ? (
              <div className="revenue-panel-cancelled-note">
                Cancelled
                {billDetail.cancellation?.cancelledAt
                  ? ` on ${formatDateTime(billDetail.cancellation.cancelledAt)}`
                  : ""}
                {billDetail.cancellation?.reason
                  ? ` • ${getCancellationReasonLabel(billDetail.cancellation.reason)}`
                  : ""}
              </div>
            ) : null}

            <div className="revenue-panel-items-list revenue-panel-modal-items">
              {(billDetail.items || []).map((item, index) => (
                <div key={`${billDetail.billId}-detail-${item.itemId || index}`} className="revenue-panel-item-row">
                  <div>
                    <div className="revenue-panel-item-name">{item.name || "Item"}</div>
                    <div className="revenue-panel-item-meta">
                      Qty {Number(item.qty || 0)}
                      {item.resourceName ? ` • Handled by ${item.resourceName}` : ""}
                    </div>
                  </div>
                  <div className="revenue-panel-item-value">
                    {currencyFmt.format(Number(item.total || 0))}
                  </div>
                </div>
              ))}
            </div>

            <div className="revenue-panel-bill-totals">
              <div>
                <span>Bill Value</span>
                <strong>{currencyFmt.format(Number(billDetail.totals?.billValue || 0))}</strong>
              </div>
              {Number(billDetail.totals?.discountAmount || 0) > 0 ? (
                <div>
                  <span>Discount</span>
                  <strong>-{currencyFmt.format(Number(billDetail.totals.discountAmount || 0))}</strong>
                </div>
              ) : null}
              {Number(billDetail.totals?.rewardsRedeemed || 0) > 0 ? (
                <div>
                  <span>Rewards Redeemed</span>
                  <strong>-{currencyFmt.format(Number(billDetail.totals.rewardsRedeemed || 0))}</strong>
                </div>
              ) : null}
              <div className="revenue-panel-bill-total-net">
                <span>Net Collected</span>
                <strong>{currencyFmt.format(Number(billDetail.totals?.netCollected || 0))}</strong>
              </div>
            </div>

            <div className="revenue-panel-modal-actions">
              <button
                type="button"
                className="revenue-panel-button"
                onClick={() => handlePrintBill(billDetail.billId)}
              >
                Reprint Bill
              </button>
              <button
                type="button"
                className="revenue-panel-button secondary"
                onClick={() => handleResendBill(billDetail.billId)}
                disabled={
                  billDetail.status === "CANCELLED" ||
                  resendingBillId === String(billDetail.billId)
                }
              >
                {resendingBillId === String(billDetail.billId) ? "Sending..." : "Resend on WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {cancelModal.open ? (
        <div className="revenue-panel-bill-modal-overlay" onClick={closeCancelModal}>
          <div
            className="revenue-panel-bill-modal revenue-panel-cancel-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="revenue-panel-bill-modal-header">
              <div>
                <div className="revenue-panel-section-title">Cancel Bill</div>
                <div className="revenue-panel-list-sub">
                  {cancelModalUsesVendorConfirm
                    ? "No customer mobile number was recorded for this walk-in bill."
                    : "OTP will be sent to the original bill customer number."}
                </div>
              </div>
              <button
                type="button"
                className="revenue-panel-modal-close"
                onClick={closeCancelModal}
                aria-label="Close cancellation"
              >
                ×
              </button>
            </div>

            <label className="revenue-panel-form-label">
              Reason
              <select
                className="revenue-panel-input"
                value={cancelModal.reason}
                onChange={(event) =>
                  setCancelModal((current) => ({
                    ...current,
                    reason: event.target.value,
                    error: "",
                  }))
                }
                disabled={cancelModal.step === "otp" || cancelModal.loading}
              >
                {CANCELLATION_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="revenue-panel-form-label">
              Note {cancelModal.reason === "OTHER" ? "(required)" : "(optional)"}
              <textarea
                className="revenue-panel-input"
                value={cancelModal.note}
                onChange={(event) =>
                  setCancelModal((current) => ({
                    ...current,
                    note: event.target.value,
                    error: "",
                  }))
                }
                rows={3}
                maxLength={500}
                disabled={cancelModal.step === "otp" || cancelModal.loading}
              />
            </label>

            {cancelModal.step === "otp" ? (
              <label className="revenue-panel-form-label">
                Customer OTP {cancelModal.phoneMasked ? `(${cancelModal.phoneMasked})` : ""}
                <input
                  className="revenue-panel-input"
                  value={cancelModal.otp}
                  onChange={(event) =>
                    setCancelModal((current) => ({
                      ...current,
                      otp: event.target.value.replace(/\D/g, "").slice(0, 6),
                      error: "",
                    }))
                  }
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  disabled={cancelModal.loading}
                />
              </label>
            ) : null}

            {cancelModal.error ? (
              <div className="revenue-panel-action-error">{cancelModal.error}</div>
            ) : null}

            <div className="revenue-panel-modal-actions">
              {cancelModal.step === "reason" ? (
                <button
                  type="button"
                  className="revenue-panel-button danger"
                  onClick={cancelModalUsesVendorConfirm ? cancelWalkInByVendorConfirm : requestCancelOtp}
                  disabled={cancelModal.loading}
                >
                  {cancelModalUsesVendorConfirm
                    ? (cancelModal.loading ? "Cancelling..." : "Confirm & Cancel")
                    : (cancelModal.loading ? "Sending OTP..." : "Send OTP")}
                </button>
              ) : (
                <button
                  type="button"
                  className="revenue-panel-button danger"
                  onClick={verifyCancelOtp}
                  disabled={cancelModal.loading}
                >
                  {cancelModal.loading ? "Cancelling..." : "Verify & Cancel"}
                </button>
              )}
              <button
                type="button"
                className="revenue-panel-button secondary"
                onClick={closeCancelModal}
                disabled={cancelModal.loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
