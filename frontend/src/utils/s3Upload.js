import API_BASE_URL from "../config";

export async function uploadToS3(file, folderType, opts = {}) {
  if (!file) throw new Error("No file");
  const form = new FormData();
  form.append("file", file);
  form.append("folderType", folderType);
  const { hierarchy, path, segments, labelName, levels } = opts || {};
  if (hierarchy !== undefined) {
    // allow array or string; send array as JSON string
    const val = Array.isArray(hierarchy) ? JSON.stringify(hierarchy) : String(hierarchy);
    form.append("hierarchy", val);
  }
  if (path) form.append("path", String(path));
  if (segments && Array.isArray(segments)) form.append("segments", JSON.stringify(segments));
  if (labelName) form.append("labelName", String(labelName));
  if (levels && Array.isArray(levels)) {
    levels.slice(0,5).forEach((lv, i) => form.append(`level${i+1}` , String(lv)));
  }
  const res = await fetch(`${API_BASE_URL}/api/upload`, { method: "POST", body: form });
  if (!res.ok) {
    let msg = "Upload failed";
    try { const j = await res.json(); if (j?.message) msg = j.message; } catch {}
    throw new Error(msg);
  }
  return res.json(); // { key, url }
}
