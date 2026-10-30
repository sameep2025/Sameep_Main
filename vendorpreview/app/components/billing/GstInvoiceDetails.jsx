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

function TaxRow({ label, value, strong = false, negative = false, hideWhenZero = false }) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || (hideWhenZero && amount === 0)) return null;
  return (
    <div className={`${styles.totalRow} ${strong ? styles.strongRow : ""}`}>
      <span>{label}</span>
      <strong>{negative ? "-" : ""}{formatPaise(amount)}</strong>
    </div>
  );
}

function getItemMetadata(data, index) {
  const item = Array.isArray(data?.items) ? data.items[index] : null;
  if (!item) return [];

  const metadata = [];
  const hierarchy = String(item.hierarchy || "").trim();
  const staffName = String(item.resourceName || item.staffName || "").trim();
  if (hierarchy && hierarchy !== String(item.name || "").trim()) metadata.push(hierarchy);
  if (staffName) metadata.push(`Staff: ${staffName}`);
  return metadata;
}

export default function GstInvoiceDetails({ data, invoice: providedInvoice, sample = false, poweredByUrl = "" }) {
  const invoice = data?.gstInvoice || providedInvoice;
  if (!invoice) return null;

  const totals = invoice.totals || {};
  const isTestDocument = sample || invoice.documentMode === "TEST";
  const isNonTaxDocument = invoice.documentMode === "NON_TAX_INVOICE";
  const documentTitle = isTestDocument
    ? "GST Test Invoice"
    : isNonTaxDocument
      ? "GST Calculation Statement"
      : "GST Tax Invoice";
  const customerName = String(data?.customer?.name || "Customer").trim();
  const customerPhone = String(data?.customer?.phone || "").trim();
  const vendorPhone = String(data?.vendor?.phone || "").trim();
  const membershipPlanName = String(data?.membership?.planName || "").trim();
  const pointsEarned = Number(data?.totals?.pointsEarned || 0);
  const pointsRedeemed = Number(data?.totals?.pointsRedeemed || 0);
  const loyaltyBalance = Number(data?.totals?.balance);

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
            {isTestDocument ? <strong>Non-production test record · Not a tax invoice</strong> : null}
            {isNonTaxDocument ? <strong>Not a tax invoice</strong> : null}
          </div>
        </section>

        <section className={styles.customer}>
          <span className={styles.label}>Bill to</span>
          <strong>{customerName}</strong>
          {customerPhone ? <span>{customerPhone}</span> : null}
        </section>

        <section className={styles.itemTable} aria-label="Invoice items">
          <div className={styles.itemHeader}>
            <span>Description</span><span>Qty</span><span>Unit price</span><span>Line total</span>
          </div>
          {(invoice.items || []).map((item, index) => {
            const metadata = getItemMetadata(data, index);
            return (
              <div className={styles.itemRow} key={`${invoice.invoiceNumber}-${index}`}>
                <div className={styles.itemDescription}>
                  <strong>{item.name}</strong>
                  <span>{Number(item.gstRateBps) / 100}% GST</span>
                  {metadata.map((value) => <span key={value}>{value}</span>)}
                </div>
                <span className={styles.quantity} data-label="Qty">{item.quantity}</span>
                <span className={styles.amount} data-label="Unit price">{formatPaise(item.unitPricePaise)}</span>
                <strong className={styles.amount} data-label="Line total">{formatPaise(item.grossAmountPaise)}</strong>
              </div>
            );
          })}
        </section>

        <div className={styles.pricingNote}>
          {invoice.pricingMode === "inclusive"
            ? "GST is included in the item prices shown above."
            : "GST is added to the taxable item prices shown above."}
        </div>

        <section className={styles.summary}>
          <TaxRow label="Services subtotal" value={totals.grossAmountPaise} />
          <TaxRow
            label={membershipPlanName ? `Membership discount · ${membershipPlanName}` : "Membership discount"}
            value={totals.membershipDiscountPaise}
            negative
            hideWhenZero
          />
          <TaxRow label="Manual discount" value={totals.manualDiscountPaise} negative hideWhenZero />
          <TaxRow label="Loyalty redemption" value={totals.loyaltyRedemptionPaise} negative hideWhenZero />
          <TaxRow label="Taxable value" value={totals.taxableValuePaise} />
          <TaxRow label="CGST" value={totals.cgstPaise} hideWhenZero />
          <TaxRow label="SGST" value={totals.sgstPaise} hideWhenZero />
          <TaxRow label="UTGST" value={totals.utgstPaise} hideWhenZero />
          <TaxRow label="IGST" value={totals.igstPaise} hideWhenZero />
          <TaxRow label="Total GST" value={totals.totalGstPaise} />
          <TaxRow label="Invoice total" value={totals.invoiceTotalPaise} strong />
          <div className={`${styles.totalRow} ${styles.payable}`}>
            <span>Final amount paid</span>
            <strong>{formatPaise(totals.customerPayablePaise)}</strong>
          </div>
        </section>

        <section className={styles.loyalty}>
          <span>Points earned: <strong>{pointsEarned}</strong></span>
          {pointsRedeemed > 0 ? (
            <span>Points redeemed: <strong>{pointsRedeemed}</strong></span>
          ) : null}
          {Number.isFinite(loyaltyBalance) ? (
            <span>Current balance: <strong>{loyaltyBalance} points</strong></span>
          ) : null}
        </section>

        <footer className={styles.footer}>
          <span>Thank you for visiting.</span>
          {poweredByUrl ? <a href={poweredByUrl}>Powered by YNOT</a> : <span>Powered by YNOT</span>}
        </footer>
      </article>
    </main>
  );
}
