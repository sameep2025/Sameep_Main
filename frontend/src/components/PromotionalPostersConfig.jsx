import { useEffect, useState } from "react";
import API from "../api";
import "./PromotionalPostersConfig.css";

const MAX_POSTERS = 12;

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = {
        width: image.naturalWidth || 1600,
        height: image.naturalHeight || 900,
      };
      URL.revokeObjectURL(objectUrl);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read image dimensions"));
    };
    image.src = objectUrl;
  });
}

function nextDisplayOrder(posters) {
  return posters.reduce((highest, poster) => Math.max(highest, Number(poster.displayOrder) || 0), -1) + 1;
}

export default function PromotionalPostersConfig() {
  const [posters, setPosters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewPoster, setPreviewPoster] = useState(null);

  useEffect(() => {
    let active = true;
    API.get("/api/app-config/promotional-posters")
      .then((response) => {
        if (active) setPosters(Array.isArray(response.data?.posters) ? response.data.posters : []);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError?.response?.data?.message || "Unable to load promotional posters.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function persistPosters(nextPosters, successMessage) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await API.put("/api/app-config/promotional-posters", {
        posters: nextPosters,
      });
      setPosters(Array.isArray(response.data?.posters) ? response.data.posters : []);
      setMessage(successMessage);
      if (Number(response.data?.cleanupFailed) > 0) {
        setMessage(`${successMessage} Some retired image cleanup is still pending.`);
      }
      return true;
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to save promotional posters.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function uploadPoster(file, posterToReplace = null) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (!posterToReplace && posters.length >= MAX_POSTERS) {
      setError(`A maximum of ${MAX_POSTERS} promotional posters is allowed.`);
      return;
    }

    let uploadedKey = "";
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const dimensions = await readImageDimensions(file);
      const body = new FormData();
      body.append("file", file);
      body.append("folderType", "promotional");
      body.append("hierarchy", JSON.stringify(["salon-management-software"]));
      body.append("labelName", file.name.replace(/\.[^.]+$/, ""));

      const uploadResponse = await API.post("/api/upload", body);
      uploadedKey = String(uploadResponse.data?.key || "");
      const uploadedUrl = String(uploadResponse.data?.url || "");
      if (!uploadedKey || !uploadedUrl) throw new Error("Upload did not return a managed image");

      const nextPoster = posterToReplace
        ? {
            ...posterToReplace,
            key: uploadedKey,
            imageUrl: uploadedUrl,
            width: dimensions.width,
            height: dimensions.height,
          }
        : {
            id: `poster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            key: uploadedKey,
            imageUrl: uploadedUrl,
            altText: "",
            displayOrder: nextDisplayOrder(posters),
            published: false,
            width: dimensions.width,
            height: dimensions.height,
          };
      const nextPosters = posterToReplace
        ? posters.map((poster) => (poster.id === posterToReplace.id ? nextPoster : poster))
        : [...posters, nextPoster];

      const saved = await persistPosters(
        nextPosters,
        posterToReplace ? "Poster replaced." : "Poster uploaded as an unpublished draft."
      );
      if (!saved) {
        await API.delete("/api/app-config/promotional-posters/upload", {
          data: { key: uploadedKey },
        }).catch(() => {});
      }
    } catch (uploadError) {
      if (uploadedKey) {
        await API.delete("/api/app-config/promotional-posters/upload", {
          data: { key: uploadedKey },
        }).catch(() => {});
      }
      setError(uploadError?.response?.data?.message || uploadError.message || "Poster upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function updatePoster(id, field, value) {
    setPosters((current) =>
      current.map((poster) => (poster.id === id ? { ...poster, [field]: value } : poster))
    );
    setMessage("");
  }

  async function togglePublished(poster) {
    if (!poster.published && !String(poster.altText || "").trim()) {
      setError("Add descriptive alt text before publishing this poster.");
      return;
    }
    const next = posters.map((entry) =>
      entry.id === poster.id ? { ...entry, published: !entry.published } : entry
    );
    await persistPosters(next, poster.published ? "Poster unpublished." : "Poster published.");
  }

  async function removePoster(poster) {
    if (!window.confirm("Remove this promotional poster?")) return;
    await persistPosters(
      posters.filter((entry) => entry.id !== poster.id),
      "Poster removed."
    );
  }

  return (
    <section className="promoConfig" aria-labelledby="promo-config-title">
      <div className="promoConfigHeader">
        <div>
          <h2 id="promo-config-title">Salon Landing Page Posters</h2>
          <p>Upload and publish promotional highlights shown on the salon software page.</p>
        </div>
        <label className={`promoUploadButton${busy ? " isDisabled" : ""}`}>
          Upload image
          <input
            aria-label="Upload promotional poster"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || posters.length >= MAX_POSTERS}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              uploadPoster(file);
            }}
          />
        </label>
      </div>

      <p className="promoConfigHint">
        JPEG, PNG or WebP. Published posters require descriptive alt text. Order uses lower numbers first.
      </p>
      {message ? <p className="promoConfigMessage">{message}</p> : null}
      {error ? <p className="promoConfigError" role="alert">{error}</p> : null}

      {loading ? <p className="promoConfigState">Loading posters...</p> : null}
      {!loading && posters.length === 0 ? (
        <p className="promoConfigState">No promotional posters configured yet.</p>
      ) : null}

      <div className="promoConfigGrid">
        {posters.map((poster) => (
          <article className="promoConfigCard" key={poster.id}>
            <button
              className="promoPreviewButton"
              type="button"
              onClick={() => setPreviewPoster(poster)}
              aria-label={`Preview ${poster.altText || "unpublished promotional poster"}`}
            >
              <img
                src={poster.imageUrl}
                alt={poster.altText || "Unpublished promotional poster preview"}
                width={poster.width}
                height={poster.height}
              />
              <span>Preview</span>
            </button>

            <div className="promoConfigFields">
              <label>
                Descriptive alt text
                <textarea
                  value={poster.altText || ""}
                  maxLength={180}
                  rows={3}
                  onChange={(event) => updatePoster(poster.id, "altText", event.target.value)}
                />
              </label>
              <label>
                Display order
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={poster.displayOrder}
                  onChange={(event) =>
                    updatePoster(poster.id, "displayOrder", Number(event.target.value))
                  }
                />
              </label>
            </div>

            <div className="promoConfigStatus">
              <span className={poster.published ? "isPublished" : "isDraft"}>
                {poster.published ? "Published" : "Unpublished"}
              </span>
              <span>{poster.width} × {poster.height}px</span>
            </div>

            <div className="promoConfigActions">
              <button type="button" disabled={busy} onClick={() => togglePublished(poster)}>
                {poster.published ? "Unpublish" : "Publish"}
              </button>
              <label className="promoReplaceButton">
                Replace
                <input
                  aria-label={`Replace poster ${poster.id}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    uploadPoster(file, poster);
                  }}
                />
              </label>
              <button className="promoRemoveButton" type="button" disabled={busy} onClick={() => removePoster(poster)}>
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>

      {posters.length > 0 ? (
        <button
          className="promoSaveButton"
          type="button"
          disabled={busy}
          onClick={() => persistPosters(posters, "Poster details and order saved.")}
        >
          {busy ? "Saving..." : "Save poster details"}
        </button>
      ) : null}

      {previewPoster ? (
        <div className="promoPreviewModal" role="dialog" aria-modal="true" aria-label="Promotional poster preview">
          <button type="button" className="promoPreviewClose" onClick={() => setPreviewPoster(null)}>
            Close preview
          </button>
          <img
            src={previewPoster.imageUrl}
            alt={previewPoster.altText || "Unpublished promotional poster preview"}
            width={previewPoster.width}
            height={previewPoster.height}
          />
        </div>
      ) : null}
    </section>
  );
}
