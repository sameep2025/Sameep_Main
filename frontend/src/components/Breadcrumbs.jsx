// Breadcrumb.jsx
import { Link, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "axios";

function Breadcrumb() {
  const { parentId } = useParams(); // current category id
  const [breadcrumb, setBreadcrumb] = useState([]);

  useEffect(() => {
    const fetchBreadcrumb = async () => {
      try {
        let trail = [];
        let currentId = parentId || null;

        while (currentId) {
          const res = await axios.get(`http://localhost:5000/api/categories/${currentId}`);
          const category = res.data;

          trail.unshift({ name: category.name, id: category._id }); // insert at start
          currentId = category.parent; // move up
        }

        setBreadcrumb(trail);
      } catch (err) {
        console.error("Error fetching breadcrumb:", err);
      }
    };

    fetchBreadcrumb();
  }, [parentId]);

  return (
    <nav style={{ marginBottom: "20px", color: "gold" }}>
      <Link to="/categories" style={{ textDecoration: "none", color: "gold" }}>
        Categories
      </Link>

      {breadcrumb.map((item, index) => (
        <span key={item.id}>
          {" "} &gt;{" "}
          <Link to={`/categories/${item.id}`} style={{ textDecoration: "none", color: "gold" }}>
            {item.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}

export default Breadcrumb;