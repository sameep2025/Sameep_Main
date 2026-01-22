// c:/BNT/Sameep/category/frontend/src/pages/CreateCategoryPage.jsx
import { useNavigate } from "react-router-dom";
import CreateCategoryModal from "../components/CreateCategoryModal";

function CreateCategoryPage() {
  const navigate = useNavigate();

  const handleClose = () => {
    navigate("/categories");
  };

  return (
    <CreateCategoryModal
      show={true}
      onClose={handleClose}
      onCreated={handleClose}
      parentId={null} // Or get from URL if we want to create subcategories
    />
  );
}

export default CreateCategoryPage;
