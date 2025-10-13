import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import "leaflet/dist/leaflet.css";


// Pages
import Dashboard from "./pages/Dashboard";
import Master from "./pages/Master";
import StatusPage from "./pages/StatusPage";
import SignupLevelPage from "./pages/SignupLevelPage";
import DisplayTypePage from "./pages/DisplayTypePage";
import CategoryPricingPage from "./pages/CategoryPricingPage";
import CategoryModelsPage from "./pages/CategoryModelsPage";
import CategoryVisibilityPage from "./pages/CategoryVisibilityPage"; 
import SocialHandlesPage from "./pages/SocialHandlesPage";
import BusinessFieldsPage from "./pages/BusinessFieldsPage";
import Questions from "./pages/Questions";
import CategoryPage from "./components/CategoryPage";
import CustomersPage from "./pages/CustomersPage";
import CarsMainPage from "./pages/cars/CarsMainPage";
import BrandPage from "./pages/cars/BrandPage";
import FuelTypePage from "./pages/cars/FuelTypePage";
import TransmissionTypePage from "./pages/cars/TransmissionTypePage";
import BodyTypePage from "./pages/cars/BodyTypePage";
import ModelPage from "./pages/cars/ModelPage";
import BikesMainPage from "./pages/bikes/BikesMainPage";
import BikeBrandPage from "./pages/bikes/BikeBrandsPage";
import BikeBodyTypePage from "./pages/bikes/BikeBodyTypesPage";
import BikeModelPage from "./pages/bikes/BikeModelsPage";


// Vendor Pages (Step 1 → Step 2 → Step 3)
import Vendors from "./pages/VendorPage"; // Step 1
import VendorStatusPage from "./pages/VendorStatusPage"; // Step 2
import VendorStatusListPage from "./pages/VendorStatusListPage"; // Step 2 detail
import VendorBusinessPage from "./pages/VendorBusinessPage"; // Step 3

function App() {
  return (
    <Router>
      <div style={{ display: "flex" }}>
        <Sidebar />
        <div style={{ flex: 1, padding: "20px" }}>
          <Routes>
            {/* Dashboard */}
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Master Pages */}
            <Route path="/master" element={<Master />} />
            <Route path="/master/status" element={<StatusPage />} /> 
            <Route path="/master/signup-levels" element={<SignupLevelPage />} />
            <Route path="/master/display-types" element={<DisplayTypePage />} />
            <Route path="/master/category-pricing" element={<CategoryPricingPage />} />
            <Route path="/master/category-models" element={<CategoryModelsPage />} />
            <Route path="/master/category-visibility" element={<CategoryVisibilityPage />} />
            <Route path="/master/social-handles" element={<SocialHandlesPage />} />
            <Route path="/master/business-fields" element={<BusinessFieldsPage />} />
            <Route path="/master/cars" element={<CarsMainPage />} />          {/* Main dashboard */}
<Route path="/master/cars/brands" element={<BrandPage />} />
<Route path="/master/cars/fuel-types" element={<FuelTypePage />} />
<Route path="/master/cars/transmission-types" element={<TransmissionTypePage />} />
<Route path="/master/cars/body-types" element={<BodyTypePage />} />
<Route path="/master/cars/models" element={<ModelPage />} />
<Route path="/master/bikes" element={<BikesMainPage />} /> {/* Main dashboard */}
<Route path="/master/bikes/brands" element={<BikeBrandPage />} />

<Route path="/master/bikes/body-types" element={<BikeBodyTypePage />} />
<Route path="/master/bikes/models" element={<BikeModelPage />} />


            {/* Questions */}
            <Route path="/questions" element={<Questions />} />

            {/* Vendor Flow */}
            <Route path="/vendors" element={<Vendors />} /> {/* Step 1 */}
            <Route path="/vendors/status/:categoryId" element={<VendorStatusPage />} /> {/* Step 2 */}
            <Route
              path="/vendors/status/:categoryId/:status"
              element={<VendorStatusListPage />}
            /> {/* Step 2 detail */}
            <Route path="/vendors/:vendorId" element={<VendorBusinessPage />} /> {/* Step 3 */}

            {/* Categories */}
            <Route path="/categories" element={<CategoryPage />} />
            <Route path="/categories/:parentId" element={<CategoryPage />} />

            {/* Customers */}
            <Route path="/customers" element={<CustomersPage />} />

            {/* Fallback */}
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
