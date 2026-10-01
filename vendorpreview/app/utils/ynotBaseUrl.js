"use client";

export function getYnotBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_VENDOR_PREVIEW_ROOT_URL ||
    process.env.NEXT_PUBLIC_PREVIEW_BASE_URL ||
    "http://localhost:4000"
  )
    .trim()
    .replace(/\/$/, "");
}
