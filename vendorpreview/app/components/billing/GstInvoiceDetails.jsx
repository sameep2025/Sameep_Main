const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPaise(value) {
  const paise = Number(value);
  return Number.isSafeInteger(paise) && paise >= 0 ? rupee.format(paise / 100) : "-";
}

function formatInvoiceDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export default function GstInvoiceDetails({ invoice, sample = false }) {
  if (!invoice) return null;
  const totals = invoice.totals || {};
  const isTestDocument = sample || invoice.documentMode === "TEST";
  const isNonTaxDocument = invoice.documentMode === "NON_TAX_INVOICE";
  const documentTitle = isNonTaxDocument ? "GST Calculation Statement" : "GST Tax Invoice";

  return (
    <section style={styles.section} aria-label="GST invoice details">
      {isTestDocument ? <div style={styles.watermark}>TEST — NOT A TAX INVOICE</div> : null}
      {isNonTaxDocument ? (
        <div style={styles.watermark}>NOT A TAX INVOICE — TAX CLASSIFICATION REQUIRED</div>
      ) : null}
      <div style={styles.heading}>
        <div>
          <p style={styles.eyebrow}>{documentTitle}</p>
          <h2 style={styles.invoiceNumber}>{invoice.invoiceNumber}</h2>
        </div>
        <strong style={styles.date}>{formatInvoiceDate(invoice.invoiceIssueDate)}</strong>
      </div>

      <div style={styles.supplier}>
        <strong>{invoice.supplier?.legalName}</strong>
        <span>GSTIN: {invoice.supplier?.gstin}</span>
        <span>{invoice.supplier?.registeredAddress}</span>
        <span>Place of supply: State code {invoice.placeOfSupply?.stateCode}</span>
        <span>Pricing: {invoice.pricingMode === "inclusive" ? "GST inclusive" : "GST exclusive"}</span>
      </div>

      <div style={styles.items}>
        <div style={styles.itemHeader}>
          <span>Tax item</span><span>Taxable</span><span>GST</span><span>Total</span>
        </div>
        {(invoice.items || []).map((item, index) => (
          <div style={styles.itemRow} key={`${invoice.invoiceNumber}-${index}`}>
            <div style={styles.itemName}>
              <strong>{item.name} × {item.quantity}</strong>
              <span>{item.classificationType} {item.classificationCode || "not provided"} · {Number(item.gstRateBps) / 100}% GST</span>
            </div>
            <span>{formatPaise(item.taxableValuePaise)}</span>
            <span>{formatPaise(item.totalGstPaise)}</span>
            <strong>{formatPaise(item.invoiceTotalPaise)}</strong>
          </div>
        ))}
      </div>

      {(invoice.complianceWarnings || []).length ? (
        <div style={styles.warning}>
          Tax classification needs to be completed before issuing a GST tax invoice.
        </div>
      ) : null}

      <div style={styles.totals}>
        <div style={styles.totalRow}><span>Taxable Value</span><strong>{formatPaise(totals.taxableValuePaise)}</strong></div>
        {Number(totals.cgstPaise) > 0 ? <div style={styles.totalRow}><span>CGST</span><strong>{formatPaise(totals.cgstPaise)}</strong></div> : null}
        {Number(totals.sgstPaise) > 0 ? <div style={styles.totalRow}><span>SGST</span><strong>{formatPaise(totals.sgstPaise)}</strong></div> : null}
        {Number(totals.utgstPaise) > 0 ? <div style={styles.totalRow}><span>UTGST</span><strong>{formatPaise(totals.utgstPaise)}</strong></div> : null}
        {Number(totals.igstPaise) > 0 ? <div style={styles.totalRow}><span>IGST</span><strong>{formatPaise(totals.igstPaise)}</strong></div> : null}
        <div style={styles.totalRow}><span>Total GST</span><strong>{formatPaise(totals.totalGstPaise)}</strong></div>
        <div style={styles.totalRow}><span>Invoice Total</span><strong>{formatPaise(totals.invoiceTotalPaise)}</strong></div>
        {Number(totals.loyaltyRedemptionPaise) > 0 ? (
          <div style={styles.totalRow}><span>Loyalty Redemption</span><strong>-{formatPaise(totals.loyaltyRedemptionPaise)}</strong></div>
        ) : null}
        <div style={{ ...styles.totalRow, ...styles.payable }}><span>Customer Payable</span><strong>{formatPaise(totals.customerPayablePaise)}</strong></div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    marginBottom: "22px",
    padding: "20px",
    borderRadius: "20px",
    border: "1px solid rgba(155, 107, 47, 0.28)",
    background: "rgba(244, 234, 220, 0.72)",
    color: "#2f2417",
  },
  heading: { display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" },
  eyebrow: { margin: "0 0 5px", color: "#9b6b2f", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" },
  invoiceNumber: { margin: 0, fontSize: "22px" },
  date: { color: "#6f5330", fontSize: "14px" },
  supplier: { display: "flex", flexDirection: "column", gap: "4px", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid rgba(155, 107, 47, 0.18)" },
  items: { marginTop: "16px", overflowX: "auto" },
  itemHeader: { display: "grid", gridTemplateColumns: "minmax(190px, 1fr) repeat(3, minmax(90px, auto))", gap: "10px", minWidth: "560px", paddingBottom: "8px", fontWeight: 800, color: "#76542d" },
  itemRow: { display: "grid", gridTemplateColumns: "minmax(190px, 1fr) repeat(3, minmax(90px, auto))", gap: "10px", minWidth: "560px", padding: "10px 0", borderTop: "1px solid rgba(155, 107, 47, 0.14)", alignItems: "start" },
  itemName: { display: "flex", flexDirection: "column", gap: "3px" },
  totals: { display: "grid", gap: "7px", marginTop: "15px", marginLeft: "auto", maxWidth: "360px" },
  totalRow: { display: "flex", justifyContent: "space-between", gap: "16px" },
  payable: { borderTop: "1px solid rgba(155, 107, 47, 0.28)", paddingTop: "8px", fontSize: "17px" },
  watermark: { marginBottom: "16px", padding: "10px", border: "2px solid #a63e2f", color: "#a63e2f", fontSize: "16px", fontWeight: 900, letterSpacing: "0.08em", textAlign: "center" },
  warning: { marginTop: "14px", padding: "10px", border: "1px solid #a63e2f", color: "#7d2d21", fontWeight: 700 },
};
