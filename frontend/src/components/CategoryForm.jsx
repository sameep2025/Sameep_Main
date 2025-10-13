import { useState } from 'react';

function CategoryForm({ onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    terms: '',
    visibleToUser: false,
    visibleToVendor: false,
    image: null,
    sequence: 0,
  });

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'file' ? files[0] : type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Category Name</label>
        <input type="text" name="name" onChange={handleChange} required />
      </div>

      <div>
        <label>Price (Optional)</label>
        <input type="number" name="price" onChange={handleChange} />
      </div>

            <div>
        <label>Sequence (Order)</label>
        <input type="number" name="sequence" onChange={handleChange} defaultValue={0} />
      </div>

      <div>
        <label>Terms & Conditions (comma-separated)</label>
        <textarea name="terms" onChange={handleChange}></textarea>
      </div>

      <div>
        <label>
          <input type="checkbox" name="visibleToUser" onChange={handleChange} /> Visible to User
        </label>
      </div>

      <div>
        <label>
          <input type="checkbox" name="visibleToVendor" onChange={handleChange} /> Visible to Vendor
        </label>
      </div>

      <div>
        <label>Upload Image</label>
        <input type="file" name="image" accept="image/*" onChange={handleChange} required />
      </div>

      <button type="submit">Update</button>
    </form>
  );
}

export default CategoryForm;