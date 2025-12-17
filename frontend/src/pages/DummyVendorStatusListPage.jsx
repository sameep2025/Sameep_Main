import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import API_BASE_URL, { PREVIEW_BASE_URL } from "../config";
import DummyBusinessHoursModal from "../components/DummyBusinessHoursModal";
import DummyBusinessLocationModal from "../components/DummyBusinessLocationModal";
import DummyLocationPickerModal from "../components/DummyLocationPickerModal";

const STATUSES = [
  "Accepted",
  "Pending",
  "Rejected",
  "Waiting for Approval",
  "Registered",
  "Profile Setup",
];

export default function DummyVendorStatusListPage() {
  const { categoryId, status } = useParams();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isHosted = /go-kar\.net/i.test(String(API_BASE_URL || ""));
  // Always use API_BASE_URL for API calls to avoid proxy mismatches
  const API_PREFIX = (API_BASE_URL && String(API_BASE_URL).trim()) || '';
  const [activeVendor, setActiveVendor] = useState(null);
  const [selectedVendorId, setSelectedVendorId] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [showAddText, setShowAddText] = useState(false);
  const [addHeading, setAddHeading] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [uploads, setUploads] = useState({}); // { [vendorId]: File[] }
  const [statusCounts, setStatusCounts] = useState({}); // { status: count }
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [newStatus, setNewStatus] = useState("Waiting for Approval");
  const [showSocialHandlesModal, setShowSocialHandlesModal] = useState(false);
  const [categorySocialHandles, setCategorySocialHandles] = useState([]);
  const [socialHandlesLoading, setSocialHandlesLoading] = useState(false);
  const [socialHandlesError, setSocialHandlesError] = useState("");
  const [socialHandleIcons, setSocialHandleIcons] = useState({}); // normalized name -> iconUrl
  const [vendorSocialLinks, setVendorSocialLinks] = useState({}); // raw { [handleName]: url }
  const [socialLinksSaving, setSocialLinksSaving] = useState(false);

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
      const res = await axios.get(`${API_PREFIX}/api/dummy-vendors/byCategory/${categoryId}`, { params: { status: String(status || '').trim() } });
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
      await axios.delete(`${API_PREFIX}/api/dummy-vendors/${v._id}/profile-pictures/${idx}`);
      await refreshVendor(v._id);
    } catch (e) { alert(e?.response?.data?.message || 'Failed to delete picture'); }
  };

  const fetchVendors = async () => {
    if (!status || !categoryId) return;
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_PREFIX}/api/dummy-vendors/byCategory/${categoryId}`, { params: { status: String(status || '').trim() } });
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

  const fetchStatusCounts = async () => {
    if (!categoryId) return;
    try {
      const res = await axios.get(`${API_PREFIX}/api/dummy-vendors/categories/counts`, {
        params: { categoryId },
      });
      const counts = res.data?.[0]?.statusCounts || {};
      setStatusCounts(counts);
    } catch {
      setStatusCounts({});
    }
  };

  useEffect(() => { fetchVendors(); }, [status, categoryId]);
  useEffect(() => { fetchStatusCounts(); }, [categoryId]);

  const normalizeHandle = (v) => {
    try {
      return String(v == null ? "" : v)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    } catch {
      return "";
    }
  };

  useEffect(() => {
    const fetchIcons = async () => {
      try {
        const res = await axios.get(`${API_PREFIX}/api/masters`, {
          params: { type: "socialHandle" },
        });
        const data = Array.isArray(res.data) ? res.data : [];
        const map = {};
        data.forEach((m) => {
          const name = m && typeof m.name === "string" ? m.name : "";
          const key = normalizeHandle(name);
          if (!key) return;
          const rawUrl = (m && typeof m.imageUrl === "string" ? m.imageUrl : "").trim();
          if (!rawUrl) return;
          map[key] = rawUrl; // frontend already talks to backend origin, so rawUrl is fine
        });
        setSocialHandleIcons(map);
      } catch {
        setSocialHandleIcons({});
      }
    };
    fetchIcons();
  }, [API_PREFIX]);

  const openSocialHandlesModal = async () => {
    if (!categoryId) return;
    const v = vendors.find((x) => x._id === selectedVendorId);
    if (!v) {
      alert('Please select a vendor first');
      return;
    }
    setSocialHandlesLoading(true);
    setSocialHandlesError("");
    try {
      const [catRes, linksRes] = await Promise.all([
        axios.get(`${API_PREFIX}/api/dummy-categories/${categoryId}`),
        axios.get(`${API_PREFIX}/api/dummy-vendors/${v._id}/social-links`),
      ]);

      const doc = catRes.data || {};
      const raw = Array.isArray(doc.socialHandle)
        ? doc.socialHandle
        : doc.socialHandle
        ? [doc.socialHandle]
        : [];
      const cleaned = raw
        .map((v) => (v == null ? "" : String(v)))
        .map((v) => v.trim())
        .filter(Boolean);
      setCategorySocialHandles(cleaned);

      const linksPayload =
        linksRes.data && typeof linksRes.data.socialLinks === 'object' && linksRes.data.socialLinks !== null
          ? linksRes.data.socialLinks
          : {};
      setVendorSocialLinks(linksPayload);
      setShowSocialHandlesModal(true);
    } catch (e) {
      setCategorySocialHandles([]);
      setSocialHandlesError(e?.response?.data?.message || "Failed to load social handles");
      setShowSocialHandlesModal(true);
    } finally {
      setSocialHandlesLoading(false);
    }
  };

  return (
    <div>
      <h2>Vendors - {decodeURIComponent(status || "")} </h2>
      {/* Top navbar actions for selected vendor */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, color: '#334155', marginRight: 8 }}>Actions:</div>
        <button
          onClick={() => {
            const v = vendors.find(x => x._id === selectedVendorId);
            if (!v) return alert('Please select a vendor first');
            navigate(`/dummy-vendors/${v._id}/categories/${categoryId}`);
          }}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}
        >View Categories</button>
        <button
          onClick={() => {
            const v = vendors.find(x => x._id === selectedVendorId);
            if (!v) return alert('Please select a vendor first');
            openHomePicker(v);
          }}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none' }}
        >Set Home Location</button>
        <button
          onClick={() => {
            const v = vendors.find(x => x._id === selectedVendorId);
            if (!v) return alert('Please select a vendor first');
            openNearbyModal(v);
          }}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#f59e0b', color: '#fff', border: 'none' }}
        >Business Location</button>
        <button
          onClick={() => {
            const v = vendors.find(x => x._id === selectedVendorId);
            if (!v) return alert('Please select a vendor first');
            openHoursModal(v);
          }}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none' }}
        >Business Hours</button>
        <button
          onClick={() => {
            const v = vendors.find((x) => x._id === selectedVendorId);
            if (!v) return alert('Please select a vendor first');
            setNewStatus(v.status || "Waiting for Approval");
            setShowStatusModal(true);
          }}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#f97316', color: '#fff', border: 'none' }}
        >Change Status</button>
        <button
          onClick={openSocialHandlesModal}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#0f766e', color: '#fff', border: 'none' }}
        >Social Handles</button>
        <button
          onClick={() => {
            const v = vendors.find(x => x._id === selectedVendorId);
            if (!v) return alert('Please select a vendor first');
            (async () => {
              try {
                try {
                  const res = await axios.get(`${API_PREFIX}/api/dummy-vendors/${v._id}/custom-fields`);
                  const cf = res.data || {};
                  setAddHeading(String(cf.freeText1 || ''));
                  setAddDescription(String(cf.freeText2 || ''));
                } catch (e1) {
                  // Fallback: read full vendor doc and pick customFields
                  try {
                    const r2 = await axios.get(`${API_PREFIX}/api/dummy-vendors/${v._id}`);
                    const doc = r2.data || {};
                    const cf = (doc.customFields && typeof doc.customFields === 'object') ? doc.customFields : {};
                    setAddHeading(String(cf.freeText1 || ''));
                    setAddDescription(String(cf.freeText2 || ''));
                  } catch {
                    setAddHeading('');
                    setAddDescription('');
                  }
                }
              } catch {}
              setShowAddText(true);
            })();
          }}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', border: 'none' }}
        >Add on Text</button>
      </div>
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
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Select</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Vendor Name</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Contact Number</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Business Name</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Home Location</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Business Location</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Profile Pictures</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v._id}>
                <td style={{ border: '1px solid #ccc', padding: 8, textAlign: 'center' }}>
                  <input
                    type="radio"
                    name="selectedVendor"
                    checked={selectedVendorId === v._id}
                    onChange={() => setSelectedVendorId(v._id)}
                  />
                </td>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showStatusModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1400,
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: 16,
              borderRadius: 10,
              minWidth: 320,
              maxWidth: 480,
              width: '90%',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Change Vendor Status</h3>
            <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 12 }}>
              You can move this vendor to any status. Counts below match the
              Dummy Vendor Status page.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', rowGap: 8, marginBottom: 12 }}>
              {STATUSES.map((st) => (
                <label
                  key={st}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: newStatus === st ? '1px solid #16a34a' : '1px solid #e5e7eb',
                    background: newStatus === st ? '#ecfdf5' : '#f9fafb',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="radio"
                      name="vendorStatus"
                      checked={newStatus === st}
                      onChange={() => setNewStatus(st)}
                    />
                    <span>{st}</span>
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {statusCounts[st] || 0} vendors
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => setShowStatusModal(false)}
                style={{ padding: '6px 10px', borderRadius: 6, background: '#e5e7eb', border: 'none' }}
                disabled={statusSaving}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const v = vendors.find((x) => x._id === selectedVendorId);
                  if (!v) {
                    alert('Please select a vendor first');
                    return;
                  }
                  setStatusSaving(true);
                  try {
                    await axios.put(`${API_PREFIX}/api/dummy-vendors/${v._id}`, {
                      status: newStatus,
                    });
                    setShowStatusModal(false);
                    await fetchVendors();
                    await fetchStatusCounts();
                  } catch (e) {
                    alert(e?.response?.data?.message || 'Failed to update status');
                  } finally {
                    setStatusSaving(false);
                  }
                }}
                style={{ padding: '6px 10px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none' }}
                disabled={statusSaving}
              >
                {statusSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSocialHandlesModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1400,
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: 16,
              borderRadius: 10,
              minWidth: 320,
              maxWidth: 480,
              width: '90%',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Category Social Handles</h3>
            {socialHandlesLoading ? (
              <div>Loading...</div>
            ) : socialHandlesError ? (
              <div style={{ color: '#b91c1c', background: '#fee2e2', border: '1px solid #fecaca', padding: 8, borderRadius: 6 }}>
                {socialHandlesError}
              </div>
            ) : categorySocialHandles.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>No social handles configured for this category.</div>
            ) : (
              <ul style={{ paddingLeft: 0, listStyle: 'none', fontSize: 13, color: '#111827', marginBottom: 12 }}>
                {categorySocialHandles.map((name, idx) => {
                  const key = normalizeHandle(name);
                  const icon = socialHandleIcons[key] || null;
                  const current = (() => {
                    if (vendorSocialLinks && typeof vendorSocialLinks === 'object') {
                      if (vendorSocialLinks[name] != null) return String(vendorSocialLinks[name]);
                      if (vendorSocialLinks[key] != null) return String(vendorSocialLinks[key]);
                    }
                    return '';
                  })();
                  return (
                    <li
                      key={`${name}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      {icon && (
                        <img
                          src={icon}
                          alt={name}
                          style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }}
                        />
                      )}
                      <span style={{ minWidth: 90 }}>{name}</span>
                      <input
                        style={{
                          flex: 1,
                          padding: 4,
                          borderRadius: 4,
                          border: '1px solid #e5e7eb',
                          fontSize: 12,
                        }}
                        placeholder="Enter link / handle"
                        value={current}
                        onChange={(e) => {
                          const value = e.target.value;
                          setVendorSocialLinks((prev) => {
                            const next = { ...(prev || {}) };
                            next[name] = value;
                            return next;
                          });
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                onClick={() => setShowSocialHandlesModal(false)}
                style={{ padding: '6px 10px', borderRadius: 6, background: '#e5e7eb', border: 'none' }}
              >
                Close
              </button>
              <button
                onClick={async () => {
                  const v = vendors.find((x) => x._id === selectedVendorId);
                  if (!v) {
                    alert('Please select a vendor first');
                    return;
                  }
                  setSocialLinksSaving(true);
                  try {
                    const payload = {};
                    (categorySocialHandles || []).forEach((name) => {
                      const vlinks = vendorSocialLinks || {};
                      const val = vlinks[name];
                      const s = val == null ? '' : String(val).trim();
                      payload[name] = s;
                    });
                    await axios.put(`${API_PREFIX}/api/dummy-vendors/${v._id}/social-links`, {
                      socialLinks: payload,
                    });
                    setShowSocialHandlesModal(false);
                  } catch (e) {
                    alert(e?.response?.data?.message || 'Failed to save social links');
                  } finally {
                    setSocialLinksSaving(false);
                  }
                }}
                style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}
                disabled={socialLinksSaving}
              >
                {socialLinksSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddText && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 10, minWidth: 320, maxWidth: 480, width: '90%' }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Add on Text</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                placeholder="Heading"
                value={addHeading}
                onChange={(e) => setAddHeading(e.target.value)}
                style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
              />
              <textarea
                placeholder="Description"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                rows={4}
                style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowAddText(false)} style={{ padding: '6px 10px', borderRadius: 6, background: '#e5e7eb', border: 'none' }}>Cancel</button>
                <button onClick={async () => {
                  const v = vendors.find(x => x._id === selectedVendorId);
                  if (!v) { alert('Please select a vendor first'); return; }
                  try {
                    try {
                      await axios.put(`${API_PREFIX}/api/dummy-vendors/${v._id}/custom-fields`, {
                        freeText1: String(addHeading || ''),
                        freeText2: String(addDescription || ''),
                      });
                    } catch (e1) {
                      // Fallback: generic vendor update with customFields
                      await axios.put(`${API_PREFIX}/api/dummy-vendors/${v._id}`, {
                        customFields: {
                          freeText1: String(addHeading || ''),
                          freeText2: String(addDescription || ''),
                        }
                      });
                    }
                    setShowAddText(false);
                  } catch (e) {
                    alert(e?.response?.data?.message || 'Failed to save');
                  }
                }} style={{ padding: '6px 10px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}>Save</button>
              </div>
              
            </div>
          </div>
        </div>
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
