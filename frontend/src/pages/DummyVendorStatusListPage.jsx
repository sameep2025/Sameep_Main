import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "../config";
import DummyBusinessHoursModal from "../components/DummyBusinessHoursModal";
import DummyBusinessLocationModal from "../components/DummyBusinessLocationModal";
import DummyLocationPickerModal from "../components/DummyLocationPickerModal";

export default function DummyVendorStatusListPage() {
  const { categoryId, status } = useParams();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isHosted = /go-kar\.net/i.test(String(API_BASE_URL || ""));
  const devProxy = (() => {
    try {
      const loc = window.location;
      const isLocal = loc && (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1');
      if (isLocal && String(loc.port) === '3001') return 'http://localhost:3000';
    } catch {}
    return '';
  })();
  // Prefer Next proxy on :3000 when running the React app on :3001, otherwise:
  // - When hosted (go-kar.net), use same-origin '' (Next/site proxy handles /api)
  // - Else use API_BASE_URL directly (e.g., http://localhost:5000 or http://localhost:3000)
  const API_PREFIX = devProxy || (isHosted ? '' : API_BASE_URL);
  const [activeVendor, setActiveVendor] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [uploads, setUploads] = useState({}); // { [vendorId]: File[] }

  const applyLocalLocation = (vendorId, location) => {
    setVendors((list) =>
      (Array.isArray(list) ? list : []).map((row) =>
        row._id === vendorId ? { ...row, location: { ...(row.location || {}), ...(location || {}) } } : row
      )
    );
  };

  const refreshVendor = async (vendorId) => {
    try {
      // refetch the one vendor via byCategory filter to update row
      const res = await axios.get(`${API_PREFIX}/api/dummy-vendors/byCategory/${categoryId}`, { params: { status } });
      const list = Array.isArray(res.data) ? res.data : [];
      setVendors(list);
    } catch {}
  };

  const onFilesChange = (vendorId, files) => {
    setUploads((u) => ({ ...u, [vendorId]: Array.from(files || []) }));
  };

  const readFileAsDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const resizeImageFile = async (file, maxDim = 1280, quality = 0.75) => {
    try {
      const dataUrl = await readFileAsDataURL(file);
      const img = document.createElement('img');
      const loaded = await new Promise((res, rej) => { img.onload = () => res(true); img.onerror = rej; img.src = dataUrl; });
      if (!loaded) return dataUrl;
      const { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      if (scale >= 1) return dataUrl; // no need to resize
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Use JPEG to reduce size; fallback to original if canvas fails
      return canvas.toDataURL('image/jpeg', quality);
    } catch {
      return await readFileAsDataURL(file);
    }
  };

  const onUploadFiles = async (v) => {
    v = await resolveVendor(v); if (!v) return;
    const files = uploads[v._id] || [];
    if (!files.length) { alert('Please choose images'); return; }
    try {
      const existing = Array.isArray(v.profilePictures) ? v.profilePictures.slice() : [];
      const dataUrls = await Promise.all(files.map((f) => resizeImageFile(f, 1280, 0.75)));
      const next = existing.concat(dataUrls).slice(0, 5);
      await axios.put(`${API_PREFIX}/api/dummy-vendors/${v._id}/profile-pictures`, { profilePictures: next });
      setUploads((u) => ({ ...u, [v._id]: [] }));
      await refreshVendor(v._id);
    } catch (e) { alert(e?.response?.data?.message || 'Failed to upload images'); }
  };

  const onDeleteThumb = async (v, idx) => {
    v = await resolveVendor(v); if (!v) return;
    try {
      await axios.delete(`${API_PREFIX}/api/dummy-vendors/${v._id}/profile-pictures/${idx}`);
      await refreshVendor(v._id);
    } catch (e) { alert(e?.response?.data?.message || 'Failed to delete image'); }
  };

  const resolveVendor = async (v) => {
    if (!v) return null;
    if (v._id !== 'local') return v;
    // Try resolve from dv_last_<categoryId>
    try {
      const raw = localStorage.getItem(`dv_last_${categoryId}`);
      if (raw) {
        const last = JSON.parse(raw);
        if (last.vendorId) return { ...v, _id: last.vendorId };
      }
    } catch {}
    // Fallback: refetch list and pick first vendor
    try {
      const res = await axios.get(`${API_BASE_URL}/api/dummy-vendors/byCategory/${categoryId}`, { params: { status } });
      const list = Array.isArray(res.data) ? res.data : [];
      if (list.length) return list[0];
    } catch {}
    alert('No real vendor found yet for this placeholder. Please activate again or refresh.');
    return null;
  };

  const openHomePicker = async (v) => {
    v = await resolveVendor(v); if (!v) return;
    setActiveVendor(v);
    setShowNearby(false);
    setShowHours(false);
    setShowPicker(true);
  };

  const openNearbyModal = async (v) => {
    v = await resolveVendor(v); if (!v) return;
    setActiveVendor(v);
    setShowPicker(false);
    setShowHours(false);
    setShowNearby(true);
  };

  const openHoursModal = async (v) => {
    v = await resolveVendor(v); if (!v) return;
    setActiveVendor(v);
    setShowPicker(false);
    setShowNearby(false);
    setShowHours(true);
  };

  const onAddProfilePic = async (v) => {
    v = await resolveVendor(v); if (!v) return;
    const url = window.prompt('Enter picture URL:');
    if (!url) return;
    try {
      const list = Array.isArray(v.profilePictures) ? v.profilePictures.slice() : [];
      list.push(url);
      await axios.put(`${API_PREFIX}/api/dummy-vendors/${v._id}/profile-pictures`, { profilePictures: list });
      await refreshVendor(v._id);
    } catch (e) { alert(e?.response?.data?.message || 'Failed to add picture'); }
  };

  const onReplaceProfilePic = async (v) => {
    v = await resolveVendor(v); if (!v) return;
    const indexStr = window.prompt('Replace picture at index (0-based):');
    if (indexStr == null) return;
    const idx = Number(indexStr);
    if (!Number.isInteger(idx) || idx < 0) { alert('Invalid index'); return; }
    const url = window.prompt('Enter new picture URL:');
    if (!url) return;
    try {
      await axios.put(`${API_PREFIX}/api/dummy-vendors/${v._id}/profile-pictures/${idx}`, { url });
      await refreshVendor(v._id);
    } catch (e) { alert(e?.response?.data?.message || 'Failed to replace picture'); }
  };

  const onDeleteProfilePic = async (v) => {
    v = await resolveVendor(v); if (!v) return;
    const indexStr = window.prompt('Delete picture at index (0-based):');
    if (indexStr == null) return;
    const idx = Number(indexStr);
    if (!Number.isInteger(idx) || idx < 0) { alert('Invalid index'); return; }
    try {
      await axios.delete(`${API_BASE_URL}/api/dummy-vendors/${v._id}/profile-pictures/${idx}`);
      await refreshVendor(v._id);
    } catch (e) { alert(e?.response?.data?.message || 'Failed to delete picture'); }
  };

  const fetchVendors = async () => {
    if (!status || !categoryId) return;
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(
        `${API_PREFIX}/api/dummy-vendors/byCategory/${categoryId}?status=${encodeURIComponent(status)}`
      );
      const vendorsData = Array.isArray(res.data) ? res.data : [];
      if (vendorsData.length === 0) {
        try {
          const raw = localStorage.getItem(`dv_last_${categoryId}`);
          const okStatus = (status || "").toLowerCase() === "waiting for approval".toLowerCase();
          const row = raw && okStatus ? JSON.parse(raw) : null;
          if (row) {
            const vid = row.vendorId || "local";
            setVendors([{ _id: vid, businessName: row.businessName, contactName: row.contactName, phone: row.phone, customerId: { fullNumber: row.phone }, status: row.status || "Waiting for Approval", createdAt: row.createdAt }]);
            return;
          }
        } catch {}
      }
      setVendors(vendorsData);
    } catch (err) {
      // Fallback to local UI-only record if available
      try {
        const raw = localStorage.getItem(`dv_last_${categoryId}`);
        if (raw) {
          const last = JSON.parse(raw);
          if ((status || "").toLowerCase() === "waiting for approval".toLowerCase()) {
            setVendors([
              {
                _id: last.vendorId || "local",
                businessName: last.businessName,
                contactName: last.contactName,
                phone: last.phone,
                customerId: { fullNumber: last.phone },
                status: last.status || "Waiting for Approval",
                createdAt: last.createdAt,
              },
            ]);
            setError("");
            return;
          }
        }
      } catch {}
      setError("Failed to fetch vendors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVendors(); }, [status, categoryId]);

  return (
    <div>
      <h2>Vendors - {decodeURIComponent(status || "")} </h2>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div style={{ color: "#991b1b", background: "#fee2e2", border: "1px solid #fecaca", padding: 10, borderRadius: 8 }}>{error}</div>
      ) : vendors.length === 0 ? (
        <div>No vendors found</div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Vendor Name</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Contact Number</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Business Name</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Home Location</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Business Location</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Profile Pictures</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v._id}>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{v.contactName || '-'}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{v.customerId?.fullNumber || v.phone || '-'}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{v.businessName || '-'}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  {(() => {
                    try {
                      const loc = v.location || {};
                      const ac = loc.areaCity || v.areaCity || ([loc.area, loc.city].filter(Boolean).join(', ')) || loc.address || v.address;
                      if (ac && String(ac).trim()) return ac;
                      const plat = (typeof loc.lat === 'number') ? loc.lat : (typeof v.lat === 'number' ? v.lat : null);
                      const plng = (typeof loc.lng === 'number') ? loc.lng : (typeof v.lng === 'number' ? v.lng : null);
                      if (typeof plat === 'number' && typeof plng === 'number') return `${plat.toFixed(4)}, ${plng.toFixed(4)}`;
                      return 'Not Set';
                    } catch { return 'Not Set'; }
                  })()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  {Array.isArray(v.location?.nearbyLocations) && v.location.nearbyLocations.filter(Boolean).length
                    ? v.location.nearbyLocations.filter(Boolean).join(', ')
                    : 'Not Set'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>Uploaded: {(v.profilePictures || []).length}/5</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {(v.profilePictures || []).map((url, idx) => (
                      <div key={idx} style={{ position: 'relative', width: 48, height: 48 }}>
                        <img src={url} alt="pic" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
                        <button
                          onClick={() => onDeleteThumb(v, idx)}
                          title="Delete"
                          style={{ position: 'absolute', top: -8, right: -8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '9999px', width: 20, height: 20, fontSize: 12, cursor: 'pointer' }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => onFilesChange(v._id, e.target.files)}
                      disabled={(v.profilePictures || []).length >= 5}
                    />
                    <button onClick={() => onUploadFiles(v)} disabled={!uploads[v._id]?.length} style={{ padding: '4px 10px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}>Upload</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>You can upload up to 5 images.</div>
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => navigate(`/dummy-vendors/${v._id}/categories/${categoryId}`)} style={{ padding: '4px 10px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}>👁️</button>
                    <button onClick={() => openHomePicker(v)} style={{ padding: '4px 10px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none' }}>🏠</button>
                    <button onClick={() => openNearbyModal(v)} style={{ padding: '4px 10px', borderRadius: 6, background: '#f59e0b', color: '#fff', border: 'none' }}>🏢</button>
                    <button onClick={() => openHoursModal(v)} style={{ padding: '4px 10px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none' }}>⏰</button>
                    {/* <button onClick={() => onAddProfilePic(v)} style={{ padding: '4px 10px', borderRadius: 6, background: '#0891b2', color: '#fff', border: 'none' }}>➕🖼️</button>
                    <button onClick={() => onReplaceProfilePic(v)} style={{ padding: '4px 10px', borderRadius: 6, background: '#0d9488', color: '#fff', border: 'none' }}>✎🖼️</button>
                    <button onClick={() => onDeleteProfilePic(v)} style={{ padding: '4px 10px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none' }}>🗑️</button> */}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {activeVendor && (
        <>
          <DummyLocationPickerModal
            show={showPicker}
            onClose={() => setShowPicker(false)}
            vendorId={activeVendor?._id}
            initialLocation={activeVendor?.location}
            onLocationSave={async (newLoc) => {
              if (activeVendor?._id) applyLocalLocation(activeVendor._id, newLoc);
              setShowPicker(false);
              // fire-and-forget refresh to sync from server
              refreshVendor(activeVendor?._id);
            }}
          />
          <DummyBusinessLocationModal
            show={showNearby}
            onClose={() => setShowNearby(false)}
            vendorId={activeVendor?._id}
            onUpdate={async () => {
              await refreshVendor(activeVendor?._id);
              setShowNearby(false);
            }}
          />
          <DummyBusinessHoursModal
            show={showHours}
            vendor={activeVendor}
            onClose={() => setShowHours(false)}
            onUpdated={async () => {
              await refreshVendor(activeVendor?._id);
              setShowHours(false);
            }}
          />
        </>
      )}
    </div>
  );
}
