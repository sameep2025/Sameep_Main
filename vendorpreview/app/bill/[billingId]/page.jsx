import { API_BASE_URL } from "../../../config";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function normalizeWebsite(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function displayWebsite(url) {
  return String(url || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
}

function getPoweredByUrl() {
  return (
    process.env.NEXT_PUBLIC_HARISH_PREVIEW_BASE_URL ||
    process.env.NEXT_PUBLIC_VENDOR_PREVIEW_ROOT_URL ||
    process.env.NEXT_PUBLIC_PREVIEW_BASE_URL ||
    "http://localhost:4000"
  )
    .trim()
    .replace(/\/$/, "");
}

function BillView({ data, error }) {
  const vendorName = data?.vendor?.businessName || "Bill Details";
  const items = Array.isArray(data?.items) ? data.items : [];
  const totals = data?.totals || {};
  const websiteUrl = normalizeWebsite(data?.vendor?.websiteUrl);
  const websiteLabel = displayWebsite(websiteUrl);
  const customerName = String(data?.customer?.name || "").trim();
  const customerPhone = String(data?.customer?.phone || "").trim();
  const vendorPhone = String(data?.vendor?.phone || "").trim();
  const billDate = data?.createdAt ? formatDate(data.createdAt) : "";
  const showCustomerName = customerName && customerName.toLowerCase() !== "customer";
  const poweredByUrl = getPoweredByUrl();
  const discountAmount = Number(totals.discountAmount || 0);
  const rewardsRedeemed = Number(totals.rewardsRedeemed || 0);

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.header}>
          <div style={styles.headerMain}>
            {data?.vendor?.logoUrl ? (
              <img src={data.vendor.logoUrl} alt={vendorName} style={styles.logo} />
            ) : null}
            <div style={styles.headerText}>
              {billDate ? <p style={styles.billDate}>Bill Date: {billDate}</p> : null}
              <h1 style={styles.title}>{vendorName}</h1>
              {vendorPhone || websiteUrl ? (
                <div style={styles.storeContactInline}>
                  {vendorPhone ? (
                    <a href={`tel:${vendorPhone}`} style={styles.storeContactLink}>
                      {vendorPhone}
                    </a>
                  ) : null}
                  {websiteUrl ? (
                    <a href={websiteUrl} target="_blank" rel="noreferrer" style={styles.storeWebsiteLink}>
                      {websiteLabel}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {error ? (
          <div style={styles.errorBox}>
            <strong style={styles.errorTitle}>Bill unavailable</strong>
            <p style={styles.errorText}>{error}</p>
          </div>
        ) : (
          <>
            <div style={styles.summaryGrid}>
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>Subtotal</span>
                <strong style={styles.summaryValue}>{formatCurrency(totals.grossAmount)}</strong>
              </div>
              {discountAmount > 0 ? (
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Discount</span>
                  <strong style={styles.summaryValue}>-{formatCurrency(discountAmount)}</strong>
                </div>
              ) : null}
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>Bill Amount</span>
                <strong style={styles.summaryValue}>{formatCurrency(totals.netBillValue)}</strong>
              </div>
              {rewardsRedeemed > 0 ? (
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>Rewards Redeemed</span>
                  <strong style={styles.summaryValue}>-{formatCurrency(rewardsRedeemed)}</strong>
                </div>
              ) : null}
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>Final Paid</span>
                <strong style={styles.summaryValue}>{formatCurrency(totals.finalPaid)}</strong>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>Points Earned</span>
                <strong style={styles.summaryValue}>{Number(totals.pointsEarned || 0)}</strong>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryLabel}>Points Redeemed</span>
                <strong style={styles.summaryValue}>{Number(totals.pointsRedeemed || 0)}</strong>
              </div>
            </div>

            <div style={styles.detailsGrid}>
              <section style={styles.detailCard}>
                <p style={styles.sectionEyebrow}>Customer</p>
                {showCustomerName ? <p style={styles.detailPrimary}>{customerName}</p> : null}
                {customerPhone ? <p style={styles.detailSecondary}>{customerPhone}</p> : null}
                <div style={styles.balanceBox}>
                  <span style={styles.balanceLabel}>Current Loyalty Balance</span>
                  <strong style={styles.balanceValue}>{Number(totals.balance || 0)} points</strong>
                </div>
              </section>
            </div>

            <div style={styles.itemsBlock}>
              <div style={styles.itemsHeader}>
                <span>Items</span>
                <span>Total</span>
              </div>

              {items.length === 0 ? (
                <p style={styles.emptyText}>No bill items available.</p>
              ) : (
                items.map((item, index) => (
                  <div key={`${item.itemId || item.name}-${index}`} style={styles.itemRow}>
                    <div style={styles.itemContent}>
                      <strong style={styles.itemName}>{item.name}</strong>
                      {item.hierarchy && item.hierarchy !== item.name ? (
                        <p style={styles.itemHierarchy}>{item.hierarchy}</p>
                      ) : null}
                      <p style={styles.itemMeta}>
                        Qty {Number(item.qty || 0)} x {formatCurrency(item.price)}
                      </p>
                      {item.resourceName ? (
                        <p style={styles.itemResource}>Handled by {item.resourceName}</p>
                      ) : null}
                    </div>
                    <strong style={styles.itemTotal}>{formatCurrency(item.total)}</strong>
                  </div>
                ))
              )}
            </div>

            <a href={poweredByUrl} target="_blank" rel="noreferrer" style={styles.poweredBy}>
              <img src="/favicon.svg" alt="Ynot" style={styles.poweredByLogo} />
              <span style={styles.poweredByText}>Powered by Ynot</span>
            </a>
          </>
        )}
      </section>
    </main>
  );
}

async function getBillData(billingId, token) {
  if (!billingId || !token) {
    return {
      error: "This bill link is incomplete.",
      data: null,
    };
  }

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/billing/public/${encodeURIComponent(billingId)}?token=${encodeURIComponent(
        token
      )}`,
      { cache: "no-store" }
    );

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        error: payload?.message || "Unable to load this bill.",
        data: null,
      };
    }

    return {
      error: "",
      data: payload?.data || null,
    };
  } catch (err) {
    return {
      error: "Unable to load this bill right now.",
      data: null,
    };
  }
}

export default async function BillPage({ params, searchParams }) {
  const billingId = params?.billingId ? String(params.billingId) : "";
  const token = searchParams?.token ? String(searchParams.token) : "";
  const { data, error } = await getBillData(billingId, token);

  return <BillView data={data} error={error} />;
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(208, 172, 120, 0.24), transparent 32%), linear-gradient(180deg, #f7f1e7 0%, #efe3d2 50%, #f9f7f2 100%)",
    padding: "28px 16px 56px",
  },
  card: {
    width: "100%",
    maxWidth: "920px",
    margin: "0 auto",
    background: "rgba(255, 252, 246, 0.96)",
    borderRadius: "28px",
    padding: "28px",
    boxShadow: "0 28px 80px rgba(87, 58, 24, 0.14)",
    border: "1px solid rgba(120, 84, 34, 0.12)",
  },
  header: {
    marginBottom: "24px",
  },
  headerMain: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    minWidth: 0,
  },
  logo: {
    width: "72px",
    height: "72px",
    borderRadius: "20px",
    objectFit: "cover",
    border: "1px solid rgba(160, 111, 45, 0.18)",
    background: "#fff",
  },
  headerText: {
    minWidth: 0,
  },
  billDate: {
    margin: "0 0 8px",
    fontSize: "13px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#9b6b2f",
    fontWeight: 700,
  },
  title: {
    margin: 0,
    fontSize: "clamp(32px, 6vw, 64px)",
    lineHeight: 1.05,
    color: "#2f2417",
  },
  storeContactInline: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px 16px",
    alignItems: "center",
    marginTop: "12px",
    color: "#7a5c35",
    fontSize: "16px",
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },
  storeContactLink: {
    color: "#7a5c35",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  storeWebsiteLink: {
    color: "#9b6b2f",
    fontWeight: 700,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  errorBox: {
    borderRadius: "18px",
    background: "#fff2f0",
    border: "1px solid #f0beb7",
    padding: "18px",
  },
  errorTitle: {
    display: "block",
    color: "#9c2f1f",
    marginBottom: "6px",
  },
  errorText: {
    margin: 0,
    color: "#6d352e",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
    marginBottom: "22px",
  },
  summaryItem: {
    background: "linear-gradient(180deg, #f4eadc 0%, #efe2d0 100%)",
    borderRadius: "20px",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    color: "#2f2417",
  },
  summaryLabel: {
    color: "#7f6646",
    fontSize: "14px",
  },
  summaryValue: {
    fontSize: "22px",
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "16px",
    marginBottom: "24px",
  },
  detailCard: {
    borderRadius: "22px",
    border: "1px solid rgba(120, 84, 34, 0.14)",
    background: "#fff",
    padding: "20px",
  },
  sectionEyebrow: {
    margin: "0 0 10px",
    color: "#9b6b2f",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    fontSize: "12px",
    fontWeight: 700,
  },
  detailPrimary: {
    margin: "0 0 6px",
    fontSize: "28px",
    lineHeight: 1.1,
    color: "#332518",
    fontWeight: 700,
  },
  detailSecondary: {
    margin: "0 0 8px",
    color: "#6d5840",
    fontSize: "15px",
  },
  balanceBox: {
    marginTop: "18px",
    paddingTop: "16px",
    borderTop: "1px solid rgba(120, 84, 34, 0.12)",
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  balanceLabel: {
    color: "#7f6646",
    fontSize: "14px",
  },
  balanceValue: {
    color: "#2f2417",
    fontSize: "20px",
  },
  itemsBlock: {
    display: "grid",
    gap: "16px",
  },
  itemsHeader: {
    display: "flex",
    justifyContent: "space-between",
    color: "#8a6840",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    borderTop: "1px solid rgba(120, 84, 34, 0.18)",
    paddingTop: "18px",
  },
  emptyText: {
    margin: 0,
    color: "#6b5a45",
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
    padding: "20px",
    borderRadius: "22px",
    border: "1px solid rgba(201, 168, 124, 0.5)",
    background: "#fff",
  },
  itemContent: {
    minWidth: 0,
  },
  itemName: {
    display: "block",
    marginBottom: "6px",
    color: "#2f2417",
    fontSize: "30px",
    lineHeight: 1.05,
  },
  itemHierarchy: {
    margin: "0 0 8px",
    color: "#9b6b2f",
    fontSize: "14px",
    lineHeight: 1.45,
  },
  itemMeta: {
    margin: "0 0 4px",
    color: "#7d6546",
    fontSize: "15px",
  },
  itemResource: {
    margin: 0,
    color: "#6d5840",
    fontSize: "14px",
  },
  itemTotal: {
    color: "#a06f2d",
    fontSize: "26px",
    whiteSpace: "nowrap",
  },
  poweredBy: {
    marginTop: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "10px",
    color: "#8a6840",
    fontSize: "14px",
    textDecoration: "none",
  },
  poweredByLogo: {
    width: "20px",
    height: "20px",
    opacity: 0.9,
  },
  poweredByText: {
    letterSpacing: "0.04em",
  },
};
