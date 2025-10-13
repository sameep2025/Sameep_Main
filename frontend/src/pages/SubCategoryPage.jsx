// pages/SubCategoryPage.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import CategoryList from "../components/CategoryList";

function SubCategoryPage() {
  const { id } = useParams();
  const [breadcrumbs, setBreadcrumbs] = useState([]);

  useEffect(() => {
    const fetchBreadcrumbs = async () => {
      try {
        let currentId = id;
        const chain = [];

        // keep going up until no parent
        while (currentId) {
          const res = await fetch(`http://localhost:5000/api/categories/${currentId}`);
          if (!res.ok) break;
          const data = await res.json();
          chain.unshift(data); // add to front
          currentId = data.parentId; // move to parent
        }

        setBreadcrumbs(chain);
      } catch (err) {
        console.error("Failed to fetch breadcrumbs", err);
      }
    };

    fetchBreadcrumbs();
  }, [id]);

  return (
    <div>
      {/* ✅ Breadcrumb Navigation */}
      <nav style={{ marginBottom: "10px" }}>
        <Link to="/categories">Home</Link>
        {breadcrumbs.map((cat, index) => (
          <span key={cat.id}>
            {" > "}
            {index === breadcrumbs.length - 1 ? (
              <b>{cat.name}</b> // current category (not clickable)
            ) : (
              <Link to={`/categories/${cat.id}`}>{cat.name}</Link>
            )}
          </span>
        ))}
      </nav>

      <h1>
        {breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : "Subcategories"}
      </h1>

      <CategoryList parentId={id} />
    </div>
  );
}

export default SubCategoryPage;
