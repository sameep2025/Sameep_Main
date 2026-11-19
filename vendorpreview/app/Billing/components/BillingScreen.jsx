
// Codex:
// STEP 2 – Catalog (read-only)
//
// Enhance BillingScreen to:
//
// - Fetch vendor catalog from:
//   GET /api/vendor-price-nodes/tree?vendorId=...&rootCategoryId=...
//
// - Create a helper function to recursively flatten the tree
//   into a flat list of services where:
//     - node.active === true
//     - node.price exists
//
// - Store flattened catalog in state as `catalogItems`
//
// - Render a simple read-only list below the loyalty status:
//     Service Name — Price
//
// Do NOT add cart, add buttons, billing session, or OTP yet.
// Keep UI minimal and readable.


"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";

function BillingScreen({ vendorId: vendorIdProp, rootCategoryId: rootCategoryIdProp }) {
  const searchParams = useSearchParams();

  const vendorId = useMemo(() => {
    if (vendorIdProp) return String(vendorIdProp);
    return searchParams?.get("vendorId") || "";
  }, [vendorIdProp, searchParams]);

  const rootCategoryId = useMemo(() => {
    if (rootCategoryIdProp) return String(rootCategoryIdProp);
    return searchParams?.get("rootCategoryId") || "";
  }, [rootCategoryIdProp, searchParams]);

  const [loyaltyRule, setLoyaltyRule] = useState(null);
  const [loading, setLoading] = useState(false);
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [customerMobile, setCustomerMobile] = useState("");
  const [availablePoints, setAvailablePoints] = useState(0);
  const [expiredPoints, setExpiredPoints] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [customerId, setCustomerId] = useState(null);
  const [verifyingCustomer, setVerifyingCustomer] = useState(false);

  const flattenCatalog = (nodes = []) => {
    const result = [];

    const visit = (node) => {
      if (!node || typeof node !== "object") return;

      const isActive = node.active === true;
      const hasPrice = node.price !== undefined && node.price !== null;

      if (isActive && hasPrice) {
        result.push({
          id: node._id || node.id || `${node.name || "service"}-${result.length}`,
          name: node.name || node.title || "Unnamed Service",
          price: node.price,
        });
      }

      if (Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    };

    if (Array.isArray(nodes)) {
      nodes.forEach(visit);
    } else {
      visit(nodes);
    }

    return result;
  };

  useEffect(() => {
    if (!vendorId) return;

    let cancelled = false;
    const fetchRule = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/loyalty/vendor-rule/${encodeURIComponent(vendorId)}`,
          { headers: getVendorAuthHeaders(vendorId) }
        );
        if (!res.ok) throw new Error("Failed to fetch loyalty rule");
        const data = await res.json();
        if (!cancelled) setLoyaltyRule(data?.data || null);
      } catch (err) {
        if (!cancelled) setLoyaltyRule(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRule();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId || !rootCategoryId) return;

    let cancelled = false;
    const fetchCatalog = async () => {
      setCatalogLoading(true);
      try {
        const url =
          `${API_BASE_URL}/api/vendor-price-nodes/tree` +
          `?vendorId=${encodeURIComponent(vendorId)}` +
          `&rootCategoryId=${encodeURIComponent(rootCategoryId)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch catalog");
        const data = await res.json();
        const flat = flattenCatalog(data);
        if (!cancelled) setCatalogItems(flat);
      } catch (_) {
        if (!cancelled) setCatalogItems([]);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    };

    fetchCatalog();
    return () => {
      cancelled = true;
    };
  }, [vendorId, rootCategoryId]);

  useEffect(() => {
    if (!customerMobile || customerMobile.length !== 10) return;

    const handle = setTimeout(() => {
      verifyCustomer(customerMobile);
    }, 500);

    return () => clearTimeout(handle);
  }, [customerMobile, vendorId]);

  useEffect(() => {
    if (redeemPoints > availablePoints) {
      setRedeemPoints(availablePoints);
    } else if (redeemPoints < 0) {
      setRedeemPoints(0);
    }
  }, [redeemPoints, availablePoints]);

  async function fetchWallet(cId) {
    if (!cId || !vendorId) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/loyalty/wallet?vendorId=${vendorId}&customerId=${cId}`,
        { headers: getVendorAuthHeaders(vendorId) }
      );

      const wallet = await res.json();
      setAvailablePoints(wallet?.availablePoints || 0);
      setExpiredPoints(wallet?.expiredPoints || 0);
    } catch (err) {
      console.error("Wallet fetch failed", err);
    }
  }

  async function verifyCustomer(mobile) {
    if (!mobile || mobile.length !== 10) return;

    try {
      setVerifyingCustomer(true);

      const customerRes = await fetch(
        `${API_BASE_URL}/api/vendor/dashboard/customer/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify({ vendorId, phone: mobile }),
        }
      );

      const customerData = await customerRes.json();
      if (!customerRes.ok || !customerData?.success) {
        throw new Error(customerData?.message || "Unable to verify customer");
      }
      const id = customerData?.data?.customerId;
      setCustomerId(id || null);
      fetchWallet(id);
    } catch (err) {
      console.error("Customer verification failed", err);
    } finally {
      setVerifyingCustomer(false);
    }
  }

  if (!vendorId) {
    return <div>Missing vendor id</div>;
  }

  if (loading && !loyaltyRule) {
    return <div>Loading loyalty status...</div>;
  }

  const enabled = loyaltyRule?.isEnabled === true;

  return (
    <div>
      {enabled ? "Loyalty Program Enabled" : "Loyalty Program Not Enabled"}
      <div style={{ marginTop: 8 }}>
        Available Points: {availablePoints}
      </div>
      <div style={{ marginTop: 4 }}>
        Expired Points: {expiredPoints}
      </div>
      {verifyingCustomer && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          Verifying customer...
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        {catalogLoading ? (
          <div>Loading services...</div>
        ) : catalogItems.length === 0 ? (
          <div>No services available</div>
        ) : (
          catalogItems.map((item) => (
            <div key={item.id}>
              {item.name} — {item.price}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default BillingScreen;
