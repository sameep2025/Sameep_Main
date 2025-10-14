import { useEffect, useState } from 'react';

export default function DebugCategories() {
  const [categories, setCategories] = useState(null);
  const [vendorId, setVendorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchCategories = async () => {
    if (!vendorId || !categoryId) {
      alert('Please enter both Vendor ID and Category ID');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/preview/${categoryId}`);
      const data = await res.json();
      setCategories(data);
      console.log('📦 Full Category Data:', JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  const renderCategory = (cat, level = 0) => {
    if (!cat) return null;
    
    return (
      <div key={cat._id || cat.id} style={{ marginLeft: level * 20, marginBottom: 10, padding: 10, border: '1px solid #ddd', borderRadius: 5 }}>
        <div><strong>Name:</strong> {cat.name}</div>
        <div><strong>ID:</strong> {cat._id || cat.id}</div>
        <div><strong>Category Type:</strong> {cat.categoryType || 'Not Set'}</div>
        <div><strong>Image URL:</strong> {cat.imageUrl || 'NOT SET ❌'}</div>
        {cat.imageUrl && (
          <div>
            <strong>Image Preview:</strong>
            <br />
            <img 
              src={`http://localhost:5000${cat.imageUrl}`} 
              alt={cat.name}
              style={{ maxWidth: 200, maxHeight: 150, objectFit: 'contain', border: '1px solid #ccc', marginTop: 5 }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextSibling.style.display = 'block';
              }}
            />
            <div style={{ display: 'none', color: 'red', marginTop: 5 }}>
              ❌ Image failed to load: {cat.imageUrl}
            </div>
          </div>
        )}
        <div><strong>Price:</strong> {cat.price || cat.vendorPrice || 'Not Set'}</div>
        <div><strong>Has Children:</strong> {cat.children?.length > 0 ? `Yes (${cat.children.length})` : 'No'}</div>
        
        {cat.children && cat.children.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <strong>Children:</strong>
            {cat.children.map(child => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1>🔍 Category Debug Tool</h1>
      <p>Use this page to check if images are in the database</p>
      
      <div style={{ marginBottom: 20, padding: 20, background: '#f5f5f5', borderRadius: 8 }}>
        <div style={{ marginBottom: 10 }}>
          <label><strong>Vendor ID:</strong></label>
          <br />
          <input 
            type="text" 
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            placeholder="Enter Vendor ID"
            style={{ padding: 8, width: 300, borderRadius: 4, border: '1px solid #ccc' }}
          />
        </div>
        
        <div style={{ marginBottom: 10 }}>
          <label><strong>Category ID:</strong></label>
          <br />
          <input 
            type="text" 
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            placeholder="Enter Category ID (e.g., Pet Grooming ID)"
            style={{ padding: 8, width: 300, borderRadius: 4, border: '1px solid #ccc' }}
          />
        </div>
        
        <button 
          onClick={fetchCategories}
          disabled={loading}
          style={{ 
            padding: '10px 20px', 
            background: '#00AEEF', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Loading...' : 'Fetch Categories'}
        </button>
      </div>

      {categories && (
        <div>
          <h2>Results:</h2>
          <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}>
            {renderCategory(categories.categories)}
          </div>
        </div>
      )}

      <div style={{ marginTop: 30, padding: 20, background: '#fffbea', borderRadius: 8 }}>
        <h3>💡 How to use:</h3>
        <ol>
          <li>Go to your admin panel and find a vendor</li>
          <li>Copy the Vendor ID</li>
          <li>Find the Category ID (e.g., Pet Grooming category ID)</li>
          <li>Paste both IDs above and click "Fetch Categories"</li>
          <li>Check if "Image URL" shows a path like <code>/uploads/filename.jpg</code></li>
          <li>If it says "NOT SET ❌", the image wasn't uploaded to the database</li>
        </ol>
      </div>
    </div>
  );
}
