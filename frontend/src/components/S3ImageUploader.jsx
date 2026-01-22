import { useState } from "react";
import { uploadToS3 } from "../utils/s3Upload";

export default function S3ImageUploader({ folderType = "category", onUploaded }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const { url: publicUrl } = await uploadToS3(file, folderType);
      setUrl(publicUrl);
      onUploaded?.(publicUrl);
    } catch (e) {
      alert(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button type="button" onClick={handleUpload} disabled={!file || busy}>
        {busy ? "Uploading..." : `Upload to S3 (${folderType})`}
      </button>
      {url ? (
        <div>
          <div>URL:</div>
          <a href={url} target="_blank" rel="noreferrer">{url}</a>
        </div>
      ) : null}
    </div>
  );
}
