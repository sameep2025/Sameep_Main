import { useParams } from "react-router-dom";
import CategoryList from "./CategoryList";

function CategoryPage() {
  const { parentId } = useParams();

  return (
    <div>
      <h1>{parentId ? "Subcategories" : "Categories"}</h1>

      {/* Category list now handles breadcrumbs and create button */}
      <CategoryList parentId={parentId || null} />
    </div>
  );
}

export default CategoryPage;