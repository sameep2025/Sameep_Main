import API_BASE_URL from "../config";

export async function uploadToS3(file, folderType) {
  if (!file) throw new Error("No file");
  const form = new FormData();
  form.append("file", file);
  form.append("folderType", folderType);
  const res = await fetch(`${API_BASE_URL}/api/upload`, { method: "POST", body: form });
  if (!res.ok) {
    let msg = "Upload failed";
    try { const j = await res.json(); if (j?.message) msg = j.message; } catch {}
    throw new Error(msg);
  }
  return res.json(); // { key, url }
}
