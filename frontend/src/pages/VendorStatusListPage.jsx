import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { LocationPickerModal } from "../components/LocationPickerModal";
import BusinessLocationModal from "../components/BusinessLocationModal";
import BusinessHoursModal from "../components/BusinessHoursModal";

// ---------------- Update Price Modal ----------------
function UpdatePriceModal({ show, onClose, category, vendorId, onUpdated }) {
  const [price, setPrice] = useState("");

  useEffect(() => {
    setPrice(category?.vendorPrice ?? category?.price ?? "");
  }, [category]);

  if (!show || !category || !vendorId) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newPrice = parseFloat(price);
    if (isNaN(newPrice)) return alert("Enter a valid number");

    try {
      await axios.put(
        `http://localhost:5000/api/vendorPricing/${vendorId}/${
          category._id ?? category.id
        }`,
        { price: newPrice }
      );

      onUpdated(category._id ?? category.id, newPrice);
      onClose();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to update price");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "20px",
          borderRadius: "10px",
          minWidth: "300px",
        }}
      >
        <h3>Update Price: {category.name}</h3>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "10px" }}
        >
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Vendor Price"
            required
            style={{
              padding: "8px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          />
          <div
            style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                background: "#ccc",
                border: "none",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                background: "#00AEEF",
                border: "none",
                color: "#fff",
              }}
            >
              Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------- Flatten Tree Helper ----------------
function flattenTree(node, rows = [], parentLevels = []) {
  if (!node) return rows;
  const levels = [...parentLevels, node.name ?? "Unnamed"];
  if (!node.children || node.children.length === 0) {
    rows.push({
      id: node._id ?? node.id,
      levels,
      price:
        typeof node.vendorPrice === "number"
          ? node.vendorPrice
          : node.price ?? "-",
      categoryId: node._id ?? node.id,
    });
  } else {
    node.children.forEach((child) => flattenTree(child, rows, levels));
  }
  return rows;
}

// ---------------- Main Component ----------------
export default function VendorStatusListPage() {
  const { categoryId, status } = useParams();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [tree, setTree] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [vendorCategoriesCache, setVendorCategoriesCache] = useState({});

  const [modalCategory, setModalCategory] = useState(null);
  const [showBusinessModal, setShowBusinessModal] = useState(false);
  // New states
  const [showBusinessLocationModal, setShowBusinessLocationModal] =
    useState(false);
  const [selectedVendorForBusiness, setSelectedVendorForBusiness] =
    useState(null);
  const [businessLocations, setBusinessLocations] = useState([]);
  const [homeLocations, setHomeLocations] = useState([]);

  // New states for location modal
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedVendorForLocation, setSelectedVendorForLocation] =
    useState(null);

  const [vendorLocation, setVendorLocation] = useState(null);
  const [newNearby, setNewNearby] = useState("");

  const [selectedVendorForBusinessHours, setSelectedVendorForBusinessHours] =
    useState(null);

  const fetchVendors = async () => {
    if (!status || !categoryId) return;
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(
        `http://localhost:5000/api/vendors/byCategory/${categoryId}?status=${encodeURIComponent(
          status
        )}`
      );
      const vendorsData = Array.isArray(res.data) ? res.data : [];
      const vendorsWithLocation = await Promise.all(
        vendorsData.map(async (vendor) => {
          try {
            const locRes = await axios.get(
              `http://localhost:5000/api/vendors/${vendor._id}/location`
            );

            const locationData = locRes.data.location || {};
            // ensure nearbyLocations exists
            locationData.nearbyLocations = locationData.nearbyLocations || [
              "",
              "",
              "",
              "",
              "",
            ];

            return { ...vendor, location: locationData };
          } catch (locError) {
            return {
              ...vendor,
              location: { nearbyLocations: ["", "", "", "", ""] },
            };
          }
        })
      );

      setVendors(vendorsWithLocation);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch vendors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!status || !categoryId) return;
    fetchVendors();
  }, [status, categoryId]);

  const fetchVendorCategories = async (vendorId) => {
    // If we already have this vendor’s categories, show them instantly
    if (vendorCategoriesCache[vendorId]) {
      setTree(vendorCategoriesCache[vendorId]);
      return;
    }

    setCategoriesLoading(true); // show loading message
    try {
      const res = await axios.get(
        `http://localhost:5000/api/vendors/${vendorId}/categories`
      );
      let categories = res.data.categories;
      let treeData;
      if (!categories) treeData = [];
      else if (Array.isArray(categories))
        treeData = [{ _id: "root", name: "Root", children: categories }];
      else treeData = [{ ...categories, children: categories.children || [] }];

      // Save (cache) this vendor’s data so next click is instant
      setVendorCategoriesCache((prev) => ({ ...prev, [vendorId]: treeData }));
      setTree(treeData);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch vendor categories");
    } finally {
      setCategoriesLoading(false);
    }
  };
  // Preload categories in background after vendor list loads
  useEffect(() => {
  if (vendors.length > 0) {
    vendors.forEach((v) => {
      // Skip if already cached
      if (vendorCategoriesCache[v._id]) return;

      axios
        .get(`http://localhost:5000/api/vendors/${v._id}/categories`)
        .then((res) => {
          let categories = res.data.categories;
          let treeData;
          if (!categories) treeData = [];
          else if (Array.isArray(categories))
            treeData = [{ _id: "root", name: "Root", children: categories }];
          else
            treeData = [{ ...categories, children: categories.children || [] }];

          setVendorCategoriesCache((prev) => ({
            ...prev,
            [v._id]: treeData,
          }));

          // ✅ Auto-select first vendor if none selected
          if (!selectedVendor) {
            setSelectedVendor(v);
            setTree(treeData);
          }
        })
        .catch(() => {});
    });
  }
}, [vendors]);


  const handleVendorClick = (vendor) => {
    setSelectedVendor(vendor);
    fetchVendorCategories(vendor._id);
  };

  const handlePriceUpdate = (categoryId, newPrice) => {
    setTree((prevTree) => {
      const updateNode = (node) => {
        if (!node) return node;
        if ((node._id ?? node.id) === categoryId)
          return { ...node, vendorPrice: newPrice };
        if (node.children)
          return { ...node, children: node.children.map(updateNode) };
        return node;
      };
      return prevTree.map(updateNode);
    });
  };

  // Callback for the new LocationPickerModal
  // This function is called when the modal successfully saves a location.
  const onLocationUpdate = (newLocation) => {
    const vendorIdToUpdate = selectedVendorForLocation?._id;
    if (!vendorIdToUpdate) return;

    setVendors((currentVendors) =>
      currentVendors.map((v) => {
        if (v._id === vendorIdToUpdate) {
          // Merge old nearbyLocations with new home location
          const nearby = v.location?.nearbyLocations || [];
          return {
            ...v,
            location: {
              ...newLocation, // new lat, lng, area, city, etc
              nearbyLocations: nearby, // preserve business locations
            },
          };
        }
        return v;
      })
    );

    if (selectedVendor?._id === vendorIdToUpdate) {
      const nearby = selectedVendor.location?.nearbyLocations || [];
      setSelectedVendor({
        ...selectedVendor,
        location: {
          ...newLocation,
          nearbyLocations: nearby,
        },
      });
    }

    setSelectedVendorForLocation(null);
    setShowLocationModal(false);
  };

  const handleBusinessLocationUpdate = (vendorId, nearbyLocations) => {
    setVendors((prev) =>
      prev.map((v) =>
        v._id === vendorId
          ? { ...v, location: { ...v.location, nearbyLocations } }
          : v
      )
    );

    if (selectedVendor && selectedVendor._id === vendorId) {
      setSelectedVendor((s) => ({
        ...s,
        location: { ...s.location, nearbyLocations },
      }));
    }
  };

  const rows = tree.flatMap((root) => flattenTree(root));
  const maxLevels = rows.reduce(
    (max, row) => Math.max(max, row.levels.length),
    0
  );
  const levelHeaders = Array.from({ length: maxLevels }, (_, idx) =>
    idx === 0 ? "Category" : `Level ${idx + 1}`
  );

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ padding: 20 }}>
      <h1>{status} Vendors</h1>
      {vendors.length === 0 ? (
        <p>No vendors found in this status.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {vendors.map((v) => (
            <li
              key={v._id}
              style={{
                marginBottom: 12,
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 6,
              }}
            >
              <p>
                <b>Vendor Name:</b> {v.contactName || "-"}
              </p>
              <p>
                <b>Contact Number:</b>{" "}
                {v.customerId?.fullNumber || v.phone || "-"}
              </p>
              <p>
                <b>Business Name:</b> {v.businessName || "-"}
              </p>
              {/* Display the saved home location */}
              <p>
                <b>Home Location: </b>
                <span
                  style={{
                    fontWeight: "bold",
                    color: v.location ? "#28a745" : "#6c757d",
                  }}
                >
                  {v.location
                    ? [v.location.area, v.location.city]
                        .filter(Boolean)
                        .join(", ")
                    : "Not Set"}
                </span>
              </p>

              <button
                onClick={() => handleVendorClick(v)}
                style={{
                  marginTop: 6,
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background: "#00AEEF",
                  color: "#fff",
                  border: "none",
                }}
              >
                View Categories
              </button>

              {/* New Home Location Button */}
              <button
                onClick={() => {
                  setSelectedVendorForLocation(v);
                  setShowLocationModal(true);
                }}
                style={{
                  marginLeft: 10,
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background: "green",
                  color: "#fff",
                  border: "none",
                }}
              >
                {v.location ? "Update Home Location" : "Set Home Location"}
              </button>

              <button
                onClick={() => {
                  setSelectedVendorForBusiness(v);
                  setShowBusinessLocationModal(true);
                }}
                style={{
                  marginLeft: 10,
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background: "orange",
                  color: "#fff",
                  border: "none",
                }}
              >
                Business Location
              </button>

              <button
                onClick={() => {
                  setSelectedVendorForBusinessHours(v);
                }}
                style={{
                  marginLeft: 10,
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background: "purple",
                  color: "#fff",
                  border: "none",
                }}
              >
                Business Hours
              </button>
              {/* Display non-empty business locations */}
              {/* Business Location Section */}
              <p>
                <b>Business Locations: </b>
                {v.location?.nearbyLocations?.filter((loc) => loc?.trim())
                  .length > 0 ? (
                  <ul style={{ paddingLeft: 16, margin: 4 }}>
                    {v.location.nearbyLocations
                      .filter((loc) => loc?.trim())
                      .map((loc, idx) => (
                        <li key={idx}>{loc}</li>
                      ))}
                  </ul>
                ) : (
                  <span style={{ color: "#6c757d" }}>Not Set</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {selectedVendor && (
        <div style={{ marginTop: 30, position: "relative" }}>
          <h2>Categories for {selectedVendor.businessName}</h2>

          {/* Preview button */}
          <button
  onClick={() => {
    if (rows[0]) {
      const categoryIdForPreview = rows[0].categoryId; // use first category
      const homeLocs =
        selectedVendor.businessLocations?.filter(Boolean) || [];

      window.open(
        `http://localhost:3000/preview/${selectedVendor._id}/${categoryIdForPreview}?homeLocs=${encodeURIComponent(
          JSON.stringify(homeLocs)
        )}&t=${Date.now()}`, // timestamp avoids cache
        "_blank"
      );
    } else {
      alert("No category available for preview");
    }
  }}
  style={{
    position: "absolute",
    right: 0,
    top: 0,
    padding: "6px 12px",
    borderRadius: 6,
    background: "#2563EB",
    color: "#fff",
    border: "none",
    cursor: "pointer",
  }}
>
  Preview
</button>


          {categoriesLoading ? (
            <p>Loading categories...</p>
          ) : rows.length === 0 ? (
            <p>No categories found</p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {levelHeaders.map((header, idx) => (
                    <th
                      key={idx}
                      style={{ border: "1px solid #ccc", padding: "8px" }}
                    >
                      {header}
                    </th>
                  ))}
                  <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                    Price
                  </th>
                  <th style={{ border: "1px solid #ccc", padding: "8px" }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {levelHeaders.map((_, idx) => (
                      <td
                        key={idx}
                        style={{ border: "1px solid #ccc", padding: "8px" }}
                      >
                        {row.levels[idx] ?? "-"}
                      </td>
                    ))}
                    <td>{row.price}</td>
                    <td>
                      <button
                        onClick={() =>
                          setModalCategory({
                            id: row.categoryId,
                            name: row.levels.slice(-1)[0],
                            vendorPrice: row.price,
                          })
                        }
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          background: "#00AEEF",
                          color: "#fff",
                          border: "none",
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modals */}
      <UpdatePriceModal
        show={!!modalCategory}
        onClose={() => setModalCategory(null)}
        category={modalCategory}
        vendorId={selectedVendor?._id}
        onUpdated={handlePriceUpdate}
      />

      <LocationPickerModal
        show={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        vendorId={selectedVendorForLocation?._id}
        initialLocation={selectedVendorForLocation?.location} // Pass the whole location object
        onLocationSave={onLocationUpdate}
      />

      <BusinessLocationModal
        show={showBusinessLocationModal}
        onClose={() => {
          setShowBusinessLocationModal(false);
          setSelectedVendorForBusiness(null);
        }}
        vendorId={selectedVendorForBusiness?._id}
        onUpdate={handleBusinessLocationUpdate}
      />

      {selectedVendorForBusinessHours && (
        <BusinessHoursModal
          vendor={selectedVendorForBusinessHours}
          onClose={() => setSelectedVendorForBusinessHours(null)}
          onUpdated={(updatedVendor) => {
            setVendors((prev) =>
              prev.map((v) => (v._id === updatedVendor._id ? updatedVendor : v))
            );
            if (selectedVendor?._id === updatedVendor._id)
              setSelectedVendor(updatedVendor);
          }}
        />
      )}
    </div>
  );
}
