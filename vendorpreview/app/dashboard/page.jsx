"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "../../config";
import { getVendorAuthHeaders } from "../utils/vendorAuth";
import CustomerSummary from "./components/CustomerSummary";
import StylistPerformance from "../../components/dashboard/StylistPerformance";

function formatTime(dateString) {
  const d = new Date(dateString);
  return d
    .toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
}

function formatAmount(v) {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

function buildServiceLines(items = []) {
  const lines = [];

  items.forEach((item) => {
    const path = item.nodePath || [];

    if (path.length >= 2) {
      const parent = path.slice(0, -1).join(" > ");
      const leaf = path[path.length - 1];

      lines.push({
        parent,
        leaf,
      });
    } else {
      lines.push({
        parent: "",
        leaf: item.name,
      });
    }
  });

  return lines;
}

export default function VendorDashboardPage() {
  const searchParams = useSearchParams();
  const vendorId = searchParams.get("vendorId");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [fyData, setFyData] = useState([]);
  const [topServices, setTopServices] = useState([]);
  const [dailyTrend, setDailyTrend] = useState([]);
  const [siteAnalyticsRange, setSiteAnalyticsRange] = useState(30);
  const [siteAnalytics, setSiteAnalytics] = useState(null);
  const [siteAnalyticsLoading, setSiteAnalyticsLoading] = useState(false);
  const [siteAnalyticsError, setSiteAnalyticsError] = useState("");
  const [customerStats, setCustomerStats] = useState(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showBills, setShowBills] = useState(false);
  const [bills, setBills] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [billDetails, setBillDetails] = useState(null);
  const [searchPhone, setSearchPhone] = useState("");
  const [customerData, setCustomerData] = useState(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);

  const currencyFmt = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
    []
  );

  const numberFmt = useMemo(
    () => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }),
    []
  );
  const currentMonth = new Date().toLocaleString("en-IN", { month: "short" });

  useEffect(() => {
    if (!vendorId) return;

    let interval;

    const fetchCustomerAnalytics = async () => {
      if (!vendorId) return;

      try {
        setCustomerLoading(true);

        const res = await fetch(
          `${API_BASE_URL}/api/vendor/dashboard/customers?vendorId=${vendorId}`
        );

        const json = await res.json();

        if (json.success) {
          setCustomerStats(json.data);
        }
      } catch (err) {
        console.error("Customer analytics failed", err);
      } finally {
        setCustomerLoading(false);
      }
    };

    const fetchSummary = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/vendor/dashboard/summary?vendorId=${vendorId}`,
          { headers: getVendorAuthHeaders(vendorId) }
        );

        if (!res.ok) throw new Error("Failed to load dashboard");

        const json = await res.json();
        setSummary(json.data);
        setError(null);

        const fyRes = await fetch(
          `${API_BASE_URL}/api/vendor/dashboard/fy-monthly?vendorId=${vendorId}`,
          { headers: getVendorAuthHeaders(vendorId) }
        );
        const fyJson = await fyRes.json();
        setFyData(fyJson.data || []);

        await fetchCustomerAnalytics();
      } catch (err) {
        console.error(err);
        setError("Failed to load dashboard data.");
      }
    };

    // First load
    fetchSummary();

    // Auto refresh every 30 seconds
    interval = setInterval(fetchSummary, 30000);

    return () => clearInterval(interval);
  }, [vendorId]);

  useEffect(() => {
    if (!selectedBill) return;

    const loadDetails = async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/vendor/dashboard/bills/${selectedBill}`
      );
      const data = await res.json();
      if (data.success) setBillDetails(data.data);
    };

    loadDetails();
  }, [selectedBill]);

  useEffect(() => {
    async function fetchTopServices() {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/vendor/dashboard/top-services?vendorId=${vendorId}`,
          { headers: getVendorAuthHeaders(vendorId) }
        );
        const data = await res.json();
        if (data.success) setTopServices(data.data);
      } catch (err) {
        console.error("Top services error", err);
      }
    }

    if (vendorId) fetchTopServices();
  }, [vendorId]);

  useEffect(() => {
    async function fetchTrend() {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/vendor/dashboard/daily-trend?vendorId=${vendorId}`,
          { headers: getVendorAuthHeaders(vendorId) }
        );
        const data = await res.json();
        if (data.success) setDailyTrend(data.data);
      } catch (e) {
        console.error(e);
      }
    }

    if (vendorId) fetchTrend();
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    let cancelled = false;

    async function fetchSiteAnalytics() {
      try {
        setSiteAnalyticsLoading(true);
        setSiteAnalyticsError("");

        const res = await fetch(
          `${API_BASE_URL}/api/site-analytics/vendor/summary?vendorId=${vendorId}&days=${siteAnalyticsRange}`,
          {
            headers: {
              ...getVendorAuthHeaders(vendorId),
            },
          }
        );

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.message || "Failed to load website analytics");
        }

        if (!cancelled) {
          setSiteAnalytics(json || null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Vendor site analytics error", err);
          setSiteAnalyticsError(err?.message || "Failed to load website analytics");
        }
      } finally {
        if (!cancelled) {
          setSiteAnalyticsLoading(false);
        }
      }
    }

    fetchSiteAnalytics();

    return () => {
      cancelled = true;
    };
  }, [vendorId, siteAnalyticsRange]);

  if (!vendorId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0b0b0d",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        Vendor ID missing. Please open this page from the vendor dashboard link.
      </div>
    );
  }

  const todayRevenue = summary?.todayRevenue ?? summary?.revenueToday ?? 0;
  const todayOrders = summary?.todayOrders ?? summary?.ordersToday ?? 0;
  const avgBillValue = summary?.avgBillValue ?? summary?.averageBillValue ?? 0;
  const thisMonthRevenue =
    summary?.thisMonthRevenue ?? summary?.monthRevenue ?? summary?.monthlyRevenue ?? 0;
  const monthOrders = summary?.monthOrders ?? 0;
  const monthAvgBill = summary?.monthAvgBill ?? 0;
  const siteAnalyticsOverview = siteAnalytics?.overview || {};
  const siteAnalyticsTrend = siteAnalytics?.dailyTrend || [];
  const siteTopSources = siteAnalytics?.topSources || [];
  const siteTopCampaigns = siteAnalytics?.topCampaigns || [];

  const formatTime = (date) =>
    new Date(date).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const normalizedBills = (customerData?.bills || [])
    .map((bill) => ({
      ...bill,
      amount: Number(bill.total || bill.amount || 0),
      services:
        bill.items?.map((i) => i.name).slice(0, 3).join(", ") ||
        bill.serviceNames ||
        "",
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const fetchCustomer = async () => {
    if (!searchPhone) return;

    try {
      setLoadingCustomer(true);
      const res = await fetch(
        `${API_BASE_URL}/api/vendor/dashboard/customer?vendorId=${vendorId}&phone=${searchPhone}&range=all`
      );
      const json = await res.json();
      setCustomerData(json.data || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCustomer(false);
    }
  };

  const fetchTodayBills = async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const res = await fetch(
        `${API_BASE_URL}/api/vendor/dashboard/bills?vendorId=${vendorId}&from=${todayStart.toISOString()}&to=${todayEnd.toISOString()}`,
        { headers: getVendorAuthHeaders(vendorId) }
      );

      const data = await res.json();
      if (data.success) {
        setBills(data.data);
        setShowBills(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0b0d",
        color: "#fff",
        padding: "40px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h1 style={{ color: "#e6c37a", marginBottom: 8 }}>
          Vendor Dashboard
        </h1>
        <p style={{ color: "#bbb", marginBottom: 8 }}>
          Live snapshot of today&apos;s performance
        </p>
        <div style={{ fontSize: 12, color: "#aaa", marginTop: 8 }}>
          Auto-refreshing every 30 seconds
        </div>

        <div className="mt-6 flex flex-wrap gap-3 items-center justify-center">
          <input
            placeholder="Search customer by mobile"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            className="bg-black border border-white/10 rounded-lg px-3 py-2 text-white"
          />
          <button
            onClick={fetchCustomer}
            className="bg-yellow-500 text-black px-4 py-2 rounded-lg font-semibold"
          >
            Search
          </button>
          {loadingCustomer && (
            <div className="text-sm text-gray-400">Loading customer...</div>
          )}
        </div>

        {loading && (
          <div style={{ color: "#aaa", marginBottom: 16 }}>Loading...</div>
        )}
        {error && (
          <div style={{ color: "#fca5a5", marginBottom: 16 }}>{error}</div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div style={{ color: "#9aa0a6", fontSize: 12 }}>Today Revenue</div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#e6c37a",
                marginTop: 8,
              }}
            >
              {currencyFmt.format(Number(todayRevenue) || 0)}
            </div>
          </div>

          <div onClick={fetchTodayBills} className="cursor-pointer">
            <div
              style={{
                background: "#111",
                border: "1px solid #333",
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div style={{ color: "#9aa0a6", fontSize: 12 }}>Today Orders</div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#e6c37a",
                  marginTop: 8,
                }}
              >
                {numberFmt.format(Number(todayOrders) || 0)}
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div style={{ color: "#9aa0a6", fontSize: 12 }}>
              Avg Bill Value
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#e6c37a",
                marginTop: 8,
              }}
            >
              {currencyFmt.format(Number(avgBillValue) || 0)}
            </div>
          </div>

          <div
            style={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div style={{ color: "#9aa0a6", fontSize: 12 }}>This Month</div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#e6c37a",
                marginTop: 8,
              }}
            >
              {currencyFmt.format(Number(thisMonthRevenue) || 0)}
            </div>
            <div style={{ fontSize: 12, color: "#9aa0a6", marginTop: 8 }}>
              {numberFmt.format(Number(monthOrders) || 0)} orders • Avg{" "}
              {currencyFmt.format(Number(monthAvgBill) || 0)}
            </div>
          </div>
        </div>

        <StylistPerformance vendorId={vendorId} />

        <div
          style={{
            marginTop: 24,
            background: "#111",
            border: "1px solid #333",
            borderRadius: 20,
            padding: 20,
            textAlign: "left",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ color: "#e6c37a", fontSize: 24, fontWeight: 800 }}>
                Website Analytics
              </div>
              <div style={{ color: "#9aa0a6", fontSize: 13, marginTop: 4 }}>
                Track vendor page visitors, CTA clicks, and enquiry interest.
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#9aa0a6", fontWeight: 600, fontSize: 13 }}>Range</span>
              <select
                value={siteAnalyticsRange}
                onChange={(event) => setSiteAnalyticsRange(Number(event.target.value))}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #3a3a3a",
                  background: "#0b0b0d",
                  color: "#fff",
                }}
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </label>
          </div>

          {siteAnalyticsError ? (
            <div
              style={{
                border: "1px solid #7f1d1d",
                background: "rgba(127, 29, 29, 0.12)",
                color: "#fca5a5",
                borderRadius: 14,
                padding: 14,
                marginBottom: 16,
              }}
            >
              {siteAnalyticsError}
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
              marginBottom: 18,
            }}
          >
            {[
              {
                title: "Page Views",
                value: numberFmt.format(siteAnalyticsOverview.totalPageViews || 0),
              },
              {
                title: "Unique Visitors",
                value: numberFmt.format(siteAnalyticsOverview.uniqueVisitors || 0),
              },
              {
                title: "CTA Clicks",
                value: numberFmt.format(siteAnalyticsOverview.ctaClicks || 0),
              },
              {
                title: "Enquiries",
                value: numberFmt.format(siteAnalyticsOverview.enquirySubmissions || 0),
              },
            ].map((card) => (
              <div
                key={card.title}
                style={{
                  background: "#0b0b0d",
                  border: "1px solid #2a2a2a",
                  borderRadius: 16,
                  padding: 18,
                }}
              >
                <div style={{ color: "#9aa0a6", fontSize: 12 }}>{card.title}</div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: "#e6c37a",
                    marginTop: 8,
                  }}
                >
                  {siteAnalyticsLoading ? "..." : card.value}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div
              style={{
                background: "#0b0b0d",
                border: "1px solid #2a2a2a",
                borderRadius: 16,
                padding: 16,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 10, color: "#fff" }}>Daily Trend</div>
              <div style={{ display: "grid", gap: 8 }}>
                {siteAnalyticsLoading ? (
                  <div style={{ color: "#9aa0a6" }}>Loading trend...</div>
                ) : siteAnalyticsTrend.length ? (
                  siteAnalyticsTrend.map((row) => (
                    <div
                      key={row.date}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "110px 1fr 1fr",
                        gap: 10,
                        padding: "8px 0",
                        borderTop: "1px solid #1f1f1f",
                        fontSize: 13,
                        color: "#d4d4d8",
                      }}
                    >
                      <strong>{row.date}</strong>
                      <span>Views: {numberFmt.format(row.views || 0)}</span>
                      <span>Unique: {numberFmt.format(row.uniqueVisitors || 0)}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#9aa0a6" }}>No visitor data yet.</div>
                )}
              </div>
            </div>

            <div
              style={{
                background: "#0b0b0d",
                border: "1px solid #2a2a2a",
                borderRadius: 16,
                padding: 16,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 10, color: "#fff" }}>Top Sources</div>
              <div style={{ display: "grid", gap: 8 }}>
                {siteAnalyticsLoading ? (
                  <div style={{ color: "#9aa0a6" }}>Loading...</div>
                ) : siteTopSources.length ? (
                  siteTopSources.map((item) => (
                    <div
                      key={item.source}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "8px 0",
                        borderTop: "1px solid #1f1f1f",
                        color: "#d4d4d8",
                      }}
                    >
                      <span>{item.source}</span>
                      <strong>{numberFmt.format(item.views || 0)}</strong>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#9aa0a6" }}>No source data yet.</div>
                )}
              </div>
            </div>

            <div
              style={{
                background: "#0b0b0d",
                border: "1px solid #2a2a2a",
                borderRadius: 16,
                padding: 16,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 10, color: "#fff" }}>Top Campaigns</div>
              <div style={{ display: "grid", gap: 8 }}>
                {siteAnalyticsLoading ? (
                  <div style={{ color: "#9aa0a6" }}>Loading...</div>
                ) : siteTopCampaigns.length ? (
                  siteTopCampaigns.map((item) => (
                    <div
                      key={item.campaign}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "8px 0",
                        borderTop: "1px solid #1f1f1f",
                        color: "#d4d4d8",
                      }}
                    >
                      <span>{item.campaign}</span>
                      <strong>{numberFmt.format(item.views || 0)}</strong>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#9aa0a6" }}>No campaign data yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {customerData && (
          <div className="mt-10 w-full max-w-4xl text-left">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Customer Summary
            </h2>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-black border border-white/10 rounded-xl p-4">
                <div className="text-gray-400 text-sm">Phone</div>
                <div className="text-white font-semibold">
                  {customerData.customer?.phone}
                </div>
                <div className="text-gray-400 text-sm mt-2">
                  Total Visits: {customerData.customer?.totalVisits || 0}
                </div>
                <div className="text-gray-400 text-sm">
                  Total Spend: ₹{customerData.customer?.totalSpend || 0}
                </div>
                <div className="text-gray-400 text-sm">
                  Avg Bill: ₹{customerData.customer?.avgBill || 0}
                </div>
                <div className="text-gray-400 text-sm">
                  Last Visit:{" "}
                  {customerData.customer?.lastVisit
                    ? new Date(customerData.customer.lastVisit).toLocaleString()
                    : "-"}
                </div>
              </div>

              <div className="bg-black border border-white/10 rounded-xl p-4">
                <div className="text-gray-400 text-sm">Loyalty</div>
                <div className="text-white font-semibold">
                  Earned: {customerData.loyalty?.earned || 0}
                </div>
                <div className="text-white font-semibold">
                  Redeemed: {customerData.loyalty?.redeemed || 0}
                </div>
                <div className="text-white font-semibold">
                  Balance: {customerData.loyalty?.balance || 0}
                </div>
                <div className="text-white font-semibold">
                  Available: {customerData.loyalty?.availablePoints || 0}
                </div>
                <div className="text-white font-semibold">
                  Expired: {customerData.loyalty?.expiredPoints || 0}
                </div>
                <div className="text-white font-semibold">
                  Expiring Soon: {customerData.loyalty?.expiringSoonPoints || 0}
                </div>
              </div>

              <div className="bg-black border border-white/10 rounded-xl p-4">
                <div className="text-gray-400 text-sm">Customer Retention</div>
                <div className="text-white font-semibold">
                  Retention: {customerData.retention?.retentionScore || 0}%
                </div>
                <div className="text-white font-semibold">
                  Returning Customers: {customerData.retention?.returningCustomers || 0}
                </div>
              </div>
            </div>

            <CustomerSummary bills={customerData.bills || []} />

            <div className="mt-6">
              <h3 className="text-xl font-semibold text-white mb-3">
                Bills
              </h3>
              <div className="space-y-3">
                {!normalizedBills.length ? (
                  <div style={{ color: "#888" }}>No bills found</div>
                ) : (
                  <div className="space-y-4">
                    {normalizedBills.map((bill, idx) => {
                      const amount = Number(bill.total || 0);
                      const time = new Date(bill.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      const phoneMasked = bill.phone
                        ? bill.phone.slice(0, 5) + "****"
                        : "Walk-in";

                      const firstItem = bill.items?.[0];
                      const hierarchy =
                        firstItem?.nodePath?.slice(0, -1).join(" > ") || "";

                      const serviceNames =
                        bill.items?.map((i) => i.name).join(", ") || "";

                      return (
                        <div
                          key={bill.billId || idx}
                          style={{
                            borderBottom: "1px solid #222",
                            paddingBottom: 12,
                            marginBottom: 12,
                          }}
                        >
                          {/* Amount + Time */}
                          <div style={{ fontWeight: 600 }}>
                            ₹{amount.toLocaleString()} • {time}
                          </div>

                          {/* Phone */}
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {phoneMasked}
                          </div>

                          {/* Hierarchy */}
                          {hierarchy && (
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              {hierarchy}
                            </div>
                          )}

                          {/* Services */}
                          <div style={{ fontSize: 13 }}>
                            {serviceNames}
                          </div>

                          {/* Earned */}
                          {bill.earned > 0 && (
                            <div style={{ color: "#22c55e", fontSize: 12 }}>
                              +{bill.earned} pts earned
                            </div>
                          )}

                          {/* Redeemed */}
                          {bill.redeemed > 0 && (
                            <div style={{ color: "#f87171", fontSize: 12 }}>
                              -{bill.redeemed} pts used
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {fyData.length > 0 && (
          <div className="mt-10 w-full max-w-4xl">
            <h2 className="text-xl text-gray-400 mb-4">
              Financial Year Performance
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
              {fyData.map((m) => (
                <div
                  key={m.month}
                  className={`rounded-xl p-5 border transition hover:border-yellow-500 ${
                    m.month === currentMonth
                      ? "bg-yellow-500/10 border-yellow-500"
                      : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <div className="text-sm text-gray-400">{m.month}</div>

                  <div className="text-xl font-semibold text-yellow-400 mt-1">
                    ₹{Number(m.revenue || 0).toLocaleString("en-IN")}
                  </div>

                  <div className="text-xs text-gray-400 mt-1">
                    {Number(m.orders || 0).toLocaleString("en-IN")} orders • Avg ₹
                    {Number(m.avgBill || 0).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {topServices.length > 0 && (
          <div className="mt-10">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Top Services
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              {topServices.map((s, i) => (
                <div
                  key={i}
                  className="bg-black border border-white/10 rounded-xl p-4 flex justify-between"
                >
                  <div>
                    <div className="text-white font-medium">{s._id}</div>
                    <div className="text-sm text-gray-400">
                      {Number(s.totalQty || 0).toLocaleString("en-IN")} orders
                    </div>
                  </div>

                  <div className="text-yellow-400 font-semibold">
                    ₹{Number(s.revenue || 0).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dailyTrend.length > 0 && (
          <div className="mt-10">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Daily Performance (This Month)
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {dailyTrend.map((d, i) => (
                <div
                  key={i}
                  className="bg-black border border-white/10 rounded-lg p-3 text-center"
                >
                  <div className="text-gray-400 text-sm">Day {d?._id?.day}</div>
                  <div className="text-yellow-400 font-semibold">
                    ₹{Number(d.revenue || 0).toLocaleString("en-IN")}
                  </div>
                  <div className="text-xs text-gray-500">
                    {Number(d.orders || 0).toLocaleString("en-IN")} orders
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ================= CUSTOMER INSIGHTS ================= */}
        <div style={{ marginTop: 30, textAlign: "left" }}>
          <h3 style={{ marginBottom: 12 }}>👥 Customer Insights</h3>

          {customerLoading && <div>Loading customer analytics...</div>}

          {customerStats && (
            <>
              {/* --- STAT CARDS --- */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <StatCard
                  title="Total Customers"
                  value={customerStats.totalCustomers || 0}
                />

                <StatCard
                  title="Repeat Rate"
                  value={`${customerStats.repeatRate || 0}%`}
                />

                <StatCard
                  title="Avg LTV"
                  value={`₹${customerStats.avgLTV || 0}`}
                />

                <StatCard
                  title="Retained Customers"
                  value={customerStats.retainedCustomers || 0}
                />
              </div>

              {/* --- TOP SPENDERS --- */}
              <div style={{ marginTop: 20 }}>
                <h4>🏆 Top Customers</h4>

                <div style={{ marginTop: 10 }}>
                  {customerStats.topSpenders?.map((c) => (
                    <div
                      key={c.customerId}
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid #eee",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {c.phone || c.customerId}
                        </div>
                        <div style={{ fontSize: 12, color: "#777" }}>
                          Visits: {c.visits}
                        </div>
                      </div>

                      <div style={{ fontWeight: 600 }}>₹{c.totalSpend}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showBills && (
        <div className="fixed right-0 top-0 h-full w-[420px] bg-black border-l border-gray-800 overflow-y-auto p-6 z-50">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Today Bills</h2>
            <button onClick={() => setShowBills(false)}>✕</button>
          </div>

          {[...bills]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map((bill) => (
              <div
                key={bill.billId}
                onClick={() => setSelectedBill(bill.billId)}
                className="p-4 border-b border-gray-800 cursor-pointer hover:bg-white/5 transition"
              >
                {/* Top Line */}
                <div style={{ fontWeight: 600 }}>
                  {formatAmount(bill.total)} • {formatTime(bill.createdAt)}
                </div>

                {/* Phone */}
                <div style={{ fontSize: 12, color: "#888" }}>
                  {bill.phone || "Walk-in"}
                </div>

                {/* Services */}
                <div style={{ marginTop: 6 }}>
                  {buildServiceLines(bill.items || []).map((s, i) => (
                    <div key={i} style={{ fontSize: 13, color: "#ddd" }}>
                      {s.parent && (
                        <div style={{ color: "#888", fontSize: 12 }}>
                          {s.parent}
                        </div>
                      )}
                      <div>{s.leaf}</div>
                    </div>
                  ))}
                </div>

                {/* Loyalty Section */}
                {(bill.earned > 0 || bill.redeemed > 0) && (
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    {bill.earned > 0 && (
                      <div style={{ color: "#22c55e" }}>
                        +{bill.earned} pts earned
                      </div>
                    )}
                    {bill.redeemed > 0 && (
                      <div style={{ color: "#f59e0b" }}>
                        -{bill.redeemed} pts used
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {billDetails && (
        <div className="fixed right-[420px] top-0 h-full w-[420px] bg-black border-l border-gray-800 p-6 z-50">
          <div className="flex justify-between mb-4">
            <h3 className="font-semibold">Bill Details</h3>
            <button onClick={() => setSelectedBill(null)}>✕</button>
          </div>

          <div className="text-sm text-gray-400 mb-3">
            {new Date(billDetails.createdAt).toLocaleString()}
          </div>

          <div className="mb-4">
            Customer:{" "}
            {billDetails.customer?.phone
              ? billDetails.customer.phone.slice(0, 6) + "****"
              : "Walk-in"}
          </div>

          <div className="space-y-2">
            {billDetails.items?.map((item, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{item.name}</span>
                <span>₹{item.total}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-700 mt-4 pt-3">
            <div>Earned: +{billDetails.pointsEarned || 0}</div>
            <div>Redeemed: -{billDetails.pointsRedeemed || 0}</div>
            <div className="font-semibold mt-2">
              Total: ₹{billDetails.totalAmount}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-6 shadow-lg">
      <p className="text-white/60 text-sm">{title}</p>
      <h3 className="text-[#e7c27d] text-2xl font-bold">{value}</h3>
    </div>
  );
}

function groupItems(items) {
  const grouped = {};

  items.forEach((item) => {
    const path = item.nodePath || [];

    const root = path[0] || "Other";
    const sub = path.slice(1, -1).join(" > ") || "General";
    const service = path[path.length - 1] || item.name;

    if (!grouped[root]) grouped[root] = {};
    if (!grouped[root][sub]) grouped[root][sub] = [];

    grouped[root][sub].push(service);
  });

  return grouped;
}
