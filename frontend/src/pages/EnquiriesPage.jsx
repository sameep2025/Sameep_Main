import { useEffect, useState } from "react";
import axios from "axios";
import API_BASE_URL from "../config";

function EnquiriesPage() {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [vendorNames, setVendorNames] = useState({}); // { [vendorId]: businessName }

  useEffect(() => {
    const loadAllEnquiries = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axios.get(`${API_BASE_URL}/api/enquiries`);
        const list = Array.isArray(res.data) ? res.data : [];
        setEnquiries(list);
      } catch (e) {
        setError(e?.response?.data?.message || e.message || "Failed to load enquiries");
      } finally {
        setLoading(false);
      }
    };
    loadAllEnquiries();
  }, []);

  // Whenever enquiries change, fetch business names for unique vendorIds
  useEffect(() => {
    const loadVendors = async () => {
      try {
        const ids = Array.from(
          new Set(
            (enquiries || [])
              .map((e) => (e && e.vendorId ? String(e.vendorId) : ""))
              .filter(Boolean)
          )
        );
        if (!ids.length) return;

        const current = vendorNames || {};
        const missing = ids.filter((id) => current[id] == null);
        if (!missing.length) return;

        const entries = await Promise.all(
          missing.map(async (id) => {
            try {
              const res = await axios.get(`${API_BASE_URL}/api/dummy-vendors/${id}`);
              const v = res.data || {};
              const name = v.businessName || v.contactName || v.name || "Vendor";
              return [id, name];
            } catch {
              return [id, id];
            }
          })
        );

        const next = { ...current };
        entries.forEach(([id, name]) => {
          next[id] = name;
        });
        setVendorNames(next);
      } catch {}
    };

    loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiries]);

  return (
    <div>
      <h2>Enquiries</h2>
      {loading ? (
        <p>Loading enquiries...</p>
      ) : error ? (
        <p style={{ color: "#b91c1c" }}>{error}</p>
      ) : enquiries.length === 0 ? (
        <p>No enquiries found.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #e5e7eb", padding: 8 }}>Time</th>
                <th style={{ border: "1px solid #e5e7eb", padding: 8 }}>Vendor</th>
                <th style={{ border: "1px solid #e5e7eb", padding: 8 }}>Customer</th>
                <th style={{ border: "1px solid #e5e7eb", padding: 8 }}>Service</th>
                <th style={{ border: "1px solid #e5e7eb", padding: 8 }}>Attributes</th>
                <th style={{ border: "1px solid #e5e7eb", padding: 8 }}>Price</th>
                <th style={{ border: "1px solid #e5e7eb", padding: 8 }}>Terms</th>
                <th style={{ border: "1px solid #e5e7eb", padding: 8 }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {enquiries.map((enq) => {
                const dt = enq.createdAt ? new Date(enq.createdAt) : null;
                const timeStr = dt ? dt.toLocaleString() : "-";
                const phone = enq.phone || enq.customerId || "-";
                const catPath = Array.isArray(enq.categoryPath) ? enq.categoryPath.join(" / ") : "";
                const attrsObj = enq.attributes && typeof enq.attributes === "object" ? enq.attributes : {};
                // Attributes: show only the inventory label name (inventoryName) if present, else '-'
                const attrsText =
                  typeof attrsObj.inventoryName === "string" && attrsObj.inventoryName.trim()
                    ? attrsObj.inventoryName.trim()
                    : "-";

                const priceStr = enq.price == null ? "-" : String(enq.price);
                const serviceLabel = (() => {
                  if (catPath && catPath.trim()) {
                    const segs = catPath
                      .split("/")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    if (segs.length >= 3) {
                      const left = segs[1];
                      const right = segs.slice(2).join(" / ");
                      return `${left} - ${right}`;
                    }
                    if (segs.length === 2) {
                      return `${segs[0]} - ${segs[1]}`;
                    }
                    return segs[0];
                  }
                  return enq.serviceName || "-";
                })();

                return (
                  <tr key={enq._id || `${enq.vendorId}-${enq.categoryId}-${enq.createdAt}`}>
                    <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>{timeStr}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>
                      {(() => {
                        const vid = enq.vendorId ? String(enq.vendorId) : "";
                        if (!vid) return "-";
                        return vendorNames[vid] || vid;
                      })()}
                    </td>
                    <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>{phone}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>{serviceLabel}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>{attrsText}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>{priceStr}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>{enq.terms || "-"}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: 8 }}>{enq.source || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default EnquiriesPage;
