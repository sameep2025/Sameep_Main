"use client";

import "./Contact.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaPhoneAlt, FaMapMarkerAlt, FaClock } from "react-icons/fa";
import { useVendor } from "@/app/context/VendorContext";
import { API_BASE_URL } from "../../config";
import {
  buildVendorPreviewAnalyticsPayload,
  trackVendorPreviewEvent,
} from "../utils/siteAnalytics";
import {
  CART_UPDATED_EVENT,
  createEnquirySubmissionKey,
  ENQUIRY_OPEN_EVENT,
  formatCurrency,
  getCommonPathPrefix,
  getEnquiryFieldLabel,
  getEnquiryFieldPlaceholder,
  getEnquiryInputMode,
  getEnquiryInputType,
  getEnquiryTypeLabel,
  getCartHierarchyLabel,
  getTimeSlotOptionsForDate,
  isLikelyPhoneField,
  mergeDateTimeValue,
  normalizeCartItems,
  sanitizeEnquiryValue,
  splitDateTimeValue,
} from "../utils/enquiryFlow";

function loadRazorpayCheckoutScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function buildDefaultFallbackFields() {
  return [
    { name: "Name", fieldType: "text", required: true, enabled: true },
    { name: "Phone Number", fieldType: "phone", required: true, enabled: true },
    { name: "Your Message", fieldType: "text", required: false, enabled: true },
  ];
}

export default function ContactSection({
  mode = "full",
  showCartSummary = true,
  sectionId = "contact",
  hideHeader = false,
  title,
  subtitle,
  submitLabel,
  onSubmitSuccess,
} = {}) {
  const { vendorInfo } = useVendor() || {};
  const formRef = useRef(null);
  const firstInputRef = useRef(null);
  const submissionKeyRef = useRef(createEnquirySubmissionKey());
  const isInlineMode = mode === "inline";

  const rootCategoryId =
    vendorInfo?.categoryId ||
    vendorInfo?.category?._id ||
    vendorInfo?.rootCategoryId ||
    null;

  const vendorId =
    vendorInfo?.vendorId ||
    vendorInfo?._id ||
    vendorInfo?.vendor?._id ||
    null;

  const [categoryData, setCategoryData] = useState(null);
  const [cartState, setCartState] = useState(() => {
    if (typeof window === "undefined") {
      return { vendorId: "", rootCategoryId: "", cartItems: [], cartTotal: 0 };
    }

    return window.__ynotCartState || {
      vendorId: "",
      rootCategoryId: "",
      cartItems: [],
      cartTotal: 0,
    };
  });
  const [formValues, setFormValues] = useState({});
  const [selectedServiceInterest, setSelectedServiceInterest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [paymentConfig, setPaymentConfig] = useState({
    paymentEnabled: false,
    provider: "",
    keyId: "",
    accountName: "",
    mode: "test",
  });

  useEffect(() => {
    if (!rootCategoryId) return;

    let cancelled = false;

    async function loadCategory() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/dummy-categories/${rootCategoryId}`,
          { cache: "no-store" }
        );

        const data = await response.json();
        if (cancelled) return;
        setCategoryData(Array.isArray(data) ? data[0] : data);
      } catch (error) {
        console.error("Contact category fetch failed", error);
        if (!cancelled) setCategoryData(null);
      }
    }

    loadCategory();

    return () => {
      cancelled = true;
    };
  }, [rootCategoryId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleCartUpdated = (event) => {
      const detail = event?.detail || {};
      setCartState({
        vendorId: String(detail?.vendorId || ""),
        rootCategoryId: String(detail?.rootCategoryId || ""),
        cartItems: Array.isArray(detail?.cartItems) ? detail.cartItems : [],
        cartTotal: Number(detail?.cartTotal || 0) || 0,
      });
    };

    const handleOpenEnquiry = () => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        firstInputRef.current?.focus();
      }, 250);
    };

    window.addEventListener(CART_UPDATED_EVENT, handleCartUpdated);
    window.addEventListener(ENQUIRY_OPEN_EVENT, handleOpenEnquiry);

    if (window.__ynotCartState) {
      handleCartUpdated({ detail: window.__ynotCartState });
    }

    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdated);
      window.removeEventListener(ENQUIRY_OPEN_EVENT, handleOpenEnquiry);
    };
  }, []);

  const enquiryConfig = categoryData?.enquiryConfig || null;
  const isEnquiryFlowEnabled = Boolean(enquiryConfig?.enabled);
  const selectedTemplateKey = String(vendorInfo?.selectedTemplateKey || "").trim().toLowerCase();
  const isEcommerceTemplate = selectedTemplateKey === "ecommerce";
  const isRazorpayCheckoutEnabled =
    isEcommerceTemplate &&
    paymentConfig.paymentEnabled &&
    paymentConfig.provider === "razorpay" &&
    Boolean(String(paymentConfig.keyId || "").trim());
  const effectiveEnquiryType =
    String(enquiryConfig?.enquiryType || "").trim() || (isEcommerceTemplate ? "order_request" : "");
  const enquiryTypeLabel = getEnquiryTypeLabel(effectiveEnquiryType);
  const supportedEnquiryFields = useMemo(() => {
    if (isEnquiryFlowEnabled) {
      return (Array.isArray(enquiryConfig?.fields) ? enquiryConfig.fields : [])
        .filter((field) => field?.enabled !== false && String(field?.name || "").trim());
    }

    return buildDefaultFallbackFields();
  }, [enquiryConfig, isEnquiryFlowEnabled]);
  const requiresCartSelection = Boolean(isEnquiryFlowEnabled && enquiryConfig?.cartBasedEnquiry);
  const normalizedCartItems = useMemo(
    () => normalizeCartItems(cartState?.cartItems || []),
    [cartState]
  );
  const serviceInterestOptions = normalizedCartItems.map((item) => ({
    value: item.cartKey,
    label: `${item.label} x${item.qty}${item.total > 0 ? ` • ${formatCurrency(item.total)}` : ""}`,
  }));
  const activeServiceInterest =
    serviceInterestOptions.some((option) => option.value === selectedServiceInterest)
      ? selectedServiceInterest
      : serviceInterestOptions[0]?.value || "";
  const effectiveCartItems = useMemo(() => {
    if (isEcommerceTemplate) return normalizedCartItems;
    if (!requiresCartSelection) return normalizedCartItems;
    if (!activeServiceInterest) return normalizedCartItems;
    return normalizedCartItems;
  }, [activeServiceInterest, isEcommerceTemplate, normalizedCartItems, requiresCartSelection]);
  const cartSummary = useMemo(() => {
    return effectiveCartItems
      .map((item) => `${item.label} x${item.qty}${item.total > 0 ? ` • ${formatCurrency(item.total)}` : ""}`)
      .join(", ");
  }, [effectiveCartItems]);
  const cartMrpTotal = useMemo(() => {
    return normalizedCartItems.reduce((sum, item) => {
      const referencePrice = Number(item?.mrp) > 0 ? Number(item.mrp) : Number(item?.price || 0);
      return sum + referencePrice * (Number(item?.qty || 0) || 1);
    }, 0);
  }, [normalizedCartItems]);
  const cartDiscountTotal = Math.max(cartMrpTotal - (Number(cartState?.cartTotal || 0) || 0), 0);

  useEffect(() => {
    setFormValues((prev) => {
      const next = {};
      supportedEnquiryFields.forEach((field) => {
        next[field.name] = prev[field.name] || "";
      });
      return next;
    });
  }, [supportedEnquiryFields]);

  useEffect(() => {
    if (!isEcommerceTemplate || !vendorId) {
      setPaymentConfig({
        paymentEnabled: false,
        provider: "",
        keyId: "",
        accountName: "",
        mode: "test",
      });
      return;
    }

    let cancelled = false;

    async function loadPaymentConfig() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/vendor-payment-config/${vendorId}`,
          { cache: "no-store" }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;

        const config = data?.config || {};
        setPaymentConfig({
          paymentEnabled: Boolean(config.paymentEnabled),
          provider: String(config.provider || ""),
          keyId: String(config?.razorpay?.keyId || ""),
          accountName: String(config?.razorpay?.accountName || ""),
          mode: String(config?.razorpay?.mode || "test"),
        });
      } catch (error) {
        console.error("Payment config fetch failed", error);
        if (!cancelled) {
          setPaymentConfig({
            paymentEnabled: false,
            provider: "",
            keyId: "",
            accountName: "",
            mode: "test",
          });
        }
      }
    }

    loadPaymentConfig();

    return () => {
      cancelled = true;
    };
  }, [isEcommerceTemplate, vendorId]);

  const phoneField = useMemo(
    () => supportedEnquiryFields.find((field) => isLikelyPhoneField(field)),
    [supportedEnquiryFields]
  );

  const phone =
    vendorInfo?.phone ||
    vendorInfo?.contact?.phone;
  const secondaryPhones = Array.isArray(vendorInfo?.secondaryPhones)
    ? vendorInfo.secondaryPhones.filter(Boolean)
    : [];
  const location = vendorInfo?.location || {};
  const businessHours = vendorInfo?.businessHours || vendorInfo?.hours || [];

  const handleFieldChange = (field, value) => {
    setFormValues((prev) => ({
      ...prev,
      [field.name]: sanitizeEnquiryValue(field, value),
    }));
  };

  const resetFormAfterSuccess = () => {
    setFormValues(
      supportedEnquiryFields.reduce((acc, field) => {
        acc[field.name] = "";
        return acc;
      }, {})
    );
    setSelectedServiceInterest("");

    if (isEcommerceTemplate && typeof window !== "undefined") {
      const nextCartState = {
        vendorId: String(vendorId || ""),
        rootCategoryId: String(rootCategoryId || ""),
        cartItems: [],
        cartTotal: 0,
      };

      window.__ynotCartState = nextCartState;
      window.dispatchEvent(
        new CustomEvent(CART_UPDATED_EVENT, {
          detail: nextCartState,
        })
      );
    }
  };

  async function handleSubmit(event) {
    event.preventDefault();

    if (!vendorId || !rootCategoryId) {
      setFeedback("Vendor details are missing. Unable to submit enquiry.");
      return;
    }

    if (requiresCartSelection && normalizedCartItems.length === 0) {
      setFeedback("Add items to cart to send enquiry.");
      return;
    }

    if (!isEcommerceTemplate && requiresCartSelection && !activeServiceInterest && normalizedCartItems.length > 0) {
      setFeedback("Please choose the service interest from your selected items.");
      return;
    }

    const nextAttributes = {};

    for (const field of supportedEnquiryFields) {
      const rawValue = String(formValues[field.name] || "").trim();
      if (field.required && !rawValue) {
        setFeedback(`${getEnquiryFieldLabel(field)} is required.`);
        return;
      }

      if (rawValue) {
        nextAttributes[getEnquiryFieldLabel(field)] = rawValue;
      }
    }

    const phoneValue = phoneField ? String(formValues[phoneField.name] || "").trim() : "";
    if (phoneField && phoneValue.length !== 10) {
      setFeedback("Enter a valid 10 digit mobile number.");
      return;
    }

    let storedUser = {};
    if (typeof window !== "undefined") {
      try {
        storedUser = JSON.parse(localStorage.getItem("userData") || "{}");
      } catch {
        storedUser = {};
      }
    }

    const aggregateCategoryPath = getCommonPathPrefix(
      effectiveCartItems.map((item) => item.categoryPath)
    );
    const aggregateCategoryIds = [
      ...new Set(
        effectiveCartItems.flatMap((item) => item.categoryPathIds || []).filter(Boolean)
      ),
    ];
    const totalQty = effectiveCartItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const totalPrice = effectiveCartItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const serviceNameSummary =
      effectiveCartItems.length > 1
        ? `${effectiveCartItems[0]?.name || enquiryTypeLabel} +${effectiveCartItems.length - 1} more`
        : effectiveCartItems[0]?.name || categoryData?.name || enquiryTypeLabel;
    const sourceSummary =
      aggregateCategoryPath[0] ||
      effectiveCartItems[0]?.categoryPath?.[0] ||
      categoryData?.name ||
      (isEcommerceTemplate ? "ecommerce-preview" : "classic-preview");
    const selectedInterestItem = normalizedCartItems.find(
      (item) => item.cartKey === activeServiceInterest
    );

    if (cartSummary) {
      nextAttributes.inventoryName = cartSummary;
      nextAttributes.inventoryNames = effectiveCartItems.map((item) => item.label);
    }

    const payload = {
      submissionKey: submissionKeyRef.current,
      vendorId: String(vendorId),
      categoryId: String(rootCategoryId),
      customerId: storedUser?.customerId ? String(storedUser.customerId) : "",
      phone: phoneValue || String(storedUser?.phone || "").trim(),
      serviceName: serviceNameSummary,
      source: sourceSummary,
      categoryPath: aggregateCategoryPath,
      categoryIds: aggregateCategoryIds.length > 0 ? aggregateCategoryIds : [String(rootCategoryId)],
      attributes: nextAttributes,
      price: totalPrice > 0 ? totalPrice : null,
      terms: "",
      meta: {
        template: isEcommerceTemplate ? "ecommerce-preview" : "classic-preview",
        enquiryType: effectiveEnquiryType,
        checkoutProvider: isRazorpayCheckoutEnabled ? "razorpay" : "",
        serviceInterest: isEcommerceTemplate ? "" : activeServiceInterest || "",
        serviceInterestLabel:
          isEcommerceTemplate
            ? effectiveCartItems.map((item) => getCartHierarchyLabel(item)).join(", ")
            : selectedInterestItem
              ? getCartHierarchyLabel(selectedInterestItem)
              : "",
        cartQty: totalQty,
        cartLineCount: effectiveCartItems.length,
        cartItems: effectiveCartItems,
        cartSummary,
      },
    };

    try {
      setIsSubmitting(true);
      setFeedback("");

      if (isRazorpayCheckoutEnabled && isEcommerceTemplate) {
        const orderResponse = await fetch(`${API_BASE_URL}/api/payments/razorpay/order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            currency: "INR",
            notes: {
              categoryId: String(rootCategoryId),
              enquiryType: effectiveEnquiryType,
            },
            ...payload,
          }),
        });

        const orderData = await orderResponse.json().catch(() => ({}));
        if (!orderResponse.ok) {
          setFeedback(orderData?.message || "Payment could not be started.");
          return;
        }

        const scriptLoaded = await loadRazorpayCheckoutScript();
        if (!scriptLoaded || !window.Razorpay) {
          setFeedback("Razorpay checkout could not be loaded.");
          return;
        }

        const checkoutAttemptId = String(orderData?.order?.checkoutAttemptId || "");
        if (!checkoutAttemptId) {
          setFeedback("Payment session could not be created.");
          return;
        }

        const preferredNameField = supportedEnquiryFields.find((field) => {
          const label = getEnquiryFieldLabel(field).toLowerCase();
          return label.includes("name");
        });
        const preferredEmailField = supportedEnquiryFields.find((field) => {
          return getEnquiryInputType(field?.fieldType) === "email";
        });

        const checkout = new window.Razorpay({
          key: String(orderData?.order?.keyId || paymentConfig.keyId || ""),
          amount: Number(orderData?.order?.amount || 0),
          currency: String(orderData?.order?.currency || "INR"),
          name:
            String(paymentConfig.accountName || "").trim() ||
            String(orderData?.order?.vendorName || vendorInfo?.businessName || "YNOT"),
          description: `Order ${checkoutAttemptId}`,
          order_id: String(orderData?.order?.razorpayOrderId || ""),
          prefill: {
            name: preferredNameField ? String(formValues[preferredNameField.name] || "").trim() : "",
            contact: phoneValue,
            email: preferredEmailField ? String(formValues[preferredEmailField.name] || "").trim() : "",
          },
          notes: {
            checkout_attempt_id: checkoutAttemptId,
            vendor_id: String(vendorId),
          },
          theme: {
            color: "#e53935",
          },
          modal: {
            ondismiss: async () => {
              try {
                await fetch(`${API_BASE_URL}/api/payments/razorpay/cancel`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    vendorId: String(vendorId),
                    checkoutAttemptId,
                    reason: "Payment checkout closed by customer",
                  }),
                });
              } catch (cancelError) {
                console.error("Failed to mark cancelled payment attempt", cancelError);
              }
              setFeedback("Payment was cancelled. The order is not confirmed until payment succeeds.");
            },
          },
          handler: async (razorpayResponse) => {
            try {
              setIsSubmitting(true);
              const verifyResponse = await fetch(`${API_BASE_URL}/api/payments/razorpay/verify`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  vendorId: String(vendorId),
                  checkoutAttemptId,
                  razorpay_order_id: razorpayResponse?.razorpay_order_id || "",
                  razorpay_payment_id: razorpayResponse?.razorpay_payment_id || "",
                  razorpay_signature: razorpayResponse?.razorpay_signature || "",
                }),
              });

              const verifyData = await verifyResponse.json().catch(() => ({}));
              if (!verifyResponse.ok) {
                setFeedback(verifyData?.message || "Payment verification failed.");
                return;
              }

              setFeedback("Order and payment submitted successfully.");
              trackVendorPreviewEvent(
                API_BASE_URL,
                buildVendorPreviewAnalyticsPayload({
                  vendorId,
                  eventType: "enquiry_submit",
                  meta: {
                    sourceLabel: "ecommerce_paid_order",
                    utmContent: String(rootCategoryId || ""),
                  },
                })
              );
              resetFormAfterSuccess();
              if (typeof onSubmitSuccess === "function") {
                onSubmitSuccess({
                  enquiry: verifyData?.enquiry || null,
                  payment: verifyData,
                });
              }
            } catch (verifyError) {
              console.error("Razorpay verification failed", verifyError);
              setFeedback("Payment was captured, but verification failed. Please contact the vendor.");
            } finally {
              setIsSubmitting(false);
            }
          },
        });

        checkout.open();
        setIsSubmitting(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/enquiries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(data?.message || `Failed to submit ${isEcommerceTemplate ? "order" : "enquiry"}.`);
        return;
      }

      setFeedback(`${isEcommerceTemplate ? "Order" : "Enquiry"} submitted successfully.`);
      submissionKeyRef.current = createEnquirySubmissionKey();
      trackVendorPreviewEvent(
        API_BASE_URL,
        buildVendorPreviewAnalyticsPayload({
          vendorId,
          eventType: "enquiry_submit",
          meta: {
            sourceLabel: effectiveEnquiryType || "service_enquiry",
            utmContent: String(rootCategoryId || ""),
          },
        })
      );
      resetFormAfterSuccess();
      if (typeof onSubmitSuccess === "function") {
        onSubmitSuccess(data);
      }
    } catch (error) {
      console.error("Enquiry submission failed", error);
      setFeedback(`Failed to submit ${isEcommerceTemplate ? "order" : "enquiry"}.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!vendorInfo) return null;

  const resolvedTitle = title || enquiryTypeLabel;
  const resolvedSubtitle =
    subtitle ||
    `Share your details and we will review your ${isEcommerceTemplate ? "order" : "enquiry"} shortly.`;
  const resolvedSubmitLabel =
    submitLabel ||
    (isEcommerceTemplate
      ? (isRazorpayCheckoutEnabled ? "Proceed to Payment" : "Place Order")
      : enquiryTypeLabel);

  const formMarkup = (
    <form ref={formRef} className={`contact-form-card${isInlineMode ? " contact-form-card--inline" : ""}`} onSubmit={handleSubmit}>
      {showCartSummary && normalizedCartItems.length > 0 ? (
        <div className={`contact-cart-card ${isEcommerceTemplate ? "contact-cart-card--ecommerce" : ""}`}>
          <div className="contact-cart-head">
            <h3>{isEcommerceTemplate ? "Order Summary" : "Selected Items"}</h3>
            <span>{formatCurrency(cartState?.cartTotal || 0)}</span>
          </div>
          <div className="contact-cart-list">
            {normalizedCartItems.map((item) => (
              <div key={item.cartKey} className="contact-cart-row">
                <div className="contact-cart-row-copy">
                  <strong>{item.label}</strong>
                  <span>
                    Qty {item.qty}
                    {item.itemCode ? ` • ${item.itemCode}` : ""}
                    {item.unitLabel ? ` • ${item.unitLabel}` : ""}
                  </span>
                  {isEcommerceTemplate && (Number(item.mrp) > 0 || Number(item.discountPercent) > 0) ? (
                    <small>
                      {Number(item.mrp) > 0 ? `MRP ${formatCurrency(item.mrp)}` : ""}
                      {Number(item.mrp) > 0 && Number(item.discountPercent) > 0 ? " • " : ""}
                      {Number(item.discountPercent) > 0 ? `${Number(item.discountPercent)}% off` : ""}
                    </small>
                  ) : null}
                </div>
                <div className="contact-cart-row-total">{formatCurrency(item.total)}</div>
              </div>
            ))}
          </div>
          {isEcommerceTemplate ? (
            <div className="contact-order-totals">
              <div className="contact-order-totals-row">
                <span>Total MRP</span>
                <strong>{formatCurrency(cartMrpTotal)}</strong>
              </div>
              <div className="contact-order-totals-row">
                <span>Discount</span>
                <strong>- {formatCurrency(cartDiscountTotal)}</strong>
              </div>
              <div className="contact-order-totals-row is-total">
                <span>Net Pay</span>
                <strong>{formatCurrency(cartState?.cartTotal || 0)}</strong>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {requiresCartSelection && normalizedCartItems.length > 0 && !isInlineMode ? (
        <select
          className="contact-select"
          value={activeServiceInterest}
          onChange={(event) => setSelectedServiceInterest(event.target.value)}
        >
          <option value="">{isEcommerceTemplate ? "Select order item" : "Select service interest"}</option>
          {serviceInterestOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {supportedEnquiryFields.map((field, index) => {
        const inputType = getEnquiryInputType(field?.fieldType);
        const isDateTimeField = inputType === "datetime-local";
        const dateTimeValue = splitDateTimeValue(formValues[field.name] || "");
        const dateAwareTimeSlots = isDateTimeField
          ? getTimeSlotOptionsForDate(businessHours, dateTimeValue.date)
          : [];
        const hasAvailableDateSlots = dateAwareTimeSlots.length > 0;
        const commonProps = {
          value: formValues[field.name] || "",
          onChange: (event) => handleFieldChange(field, event.target.value),
          placeholder: getEnquiryFieldPlaceholder(field),
          required: Boolean(field?.required),
          inputMode: getEnquiryInputMode(field),
        };

        if (inputType === "textarea") {
          return (
            <textarea
              key={field.name}
              ref={index === 0 ? firstInputRef : undefined}
              {...commonProps}
            />
          );
        }

        const shouldUseTextarea =
          inputType === "text" &&
          String(getEnquiryFieldLabel(field)).toLowerCase().includes("message");

        if (shouldUseTextarea) {
          return (
            <textarea
              key={field.name}
              ref={index === 0 ? firstInputRef : undefined}
              {...commonProps}
            />
          );
        }

        if (isDateTimeField) {
          return (
            <div key={field.name} className="contact-datetime-group">
              <div className="contact-date-wrap">
                <input
                  ref={index === 0 ? firstInputRef : undefined}
                  type="date"
                  value={dateTimeValue.date}
                  onChange={(event) =>
                    setFormValues((prev) => ({
                      ...prev,
                      [field.name]: mergeDateTimeValue(
                        event.target.value,
                        ""
                      ),
                    }))
                  }
                  required={Boolean(field?.required)}
                />
              </div>
              <select
                className="contact-select"
                value={dateTimeValue.time}
                onChange={(event) =>
                  setFormValues((prev) => ({
                    ...prev,
                    [field.name]: mergeDateTimeValue(
                      dateTimeValue.date,
                      event.target.value
                    ),
                  }))
                }
                disabled={Boolean(dateTimeValue.date) && !hasAvailableDateSlots}
              >
                <option value="">
                  {Boolean(dateTimeValue.date) && !hasAvailableDateSlots
                    ? "No slots available"
                    : "Select time"}
                </option>
                {dateAwareTimeSlots.map((slot) => (
                  <option key={`${field.name}-${slot.value}`} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        return (
          <input
            key={field.name}
            ref={index === 0 ? firstInputRef : undefined}
            type={inputType}
            {...commonProps}
          />
        );
      })}

      {feedback ? (
        <div className={`contact-feedback ${feedback.includes("successfully") ? "success" : "error"}`}>
          {feedback}
        </div>
      ) : null}

      <button
        className="send-btn"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Submitting..." : resolvedSubmitLabel}
      </button>
    </form>
  );

  if (isInlineMode) {
    return (
      <div id={sectionId} className="contact-inline-section">
        {hideHeader ? null : (
          <>
            <h3 className="contact-inline-title">{resolvedTitle}</h3>
            {resolvedSubtitle ? <p className="contact-inline-subtitle">{resolvedSubtitle}</p> : null}
          </>
        )}
        {formMarkup}
      </div>
    );
  }

  return (
    <section id={sectionId} className="contact-section">
      {hideHeader ? null : <h2 className="contact-title">{resolvedTitle}</h2>}
      {hideHeader ? null : <p className="contact-subtitle">{resolvedSubtitle}</p>}

      <div className="contact-grid">
        <div className="contact-left">
          <div className="contact-card">
            <div className="card-header">
              <FaPhoneAlt className="icon" />
              <h3>Call Us</h3>
            </div>
            <p className="contact-info">
              {phone ? (
                <a
                  href={`tel:${phone}`}
                  onClick={() =>
                    trackVendorPreviewEvent(
                      API_BASE_URL,
                      buildVendorPreviewAnalyticsPayload({
                        vendorId,
                        eventType: "cta_click",
                        meta: { sourceLabel: "contact_phone_primary" },
                      })
                    )
                  }
                >
                  {phone}
                </a>
              ) : (
                "Phone not available"
              )}
            </p>
            {secondaryPhones.length > 0 && (
              <div className="contact-secondary-list">
                {secondaryPhones.map((secondaryPhone) => (
                  <a
                    key={secondaryPhone}
                    className="contact-secondary-link"
                    href={`tel:${secondaryPhone}`}
                    onClick={() =>
                      trackVendorPreviewEvent(
                        API_BASE_URL,
                        buildVendorPreviewAnalyticsPayload({
                          vendorId,
                          eventType: "cta_click",
                          meta: { sourceLabel: "contact_phone_secondary" },
                        })
                      )
                    }
                  >
                    {secondaryPhone}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="contact-card">
            <div className="card-header">
              <FaMapMarkerAlt className="icon" />
              <h3>Our Location</h3>
            </div>

            <p className="contact-info">
              {location?.address || "Location not available"}
            </p>

            {location?.lat && location?.lng && (
              <div className="map-box">
                <iframe
                  title="map"
                  width="100%"
                  height="200"
                  loading="lazy"
                  src={`https://www.google.com/maps?q=${location.lat},${location.lng}&z=15&output=embed`}
                />
              </div>
            )}
          </div>

          <div className="contact-card">
            <div className="card-header">
              <FaClock className="icon" />
              <h3>Business Hours</h3>
            </div>

            <ul className="hours-list">
              {Array.isArray(businessHours) && businessHours.length > 0 ? (
                businessHours.map((bh, index) => (
                  <li key={bh._id || index}>
                    <span>{bh.day}</span>
                    <span>{bh.hours || "Closed"}</span>
                  </li>
                ))
              ) : (
                <li>Business hours not available</li>
              )}
            </ul>
          </div>
        </div>

        <div className="contact-right">
          {formMarkup}
        </div>
      </div>
    </section>
  );
}
