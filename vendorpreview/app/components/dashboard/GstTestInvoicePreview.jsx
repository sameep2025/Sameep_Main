"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import { printReceiptSnapshot } from "../../utils/receiptPrint";
import GstInvoiceDetails from "../billing/GstInvoiceDetails";

function formatPaise(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0) / 100);
}

export default function GstTestInvoicePreview({ vendorId, vendorName, onClose }) {
  const [catalog, setCatalog] = useState([]);
  const [selectedItemKey, setSelectedItemKey] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [sampleItems, setSampleItems] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_BASE_URL}/api/vendor/gst-preview/${encodeURIComponent(vendorId)}/test-invoice/items`,
          { cache: "no-store", headers: getVendorAuthHeaders(vendorId) }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || "Unable to load catalog items");
        if (!cancelled) {
          const items = data?.data?.items || [];
          setCatalog(items);
          setSelectedItemKey(items[0] ? `${items[0].itemSource}:${items[0].itemId}` : "");
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || "Unable to load catalog items");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCatalog();
    return () => { cancelled = true; };
  }, [vendorId]);

  const selectedItem = useMemo(
    () => catalog.find((item) => `${item.itemSource}:${item.itemId}` === selectedItemKey),
    [catalog, selectedItemKey]
  );

  const addSampleItem = () => {
    const qty = Number(quantity);
    if (!selectedItem || !Number.isFinite(qty) || qty <= 0) {
      setError("Select an item and enter a valid quantity.");
      return;
    }
    setSampleItems((current) => {
      const key = `${selectedItem.itemSource}:${selectedItem.itemId}`;
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) => item.key === key ? { ...item, qty: item.qty + qty } : item);
      }
      return [...current, { ...selectedItem, key, qty }];
    });
    setPreview(null);
    setError("");
  };

  const generatePreview = async () => {
    if (!sampleItems.length) {
      setError("Add at least one service or product to the sample invoice.");
      return;
    }
    try {
      setGenerating(true);
      setError("");
      const response = await fetch(
        `${API_BASE_URL}/api/vendor/gst-preview/${encodeURIComponent(vendorId)}/test-invoice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getVendorAuthHeaders(vendorId) },
          body: JSON.stringify({
            items: sampleItems.map((item) => ({
              itemId: item.itemId,
              itemSource: item.itemSource,
              qty: item.qty,
            })),
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Unable to generate sample invoice");
      setPreview(data?.data || null);
    } catch (previewError) {
      setError(previewError?.message || "Unable to generate sample invoice");
    } finally {
      setGenerating(false);
    }
  };

  const printSample = () => {
    if (!preview?.invoice) return;
    const invoice = preview.invoice;
    printReceiptSnapshot({
      isSampleGstInvoice: true,
      vendorName: invoice.supplier?.legalName || vendorName || "Vendor",
      vendorAddress: invoice.supplier?.registeredAddress || "",
      completedAt: invoice.invoiceIssueDate,
      customerLabel: "Sample Customer",
      items: invoice.items.map((item) => ({
        name: item.name,
        qty: item.quantity,
        total: item.invoiceTotalPaise / 100,
      })),
      grossAmount: invoice.totals.grossAmountPaise / 100,
      discountAmount: invoice.totals.totalDiscountPaise / 100,
      netCollected: invoice.totals.customerPayablePaise / 100,
      paymentMode: "CASH",
      gstInvoice: invoice,
    });
  };

  return (
    <div className="gst-sample-overlay" role="dialog" aria-modal="true" aria-labelledby="gst-sample-title">
      <div className="gst-sample-dialog">
        <div className="gst-sample-header">
          <div>
            <p>GST Layout Check</p>
            <h3 id="gst-sample-title">Preview GST Invoice</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close GST invoice preview">×</button>
        </div>

        <div className="gst-sample-builder">
          {loading ? <p>Loading catalog items...</p> : catalog.length === 0 ? (
            <p>No active billable services or products are available.</p>
          ) : (
            <>
              <label>
                <span>Service or product</span>
                <select value={selectedItemKey} onChange={(event) => setSelectedItemKey(event.target.value)}>
                  {catalog.map((item) => (
                    <option key={`${item.itemSource}:${item.itemId}`} value={`${item.itemSource}:${item.itemId}`}>
                      {item.name} · {formatPaise(item.pricePaise)} · {item.itemType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="gst-sample-quantity">
                <span>Quantity</span>
                <input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </label>
              <button type="button" className="gst-sample-secondary" onClick={addSampleItem}>Add Sample Item</button>
            </>
          )}
        </div>

        {sampleItems.length > 0 ? (
          <div className="gst-sample-selected">
            {sampleItems.map((item) => (
              <div key={item.key}>
                <span>{item.name} × {item.qty}</span>
                <button type="button" onClick={() => {
                  setSampleItems((current) => current.filter((entry) => entry.key !== item.key));
                  setPreview(null);
                }}>Remove</button>
              </div>
            ))}
          </div>
        ) : null}

        {error ? <p className="gst-sample-error" role="alert">{error}</p> : null}

        <div className="gst-sample-actions">
          <button type="button" className="gst-sample-primary" disabled={generating || !sampleItems.length} onClick={generatePreview}>
            {generating ? "Generating..." : "Generate Sample Invoice"}
          </button>
          {preview?.invoice ? <button type="button" className="gst-sample-secondary" onClick={printSample}>Print Sample</button> : null}
        </div>

        {preview?.warnings?.map((warning) => (
          <p className="gst-sample-warning" key={warning.code}>{warning.message}</p>
        ))}
        {preview?.invoice ? <GstInvoiceDetails invoice={preview.invoice} sample /> : null}
      </div>
    </div>
  );
}
