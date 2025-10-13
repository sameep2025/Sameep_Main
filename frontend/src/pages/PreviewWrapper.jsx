// src/pages/PreviewWrapper.jsx
import { useLocation } from "react-router-dom";
import PreviewPage from "./preview/[vendorId]/[categoryId]";
export default function PreviewWrapper() {
  const location = useLocation();
  const query = new URLSearchParams(location.search);

  const vendorId = query.get("vendorId");
  const categoryId = query.get("categoryId");

  return <PreviewPage vendorId={vendorId} categoryId={categoryId} />;
}
