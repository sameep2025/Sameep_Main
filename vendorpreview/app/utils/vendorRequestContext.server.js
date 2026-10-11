import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { buildPreviewSeoDataFromPricing, buildPreviewSeoDataFromTree } from "./vendorSeo";

function isLocalHost(host) {
  return /(^|\.)localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/i.test(host);
}

function getSubdomain(host) {
  const cleanHost = String(host || "").split(":")[0];
  const parts = cleanHost.split(".").filter(Boolean);
  if (parts.length >= 2 && /^localhost$/i.test(parts[parts.length - 1])) {
    return parts[0] || null;
  }
  if (parts.length < 3) return null;
  return parts[0] || null;
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export const resolveVendorRequestContext = cache(async function resolveVendorRequestContext() {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ||
    headerList.get("host") ||
    "";
  const protocol =
    headerList.get("x-forwarded-proto") ||
    (isLocalHost(host) ? "http" : "https");
  const referer = headerList.get("referer") || "";
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || "";

  const pageUrl = host ? `${protocol}://${host}` : "";
  const subdomain = getSubdomain(host);
  const isPreviewHost = !subdomain;

  let vendorContext = null;
  let previewVendorId = "";

  if (base && subdomain) {
    vendorContext = await fetchJson(`${base}/api/vendor/by-subdomain/${subdomain}`);
  }

  if (!vendorContext && referer) {
    try {
      const refererUrl = new URL(referer);
      previewVendorId = String(refererUrl.searchParams.get("vendorId") || "").trim();
      if (base && previewVendorId) {
        vendorContext = await fetchJson(`${base}/api/dummy-vendors/${previewVendorId}`);
      }
    } catch {
      previewVendorId = "";
    }
  }

  const vendorId = String(vendorContext?.vendorId || vendorContext?._id || "").trim();
  const categoryId = String(
    vendorContext?.categoryId || vendorContext?.category?._id || vendorContext?.rootCategoryId || ""
  ).trim();

  if (base && vendorContext && vendorId && categoryId) {
    const pricingSource = String(vendorContext?.pricingSource || "").trim().toLowerCase();
    const pricingApi =
      pricingSource === "self_managed"
        ? `${base}/api/vendor-menu/${vendorId}/tree?mode=user`
        : `${base}/api/vendor-price-nodes/tree?vendorId=${vendorId}&rootCategoryId=${categoryId}&mode=user`;
    const categoryApi = `${base}/api/categories/tree?rootCategoryId=${categoryId}`;
    const customPackagesApi = `${base}/api/vendor-custom-packages?vendorId=${vendorId}&rootCategoryId=${categoryId}&mode=user`;

    const [pricingContext, categoryTreeData, customPackagesContext] = await Promise.all([
      fetchJson(pricingApi),
      fetchJson(categoryApi),
      pricingSource === "self_managed" ? Promise.resolve({ success: true, data: [] }) : fetchJson(customPackagesApi),
    ]);

    if (pricingContext && categoryTreeData) {
      const categoryTree = Array.isArray(categoryTreeData) ? categoryTreeData : [categoryTreeData];
      const categoryObj = categoryTree[0] || null;
      const nextVendorContext = { ...vendorContext };

      if (categoryObj && !nextVendorContext.categoryData) {
        nextVendorContext.categoryData = categoryObj;
      }

      if (!nextVendorContext.previewSeoData) {
        nextVendorContext.previewSeoData = buildPreviewSeoDataFromPricing({
          pricingTree: pricingContext,
          customPackagesTree: customPackagesContext?.data || [],
          categoryTree,
          categoryObj,
          rootCategoryId: categoryId,
          pricingSource,
        });
      }

      vendorContext = nextVendorContext;
    } else {
      const inventoryContext = await fetchJson(
        `${base}/api/dummy-vendors/${vendorId}/categories/${categoryId}/inventory/active`
      );

      if (inventoryContext?.category || inventoryContext?.categories) {
        const nextVendorContext = { ...vendorContext };

        if (inventoryContext.category && !nextVendorContext.categoryData) {
          nextVendorContext.categoryData = inventoryContext.category;
        }

        if (!nextVendorContext.previewSeoData && inventoryContext.categories) {
          nextVendorContext.previewSeoData = buildPreviewSeoDataFromTree(
            inventoryContext.categories,
            inventoryContext.category
          );
        }

        vendorContext = nextVendorContext;
      }
    }
  }

  return {
    vendorContext,
    host,
    protocol,
    pageUrl,
    subdomain,
    previewVendorId,
    isPreviewHost,
    isIndexable: Boolean(vendorContext && subdomain && !isLocalHost(host)),
  };
});
