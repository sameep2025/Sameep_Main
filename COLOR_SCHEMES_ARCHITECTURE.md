<!-- # Color Schemes Architecture Documentation

## 1. API Response Structure - Backend Color Schemes

### Database Schema (Category Model)
**File:** `backend/models/Category.js`

```javascript
const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  // ... other fields ...
  
  colorSchemes: [
    {
      name: { type: String, required: true },      // e.g. "Pink Sunset", "Ocean Blue"
      primary: { type: String, required: true },   // Main theme color
      accent: { type: String, required: true },    // Accent/highlight color
      background: { type: String, required: true }, // Page background
      cardBg: { type: String, required: true },    // Card background
      text: { type: String, required: true },      // Text color
    },
  ],
  createdAt: { type: Date, default: Date.now },
});
```

### API Endpoints

#### 1. Get All Parent Categories with Color Schemes
**Endpoint:** `GET /api/categories/colors/parents`

**Response Structure:**
```json
[
  {
    "_id": "64abc123...",
    "name": "Pet Grooming",
    "colorSchemes": [
      {
        "name": "Sunset Orange",
        "primary": "#F59E0B",
        "accent": "#FBBF24",
        "background": "#FFFAEB",
        "cardBg": "#FFF6D9",
        "text": "#92400E"
      },
      {
        "name": "Ocean Blue",
        "primary": "#0EA5E9",
        "accent": "#38BDF8",
        "background": "#F0F9FF",
        "cardBg": "#E0F2FE",
        "text": "#075985"
      }
    ]
  },
  {
    "_id": "64abc456...",
    "name": "Cold Pressed Oils",
    "colorSchemes": [
      {
        "name": "Natural Green",
        "primary": "#059669",
        "accent": "#10B981",
        "background": "#ECFDF5",
        "cardBg": "#D1FAE5",
        "text": "#065F46"
      }
    ]
  }
]
```

#### 2. Create Category with Color Schemes
**Endpoint:** `POST /api/categories`

**Request Body (FormData):**
```javascript
{
  name: "Pet Grooming",
  categoryType: "Services",
  colorSchemes: JSON.stringify([
    {
      name: "Sunset Orange",
      primary: "#F59E0B",
      accent: "#FBBF24",
      background: "#FFFAEB",
      cardBg: "#FFF6D9",
      text: "#92400E"
    }
  ])
}
```

**Backend Handler:**
```javascript
// File: backend/routes/categoryRoutes.js
if (req.body.colorSchemes) {
  try {
    categoryData.colorSchemes = JSON.parse(req.body.colorSchemes);
  } catch (e) {
    console.warn("Invalid colorSchemes JSON:", e.message);
    categoryData.colorSchemes = [];
  }
}
```

#### 3. Update Category Color Schemes
**Endpoint:** `PUT /api/categories/:id`

**Request Body (FormData):**
```javascript
{
  colorSchemes: JSON.stringify([
    {
      name: "Updated Theme",
      primary: "#E75480",
      accent: "#FDBA74",
      background: "#FFF1F2",
      cardBg: "#FFE4E6",
      text: "#7C2D12"
    }
  ])
}
```

---

## 2. Category Component - Modal & Card Rendering

### Main Preview Page Component
**File:** `nikspreview-site/pages/preview/[vendorId]/[categoryId].jsx`

#### Component Structure:
```javascript
function PreviewPage() {
  // State management
  const [vendor, setVendor] = useState(null);
  const [categoryTree, setCategoryTree] = useState(null);
  const [stack, setStack] = useState([]);
  const [highlightedCategory, setHighlightedCategory] = useState(null);
  const [selectedLeafCategory, setSelectedLeafCategory] = useState(null);
  
  // Theme selection
  const theme = categoryThemes[categoryTree.name.toLowerCase()] || categoryThemes.default;
  const { primary, accent, cardBg, background } = theme;
  
  return (
    <div>
      <TopNavBar onCategoryClick={handleCategoryClick} />
      
      {/* Main Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "..." }}>
        {filteredChildren.map((cat) => (
          <CategoryCard
            node={cat}
            themeColor={primary}
            cardBg={cardBg}
            accentColor={accent}
            isHighlighted={highlightedCategory === cat._id}
          />
        ))}
      </div>
      
      {/* Overlay Modal */}
      {stack.length > 0 && (
        <OverlayModal
          stack={stack}
          themeColor={primary}
          cardBg={cardBg}
          accentColor={accent}
          selectedCategoryId={highlightedCategory}
          setSelectedCategoryId={setHighlightedCategory}
        />
      )}
    </div>
  );
}
```

### CategoryCard Component
```javascript
const CategoryCard = ({ node, onClick, themeColor, cardBg, accentColor, isHighlighted }) => {
  return (
    <div
      onClick={() => onClick(node)}
      style={{
        // Highlighted state
        background: isHighlighted 
          ? `linear-gradient(135deg, ${themeColor}55, ${accentColor}55)` 
          : cardBg,
        boxShadow: isHighlighted 
          ? `0 8px 24px ${themeColor}80` 
          : "0 6px 16px rgba(0,0,0,0.08)",
        border: isHighlighted 
          ? `3px solid ${accentColor}` 
          : `1.5px solid ${themeColor}`,
        transform: isHighlighted ? "scale(1.05)" : "scale(1)",
        transition: "all 0.3s ease",
      }}
    >
      <h3 style={{ color: themeColor }}>{node.name}</h3>
      {/* Price display */}
      {lowestPrice && (
        <div style={{
          background: `linear-gradient(135deg, ${accentColor}, ${themeColor})`,
          fontSize: 18,
          fontWeight: 700,
          borderRadius: 8,
          padding: "8px 16px",
          boxShadow: `0 4px 12px ${accentColor}40`,
        }}>
          ₹{lowestPrice}
        </div>
      )}
    </div>
  );
};
```

### OverlayModal Component
```javascript
const OverlayModal = ({
  stack,
  setStack,
  themeColor,
  cardBg,
  accentColor,
  selectedCategoryId,
  setSelectedCategoryId,
}) => {
  const current = stack[stack.length - 1];
  
  return (
    <div style={{ 
      position: "fixed", 
      inset: 0, 
      background: "rgba(0,0,0,0.75)",
      zIndex: 9999 
    }}>
      <div style={{ background: cardBg, borderRadius: 20 }}>
        {/* Grid of categories */}
        <div style={{ display: "grid", gap: 20 }}>
          {current.children?.map((child) => (
            <div
              key={child._id}
              onClick={() => setSelectedCategoryId(child._id)}
              style={{ cursor: "pointer" }}
            >
              <CategoryCard
                node={child}
                themeColor={themeColor}
                cardBg={cardBg}
                accentColor={accentColor}
                isHighlighted={selectedCategoryId === child._id}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

---

## 3. State Management - Current Implementation

### Technology: **React useState (Local Component State)**

#### State Variables in PreviewPage Component:

```javascript
// Main data states
const [vendor, setVendor] = useState(null);
const [categoryTree, setCategoryTree] = useState(null);
const [loading, setLoading] = useState(true);

// Navigation states
const [stack, setStack] = useState([]);              // For overlay modal navigation
const [activeTab, setActiveTab] = useState("all");   // Products/Services filter

// Selection & Highlighting states
const [highlightedCategory, setHighlightedCategory] = useState(null);
const [selectedLeafCategory, setSelectedLeafCategory] = useState(null);
```

#### State Flow:

```
1. User clicks category in TopNavBar
   ↓
2. handleCategoryClick() is called
   ↓
3. If category has children:
   - setStack([category])              → Opens overlay modal
   - setHighlightedCategory(category._id) → Prepares highlight
   ↓
4. User clicks card in overlay modal
   ↓
5. setSelectedCategoryId(child._id)    → Highlights clicked card
   ↓
6. Both cards remain visible, clicked one is highlighted
```

### Theme State Management

**Current Implementation:** Static theme mapping from `categoryThemes.js`

```javascript
// File: nikspreview-site/utils/categoryThemes.js
const categoryThemes = {
  "pet grooming": {
    primary: "#F59E0B",
    accent: "#FBBF24",
    background: "#FFFAEB",
    cardBg: "#FFF6D9",
    text: "#92400E"
  },
  "cold pressed oils": {
    primary: "#059669",
    accent: "#10B981",
    background: "#ECFDF5",
    cardBg: "#D1FAE5",
    text: "#065F46"
  },
  default: {
    primary: "#111827",
    accent: "#2563EB",
    background: "#F9FAFB",
    cardBg: "#FFFFFF",
    text: "#111827"
  }
};
```

**Usage:**
```javascript
// In PreviewPage component
const theme = categoryThemes[categoryTree.name.toLowerCase()] || categoryThemes.default;
const { primary, accent, cardBg, background } = theme;
```

**Theme is passed down as props:**
```javascript
<CategoryCard
  themeColor={primary}
  cardBg={cardBg}
  accentColor={accent}
/>

<TopNavBar
  categoryName={categoryTree.name.toLowerCase()}
/>
```

---

## 4. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Backend (MongoDB)                       │
│  Category Schema with colorSchemes array                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ GET /api/vendors/:id/preview/:categoryId
                      ↓
┌─────────────────────────────────────────────────────────────┐
│                   PreviewPage Component                      │
│  - Fetches categoryTree with colorSchemes                    │
│  - Maps category name to hardcoded theme                     │
│  - Stores in useState(categoryTree)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Props drilling
                      ↓
┌─────────────────────────────────────────────────────────────┐
│              Child Components (Cards, Modal)                 │
│  - Receive theme colors as props                             │
│  - Apply colors to background, borders, shadows              │
│  - Highlight based on highlightedCategory state              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Key Files Reference

### Backend:
- **Model:** `backend/models/Category.js` (lines 26-35)
- **Routes:** `backend/routes/categoryRoutes.js` (lines 84-91, 181-187, 225-238)

### Frontend:
- **Main Page:** `nikspreview-site/pages/preview/[vendorId]/[categoryId].jsx`
  - State: lines 477-483
  - Theme: line 510
  - CategoryCard: lines 95-157
  - OverlayModal: lines 321-471
- **Theme Config:** `nikspreview-site/utils/categoryThemes.js`
- **TopNavBar:** `nikspreview-site/components/TopNavBar.jsx` (line 15)

---

## 6. Current Limitations & Opportunities

### Current State:
✅ Backend supports multiple color schemes per category  
✅ API endpoint exists to fetch color schemes  
❌ Frontend uses hardcoded themes (not from database)  
❌ No UI to switch between color schemes  
❌ Color schemes in DB are not being utilized  

### Potential Enhancement:
Replace hardcoded `categoryThemes.js` with dynamic themes from the database `colorSchemes` array, allowing users to switch themes in real-time. -->
