import styles from "./GstInvoiceDetails.module.css";

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

function TaxRow({ label, value, strong = false, negative = false }) {
  if (!Number(value)) return null;
  return (
    <div className={`${styles.totalRow} ${strong ? styles.strongRow : ""}`}>
      <span>{label}</span>
      <strong>{negative ? "-" : ""}{formatPaise(value)}</strong>
    </div>
  );
}

export default function GstInvoiceDetails({ data, poweredByUrl = "" }) {
  const invoice = data?.gstInvoice;
  if (!invoice) return null;

  const totals = invoice.totals || {};
  const isTestDocument = invoice.documentMode === "TEST";
  const isNonTaxDocument = invoice.documentMode === "NON_TAX_INVOICE";
  const documentTitle = isNonTaxDocument ? "GST Calculation Statement" : "GST Tax Invoice";
  const customerName = String(data?.customer?.name || "Customer").trim();
  const customerPhone = String(data?.customer?.phone || "").trim();
  const vendorPhone = String(data?.vendor?.phone || "").trim();

  return (
    <main className={styles.page}>
      <article className={styles.invoice} aria-label="GST invoice details">
        <header className={styles.businessHeader}>
          <div>
            <h1>{invoice.supplier?.legalName || data?.vendor?.businessName || "Business"}</h1>
            {data?.vendor?.businessName && data.vendor.businessName !== invoice.supplier?.legalName ? (
              <p className={styles.tradeName}>{data.vendor.businessName}</p>
            ) : null}
          </div>
          <div className={styles.businessMeta}>
            <span>{invoice.supplier?.registeredAddress}</span>
            {vendorPhone ? <span>{vendorPhone}</span> : null}
            <strong>GSTIN: {invoice.supplier?.gstin}</strong>
          </div>
        </header>

        <section className={styles.documentHeader}>
          <div>
            <p className={styles.documentTitle}>{documentTitle}</p>
            <strong className={styles.invoiceNumber}>{invoice.invoiceNumber}</strong>
          </div>
          <div className={styles.documentMeta}>
            <span>{formatInvoiceDate(invoice.invoiceIssueDate)}</span>
            <span>Place of supply: State code {invoice.placeOfSupply?.stateCode}</span>
          </div>
        </section>

        {isTestDocument || isNonTaxDocument ? (
          <div className={styles.documentNotice}>
            {isTestDocument ? "TEST · NOT A TAX INVOICE" : "NOT A TAX INVOICE"}
          </div>
        ) : null}

        <section className={styles.customer}>
          <span className={styles.label}>Bill to</span>
          <strong>{customerName}</strong>
          {customerPhone ? <span>{customerPhone}</span> : null}
        </section>

        <section className={styles.itemTable} aria-label="Invoice items">
          <div className={styles.itemHeader}>
            <span>Description</span><span>Qty</span><span>Taxable</span><span>GST</span><span>Total</span>
          </div>
          {(invoice.items || []).map((item, index) => (
            <div className={styles.itemRow} key={`${invoice.invoiceNumber}-${index}`}>
              <div className={styles.itemDescription}>
                <strong>{item.name}</strong>
                <span>
                  {Number(item.gstRateBps) / 100}% GST
                  {item.classificationCode
                    ? ` · ${item.classificationType} ${item.classificationCode}`
                    : ""}
                </span>
              </div>
              <span className={styles.quantity} data-label="Qty">{item.quantity}</span>
              <span className={styles.amount} data-label="Taxable">{formatPaise(item.taxableValuePaise)}</span>
              <span className={styles.amount} data-label="GST">{formatPaise(item.totalGstPaise)}</span>
              <strong className={styles.amount} data-label="Total">{formatPaise(item.invoiceTotalPaise)}</strong>
            </div>
          ))}
        </section>

        <div className={styles.pricingNote}>
          {invoice.pricingMode === "inclusive"
            ? "GST is included in the item prices shown above."
            : "GST is added to the taxable item prices shown above."}
        </div>

        <section className={styles.summary}>
          <TaxRow label="Membership discount" value={totals.membershipDiscountPaise} negative />
          <TaxRow label="Additional discount" value={totals.manualDiscountPaise} negative />
          <TaxRow label="Taxable value" value={totals.taxableValuePaise} />
          <TaxRow label="CGST" value={totals.cgstPaise} />
          <TaxRow label="SGST" value={totals.sgstPaise} />
          <TaxRow label="UTGST" value={totals.utgstPaise} />
          <TaxRow label="IGST" value={totals.igstPaise} />
          <TaxRow label="Total GST" value={totals.totalGstPaise} />
          <TaxRow label="Invoice total" value={totals.invoiceTotalPaise} strong />
          <TaxRow label="Rewards redeemed" value={totals.loyaltyRedemptionPaise} negative />
          <div className={`${styles.totalRow} ${styles.payable}`}>
            <span>Amount paid</span>
            <strong>{formatPaise(totals.customerPayablePaise)}</strong>
          </div>
        </section>

        <section className={styles.loyalty}>
          <span>Points earned: <strong>{Number(data?.totals?.pointsEarned || 0)}</strong></span>
          {Number(data?.totals?.pointsRedeemed || 0) > 0 ? (
            <span>Points redeemed: <strong>{Number(data.totals.pointsRedeemed)}</strong></span>
          ) : null}
          <span>Balance: <strong>{Number(data?.totals?.balance || 0)} points</strong></span>
        </section>

        <footer className={styles.footer}>
          <span>Thank you for visiting.</span>
          {poweredByUrl ? <a href={poweredByUrl}>Powered by YNOT</a> : <span>Powered by YNOT</span>}
        </footer>
      </article>
    </main>
  );
}
