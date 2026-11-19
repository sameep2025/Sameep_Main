"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import "./SubscriptionDashboard.css";

export default function SubscriptionDashboard({ vendorId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vendorId) return;

    const loadSubscription = async () => {
      try {
        setLoading(true);

        const res = await fetch(
          `${API_BASE_URL}/api/vendor/subscription/${vendorId}`,
          { cache: "no-store", headers: getVendorAuthHeaders(vendorId) }
        );

        const json = await res.json();

        if (json?.success) {
          setData(json.data);
        } else {
          setData(null);
        }
      } catch (err) {
        console.error("Subscription fetch failed", err);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    loadSubscription();
  }, [vendorId]);

  const plan = data?.plan;
  const subscription = data?.subscription;
  const wallet = data?.wallet;

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <section className="subscription-panel">
      {loading ? (
        <div className="subscription-loading">
          Loading subscription...
        </div>
      ) : !data ? (
        <div className="subscription-empty">
          No subscription found
        </div>
      ) : (
        <>
          {/* PLAN CARD */}
          <div className="subscription-plan-card">

            <div className="subscription-plan-head">
              <div className="subscription-plan-name">
                {plan?.name} Plan
              </div>

              <div className="subscription-status">
                {subscription?.active ? "Active" : "Inactive"}
              </div>
            </div>

            <div className="subscription-plan-price">
              ₹{plan?.price?.toLocaleString("en-IN")}
              <span> / {plan?.billingCycle}</span>
            </div>

            <div className="subscription-dates">
              <div>
                <span>Start Date</span>
                <strong>{formatDate(subscription?.startDate)}</strong>
              </div>

              <div>
                <span>Expiry Date</span>
                <strong>{formatDate(subscription?.expiryDate)}</strong>
              </div>
            </div>
          </div>

          {/* WALLET */}
          <div className="subscription-wallet-grid">

            <div className="subscription-wallet-card">
              <div className="wallet-title">
                WhatsApp Balance
              </div>
              <div className="wallet-value">
                {wallet?.whatsappBalance ?? 0}
              </div>
            </div>

            <div className="subscription-wallet-card">
              <div className="wallet-title">
                OTP Balance
              </div>
              <div className="wallet-value">
                {wallet?.otpBalance ?? 0}
              </div>
            </div>

          </div>

          {/* FEATURES */}
          <div className="subscription-features">

            <div className="subscription-features-title">
              Plan Features
            </div>

            <div className="subscription-feature-grid">

              {Object.entries(plan?.features || {}).map(
                ([key, value]) => (
                  <div
                    key={key}
                    className={`feature-item ${
                      value ? "enabled" : "disabled"
                    }`}
                  >
                    <span className="feature-icon">
                      {value ? "✓" : "✕"}
                    </span>

                    <span className="feature-name">
                      {key.replace(/([A-Z])/g, " $1")}
                    </span>
                  </div>
                )
              )}

            </div>
          </div>
        </>
      )}
    </section>
  );
}
