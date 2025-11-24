// pages/preview/[vendorId]/[categoryId].jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

import { useRouter } from "next/router";
import Head from "next/head";
import TopNavBar from "../../../components/TopNavBar";
import HomeSection from "../../../components/HomeSection";
import BenefitsSection from "../../../components/BenefitsSection";
import AboutSection from "../../../components/AboutSection";
import ContactSection from "../../../components/ContactSection";
import Footer from "../../../components/Footer";
import FullPageShimmer from "../../../components/FullPageShimmer";
import API_BASE_URL, { ASSET_BASE_URL } from "../../../config";

export default function PreviewPage() {
  const router = useRouter();
  const { vendorId, categoryId, lat, lng, homeLocs, mode } = router.query;

  const parsedHomeLocations = homeLocs ? JSON.parse(homeLocs) : [];

  const [vendor, setVendor] = useState(null);
  const [categoryTree, setCategoryTree] = useState(null);
  const [loadingVendor, setLoadingVendor] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [error, setError] = useState("");
  const [selectedLeaf, setSelectedLeaf] = useState(null);
  const [location, setLocation] = useState(null);
  const [cardSelections, setCardSelections] = useState({});
  const [nodeSelections, setNodeSelections] = useState({});
  // Attribute filter bar state (driven by uiConfig.attributesBar)
  const [attrSelections, setAttrSelections] = useState({}); // { field: value }
  const [attrDropdownOpen, setAttrDropdownOpen] = useState({}); // { [cardKey]: boolean }
  const [comboSizeDropdownOpen, setComboSizeDropdownOpen] = useState({}); // { [comboIndex]: boolean }
  const [pairSelections, setPairSelections] = useState({}); // { index: "A|B" }
  const [taxiSelections, setTaxiSelections] = useState({}); // { [lvl1Id]: { lvl2, lvl3, bodySeats: "body|seats", fuelType: string, modelBrand: "model|brand" } }
  const [combos, setCombos] = useState([]);
  const [webMenu, setWebMenu] = useState([]);
  const [servicesNavLabel, setServicesNavLabel] = useState("Our Services");
  const [packageSelections, setPackageSelections] = useState({}); // { [idx]: { size: string|null } }
  const [invImgIdx, setInvImgIdx] = useState({}); // { [targetId]: number }
  const [heroTitle, setHeroTitle] = useState(null);
  const [heroDescription, setHeroDescription] = useState(null);
  const [homePopup, setHomePopup] = useState(null);
  const [vendorAddonTitle, setVendorAddonTitle] = useState(null);
  const [vendorAddonDescription, setVendorAddonDescription] = useState(null);
  const [activeServiceKey, setActiveServiceKey] = useState(null); // which service/card should animate

  const loading = loadingVendor || loadingCategories;

  // Build dynamic service labels from top-level category children (product card sections)
  const serviceLabels = useMemo(() => {
    try {
      const children = Array.isArray(categoryTree?.children) ? categoryTree.children : [];
      const labels = children
        .map((n) => (n && typeof n.name === "string" ? n.name.trim() : ""))
        .filter((name) => !!name);
      if (labels.length > 0) return labels;
    } catch {}
    // Fallback to default static labels if we cannot derive from tree
    return ["Driving Packages", "Individual Courses", "Commercial Training"];
  }, [categoryTree]);

  const makeServiceKey = useCallback((name) => {
    try {
      const raw = String(name || "");
      return raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    } catch {
      return "";
    }
  }, []);

  const scrollToServiceSection = useCallback((serviceKey) => {
    try {
      if (typeof window === "undefined" || !serviceKey) return;
      const header = document.querySelector("header");
      const headerHeight = header ? header.getBoundingClientRect().height : 80;
      const OFFSET = headerHeight + 16;

      const el = document.getElementById(`service-${serviceKey}`);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - OFFSET;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    } catch {}
  }, []);

  // Listen for service selection events from TopNavBar (Our Services dropdown)
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = (event) => {
      try {
        const detail = event?.detail || {};
        const key = detail.key || detail.serviceKey || makeServiceKey(detail.label);
        if (!key) return;
        setActiveServiceKey(key);
        scrollToServiceSection(key);
        // Clear after animation duration so we can re-trigger
        window.setTimeout(() => {
          setActiveServiceKey((current) => (current === key ? null : current));
        }, 900);
      } catch {}
    };
    window.addEventListener("preview:service-click", handler);
    return () => window.removeEventListener("preview:service-click", handler);
  }, [makeServiceKey, scrollToServiceSection]);

  // ----------------- Fetch vendor & categories -----------------
  const fetchData = useCallback(async () => {
    if (!router.isReady || !vendorId) return;
    setLoadingVendor(true);
    setLoadingCategories(true);
    try {
      // Try to read webMenu and categoryType from dummy category config (if it exists)
      try {
        if (categoryId) {
          const wmRes = await fetch(`${API_BASE_URL}/api/dummy-categories/${categoryId}?t=${Date.now()}`, { cache: 'no-store' });
          if (wmRes.ok) {
            const wmJson = await wmRes.json().catch(() => null);
            const arr = Array.isArray(wmJson?.webMenu) ? wmJson.webMenu : [];
            setWebMenu(arr);
            if (wmJson?.homePopup && typeof wmJson.homePopup === 'object') {
              setHomePopup(wmJson.homePopup);
            } else {
              setHomePopup(null);
            }
            // Derive nav label from categoryType
            const rawType = (wmJson?.categoryType || "").toString();
            let lbl = "Our Services";
            if (rawType === "Products") lbl = "Our Products";
            else if (rawType === "Services") lbl = "Our Services";
            else if (rawType === "Products & Services") lbl = "Our Products & Services";
            setServicesNavLabel(lbl);
          } else {
            setWebMenu([]);
            setServicesNavLabel("Our Services");
          }
        }
      } catch {
        setWebMenu([]);
        setServicesNavLabel("Our Services");
      }

      const forceDummy = String(mode || '').toLowerCase() === 'dummy';
      if (forceDummy) {
        // Dummy vendor flow (forced by query)
        try {
          const dvRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/categories`, { cache: 'no-store' });
          const dv = await dvRes.json();
          // Fetch full dummy vendor document to hydrate inventorySelections/rowImages
          let dvDoc = {};
          try {
            const vRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}`, { cache: 'no-store' });
            dvDoc = await vRes.json().catch(() => ({}));
          } catch { dvDoc = {}; }
          let dvVendor = { ...(dv?.vendor || {}), ...(dvDoc || {}) };
          try {
            const pics = Array.isArray(dvVendor?.profilePictures) ? dvVendor.profilePictures : [];
            if (pics.length === 0) {
              const pRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/profile-pictures`, { cache: 'no-store' });
              if (pRes.ok) {
                const pj = await pRes.json().catch(() => null);
                const list = Array.isArray(pj?.profilePictures) ? pj.profilePictures : [];
                if (list.length) dvVendor = { ...dvVendor, profilePictures: list };
              }
            }
          } catch {}
          setVendor(dvVendor);
          const categoriesWithLinked = dv?.categories || null;
          setCategoryTree(categoriesWithLinked);
          if (dvVendor?.location) setLocation(dvVendor.location);
          // Compute hero title/description from dummy category/vendor freeTexts
          try {
            const trimOrNull = (v) => { const s = (v == null) ? '' : String(v); const t = s.trim(); return t ? t : null; };
            const firstNonEmpty = (arr) => Array.isArray(arr) ? arr.map(trimOrNull).find(Boolean) || null : null;
            // Try to fetch the exact dummy category to read its freeTexts if tree doesn't have it
            let dummyCat = null;
            try {
              const r = await fetch(`${API_BASE_URL}/api/dummy-categories/${categoryId}`, { cache: 'no-store' });
              if (r.ok) dummyCat = await r.json();
            } catch {}
            const rawCatFT = (categoriesWithLinked && categoriesWithLinked.freeTexts)
              ? categoriesWithLinked.freeTexts
              : (Array.isArray(dummyCat?.freeTexts) ? dummyCat.freeTexts : []);
            const catFT = (() => { try { const arr = Array.isArray(rawCatFT) ? rawCatFT : []; if (arr.length === 10 && (arr[0] == null || String(arr[0]).trim() === '') && (arr[1] != null && String(arr[1]).trim() !== '')) { return [...arr.slice(1), '']; } return arr; } catch { return Array.isArray(rawCatFT) ? rawCatFT : []; } })();
            const rawVenFT = dvVendor?.freeTexts || []; const venFT = Array.isArray(rawVenFT) ? rawVenFT : [];
            const titleFromCategory = trimOrNull(catFT[0]) || firstNonEmpty(catFT);
            const descFromCategory = trimOrNull(catFT[1]) || firstNonEmpty(catFT);
            const titleFromVendor = trimOrNull(dvVendor?.customFields?.freeText1) || trimOrNull(venFT[0]) || trimOrNull(dvVendor?.ui?.heroTitle) || firstNonEmpty(venFT);
            const descFromVendor = trimOrNull(dvVendor?.customFields?.freeText2) || trimOrNull(venFT[1]) || trimOrNull(dvVendor?.ui?.heroDescription) || firstNonEmpty(venFT);
            setVendorAddonTitle(trimOrNull(dvVendor?.customFields?.freeText1) || null);
            setVendorAddonDescription(trimOrNull(dvVendor?.customFields?.freeText2) || null);
            const q = router?.query || {};
            const title = trimOrNull(q.ft1) || titleFromVendor || titleFromCategory || null;
            const desc = trimOrNull(q.ft2) || descFromVendor || descFromCategory || null;
            setHeroTitle(title); setHeroDescription(desc);
          } catch {}
          // Fetch dummy combos for this category
          try {
            const c1 = await fetch(`${API_BASE_URL}/api/dummy-combos?parentCategoryId=${categoryId}`, { cache: 'no-store' });
            let list = await c1.json().catch(() => []);
            if (!Array.isArray(list) || list.length === 0) {
              try {
                const c2 = await fetch(`${API_BASE_URL}/api/dummy-combos/byParent/${categoryId}`, { cache: 'no-store' });
                list = await c2.json().catch(() => []);
              } catch {}
            }
            setCombos(Array.isArray(list) ? list : []);
          } catch { setCombos([]); }
        } catch (e) {
          setError(e?.message || 'Failed to load dummy vendor preview');
          setCategoryTree(null);
        }
      } else {
        // Try real vendor flow
        const vendorRes = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}`, { cache: 'no-store' });
        let vendorData = {};
        try { vendorData = await vendorRes.json(); } catch { vendorData = {}; }
        const isDummy = (!vendorRes.ok || vendorData?.message);
        if (isDummy) {
          // Fallback to dummy
          try {
            const dvRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/categories`, { cache: 'no-store' });
            const dv = await dvRes.json();
            // Hydrate with full dummy vendor
            let dvDoc = {};
            try {
              const vRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}`, { cache: 'no-store' });
              dvDoc = await vRes.json().catch(() => ({}));
            } catch { dvDoc = {}; }
            let dvVendor = { ...(dv?.vendor || {}), ...(dvDoc || {}) };
            try {
              const pics = Array.isArray(dvVendor?.profilePictures) ? dvVendor.profilePictures : [];
              if (pics.length === 0) {
                const pRes = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/profile-pictures`, { cache: 'no-store' });
                if (pRes.ok) {
                  const pj = await pRes.json().catch(() => null);
                  const list = Array.isArray(pj?.profilePictures) ? pj.profilePictures : [];
                  if (list.length) dvVendor = { ...dvVendor, profilePictures: list };
                }
              }
            } catch {}
            setVendor(dvVendor);
            const categoriesWithLinked = dv?.categories || null;
            setCategoryTree(categoriesWithLinked);
            if (dvVendor?.location) setLocation(dvVendor.location);
            // Compute hero title/description for fallback dummy as well
            try {
              const trimOrNull = (v) => { const s = (v == null) ? '' : String(v); const t = s.trim(); return t ? t : null; };
              const firstNonEmpty = (arr) => Array.isArray(arr) ? arr.map(trimOrNull).find(Boolean) || null : null;
              // Try to fetch the exact dummy category to read its freeTexts if tree doesn't have it
              let dummyCat = null;
              try {
                const r = await fetch(`${API_BASE_URL}/api/dummy-categories/${categoryId}`, { cache: 'no-store' });
                if (r.ok) dummyCat = await r.json();
              } catch {}
              const rawCatFT = (categoriesWithLinked && categoriesWithLinked.freeTexts)
                ? categoriesWithLinked.freeTexts
                : (Array.isArray(dummyCat?.freeTexts) ? dummyCat.freeTexts : []);
              const catFT = (() => { try { const arr = Array.isArray(rawCatFT) ? rawCatFT : []; if (arr.length === 10 && (arr[0] == null || String(arr[0]).trim() === '') && (arr[1] != null && String(arr[1]).trim() !== '')) { return [...arr.slice(1), '']; } return arr; } catch { return Array.isArray(rawCatFT) ? rawCatFT : []; } })();
              const rawVenFT = dvVendor?.freeTexts || []; const venFT = Array.isArray(rawVenFT) ? rawVenFT : [];
              const titleFromCategory = trimOrNull(catFT[0]) || firstNonEmpty(catFT);
              const descFromCategory = trimOrNull(catFT[1]) || firstNonEmpty(catFT);
              const titleFromVendor = trimOrNull(venFT[0]) || trimOrNull(dvVendor?.customFields?.freeText1) || trimOrNull(dvVendor?.ui?.heroTitle) || firstNonEmpty(venFT);
              const descFromVendor = trimOrNull(venFT[1]) || trimOrNull(dvVendor?.customFields?.freeText2) || trimOrNull(dvVendor?.ui?.heroDescription) || firstNonEmpty(venFT);
              setVendorAddonTitle(trimOrNull(dvVendor?.customFields?.freeText1) || null);
              setVendorAddonDescription(trimOrNull(dvVendor?.customFields?.freeText2) || null);
              const q = router?.query || {};
              const title = trimOrNull(q.ft1) || titleFromCategory || titleFromVendor || null;
              const desc = trimOrNull(q.ft2) || descFromCategory || descFromVendor || null;
              setHeroTitle(title); setHeroDescription(desc);
            } catch {}
            // Fetch dummy combos for this category (fallback path)
            try {
              const c1 = await fetch(`${API_BASE_URL}/api/dummy-combos?parentCategoryId=${categoryId}`, { cache: 'no-store' });
              let list = await c1.json().catch(() => []);
              if (!Array.isArray(list) || list.length === 0) {
                try {
                  const c2 = await fetch(`${API_BASE_URL}/api/dummy-combos/byParent/${categoryId}`, { cache: 'no-store' });
                  list = await c2.json().catch(() => []);
                } catch {}
              }
              setCombos(Array.isArray(list) ? list : []);
            } catch { setCombos([]); }
          } catch (e) {
            setError(e?.message || 'Failed to load dummy vendor preview');
            setCategoryTree(null);
          }
        } else {
          // Real vendor: load preview tree and meta
          setVendor(vendorData);
          const [categoryRes, locationRes, catMetaRes, serverTreeRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/vendors/${vendorId}/preview/${categoryId}`, { cache: 'no-store' }),
            fetch(`${API_BASE_URL}/api/vendors/${vendorId}/location`, { cache: 'no-store' }),
            fetch(`${API_BASE_URL}/api/categories/${categoryId}`, { cache: 'no-store' }),
            fetch(`${API_BASE_URL}/api/categories/${categoryId}/tree`, { cache: 'no-store' }),
          ]);

          const categoryData = await categoryRes.json().catch(() => ({}));
          const catMeta = await catMetaRes.json().catch(() => ({}));
          const serverTree = await serverTreeRes.json().catch(() => null);
          let locationData = null;
          try { locationData = await locationRes.json(); } catch { locationData = null; }

          const linkedAttributes = (catMeta && catMeta.linkedAttributes) ? catMeta.linkedAttributes : {};
          let categoriesWithLinked = categoryData?.categories ? { ...categoryData.categories, linkedAttributes } : null;
          if (!categoriesWithLinked && serverTree && (serverTree._id || serverTree.id)) {
            categoriesWithLinked = { ...serverTree, linkedAttributes };
          }

          try {
            if (categoriesWithLinked && serverTree && (serverTree._id || serverTree.id)) {
              const pickId = (n) => String(n?.id || n?._id || '');
              const buildIndex = (root) => {
                const idx = new Map();
                const visit = (n) => { if (!n) return; const k = pickId(n); if (k) idx.set(k, n); (Array.isArray(n.children) ? n.children : []).forEach(visit); };
                visit(serverTree); return idx; };
              const serverIdx = buildIndex(serverTree);
              const serverChildrenByParent = new Map();
              const collectChildren = (n) => { if (!n) return; const pid = String(n._id || n.id || ''); if (Array.isArray(n.children)) serverChildrenByParent.set(pid, n.children); (n.children || []).forEach(collectChildren); };
              collectChildren(serverTree);
              const mergeFields = (dst, src) => { if (!dst || !src) return; if (Array.isArray(src.displayType)) dst.displayType = src.displayType; if (src.uiRules && typeof src.uiRules === 'object') dst.uiRules = src.uiRules; if (typeof src.imageUrl === 'string') dst.imageUrl = src.imageUrl; if (typeof src.iconUrl === 'string') dst.iconUrl = src.iconUrl; };
              const overlay = (node, srcParent) => { if (!node) return; const k = pickId(node); let src = k ? serverIdx.get(k) : null; if (!src && srcParent) { const sibs = serverChildrenByParent.get(String(srcParent._id || srcParent.id || '')) || []; const byName = sibs.find((c) => String(c?.name || '').toLowerCase() === String(node?.name || '').toLowerCase()); if (byName) src = byName; } if (src) mergeFields(node, src); const nextSrcParent = src || srcParent; (Array.isArray(node.children) ? node.children : []).forEach((ch) => overlay(ch, nextSrcParent)); };
              overlay(categoriesWithLinked, serverTree);
            }
          } catch {}

          setCategoryTree(categoriesWithLinked);

          try {
            const trimOrNull = (v) => { const s = (v == null) ? '' : String(v); const t = s.trim(); return t ? t : null; };
            const firstNonEmpty = (arr) => Array.isArray(arr) ? arr.map(trimOrNull).find(Boolean) || null : null;
            const rawCatFT = (categoriesWithLinked && categoriesWithLinked.freeTexts) ? categoriesWithLinked.freeTexts : (catMeta && Array.isArray(catMeta.freeTexts)) ? catMeta.freeTexts : (categoryData && Array.isArray(categoryData.freeTexts)) ? categoryData.freeTexts : [];
            const catFT = (() => { try { const arr = Array.isArray(rawCatFT) ? rawCatFT : []; if (arr.length === 10 && (arr[0] == null || String(arr[0]).trim() === '') && (arr[1] != null && String(arr[1]).trim() !== '')) { return [...arr.slice(1), '']; } return arr; } catch { return Array.isArray(rawCatFT) ? rawCatFT : []; } })();
            const rawVenFT = vendorData?.freeTexts || []; const venFT = Array.isArray(rawVenFT) ? rawVenFT : [];
            const titleFromCategory = trimOrNull(catFT[0]) || firstNonEmpty(catFT);
            const descFromCategory = trimOrNull(catFT[1]) || firstNonEmpty(catFT);
            const titleFromVendor = trimOrNull(venFT[0]) || trimOrNull(vendorData?.customFields?.freeText1) || trimOrNull(vendorData?.ui?.heroTitle) || firstNonEmpty(venFT);
            const descFromVendor = trimOrNull(venFT[1]) || trimOrNull(vendorData?.customFields?.freeText2) || trimOrNull(vendorData?.ui?.heroDescription) || firstNonEmpty(venFT);
            const titleFromUi =
              trimOrNull(catMeta?.ui?.heroTitle) ||
              trimOrNull(categoryData?.customFields?.freeText1) ||
              trimOrNull(categoryData?.freeText1) ||
              trimOrNull(categoryData?.ui?.heroTitle);
            const descFromUi =
              trimOrNull(catMeta?.ui?.heroDescription) ||
              trimOrNull(categoryData?.customFields?.freeText2) ||
              trimOrNull(categoryData?.freeText2) ||
              trimOrNull(categoryData?.ui?.heroDescription);
            const q = router?.query || {};
            const title = trimOrNull(q.ft1) || titleFromCategory || titleFromVendor || titleFromUi || 'Welcome';
            const desc = trimOrNull(q.ft2) || descFromCategory || descFromVendor || descFromUi || 'Discover our offerings';
            setHeroTitle(title); setHeroDescription(desc);
          } catch {}

          try {
            const combosRes = await fetch(`${API_BASE_URL}/api/combos?parentCategoryId=${categoryId}`, { cache: 'no-store' });
            let combosData = await combosRes.json().catch(() => []);
            if (!Array.isArray(combosData) || combosData.length === 0) {
              // Fallback to dummy combos if real combos are empty
              try {
                const c1 = await fetch(`${API_BASE_URL}/api/dummy-combos?parentCategoryId=${categoryId}`, { cache: 'no-store' });
                let list = await c1.json().catch(() => []);
                if (!Array.isArray(list) || list.length === 0) {
                  const c2 = await fetch(`${API_BASE_URL}/api/dummy-combos/byParent/${categoryId}`, { cache: 'no-store' });
                  list = await c2.json().catch(() => []);
                }
                combosData = Array.isArray(list) ? list : [];
              } catch {}
            }
            setCombos(Array.isArray(combosData) ? combosData : []);
          } catch { setCombos([]); }

          if (locationData?.success) setLocation(locationData.location);
          else if (vendorData.location) setLocation(vendorData.location);
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoadingVendor(false);
      setLoadingCategories(false);
    }
  }, [router.isReady, vendorId, categoryId, mode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize Taxi Services / Driving School to cheapest option on first load
  useEffect(() => {
    try {
      if (!vendor || !categoryTree) return;
      const rootName = String(categoryTree?.name || '').toLowerCase();
      const isTaxi = rootName === 'taxi services';
      const isDriving = rootName === 'driving school';
      if (!isTaxi && !isDriving) return;

      const familiesByTarget = new Map();
      try {
        const cfg = vendor?.familiesByTarget || {};
        Object.entries(cfg).forEach(([k, arr]) => {
          familiesByTarget.set(String(k), new Set((arr || []).map(String)));
        });
      } catch {}

      const roots = Array.isArray(categoryTree.children) ? categoryTree.children : [];

      const updateForRoot = (lvl1) => {
        const lvl1Id = String(lvl1?.id || '');
        if (!lvl1Id) return;
        const existing = taxiSelections[lvl1Id];
        if (existing && (existing.bodySeats || existing.fuelType || existing.modelBrand || existing.transmission || existing.bodyType)) return; // don't override user

        const invEntries = (vendor?.inventorySelections?.[categoryId] || []).filter((entry) => {
          try {
            const famSet = familiesByTarget.get(lvl1Id);
            if (famSet) {
              const fam = String(entry?.scopeFamily || '');
              if (fam && !famSet.has(fam)) return false;
            }
            const pbr = entry?.pricesByRow;
            if (pbr && typeof pbr === 'object') {
              for (const key of Object.keys(pbr)) {
                const ids = String(key).split('|');
                if (ids.some((id) => String(id) === lvl1Id)) return true;
              }
              return false;
            }
            return true;
          } catch { return true; }
        });

        let best = { price: null, entry: null };
        invEntries.forEach((entry) => {
          try {
            const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
            if (!pbr) return;
            for (const [key, value] of Object.entries(pbr)) {
              const ids = String(key).split('|');
              if (ids.some((id) => String(id) === lvl1Id)) {
                const num = Number(value);
                if (!Number.isNaN(num) && (best.price == null || num < best.price)) {
                  best = { price: num, entry };
                }
              }
            }
          } catch {}
        });

        if (!best.entry) return;
        const fam = String(best.entry?.scopeFamily || '');
        const sel = (best.entry?.selections && fam && best.entry.selections[fam]) ? best.entry.selections[fam] : {};

        if (isTaxi) {
          const transmission = sel?.transmission != null ? String(sel.transmission) : undefined;
          const bodyType = fam === 'tempoMinibuses' ? (sel?.tempoBusBodyType ?? '') : (sel?.bodyType ?? '');
          const model = String(sel?.model ?? '');
          const brand = fam === 'tempoMinibuses' ? String(sel?.tempoBusBrand ?? '') : String(sel?.brand ?? '');
          setTaxiSelections((prev) => ({
            ...prev,
            [lvl1Id]: {
              ...(prev[lvl1Id] || {}),
              transmission: transmission || prev[lvl1Id]?.transmission,
              bodyType: bodyType || prev[lvl1Id]?.bodyType,
              modelBrand: (model && brand) ? `${model}|${brand}` : prev[lvl1Id]?.modelBrand,
            },
          }));
        }

        if (isDriving) {
          const transmission = (sel?.transmission ?? sel?.bikeTransmission) != null ? String(sel?.transmission ?? sel?.bikeTransmission) : undefined;
          const bodyType = sel?.bodyType != null ? String(sel.bodyType) : undefined;
          const model = String(sel?.model ?? '');
          const brand = String(sel?.brand ?? sel?.bikeBrand ?? '');
          setTaxiSelections((prev) => ({
            ...prev,
            [lvl1Id]: {
              ...(prev[lvl1Id] || {}),
              transmission: transmission || prev[lvl1Id]?.transmission,
              bodyType: bodyType || prev[lvl1Id]?.bodyType,
              modelBrand: (model && brand) ? `${model}|${brand}` : prev[lvl1Id]?.modelBrand,
            },
          }));
        }
      };

      roots.forEach(updateForRoot);
    } catch {}
  }, [vendor, categoryTree, categoryId]);

  // Initialize attribute bar (brand/model/transmission/bodyType) to first brand combo when empty
  useEffect(() => {
    try {
      if (!vendor || !categoryTree) return;

      if (attrSelections && (attrSelections.brand || attrSelections.model || attrSelections.transmission || attrSelections.bodyType || attrSelections.bikeBrand || attrSelections.bikeTransmission)) {
        return; // do not override user/default once set
      }

      const catKey = String(categoryId || '');
      const inv = Array.isArray(vendor?.inventorySelections?.[catKey]) ? vendor.inventorySelections[catKey] : [];
      if (!inv.length) return;

      const cars = [];
      const bikes = [];
      inv.forEach((entry) => {
        try {
          const fam = String(entry?.scopeFamily || '').toLowerCase();
          const sels = entry?.selections || {};
          let sel = sels[fam] || sels.cars || sels.bikes || {};
          if (!sel || typeof sel !== 'object') sel = {};
          if (fam === 'cars') {
            const brand = sel.brand != null ? String(sel.brand) : '';
            const transmission = sel.transmission != null ? String(sel.transmission) : '';
            const model = sel.model != null ? String(sel.model) : '';
            const bodyType = sel.bodyType != null ? String(sel.bodyType) : '';
            if (brand || model || transmission || bodyType) {
              cars.push({ brand, model, transmission, bodyType });
            }
          } else if (fam === 'bikes') {
            const brand = sel.bikeBrand != null ? String(sel.bikeBrand) : (sel.brand != null ? String(sel.brand) : '');
            const transmission = sel.bikeTransmission != null ? String(sel.bikeTransmission) : (sel.transmission != null ? String(sel.transmission) : '');
            const model = sel.model != null ? String(sel.model) : '';
            if (brand || model || transmission) {
              bikes.push({ brand, model, transmission });
            }
          }
        } catch {}
      });

      const carBrands = Array.from(new Set(cars.map((n) => String(n.brand || '').trim()).filter(Boolean)));
      const firstCarBrand = carBrands[0] || '';
      const carsForBrand = firstCarBrand
        ? cars.filter((n) => String(n.brand || '').trim() === firstCarBrand)
        : [];

      // We only default the brand for cars; user will choose model/trans/bodyType.

      const bikeBrands = Array.from(new Set(bikes.map((n) => String(n.brand || '').trim()).filter(Boolean)));
      const firstBikeBrand = bikeBrands[0] || '';
      const bikesForBrand = firstBikeBrand
        ? bikes.filter((n) => String(n.brand || '').trim() === firstBikeBrand)
        : [];

      // For bikes we also only default the brand.

      setAttrSelections((prev) => {
        const current = prev || {};
        if (current.brand || current.model || current.transmission || current.bodyType || current.bikeBrand || current.bikeTransmission) return current;
        const next = { ...current };
        if (firstCarBrand) next.brand = firstCarBrand;
        if (firstBikeBrand) next.bikeBrand = firstBikeBrand;
        return next;
      });
    } catch {}
  }, [vendor, categoryTree, categoryId, attrSelections]);

  // Listen for vendor pricing updates from other tabs/pages and refresh
  useEffect(() => {
    if (!vendorId || !categoryId) return;
    const storageHandler = (e) => {
      try {
        if (!e || e.key !== `vendorPricingUpdated:${vendorId}:${categoryId}`) return;
        fetchData();
      } catch {}
    };
    const customHandler = (e) => {
      try {
        const v = e?.detail?.vendorId;
        const c = e?.detail?.categoryId;
        if (String(v) === String(vendorId) && String(c) === String(categoryId)) {
          fetchData();
        }
      } catch {}
    };
    window.addEventListener('storage', storageHandler);
    window.addEventListener('vendorPricingUpdated', customHandler);
    return () => {
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener('vendorPricingUpdated', customHandler);
    };
  }, [vendorId, categoryId, fetchData]);

  // ----------------- Helpers -----------------
  const hasChildren = (node) => node?.children?.length > 0;

  const containsId = (node, id) => {
    if (!node || !id) return false;
    if (node.id === id) return true;
    return node.children?.some((c) => containsId(c, id)) || false;
  };

  // ----------------- Card Component -----------------
  const ParentWithSizesCard = ({ node, selection, onSelectionChange, onLeafSelect, mode = "buttons", includeLeafChildren = true }) => {
    if (!node) return null;

    const getDeepestFirstChild = (n) => (!n?.children?.length ? n : getDeepestFirstChild(n.children[0]));

    // Local flag to detect Driving School cards for conditional headings
    const rootNameForCard = String(categoryTree?.name || '').toLowerCase();
    const isDriving = rootNameForCard === 'driving school';

    const selectedParent = selection?.parent || node.children?.[0] || node;
    const selectedChild = selection?.child || getDeepestFirstChild(selectedParent);

    const displayNode = selectedChild || selectedParent;
    let attributeDropdown = null;

    const getUiForLocal = (nodeOrId) => ({ mode: 'buttons', includeLeafChildren: true });

    // Resolve selector display type from the NODE'S OWN config
    const mapToSelectorMode = (dt) => {
      const x = String(dt || '').toLowerCase();
      if (x === 'dropdown' || x === 'select') return 'dropdown';
      return 'buttons';
    };
    const pickDtArr = (arr) => Array.isArray(arr) && arr.length > 0 ? String(arr[0]).toLowerCase() : null;
    const getNodeMode = (n) => pickDtArr(n?.displayType) || getUiForLocal(n).mode || 'buttons';
    // Parent selector (for node's immediate children) comes from node's own displayType
    const parentSelectorMode = mapToSelectorMode(getNodeMode(node));
    // Child selector (for selected parent's children) comes from selectedParent's own displayType
    const childSelectorMode = mapToSelectorMode(getNodeMode(selectedParent));
    try { console.log('[preview] in-card modes', { node: node?.name, parentSelectorMode, childOf: selectedParent?.name, childSelectorMode }); } catch {}

    const [imgIdx, setImgIdx] = useState(0);
    const [extraRowImages, setExtraRowImages] = useState({}); // { [id]: string[] }
    // Build images for this card
    const ASSET_PREFIX = (ASSET_BASE_URL && String(ASSET_BASE_URL)) || (API_BASE_URL && String(API_BASE_URL)) || '';
    const imagesForCard = (() => {
      try {
        const ids = [displayNode?.id, selectedParent?.id, node?.id].map((x) => String(x || ''));
        let arr = [];
        for (const id of ids) {
          if (!id) continue;
          const rows = Array.isArray(vendor?.rowImages?.[id]) ? vendor.rowImages[id] : (Array.isArray(extraRowImages?.[id]) ? extraRowImages[id] : []);
          if (rows.length) { arr = rows.slice(0, 10); break; }
        }
        if (!arr.length && displayNode?.imageUrl) arr = [displayNode.imageUrl];
        // If still empty, try any available vendor.rowImages across ids
        if (!arr.length) {
          try {
            const all = vendor?.rowImages || {};
            for (const k in all) {
              const list = Array.isArray(all[k]) ? all[k] : [];
              if (list.length) { arr = list.slice(0, 10); break; }
            }
          } catch {}
        }
        // If still empty and in dummy mode, try fetching dummy category's image/icon
        if (!arr.length && String(mode || '').toLowerCase() === 'dummy') {
          try {
            const did = String(displayNode?.id || '');
            if (did) {
              // Synchronous fetch disabled inside IIFE; we cannot await here.
              // Instead, enqueue an async fetch to populate extraRowImages so subsequent renders have data.
              (async () => {
                try {
                  const r = await fetch(`${API_BASE_URL}/api/dummy-categories/${did}`, { cache: 'no-store' });
                  if (r.ok) {
                    const j = await r.json();
                    const candidates = [];
                    if (j?.imageUrl) candidates.push(j.imageUrl);
                    if (j?.iconUrl) candidates.push(j.iconUrl);
                    if (candidates.length) {
                      setExtraRowImages((prev) => ({ ...(prev || {}), [did]: candidates }));
                    }
                  }
                } catch {}
              })();
            }
          } catch {}
        }
        const base = String(ASSET_PREFIX || '').replace(/\/+$/, '');
        return arr.map((s) => {
          const str = String(s);
          let url;
          if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:')) {
            url = str;
          } else {
            const path = str.startsWith('/') ? str : `/${str}`;
            url = `${base}${path}`;
          }
          return encodeURI(url).replace(/\+/g, '%2B');
        });
      } catch { return []; }
    })();
    useEffect(() => { setImgIdx(0); }, [displayNode?.id, selectedParent?.id, node?.id, imagesForCard.length]);

    // Lazy fetch row images if not present in vendor.rowImages.
    // We still attempt per-id fetches when vendor.rowImages/extraRowImages are empty,
    // even if imagesForCard already has generic images (e.g., profilePictures),
    // so row-specific images can replace generic ones.
    useEffect(() => {
      (async () => {
        try {
          const ids = [displayNode?.id, selectedParent?.id, node?.id].map((x) => String(x || ''));
          for (const id of ids) {
            if (!id) continue;
            const hasLocal = Array.isArray(vendor?.rowImages?.[id]) && vendor.rowImages[id].length > 0;
            const hasExtra = Array.isArray(extraRowImages?.[id]) && extraRowImages[id].length > 0;
            if (hasLocal || hasExtra) continue;
            const preferred = String(mode || '').toLowerCase() === 'dummy' ? ['dummy-vendors','vendors'] : ['vendors','dummy-vendors'];
            let data = null;
            for (const bp of preferred) {
              try {
                const res = await fetch(`${API_BASE_URL}/api/${bp}/${vendorId}/rows/${id}/images`, { cache: 'no-store' });
                if (!res.ok) continue;
                data = await res.json().catch(() => null);
                break;
              } catch {}
            }
            if (!data) continue;
            const imgs = Array.isArray(data?.images) ? data.images : [];
            if (imgs.length) {
              setExtraRowImages((prev) => ({ ...(prev || {}), [id]: imgs }));
            }
          }
        } catch {}
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vendorId, displayNode?.id, selectedParent?.id, node?.id]);

    return (
      <section style={{ marginBottom: 20 }}>
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 18,
            padding: 24,
            background: "#D6EEDE", // match HomeSection background
            width: "100%",
            minHeight: 420,
            height: "100%",
            boxShadow: "0 10px 20px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 600, textAlign: "center" }}>{node.name}</h2>

          {imagesForCard.length > 0 ? (
            <div style={{ width: '100%', height: 160, borderRadius: 10, overflow: 'hidden', background: '#f8fafc', position: 'relative', marginBottom: 12 }}>
              <div style={{ display: 'flex', width: `${imagesForCard.length * 100}%`, height: '100%', transform: `translateX(-${imgIdx * (100 / imagesForCard.length)}%)`, transition: 'transform 400ms ease' }}>
                {imagesForCard.map((src, i) => (
                  <div key={i} style={{ width: `${100 / imagesForCard.length}%`, height: '100%', flex: '0 0 auto' }}>
                    <img src={src} alt={`img-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
              {imagesForCard.length > 1 ? (
                <>
                  <button
                    aria-label="Prev"
                    onClick={() => setImgIdx((i) => (i - 1 + imagesForCard.length) % imagesForCard.length)}
                    style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}
                  >‹</button>
                  <button
                    aria-label="Next"
                    onClick={() => setImgIdx((i) => (i + 1) % imagesForCard.length)}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}
                  >›</button>
                  <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', gap: 6, justifyContent: 'center' }}>
                    {imagesForCard.map((_, i) => (
                      <button key={i} onClick={() => setImgIdx(i)} aria-label={`Go to ${i+1}`}
                        style={{ width: i===imgIdx?9:7, height: i===imgIdx?9:7, borderRadius: 999, border: 'none', background: i===imgIdx ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }} />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {displayNode && (
            <div style={{ marginBottom: 12 }}>
              {(() => {
                try {
                  const catKey = String(categoryId || '');
                  const inv = Array.isArray(vendor?.inventorySelections?.[catKey]) ? vendor.inventorySelections[catKey] : [];
                  const ids = [displayNode?.id, selectedParent?.id, node?.id].map((x) => String(x || ''));
                  const rootNameLocal = String(categoryTree?.name || '').toLowerCase();
                  const isDrivingLocal = rootNameLocal === 'driving school';

                  const pickBaselinePrice = () => {
                    let invPrice = null;
                    inv.forEach((entry) => {
                      if (invPrice != null) return;
                      const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                      if (!pbr) return;
                      for (const target of ids) {
                        if (!target) continue;
                        for (const [rk, val] of Object.entries(pbr)) {
                          const parts = String(rk).split('|');
                          if (parts.some((id) => String(id) === target)) {
                            const num = Number(val);
                            if (!Number.isNaN(num)) { invPrice = num; break; }
                          }
                        }
                        if (invPrice != null) break;
                      }
                    });
                    const nodePrice =
                      (displayNode.vendorPrice ?? displayNode.price) ??
                      (selectedParent?.vendorPrice ?? selectedParent?.price) ??
                      (node.vendorPrice ?? node.price) ?? null;
                    return (invPrice != null) ? invPrice : nodePrice;
                  };

                  // For Driving School, make price aware of current brand/model/transmission/bodyType selections
                  if (isDrivingLocal && inv.length > 0) {
                    const targetId = String((displayNode?.id || selectedParent?.id || node?.id || ''));
                    const normalized = [];
                    inv.forEach((entry) => {
                      try {
                        const fam = String(entry?.scopeFamily || '').toLowerCase();
                        const sels = entry?.selections || {};
                        let sel = sels[fam] || sels.cars || sels.bikes || {};
                        if (!sel || typeof sel !== 'object') sel = {};
                        if (fam === 'bikes') {
                          const brand = sel.bikeBrand != null ? String(sel.bikeBrand) : (sel.brand != null ? String(sel.brand) : '');
                          const transmission = sel.bikeTransmission != null ? String(sel.bikeTransmission) : (sel.transmission != null ? String(sel.transmission) : '');
                          const model = sel.model != null ? String(sel.model) : '';
                          if (brand || model || transmission) {
                            normalized.push({ family: fam, brand, model, transmission, bodyType: null, entry });
                          }
                        } else if (fam === 'cars') {
                          const brand = sel.brand != null ? String(sel.brand) : '';
                          const transmission = sel.transmission != null ? String(sel.transmission) : '';
                          const model = sel.model != null ? String(sel.model) : '';
                          const bodyType = sel.bodyType != null ? String(sel.bodyType) : '';
                          if (brand || model || transmission || bodyType) {
                            normalized.push({ family: fam, brand, model, transmission, bodyType, entry });
                          }
                        }
                      } catch {}
                    });

                    const minPriceForList = (list) => {
                      try {
                        const prices = [];
                        list.forEach((n) => {
                          const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
                          if (!pbr) return;
                          for (const [key, value] of Object.entries(pbr)) {
                            const ids = String(key).split('|');
                            if (ids.some((id) => String(id) === targetId)) {
                              const num = Number(value);
                              if (!Number.isNaN(num)) prices.push(num);
                            }
                          }
                        });
                        if (!prices.length) return null;
                        return Math.min(...prices);
                      } catch { return null; }
                    };

                    const carBrand = String(attrSelections?.brand ?? '').trim() || null;
                    const carModel = String(attrSelections?.model ?? '').trim() || null;
                    const carTrans = String(attrSelections?.transmission ?? '').trim() || null;
                    const carBody = String(attrSelections?.bodyType ?? '').trim() || null;
                    const bikeBrand = String(attrSelections?.bikeBrand ?? '').trim() || null;
                    const bikeModel = String(attrSelections?.bikeModel ?? '').trim() || null;
                    const bikeTrans = String(attrSelections?.bikeTransmission ?? '').trim() || null;

                    const refined = normalized.filter((n) => {
                      const fam = String(n.family || '').toLowerCase();
                      const effBrand = fam === 'bikes' ? bikeBrand : carBrand;
                      const effModel = fam === 'bikes' ? bikeModel : carModel;
                      const effTrans = fam === 'bikes' ? bikeTrans : carTrans;
                      const effBody = fam === 'cars' ? carBody : null;
                      if (effBrand && String(n.brand) !== String(effBrand)) return false;
                      if (effModel && String(n.model) !== String(effModel)) return false;
                      if (effTrans && String(n.transmission) !== String(effTrans)) return false;
                      if (effBody && n.bodyType && String(n.bodyType) !== String(effBody)) return false;
                      return true;
                    });

                    const attrAwarePrice = refined.length ? minPriceForList(refined) : null;
                    const fallback = pickBaselinePrice();
                    const resolvedPrice = (attrAwarePrice != null) ? attrAwarePrice : fallback;
                    if (resolvedPrice == null) return null;
                    return (<p className="unified-price">₹ {resolvedPrice}</p>);
                  }

                  const resolvedPrice = pickBaselinePrice();
                  if (resolvedPrice == null) return null;
                  return (<p className="unified-price">₹ {resolvedPrice}</p>);
                } catch { return null; }
              })()}
              {(() => {
                const resolvedTerms = displayNode.terms || selectedParent?.terms || node.terms || "";
                if (!resolvedTerms) return null;
                return (
                  <ul style={{ marginTop: 4, paddingLeft: 18 }}>
                    {resolvedTerms.split(",").map((t, i) => (
                      <li key={i} style={{ fontSize: 13, color: "#4b5563" }}>
                        {t.trim()}
                      </li>
                    ))}
                  </ul>
                );
              })()}
              {(() => {
                try {
                  const linked = (categoryTree && categoryTree.linkedAttributes && typeof categoryTree.linkedAttributes === 'object') ? categoryTree.linkedAttributes : {};
                  // Build case-insensitive index of families from linkedAttributes
                  const famIndex = new Map(); // famLower -> { base, fields, modelFields, linkedSub, specificSubs: Set }
                  Object.keys(linked).forEach((k) => {
                    const parts = String(k).split(':');
                    const fam = parts[0] || '';
                    const lower = String(fam || '').toLowerCase();
                    const curr = famIndex.get(lower) || { base: fam, fields: [], modelFields: [], linkedSub: null, specificSubs: new Set() };
                    const last = parts[parts.length - 1];
                    if (parts.length === 1) {
                      // e.g., 'cars' -> fields list
                      curr.fields = Array.isArray(linked[k]) ? linked[k].map(String) : curr.fields;
                    } else if (parts.length === 2 && parts[1] === 'modelFields') {
                      curr.modelFields = Array.isArray(linked[k]) ? linked[k].map(String) : curr.modelFields;
                    } else if (last === 'linkedSubcategory') {
                      const raw = linked[k];
                      const vals = Array.isArray(raw) ? raw.map((v) => String(v || '')) : [String(raw || '')];
                      if (parts.length === 2) {
                        // fam:linkedSubcategory -> family-level
                        curr.linkedSub = vals[0] || '';
                      } else {
                        // fam:<something>:linkedSubcategory -> specific mapping for labels/inventory
                        vals.forEach((v) => { if (v) curr.specificSubs.add(v); });
                      }
                    }
                    famIndex.set(lower, curr);
                  });
                  // Families allowed to render with precedence: specific match > family-level match; treat 'ALL' as global only if no specific mappings exist
                  const targetIdsLinkedAttrs = [displayNode?.id, selectedParent?.id, node?.id].map((x) => String(x || ''));
                  const familiesAllLower = new Set(
                    Array.from(famIndex.entries())
                      .filter(([, v]) => {
                        // Specific mappings take precedence
                        const hasSpecific = v.specificSubs && v.specificSubs.size > 0;
                        if (hasSpecific) {
                          return targetIdsLinkedAttrs.some((tid) => tid && v.specificSubs.has(String(tid)));
                        }
                        // Then check family-level
                        const ls = v.linkedSub;
                        if (!ls) return false; // require explicit mapping
                        if (ls === 'ALL') return true;
                        return targetIdsLinkedAttrs.some((tid) => tid && String(ls) === String(tid));
                      })
                      .map(([k]) => k)
                  );
                  const catKey = String(categoryId || '');
                  const invPriceList = Array.isArray(vendor?.inventorySelections?.[catKey]) ? vendor.inventorySelections[catKey] : [];
                  // Do NOT auto-allow families not configured; they will render only if an explicit mapping exists.
                  // First try strict linkedAttributes-based entries; then, if nothing matches, fall back to any entries
                  // whose pricesByRow target this card's node ids.
                  let entriesAll = invPriceList.filter((e) => {
                    const famLower = String(e?.scopeFamily || '').toLowerCase();
                    if (!familiesAllLower.has(famLower)) return false;
                    const fam = String(e?.scopeFamily || '');
                    const label = String(e?.scopeLabel || '');
                    const specificKey = `${fam}:${label}:linkedSubcategory`;
                    const genericLabelKey = `${fam}:inventoryLabels:linkedSubcategory`;
                    const familyKey = `${fam}:linkedSubcategory`;
                    let mapped = undefined;
                    if (Array.isArray(linked[specificKey]) && linked[specificKey].length) mapped = String(linked[specificKey][0] || '');
                    else if (Array.isArray(linked[genericLabelKey]) && linked[genericLabelKey].length) mapped = String(linked[genericLabelKey][0] || '');
                    else if (Array.isArray(linked[familyKey]) && linked[familyKey].length) mapped = String(linked[familyKey][0] || '');
                    if (mapped === 'ALL') return true;
                    if (!mapped) return false; // require explicit mapping to show
                    return targetIdsLinkedAttrs.some((tid) => tid && String(mapped) === String(tid));
                  });

                  if (entriesAll.length === 0 && invPriceList.length > 0) {
                    // Fallback: any inventory entry that has pricesByRow targeting this card's node ids.
                    entriesAll = invPriceList.filter((e) => {
                      try {
                        const pbr = e && e.pricesByRow && typeof e.pricesByRow === 'object' ? e.pricesByRow : null;
                        if (!pbr) return false;
                        for (const [rk] of Object.entries(pbr)) {
                          const parts = String(rk).split('|');
                          if (targetIdsLinkedAttrs.some((tid) => tid && parts.some((id) => String(id) === tid))) return true;
                        }
                        return false;
                      } catch { return false; }
                    });
                  }
                  // Prefer entries that have a pricesByRow targeting this card's node ids
                  const entriesMatched = entriesAll.filter((entry) => {
                    try {
                      const pbr = entry && entry.pricesByRow && typeof entry.pricesByRow === 'object' ? entry.pricesByRow : null;
                      if (!pbr) return false;
                      for (const [rk] of Object.entries(pbr)) {
                        const parts = String(rk).split('|');
                        if (targetIds.some((tid) => tid && parts.some((id) => String(id) === tid))) return true;
                      }
                      return false;
                    } catch { return false; }
                  });
                  const entries = entriesMatched.length > 0 ? entriesMatched : entriesAll;
                  let blocks = entries.map((entry, idx) => {
                    const fam = String(entry?.scopeFamily || '');
                    const famLower = fam.toLowerCase();
                    let sel = {};
                    try {
                      const sels = entry?.selections || {};
                      if (sels && typeof sels === 'object') {
                        if (sels[fam]) sel = sels[fam];
                        else {
                          const key = Object.keys(sels).find((k) => String(k).toLowerCase() === famLower);
                          if (key) sel = sels[key];
                        }
                      }
                    } catch { sel = {}; }
                    // Normalize known alias keys per family
                    if (famLower === 'bikes') {
                      try {
                        let nextSel = sel || {};
                        if (nextSel.brand && !nextSel.bikeBrand) nextSel = { ...nextSel, bikeBrand: nextSel.brand };
                        if (nextSel.model && !nextSel.bikeModel) nextSel = { ...nextSel, bikeModel: nextSel.model };
                        // Remove shared car keys so bikes do not interfere with car filters
                        if (Object.prototype.hasOwnProperty.call(nextSel, 'brand') || Object.prototype.hasOwnProperty.call(nextSel, 'model')) {
                          const { brand: _b, model: _m, ...rest } = nextSel;
                          nextSel = rest;
                        }
                        sel = nextSel;
                      } catch {}
                    }
                    const conf = famIndex.get(famLower) || { fields: [], modelFields: [] };
                    const allowed = new Set([...(conf.fields || []), ...(conf.modelFields || [])].map(String));
                    if (famLower === 'cars' || famLower === 'bikes') {
                      ['brand', 'bikeBrand', 'model', 'bikeModel', 'transmission', 'bikeTransmission', 'bodyType'].forEach((k) => {
                        allowed.add(String(k));
                      });
                    }
                    let pairs = Object.entries(sel).filter(([k, v]) => {
                      if (v == null || String(v).trim() === '') return false;
                      return (allowed.size === 0 || allowed.has(String(k)));
                    });
                    // If nothing passed the allowed filter, fall back to all non-empty keys
                    if (pairs.length === 0) {
                      pairs = Object.entries(sel).filter(([k, v]) => v != null && String(v).trim() !== '');
                    }
                    return { key: entry._id || entry.at || idx, pairs, sel, fam: famLower };
                  }).filter((b) => b.pairs.length > 0);
                  // Fallback: if nothing matched, render first inventory selection raw pairs
                  if (blocks.length === 0 && entriesAll.length > 0) {
                    const first = entriesAll[0];
                    const fam = String(first?.scopeFamily || '');
                    const famLower = fam.toLowerCase();
                    const sels = first?.selections || {};
                    let sel = {};
                    if (sels[fam]) sel = sels[fam];
                    else {
                      const key = Object.keys(sels).find((k) => String(k).toLowerCase() === famLower);
                      if (key) sel = sels[key];
                    }
                    const pairs = Object.entries(sel).filter(([k, v]) => v != null && String(v).trim() !== '');
                    if (pairs.length > 0) blocks = [{ key: first._id || first.at || 'first', pairs, sel, fam: famLower }];
                  }
                  if (blocks.length === 0) return null;

                  // Build combo options: each inventory selection becomes one combo
                  const dropdownKey = String(node?.id || 'global');

                  const combos = blocks.map((b) => {
                    const sel = b.sel || {};
                    const famLower = String(b.fam || sel.family || '').toLowerCase();
                    const isBike = famLower === 'bikes';
                    const brand = isBike
                      ? (sel.bikeBrand || sel.brand || '')
                      : (sel.brand || '');
                    const model = isBike
                      ? (sel.bikeModel || sel.model || '')
                      : (sel.model || '');
                    const transmission = isBike
                      ? (sel.bikeTransmission || sel.transmission || '')
                      : (sel.transmission || '');
                    const bodyType = !isBike ? (sel.bodyType || '') : '';
                    return {
                      key: b.key,
                      brand: String(brand || '').trim(),
                      model: String(model || '').trim(),
                      transmission: String(transmission || '').trim(),
                      bodyType: String(bodyType || '').trim(),
                      isBike,
                    };
                  }).filter((c) => c.brand || c.model || c.transmission || c.bodyType);

                  if (!combos.length) return null;

                  const current = attrSelections || {};
                  const activeIndex = combos.findIndex((c) => {
                    if (c.isBike) {
                      return (
                        (!current.bikeBrand || String(current.bikeBrand) === c.brand) &&
                        (!current.bikeModel || String(current.bikeModel) === c.model) &&
                        (!current.bikeTransmission || String(current.bikeTransmission) === c.transmission)
                      );
                    }
                    return (
                      (!current.brand || String(current.brand) === c.brand) &&
                      (!current.model || String(current.model) === c.model) &&
                      (!current.transmission || String(current.transmission) === c.transmission) &&
                      (!current.bodyType || String(current.bodyType) === c.bodyType)
                    );
                  });
                  const activeCombo = activeIndex >= 0 ? combos[activeIndex] : null;

                  const buildLabel = (c) => {
                    const hasTrans = !!c.transmission;
                    const hasBody = !!c.bodyType;
                    const row1 = hasTrans
                      ? [c.transmission, hasBody ? ` · ${c.bodyType}` : '']
                      : [c.bodyType, ''];
                    const row2 = [c.brand, c.model].filter(Boolean).join(' · ');
                    if (!row1[0] && !row2) return 'Select Vehicle';
                    if (!row1[0]) return row2;
                    return `${row1.filter(Boolean).join('') } / ${row2}`;
                  };

                  const triggerLabel = activeCombo ? buildLabel(activeCombo) : 'Select Vehicle';

                  const handleSelectCombo = (combo) => {
                    setAttrSelections((prev) => {
                      const next = { ...(prev || {}) };
                      if (combo.isBike) {
                        next.bikeBrand = combo.brand || undefined;
                        next.bikeModel = combo.model || undefined;
                        next.bikeTransmission = combo.transmission || undefined;
                        delete next.brand;
                        delete next.model;
                        delete next.transmission;
                        delete next.bodyType;
                      } else {
                        next.brand = combo.brand || undefined;
                        next.model = combo.model || undefined;
                        next.transmission = combo.transmission || undefined;
                        next.bodyType = combo.bodyType || undefined;
                        delete next.bikeBrand;
                        delete next.bikeModel;
                        delete next.bikeTransmission;
                      }
                      Object.keys(next).forEach((k) => {
                        if (next[k] === undefined || next[k] === '') delete next[k];
                      });
                      return next;
                    });
                    setAttrDropdownOpen((prev) => ({ ...(prev || {}), [dropdownKey]: false }));
                  };

                  attributeDropdown = (
                    <div style={{ marginTop: 8, marginBottom: 15, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 400, color: 'black', marginLeft: 2 }}>
                        Select Model 
                      </div>
                      {/* <div style={{ fontSize: 11, fontWeight: 500, color: '#e5e7eb', marginLeft: 2 }}>
                        Select model:
                      </div> */}
                      <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setAttrDropdownOpen((prev) => {
                              const current = prev && prev[dropdownKey];
                              return { ...(prev || {}), [dropdownKey]: !current };
                            })
                          }
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            minWidth: 220,
                            padding: '10px 16px',
                            borderRadius: 999,
                            border: '1px solid rgba(148, 163, 184, 0.9)',
                            background: '#ffffff',
                            color: '#111827',
                            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.18)',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 600,
                            letterSpacing: 0.2,
                            transition: 'transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.28)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.18)';
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {triggerLabel}
                          </span>
                          <span style={{ fontSize: 20, lineHeight: 1 }}>▾</span>
                        </button>

                        {!!attrDropdownOpen?.[dropdownKey] && (
                          <div
                            style={{
                              marginTop: 8,
                              zIndex: 1,
                              width: '100%',
                              maxHeight: '45vh',
                              overflowY: 'auto',
                              padding: 8,
                              borderRadius: 14,
                              background: 'rgba(255, 255, 255, 0.98)',
                              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
                              overscrollBehavior: 'contain',
                            }}
                          >
                            {combos.map((combo) => {
                              const hasTrans = !!combo.transmission;
                              const hasBody = !!combo.bodyType;
                              const row1Left = hasTrans ? combo.transmission : combo.bodyType;
                              const row1Right = hasTrans && hasBody ? combo.bodyType : '';
                              const row2Left = combo.brand;
                              const row2Right = combo.model;

                              const lineParts = [
                                row1Left,
                                row1Right,
                                row2Left,
                                row2Right,
                              ].filter((p) => p && String(p).trim() !== '');
                              const lineText = lineParts.join(' · ');

                              return (
                                <button
                                  key={combo.key}
                                  type="button"
                                  onClick={() => handleSelectCombo(combo)}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '8px 10px',
                                    marginBottom: 4,
                                    borderRadius: 10,
                                    border: '1px solid rgba(148, 163, 184, 0.8)',
                                    background: '#ffffff',
                                    color: '#0f172a',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    transition: 'background 140ms ease, transform 140ms ease, box-shadow 140ms ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#e5f0ff';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.18)';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#ffffff';
                                    e.currentTarget.style.boxShadow = 'none';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'block',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {lineText || '—'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
            </div>
          )}

          {/* Parent Buttons / Dropdown (resolved per node) */}
          {node.children?.length > 0 && (
            parentSelectorMode === "buttons" ? (
              <>
                {isDriving && (
                  <div style={{ fontSize: 11, fontWeight: 400, color: "#111827", marginLeft: 2, marginBottom: -14 }}>
                    Select course type 
                  </div>
                )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {node.children.map((opt) => {
                  const leaf = getDeepestFirstChild(opt);
                  const isSelectedParent = selectedParent?.id === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onSelectionChange?.(opt, leaf);
                        onLeafSelect?.(leaf);
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: isSelectedParent ? "2px solid #059669" : "1px solid #d1d5db",
                        background: isSelectedParent ? "#059669" : "#f9fafb",
                        color: isSelectedParent ? "#fff" : "#111827",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {opt.name}
                    </button>
                  );
                })}
              </div>
            </>
            ) : (
              <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {isDriving && (
                  <div style={{ fontSize: 13, fontWeight: 400, color: "#111827", marginBottom: 0 }}>
                    Select course type :
                  </div>
                )}
                <select
                  value={selectedParent?.id || ""}
                  onChange={(e) => {
                    const next = node.children.find((c) => String(c.id) === e.target.value) || node.children[0];
                    const leaf = getDeepestFirstChild(next);
                    onSelectionChange?.(next, leaf);
                    onLeafSelect?.(leaf);
                  }}
                  style={{
                    width: "auto",
                    maxWidth: "100%",
                    padding: "10px 32px 10px 16px",
                    borderRadius: 999,
                    border: "1px solid #111827",
                    background: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: "left",
                  }}
                >
                  {node.children.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              </div>
            )
          )}

          {/* Child Buttons / Dropdown (resolved per selected parent) */}
          {includeLeafChildren && selectedParent?.children?.length > 0 && (
            childSelectorMode === "buttons" ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {selectedParent.children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => {
                        onSelectionChange?.(selectedParent, child);
                        onLeafSelect?.(child);
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: selectedChild?.id === child.id ? "2px solid #2563eb" : "1px solid #d1d5db",
                        background: selectedChild?.id === child.id ? "#2563eb" : "#f9fafb",
                        color: selectedChild?.id === child.id ? "#fff" : "#111827",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <select
                  value={selectedChild?.id || ""}
                  onChange={(e) => {
                    const next = selectedParent.children.find((c) => String(c.id) === e.target.value) || selectedParent.children[0];
                    onSelectionChange?.(selectedParent, next);
                    onLeafSelect?.(next);
                  }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13 }}
                >
                  {selectedParent.children.map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </select>
              </div>
            )
          )}

          {attributeDropdown}

          <button
            onClick={() => alert(`Booking ${displayNode?.name}`)}
            style={{
              marginTop: "auto",
              width: "100%",
              padding: "10px 14px",
              borderRadius: 28,
              border: "none",
              background: "rgb(245 158 11)",
              color: "#111827",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            Enroll Now
          </button>
        </div>
      </section>
    );
  };

  // ----------------- Render tree -----------------
  const renderTree = (root) => {
    if (!root) return <p>No categories available</p>;
    if (!Array.isArray(root.children) || root.children.length === 0)
      return <p>No categories available</p>;

    const linked = (categoryTree && categoryTree.linkedAttributes && typeof categoryTree.linkedAttributes === "object")
      ? categoryTree.linkedAttributes
      : {};

    // Resolve displayType chain only
    const resolveDisplayTypeFor = (node, parent) => {
      const pick = (arr) => Array.isArray(arr) && arr.length > 0 ? String(arr[0]).toLowerCase() : null;
      return (
        pick(node?.displayType) ||
        pick(parent?.displayType) ||
        pick(root?.displayType) ||
        "card"
      );
    };

    // ... rest of the code remains the same ...
  const familiesByTarget = new Map();
  // First pass: detect families that have any specific mappings (fam:*:linkedSubcategory)
  const famHasSpecific = new Map(); // fam -> boolean
  Object.keys(linked).forEach((k) => {
    if (!k.endsWith(":linkedSubcategory")) return;
    const parts = String(k).split(":");
    const fam = parts[0] || "";
    if (parts.length > 2) famHasSpecific.set(fam, true);
  });
  // Second pass: add mappings, but ignore ALL for families that have specific mappings
  Object.keys(linked).forEach((k) => {
    if (!k.endsWith(":linkedSubcategory")) return;
    const parts = String(k).split(":");
    const fam = parts[0] || "";
    const raw = linked[k];
    const val = Array.isArray(raw) ? String(raw[0] || "") : String(raw || "");
    if (!val) return; // require explicit mapping
    if (parts.length === 2 && val === "ALL" && famHasSpecific.get(fam)) return; // ignore ALL when specific exists
    const key = val === "ALL" ? "ALL" : val;
    if (!familiesByTarget.has(key)) familiesByTarget.set(key, new Set());
    familiesByTarget.get(key).add(fam);
  });

  const invEntries = vendor?.inventorySelections?.[categoryId] || [];
  // Build attribute fields/options from inventory selections
  const allFields = new Set();
  const fieldValues = new Map(); // field -> Set(values)
  for (const entry of invEntries) {
    const fam = entry?.scopeFamily;
    const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
    Object.entries(sel).forEach(([k, v]) => {
      const key = String(k);
      if (!fieldValues.has(key)) fieldValues.set(key, new Set());
      allFields.add(key);
      if (v != null && String(v).trim() !== "") fieldValues.get(key).add(String(v));
    });
  }
  // Restrict to fields selected in linkedAttributes (Link Attributes for Pricing)
  const linkedLA = (categoryTree && categoryTree.linkedAttributes && typeof categoryTree.linkedAttributes === "object")
    ? categoryTree.linkedAttributes
    : {};
  const allowedFields = new Set();
  Object.entries(linkedLA).forEach(([k, arr]) => {
    if (!Array.isArray(arr)) return;
    // keys like 'cars' or 'Bikes' directly list fields (brand, model, seats, etc.)
    const parts = String(k).split(":");
    if (parts.length === 1) {
      arr.forEach((f) => { if (f) allowedFields.add(String(f)); });
    }
    // keys like 'cars:modelFields'
    if (parts.length === 2 && parts[1] === 'modelFields') {
      arr.forEach((f) => { if (f) allowedFields.add(String(f)); });
    }
  });
  const fieldsListRaw = Array.from(allFields);
  const fieldsList = allowedFields.size > 0
    ? fieldsListRaw.filter((f) => allowedFields.has(String(f)))
    : fieldsListRaw;
  const optionsByField = Object.fromEntries(fieldsList.map((f) => [f, Array.from(fieldValues.get(f) || new Set())]));

  // Build pair options for a given field pair
  const getPairOptions = (A, B) => {
    if (!A || !B || A === B) return [];
    const set = new Set();
    for (const entry of invEntries) {
      const fam = entry?.scopeFamily;
      const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
      const va = sel?.[A];
      const vb = sel?.[B];
      if (va != null && vb != null && String(va).trim() !== "" && String(vb).trim() !== "") {
        set.add(`${String(va)}|${String(vb)}`);
      }
    }
    return Array.from(set);
  };

  const matchesAttrFilters = (entry) => {
    const fam = entry?.scopeFamily;
    const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
    // singles: all selected singles must match
    for (const [field, val] of Object.entries(attrSelections || {})) {
      if (!val) continue;
      if (String(sel?.[field] ?? "") !== String(val)) return false;
    }
    // pairs: all chosen pairs must match
    for (const [idx, combo] of Object.entries(pairSelections || {})) {
      if (!combo) continue;
      const cfg = (categoryTree?.uiConfig?.attributesBar || [])[Number(idx)];
      if (!cfg || cfg.type !== 'pair') continue;
      const A = cfg.a;
      const B = cfg.b;
      if (!A || !B) continue;
      const [va, vb] = String(combo).split('|');
      const sa = String(sel?.[A] ?? "");
      const sb = String(sel?.[B] ?? "");
      if (!(sa === String(va ?? "") && sb === String(vb ?? ""))) return false;
    }
    return true;
  };
  const invByFamily = invEntries.reduce((acc, entry) => {
    const fam = String(entry?.scopeFamily || "").trim();
    if (!fam) return acc;
    if (!acc[fam]) acc[fam] = [];
    acc[fam].push(entry);
    return acc;
  }, {});

  const rootName = String(root?.name || '').toLowerCase();
  if (false && rootName.includes('taxi')) {
    const carsList = invByFamily['cars'] || [];
    const tempoList = invByFamily['tempoMinibuses'] || [];

    const extract = (entry) => {
      const fam = entry?.scopeFamily;
      const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
      if (fam === 'cars') {
        return {
          family: 'cars',
          body: String(sel?.bodyType ?? ''),
          seats: String(sel?.seats ?? ''),
          fuel: sel?.fuelType != null ? String(sel.fuelType) : undefined,
          model: String(sel?.model ?? ''),
          brand: String(sel?.brand ?? ''),
          entry,
        };
      }
      if (fam === 'tempoMinibuses') {
        return {
          family: 'tempoMinibuses',
          body: String(sel?.tempoBusBodyType ?? ''),
          seats: String(sel?.seats ?? ''),
          fuel: undefined, // not applicable for tempos per data
          model: String(sel?.model ?? ''),
          brand: String(sel?.tempoBusBrand ?? ''),
          entry,
        };
      }
      return null;
    };

    const normalized = [
      ...carsList.map(extract).filter(Boolean),
      ...tempoList.map(extract).filter(Boolean),
    ];

    const bodySeatsOptions = Array.from(new Set(normalized
      .filter((n) => n.body && n.seats)
      .map((n) => `${n.body}|${n.seats}`)));

    const filterByBodySeats = (pair) => {
      if (!pair) return normalized;
      const [b, s] = String(pair).split('|');
      return normalized.filter((n) => String(n.body) === String(b ?? '') && String(n.seats) === String(s ?? ''));
    };

    const fuelOptionsFromList = (list) => Array.from(new Set(list
      .map((n) => n.fuel)
      .filter((v) => v != null && String(v).trim() !== '')));

    const modelBrandPairsFromList = (list) => Array.from(new Set(list
      .filter((n) => n.model && n.brand)
      .map((n) => `${n.model}|${n.brand}`)));

    const uiRow = (label, control) => (
      <div
        style={{
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</div>
        <div style={{ width: '100%' }}>{control}</div>
      </div>
    );

    // Compute minimum price from a list of normalized entries for a target node id
    const minPriceForListTarget = (list, targetId) => {
      try {
        const prices = [];
        list.forEach((n) => {
          const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
          if (!pbr) return;
          for (const [key, value] of Object.entries(pbr)) {
            const ids = String(key).split('|');
            if (ids.some((id) => String(id) === String(targetId))) {
              const num = Number(value);
              if (!Number.isNaN(num)) prices.push(num);
            }
          }
        });
        if (prices.length === 0) return null;
        return Math.min(...prices);
      } catch { return null; }
    };

    // Local helper: compute min price in subtree including inventory pricesByRow for this node id
    const localMinPriceInSubtree = (n) => {
      let best = null;
      const catKey = String(categoryId || '');
      const consider = (val) => {
        if (val == null) return;
        const num = Number(val);
        if (!Number.isNaN(num) && (best == null || num < best)) best = num;
      };
      const visit = (x) => {
        if (!x) return;
        // Consider node/vendor price on the node
        consider(x.vendorPrice ?? x.price);
        // Consider inventory per-row prices targeting this node id
        try {
          const idStr = String(x.id || '');
          const inv = Array.isArray(vendor?.inventorySelections?.[catKey]) ? vendor.inventorySelections[catKey] : [];
          inv.forEach((entry) => {
            const pbr = entry && entry.pricesByRow && typeof entry.pricesByRow === 'object' ? entry.pricesByRow : null;
            if (!pbr) return;
            for (const [rk, val] of Object.entries(pbr)) {
              const parts = String(rk).split('|');
              if (parts.some((pid) => String(pid) === idStr)) { consider(val); }
            }
          });
        } catch {}
        if (Array.isArray(x.children) && x.children.length) x.children.forEach(visit);
      };
      visit(n);
      return best;
    };

    const renderPriceForNode = (node, parentNode) => {
      let livePrice = null;
      const priceRows = vendor?.inventorySelections?.[categoryId] || [];
      for (const entry of priceRows) {
        const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
        if (!pbr) continue;
        for (const [key, value] of Object.entries(pbr)) {
          const ids = String(key).split('|');
          if (ids.some((id) => String(id) === String(node?.id))) { livePrice = Number(value); break; }
        }
        if (livePrice != null) break;
      }
      if (livePrice == null) {
        livePrice = vendor?.pricing?.[node?.id] ?? vendor?.pricing?.[parentNode?.id] ?? node?.vendorPrice ?? node?.price ?? null;
      }
      return livePrice;
    };

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 30, alignItems: 'stretch' }}>
        {root.children.map((lvl1) => {
          const serviceKey = makeServiceKey(lvl1?.name || "");
      const lvl2KidsRaw = Array.isArray(lvl1.children) ? lvl1.children : [];
      // Sort L2 by min subtree price
      const lvl2Kids = [...lvl2KidsRaw].sort((a, b) => {
        const pa = localMinPriceInSubtree(a);
        const pb = localMinPriceInSubtree(b);
        const va = pa == null ? Number.POSITIVE_INFINITY : Number(pa);
        const vb = pb == null ? Number.POSITIVE_INFINITY : Number(pb);
        return va - vb;
      });
      const selState = taxiSelections[lvl1.id] || {};
      const selectedLvl2 = lvl2Kids.find((c) => String(c.id) === String(selState.lvl2)) || lvl2Kids[0] || null;
      const lvl3KidsRaw = Array.isArray(selectedLvl2?.children) ? selectedLvl2.children : [];
      const lvl3Kids = [...lvl3KidsRaw].sort((a, b) => {
        const pa = localMinPriceInSubtree(a);
        const pb = localMinPriceInSubtree(b);
        const va = pa == null ? Number.POSITIVE_INFINITY : Number(pa);
        const vb = pb == null ? Number.POSITIVE_INFINITY : Number(pb);
        return va - vb;
      });
      const selectedLvl3 = lvl3Kids.find((c) => String(c.id) === String(selState.lvl3)) || lvl3Kids[0] || null;

      const belongsToLvl1 = (entry) => {
        try {
          const lvl1Id = String(lvl1?.id || '');
          const fam = String(entry?.scopeFamily || '');
          const famSetForLvl1 = familiesByTarget.get(lvl1Id);
          const famSetAll = familiesByTarget.get('ALL');

          // Require explicit mapping: either mapped to this lvl1 or mapped via ALL
          const isExplicitlyAllowed = (
            (famSetForLvl1 && famSetForLvl1.has(fam)) ||
            (famSetAll && famSetAll.has(fam))
          );
          if (!isExplicitlyAllowed) return false;

          // Additionally, if pricesByRow targets this lvl1, keep it. If pricesByRow exists but doesn't target, exclude.
          const pbr = entry?.pricesByRow;
          if (pbr && typeof pbr === 'object') {
            for (const key of Object.keys(pbr)) {
              const ids = String(key).split('|');
              if (ids.some((id) => String(id) === lvl1Id)) return true;
            }
            return false;
          }
          return true;
        } catch { return false; }
      };

      const normalizedForLvl1 = normalized.filter((n) => belongsToLvl1(n.entry));
      const bodySeatsOptions = Array.from(new Set(normalizedForLvl1
        .filter((n) => n.body && n.seats)
        .map((n) => `${n.body}|${n.seats}`)));
      const filterByBodySeats = (pair) => {
        if (!pair) return normalizedForLvl1;
        const [b, s] = String(pair).split('|');
        return normalizedForLvl1.filter((n) => String(n.body) === String(b ?? '') && String(n.seats) === String(s ?? ''));
      };
      const filteredByBodySeats = filterByBodySeats(selState.bodySeats);
      // Sort bodySeats options by min price for current target
      const targetIdForSort = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
      const bodySeatsWithPrice = bodySeatsOptions.map((opt) => ({
        opt,
        price: minPriceForListTarget(filterByBodySeats(opt), targetIdForSort),
      }));
      bodySeatsWithPrice.sort((a, b) => {
        const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
        const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
        return va - vb;
      });
      const sortedBodySeatsOptions = bodySeatsWithPrice.map((x) => x.opt);
      const fuelOptions = fuelOptionsFromList(filteredByBodySeats);
      const filteredByFuel = selState.fuelType
        ? filteredByBodySeats.filter((n) => String(n.fuel ?? '') === String(selState.fuelType))
        : filteredByBodySeats;
      // Sort fuel options by min price under current bodySeats
      const fuelWithPrice = fuelOptions.map((opt) => ({
        opt,
        price: minPriceForListTarget(filteredByBodySeats.filter((n) => String(n.fuel ?? '') === String(opt)), targetIdForSort),
      }));
      fuelWithPrice.sort((a, b) => {
        const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
        const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
        return va - vb;
      });
      const sortedFuelOptions = fuelWithPrice.map((x) => x.opt);
      const modelBrandOptions = modelBrandPairsFromList(filteredByFuel);
      // Sort modelBrand by min price
      const mbWithPrice = modelBrandOptions.map((opt) => {
        const [m, b] = String(opt).split('|');
        const list = filteredByFuel.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
        return { opt, price: minPriceForListTarget(list, targetIdForSort) };
      });
      mbWithPrice.sort((a, b) => {
        const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
        const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
        return va - vb;
      });
      const sortedModelBrandOptions = mbWithPrice.map((x) => x.opt);

      const displayNode = selectedLvl3 || selectedLvl2 || lvl1;
      const livePrice = renderPriceForNode(displayNode, selectedLvl2 || lvl1);
      const hasFuelOptions = fuelOptions.length > 0;
      const hasBodySeats = bodySeatsOptions.length > 0;
      const hasModelBrand = modelBrandOptions.length > 0;
      const hasAnyAttributes = hasBodySeats || hasFuelOptions || hasModelBrand;
      const isComplete = (!hasBodySeats || Boolean(selState.bodySeats)) && (!hasFuelOptions || Boolean(selState.fuelType)) && (!hasModelBrand || Boolean(selState.modelBrand));
      const attrAwarePrice = (() => {
        try {
          if (!isComplete) return null;
          const prices = [];
          const targetId = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
          const refined = (() => {
            if (!selState.modelBrand) return filteredByFuel;
            const [m, b] = String(selState.modelBrand).split('|');
            return filteredByFuel.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
          })();
          refined.forEach((n) => {
            const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
            if (!pbr) return;
            for (const [key, value] of Object.entries(pbr)) {
              const ids = String(key).split('|');
              if (ids.some((id) => String(id) === targetId)) {
                const num = Number(value);
                if (!Number.isNaN(num)) prices.push(num);
              }
            }
          });
          if (prices.length === 0) return livePrice;
          return Math.min(...prices);
        } catch {
          return livePrice;
        }
      })();

      return (
        <section key={lvl1.id} style={{
      marginBottom: 16,
      flex: "0 0 320px",       // same width for Two/Four/Commercial
      maxWidth: 340,
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
    }}
    className={activeServiceKey === serviceKey ? 'service-card-fade-out' : ''}
    >
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
            <h2
              style={{
                margin: 0,
                textTransform: 'Capitalize',
                fontSize: 18,
                fontWeight: 600,
                minHeight: 44,
                display: 'flex',
                alignItems: 'flex-end',
                whiteSpace: 'nowrap',
              }}
            >
              {lvl1.name}
            </h2>
            {lvl2Kids.length > 0 ? (
              <select
                value={String(selectedLvl2?.id || '')}
                onChange={(e) => {
                  const next = lvl2Kids.find((c) => String(c.id) === e.target.value) || lvl2Kids[0] || null;
                  // Compute cheapest defaults for Taxi (bodySeats, fuel, modelBrand) under new selection
                  const nextTargetId = String((selectedLvl3 || next || lvl1)?.id || '');
                  const mp = (list) => {
                    try {
                      const prices = [];
                      list.forEach((n) => {
                        const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
                        if (!pbr) return;
                        for (const [key, value] of Object.entries(pbr)) {
                          const ids = String(key).split('|');
                          if (ids.some((id) => String(id) === String(nextTargetId))) {
                            const num = Number(value);
                            if (!Number.isNaN(num)) prices.push(num);
                          }
                        }
                      });
                      if (prices.length === 0) return null;
                      return Math.min(...prices);
                    } catch { return null; }
                  };
                  const nextBodySeatsOptions = Array.from(new Set(normalizedForLvl1
                    .filter((n) => n.body && n.seats)
                    .map((n) => `${n.body}|${n.seats}`)));
                  const bodySeatsWithPrice2 = nextBodySeatsOptions.map((opt) => ({ opt, price: mp(
                    (pair => { const [b,s] = String(pair).split('|'); return normalizedForLvl1.filter((n) => String(n.body)===String(b||'') && String(n.seats)===String(s||'')); })(opt)
                  ) }));
                  bodySeatsWithPrice2.sort((a,b)=>{
                    const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                    const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                    return va - vb;
                  });
                  const bestBodySeats = bodySeatsWithPrice2[0]?.opt;
                  const listAfterBody = bestBodySeats ? ((pair)=>{ const [b,s]=String(pair).split('|'); return normalizedForLvl1.filter((n)=> String(n.body)===String(b||'') && String(n.seats)===String(s||'')); })(bestBodySeats) : normalizedForLvl1;
                  const fuelOpts2 = Array.from(new Set(listAfterBody.map((n)=>n.fuel).filter((v)=> v != null && String(v).trim()!=='')));
                  const fuelWithPrice2 = fuelOpts2.map((opt)=>({ opt, price: mp(listAfterBody.filter((n)=> String(n.fuel??'')===String(opt))) }));
                  fuelWithPrice2.sort((a,b)=>{
                    const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                    const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                    return va - vb;
                  });
                  const bestFuel = fuelWithPrice2[0]?.opt;
                  const listAfterFuel = bestFuel ? listAfterBody.filter((n)=> String(n.fuel??'')===String(bestFuel)) : listAfterBody;
                  const mbPairs2 = Array.from(new Set(listAfterFuel.filter((n)=> n.model && n.brand).map((n)=> `${n.model}|${n.brand}`)));
                  const mbWithPrice2 = mbPairs2.map((opt)=>{
                    const [m,b] = String(opt).split('|');
                    const lst = listAfterFuel.filter((n)=> String(n.model)===String(m||'') && String(n.brand)===String(b||''));
                    return { opt, price: mp(lst) };
                  });
                  mbWithPrice2.sort((a,b)=>{
                    const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                    const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                    return va - vb;
                  });
                  const bestModelBrand = mbWithPrice2[0]?.opt;

                  setTaxiSelections((prev) => ({
                    ...prev,
                    [lvl1.id]: {
                      lvl2: next?.id,
                      lvl3: (Array.isArray(next?.children) && next.children[0]?.id) || undefined,
                      bodySeats: bestBodySeats,
                      fuelType: bestFuel,
                      modelBrand: bestModelBrand,
                    },
                  }));
                }}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
              >
                {lvl2Kids.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
            ) : null}
          </div>

          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              padding: 20,
              background: '#D6EEDE',
              width: '100%',
              minHeight: 400,
              height: '100%',
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontFamily: 'Poppins, sans-serif',
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600 }}>{displayNode?.name}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              {(() => {
                try {
                  const targetId = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
                  const refinedForImages = (() => {
                    const list = filteredByFuel;
                    if (!selState.modelBrand) return list;
                    const [m, b] = String(selState.modelBrand).split('|');
                    return list.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
                  })();
                  // Build images: prefer inventory entry images, then rowImages, then imageUrl
                  let images = [];
                  refinedForImages.some((n) => {
                    const imgs = Array.isArray(n.entry?.images) ? n.entry.images : [];
                    if (imgs.length) { images = imgs.slice(0, 10); return true; }
                    return false;
                  });
                  if (!images.length) {
                    const rows = Array.isArray(vendor?.rowImages?.[targetId]) ? vendor.rowImages[targetId] : [];
                    if (rows.length) images = rows.slice(0, 10);
                  }
                  if (!images.length && displayNode?.imageUrl) images.push(displayNode.imageUrl);
                  // As a last resort, if no exact row images or inline image, try any rowImages from vendor
                  if (!images.length) {
                    try {
                      const all = vendor?.rowImages || {};
                      for (const k in all) {
                        const rows = Array.isArray(all[k]) ? all[k] : [];
                        if (rows.length) { images = images.concat(rows.slice(0, 10)); break; }
                      }
                    } catch {}
                  }
                  const normImgs = images.map((s) => {
                    const str = String(s);
                    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:')) return str;
                    return `${ASSET_BASE_URL}${str}`;
                  });
                  if (!normImgs.length) return <div />;
                  const idx = Number(invImgIdx[targetId] || 0) % normImgs.length;
                  return (
                    <div style={{ width: '100%', height: 140, borderRadius: 10, overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
                      <div style={{ display: 'flex', width: `${normImgs.length * 100}%`, height: '100%', transform: `translateX(-${idx * (100 / normImgs.length)}%)`, transition: 'transform 400ms ease' }}>
                        {normImgs.map((src, i) => (
                          <div key={i} style={{ width: `${100 / normImgs.length}%`, height: '100%', flex: '0 0 auto' }}>
                            <img src={src} alt={`img-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ))}
                      </div>
                      {normImgs.length > 1 ? (
                        <>
                          <button aria-label="Prev" onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: ((idx - 1 + normImgs.length) % normImgs.length) }))}
                            style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}>‹</button>
                          <button aria-label="Next" onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: ((idx + 1) % normImgs.length) }))}
                            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}>›</button>
                          <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', gap: 6, justifyContent: 'center' }}>
                            {normImgs.map((_, i) => (
                              <button key={i} onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: i }))} aria-label={`Go to ${i+1}`}
                                style={{ width: i===idx?8:6, height: i===idx?8:6, borderRadius: 999, border: 'none', background: i===idx ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }} />
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                } catch { return <div />; }
              })()}
              {attrAwarePrice != null ? (
                <div className="unified-price">₹ {attrAwarePrice}</div>
              ) : null}
            </div>

            {lvl3Kids.length > 0 ? uiRow('Options', (
              <select
                value={String(selectedLvl3?.id || '')}
                onChange={(e) => {
                  const next = lvl3Kids.find((c) => String(c.id) === e.target.value) || lvl3Kids[0] || null;
                  setTaxiSelections((prev) => ({
                    ...prev,
                    [lvl1.id]: { ...(prev[lvl1.id] || {}), lvl3: next?.id },
                  }));
                  setSelectedLeaf(next || selectedLvl2 || lvl1);
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
              >
                {lvl3Kids.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
            )) : null}

            {sortedBodySeatsOptions.length > 0 ? uiRow('Body Type + Seats', (
              <select
                value={String(selState.bodySeats || '')}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), bodySeats: val, fuelType: undefined, modelBrand: undefined } }));
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
              >
                <option value="">Any</option>
                {sortedBodySeatsOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt.replace('|', ' | ')}</option>
                ))}
              </select>
            )) : null}

            {sortedFuelOptions.length > 0 ? uiRow('Fuel Type', (
              <select
                value={String(selState.fuelType || '')}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), fuelType: val, modelBrand: undefined } }));
                }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13 }}
              >
                <option value="">Any</option>
                {sortedFuelOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )) : null}

            {sortedModelBrandOptions.length > 0 ? uiRow('Brand + Model', (
              <select
                value={String(selState.modelBrand || '')}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), modelBrand: val } }));
                }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13 }}
              >
                <option value="">Any</option>
                {sortedModelBrandOptions.map((opt) => {
                  const [model, brand] = String(opt).split('|');
                  return (
                    <option key={opt} value={opt}>{`${brand || ''} | ${model || ''}`.trim()}</option>
                  );
                })}
              </select>
            )) : null}

            <button
              onClick={() => alert(`Booking ${displayNode?.name}`)}
              style={{
                marginTop: 'auto',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 28,
                border: 'none',
                background: 'rgb(245 158 11)',
                color: '#111827',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Poppins, sans-serif',
              }}
            >
              Enroll Now
            </button>
          </div>
        </section>
      );
    })}
  </div>
);

}

  const minPriceInSubtree = (n) => {
    let best = null;
    const visit = (x) => {
      if (!x) return;
      const p = x.vendorPrice ?? x.price;
      if (p != null && (best == null || p < best)) best = p;
      if (Array.isArray(x.children) && x.children.length) x.children.forEach(visit);
    };
    visit(n);
    return best;
  };

  // Build simple inventory leaves under a subcategory for given families
  function makeLeavesForFamilies(famList, priceSeed, termsSeed, subNodeId) {
    try {
      const famSet = new Set(Array.isArray(famList) ? famList.map(String) : []);
      const list = (vendor?.inventorySelections?.[categoryId] || []).filter((e) => famSet.has(String(e?.scopeFamily || '')));
      const buckets = new Map(); // attrKey -> { name, price, terms }
      list.forEach((entry, idx) => {
        const sel = entry?.selections?.[entry?.scopeFamily] || {};
        const parts = Object.values(sel).filter((v) => v != null && String(v).trim() !== "");
        const name = parts.join(" ") || "Item";
        let leafPrice = null;
        try {
          const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
          if (pbr && subNodeId != null) {
            for (const [rk, val] of Object.entries(pbr)) {
              const ids = String(rk).split('|');
              if (ids.some((id) => String(id) === String(subNodeId))) {
                const n = Number(val);
                if (!Number.isNaN(n)) { leafPrice = n; break; }
              }
            }
          }
        } catch {}
        if (leafPrice == null && entry && entry.price != null && entry.price !== '') {
          const n = Number(entry.price);
          if (!Number.isNaN(n)) leafPrice = n;
        }
        if (leafPrice == null) leafPrice = priceSeed ?? null;

        // Build attribute key for grouping: stable key order
        try {
          const fam = String(entry?.scopeFamily || '');
          const kv = Object.entries(sel)
            .filter(([_, v]) => v != null && String(v).trim() !== '')
            .sort(([a], [b]) => String(a).localeCompare(String(b)))
            .map(([k, v]) => `${k}:${v}`)
            .join('|');
          const attrKey = `${fam}|${kv}`;
          const prev = buckets.get(attrKey);
          if (!prev || (prev.price == null || (leafPrice != null && leafPrice < prev.price))) {
            buckets.set(attrKey, { name, price: leafPrice, terms: termsSeed || "" });
          }
        } catch {
          // fallback: unique per entry
          const attrKey = `raw-${entry?.scopeFamily || 'fam'}-${entry?.at || idx}`;
          const prev = buckets.get(attrKey);
          if (!prev || (prev.price == null || (leafPrice != null && leafPrice < prev.price))) {
            buckets.set(attrKey, { name, price: leafPrice, terms: termsSeed || "" });
          }
        }
      });
      // Emit cheapest per attribute combo, sorted by price asc
      const out = Array.from(buckets.entries())
        .map(([key, v], i) => ({
          id: `inv-${key}-${i}`.replace(/\s+/g, '-'),
          name: v.name,
          children: [],
          vendorPrice: v.price,
          price: v.price,
          terms: v.terms,
        }))
        .sort((a, b) => {
          const pa = a.vendorPrice == null ? Number.POSITIVE_INFINITY : Number(a.vendorPrice);
          const pb = b.vendorPrice == null ? Number.POSITIVE_INFINITY : Number(b.vendorPrice);
          return pa - pb;
        });
      return out;
    } catch {
      return [];
    }
  }

  // Helper: deepest first child
  const deepestFirstChild = (n) => (!n?.children?.length ? n : deepestFirstChild(n.children[0]));

  const enrichNode = (node) => {
    const nodeId = String(node?.id || node?._id || "");
    const famsForNode = new Set([
      ...(familiesByTarget.get(nodeId) || new Set()),
      ...(familiesByTarget.get("ALL") || new Set()),
    ]);
    const famList = Array.from(famsForNode);

    const newChildren = Array.isArray(node?.children)
      ? node.children.map((c) => {
          const priceForC = minPriceInSubtree(c) ?? (c.vendorPrice ?? c.price) ?? null;
          const termsForC = c.terms ?? node.terms ?? "";
          const invLeaves = makeLeavesForFamilies(famList, priceForC, termsForC, c.id);
          const mergedChildren = Array.isArray(c.children) && c.children.length > 0
            ? [...c.children, ...invLeaves]
            : [...invLeaves];
          return { ...c, children: mergedChildren };
        })
      : [];

    return { ...node, children: newChildren };
  };

  // 🧠 First-level headings only (but hide heading if lvl1 has only flat children-as-cards)
  const renderedTree = root.children.map((lvl1) => {
    const enriched = enrichNode(lvl1);
    const children = Array.isArray(enriched?.children) ? enriched.children : [];
    const hasDeeperLevels = children.some((c) => Array.isArray(c?.children) && c.children.length > 0);

    const serviceKey = makeServiceKey(lvl1?.name);
    return (
      <section
        key={lvl1.id}
        id={serviceKey ? `service-${serviceKey}` : undefined}
        style={{ marginBottom: 16 }}
      >
        {hasDeeperLevels && (
          <h2
            style={{
              margin: "0 0 12px",
              textTransform: "Capitalize",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            {lvl1.name}
          </h2>
        )}
        <div
          className="first-level-card-row"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: 'stretch',
            justifyContent: 'center',
          }}
        >
          {(() => {
            const mapModeToDt = (m) => {
              const x = String(m || '').toLowerCase();
              if (x === 'card') return 'card';
              if (x === 'dropdown' || x === 'select') return 'dropdown';
              if (x === 'button' || x === 'buttons') return 'buttons';
              return null;
            };

            const renderNode = (child, parentNode) => {
              const pick = (arr) => Array.isArray(arr) && arr.length > 0 ? String(arr[0]).toLowerCase() : null;
              // Precedence: node.displayType -> parent.displayType -> root.displayType -> card
              let dt = pick(child?.displayType) || pick(parentNode?.displayType) || pick(lvl1?.displayType) || 'card';

              // Debug trace
              try {
                const id = child?.id || child?._id || '';
                const name = child?.name || '';
                console.log('[preview] layout', { id, name, resolvedDt: dt });
              } catch {}

              // Card: keep existing rich card behavior
              if (dt === 'card') {
                let livePrice = null;
                const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                for (const entry of priceRows) {
                  const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                  if (!pbr) continue;
                  for (const [key, value] of Object.entries(pbr)) {
                    const ids = String(key).split('|');
                    if (ids.some((id) => String(id) === String(child.id))) { livePrice = Number(value); break; }
                  }
                  if (livePrice != null) break;
                }
                if (livePrice == null) {
                  livePrice = vendor?.pricing?.[child.id] ?? vendor?.pricing?.[parentNode?.id] ?? child.vendorPrice ?? child.price ?? null;
                }
                const nodeWithLivePrice = { ...child, vendorPrice: livePrice, price: livePrice };
                return (
                  <ParentWithSizesCard
                    key={child.id}
                    node={nodeWithLivePrice}
                    selection={cardSelections[child.id]}
                    onSelectionChange={(parent, leaf) =>
                      setCardSelections((prev) => ({ ...prev, [child.id]: { parent, child: leaf } }))
                    }
                    onLeafSelect={(leaf) => setSelectedLeaf(leaf)}
                    mode={'buttons'}
                    includeLeafChildren={Boolean(child?.uiRules?.includeLeafChildren ?? true)}
                  />
                );
              }

              const kids = Array.isArray(child.children) ? child.children : [];
              if (kids.length === 0) {
                // Render standalone card with price/terms/image when a first-level child has no children
                let livePrice = null;
                try {
                  const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                  for (const entry of priceRows) {
                    const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                    if (!pbr) continue;
                    for (const [key, value] of Object.entries(pbr)) {
                      const ids = String(key).split('|');
                      if (ids.some((id) => String(id) === String(child.id))) { livePrice = Number(value); break; }
                    }
                    if (livePrice != null) break;
                  }
                } catch {}
                if (livePrice == null) {
                  livePrice = vendor?.pricing?.[child.id] ?? vendor?.pricing?.[parentNode?.id] ?? child.vendorPrice ?? child.price ?? null;
                }
                const imgSrc = (() => {
                  const s = String(child?.imageUrl || '');
                  if (!s) return null;
                  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
                  if (s.startsWith('/')) return `${ASSET_BASE_URL}${s}`;
                  return `${ASSET_BASE_URL}/${s}`;
                })();
                const termsRaw = child?.terms || '';
                const termsArr = Array.isArray(termsRaw)
                  ? termsRaw
                  : String(termsRaw || '')
                      .split(/\r?\n|,|;|\u2022/g)
                      .map((s) => s.trim())
                      .filter(Boolean);
                const terms = termsArr.join(', ');
                return (
                  <section key={child.id} style={{ flex: '1 1 320px', minWidth: 300 }}>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minHeight: 400, justifyContent: 'flex-start', height: '100%' }}>
                      <h3 style={{ margin: 0 }}>{child.name}</h3>
                      {imgSrc ? (
                        <img src={imgSrc} alt={child.name} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                      ) : null}
                      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {livePrice != null ? (
                          <div className="unified-price">₹{Number(livePrice)}</div>
                        ) : null}
                        {terms ? (
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{terms}</div>
                        ) : null}
                        <button
                          onClick={() => alert(`Booking ${child?.name}`)}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: 28, border: 'none', background: 'rgb(245 158 11)', color: '#111827', fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                        >
                          Enroll Now
                        </button>
                      </div>
                    </div>
                  </section>
                );
              }

              const selectedId = nodeSelections[child.id] || kids[0]?.id;
              const selected = kids.find((k) => String(k.id) === String(selectedId)) || kids[0];

              if (dt === 'buttons' || dt === 'button') {
                return (
                  <div key={child.id} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 260 }}>
                    <div style={{ fontWeight: 600 }}>{child.name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {kids.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setNodeSelections((p) => ({ ...p, [child.id]: opt.id }));
                            const leaf = deepestFirstChild(opt);
                            if (leaf) setSelectedLeaf(leaf);
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            border: String(selected?.id) === String(opt.id) ? '2px solid #2563eb' : '1px solid #d1d5db',
                            background: String(selected?.id) === String(opt.id) ? '#2563eb' : '#f9fafb',
                            color: String(selected?.id) === String(opt.id) ? '#fff' : '#111827',
                            cursor: 'pointer',
                            fontSize: 13,
                          }}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                    {selected ? renderNode(selected, child) : null}
                  </div>
                );
              }

              if (dt === 'dropdown' || dt === 'select') {
                return (
                  <div key={child.id} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 260 }}>
                    <div style={{ fontWeight: 600 }}>{child.name}</div>
                    <select
                      value={String(selected?.id || '')}
                      onChange={(e) => {
                        const next = kids.find((c) => String(c.id) === e.target.value) || kids[0];
                        setNodeSelections((p) => ({ ...p, [child.id]: next?.id }));
                        const leaf = deepestFirstChild(next);
                        if (leaf) setSelectedLeaf(leaf);
                      }}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
                    >
                      {kids.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                    {selected ? renderNode(selected, child) : null}
                  </div>
                );
              }

              // fallback to card if unknown
              return renderNode({ ...child, displayType: ['Card'] }, parentNode);
            };

            const kidsTop = Array.isArray(enriched.children) ? enriched.children : [];
            if (kidsTop.length === 0) {
              // Render the first-level node itself as a card (leaf L1)
              let livePrice = null;
              try {
                const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                for (const entry of priceRows) {
                  const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                  if (!pbr) continue;
                  for (const [key, value] of Object.entries(pbr)) {
                    const ids = String(key).split('|');
                    if (ids.some((id) => String(id) === String(enriched.id))) { livePrice = Number(value); break; }
                  }
                  if (livePrice != null) break;
                }
              } catch {}
              if (livePrice == null) {
                livePrice = vendor?.pricing?.[enriched.id] ?? vendor?.pricing?.[root?.id] ?? enriched.vendorPrice ?? enriched.price ?? null;
              }
              const imgSrc = (() => {
                const s = String(enriched?.imageUrl || '');
                if (!s) return null;
                if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
                if (s.startsWith('/')) return `${ASSET_BASE_URL}${s}`;
                return `${ASSET_BASE_URL}/${s}`;
              })();
              const termsRaw = enriched?.terms || '';
              const termsArr = Array.isArray(termsRaw) ? termsRaw : String(termsRaw || '')
                .split(/\r?\n|,|;|\u2022/g).map((s) => s.trim()).filter(Boolean);
              const terms = termsArr.join(', ');
              return [
                (
                  <section key={enriched.id} style={{ flex: '1 1 320px', minWidth: 300 }}>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minHeight: 400, justifyContent: 'flex-start', height: '100%' }}>
                      <h3 style={{ margin: 0 }}>{enriched.name}</h3>
                      {imgSrc ? (
                        <img src={imgSrc} alt={enriched.name} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                      ) : null}
                      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {livePrice != null ? (
                          <div className="unified-price">₹{Number(livePrice)}</div>
                        ) : null}
                        {terms ? (
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{terms}</div>
                        ) : null}
                        <button
                          onClick={() => alert(`Booking ${enriched?.name}`)}
                          style={{ width: '100%', padding: '10px 14px', borderRadius: 28, border: 'none', background: 'rgb(245 158 11)', color: '#111827', fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                        >
                          Enroll Now
                        </button>
                      </div>
                    </div>
                  </section>
                )
              ];
            }
            
            // If ALL children are leaves, render a single parent card with inline buttons (sizes)
            const allKidsAreLeaves = kidsTop.length > 0 && kidsTop.every((k) => !Array.isArray(k.children) || k.children.length === 0);
            if (allKidsAreLeaves) {
              let livePrice = null;
              try {
                const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                for (const entry of priceRows) {
                  const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                  if (!pbr) continue;
                  for (const [key, value] of Object.entries(pbr)) {
                    const ids = String(key).split('|');
                    if (ids.some((id) => String(id) === String(enriched.id))) { livePrice = Number(value); break; }
                  }
                  if (livePrice != null) break;
                }
              } catch {}
              if (livePrice == null) {
                livePrice = vendor?.pricing?.[enriched.id] ?? vendor?.pricing?.[root?.id] ?? enriched.vendorPrice ?? enriched.price ?? null;
              }
              const nodeWithLivePrice = { ...enriched, vendorPrice: livePrice, price: livePrice };
              return (
                <ParentWithSizesCard
                  key={`parent-${enriched.id}`}
                  node={nodeWithLivePrice}
                  selection={cardSelections[enriched.id]}
                  onSelectionChange={(parent, leaf) =>
                    setCardSelections((prev) => ({ ...prev, [enriched.id]: { parent, child: leaf } }))
                  }
                  onLeafSelect={(leaf) => setSelectedLeaf(leaf)}
                  mode={'buttons'}
                  includeLeafChildren={true}
                />
              );
            }

            // Sort children by minimum price in their subtree
            const sortedKids = [...kidsTop].sort((a, b) => {
              const pa = minPriceInSubtree(a);
              const pb = minPriceInSubtree(b);
              const va = pa == null ? Number.POSITIVE_INFINITY : Number(pa);
              const vb = pb == null ? Number.POSITIVE_INFINITY : Number(pb);
              return va - vb;
            });
            return sortedKids.map((child) => renderNode(child, enriched));
          })()}
        </div>
      </section>
    );
  });

  return renderedTree;
};

  const isDrivingSchool = String(categoryTree?.name || "").toLowerCase() === "driving school";

  return (
    <div id="preview-page" style={{ padding: 0, background: "#F0FDF4" }}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/redesignr.css?v=23" />
      </Head>
      {loading ? (
        <FullPageShimmer />
      ) : (
        <>
          <TopNavBar
            businessName={vendor?.businessName || "Loading..."}
            services={serviceLabels}
            categoryTree={categoryTree}
            selectedLeaf={selectedLeaf}
            onLeafSelect={setSelectedLeaf}
            hasPackages={Array.isArray(combos) && combos.length > 0}
            webMenu={webMenu}
            servicesNavLabel={servicesNavLabel}
          />
          <HomeSection
            businessName={vendor?.businessName || "Loading..."}
            profilePictures={vendor?.profilePictures || []}
            heroTitle={heroTitle || router?.query?.ft1 || vendor?.freeTexts?.[0] || vendor?.customFields?.freeText1 || vendor?.ui?.heroTitle}
            heroDescription={
              heroDescription ||
              router?.query?.ft2 ||
              vendor?.freeTexts?.[1] ||
              vendor?.customFields?.freeText2 ||
              vendor?.ui?.heroDescription
            }
            homePopup={homePopup}
            vendorAddonTitle={vendorAddonTitle}
            vendorAddonDescription={vendorAddonDescription}
          />
          <main id="products" style={{ padding: "20px", marginTop: "10px" }}>
            {Array.isArray(combos) && combos.length > 0 ? (
              <section style={{ marginBottom: 8 }}>
                {isDrivingSchool ? (
                  <div style={{ textAlign: "center", marginBottom: 16, fontFamily: "Poppins, sans-serif"   }}>
                    <h2 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>Explore Our Driving Packages</h2>
                    <p style={{ margin: "6px 0 0", fontSize: 18, color: "#4b5563" }}>
                      Comprehensive bundles designed to give you the best value and a complete learning experience.
                    </p>
                  </div>
                ) : null}
                {/* <h2 style={{ margin: '0 0 10px 0' }}>Packages</h2> */}
                <div
                  className="combos-card-row"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: "16px",
                    alignItems: 'stretch',
                    justifyContent: 'center',
                  }}
                >
                  {combos.map((combo, idx) => {
                    const name = combo?.name || 'Package';
                    // Be very tolerant about where the combo image might live
                    const comboImageCandidates = (() => {
                      try {
                        const out = [];
                        const push = (v) => { if (v) out.push(v); };
                        push(combo?.imageUrl);
                        push(combo?.image);
                        if (Array.isArray(combo?.images)) combo.images.forEach(push);
                        if (Array.isArray(combo?.imageUrls)) combo.imageUrls.forEach(push);
                        if (Array.isArray(combo?.photos)) combo.photos.forEach(push);
                        if (Array.isArray(combo?.pictures)) combo.pictures.forEach(push);
                        return out;
                      } catch { return []; }
                    })();
                    const img = comboImageCandidates.find((v) => v) || null;
                    const items = Array.isArray(combo?.items) ? combo.items : [];
                    const perSizeArr = Array.isArray(combo?.perSize) ? combo.perSize : [];
                    // Compute best price from variants across items, fallback to basePrice
                    let variantPrices = [];
                    try {
                      items.forEach((it) => {
                        const vs = Array.isArray(it?.variants) ? it.variants : [];
                        vs.forEach((v) => {
                          const p = v?.price;
                          if (p !== undefined && p !== null && String(p) !== '' && !Number.isNaN(Number(p))) {
                            variantPrices.push(Number(p));
                          }
                        });
                      });
                    } catch {}
                    // Build includes label from parent services (Step 2 selections)
                    const includesLabel = (() => {
                      try {
                        const pickId = (n) => String(n?.id || n?._id || '');
                        const findParentName = (node, targetId, parentName = '') => {
                          if (!node) return '';
                          const id = pickId(node);
                          if (id === String(targetId)) return parentName || '';
                          const children = Array.isArray(node.children) ? node.children : [];
                          for (const ch of children) {
                            const res = findParentName(ch, targetId, node?.name || parentName || '');
                            if (res) return res;
                          }
                          return '';
                        };
                        const seen = new Set();
                        const names = [];
                        items.forEach((it) => {
                          let nm = '';
                          if (it?.kind === 'custom') nm = it?.name || 'Custom';
                          else if (it?.categoryId) {
                            const pidName = findParentName(categoryTree, String(it.categoryId));
                            nm = pidName || 'Service';
                          }
                          nm = String(nm || '').trim();
                          const key = nm.toLowerCase();
                          if (nm && !seen.has(key)) { seen.add(key); names.push(nm); }
                        });
                        return names.join(', ');
                      } catch { return ''; }
                    })();
                    const sizes = (() => {
                      try {
                        const set = new Set();
                        items.forEach((it) => {
                          const vs = Array.isArray(it?.variants) ? it.variants : [];
                          if (vs.length === 0) set.add('—');
                          vs.forEach((v) => set.add(v?.size || '—'));
                        });
                        return Array.from(set);
                      } catch { return []; }
                    })();
                    const base = (combo && combo.basePrice != null && combo.basePrice !== '') ? Number(combo.basePrice) : null;
                    const selectedSize = (packageSelections[idx]?.size != null) ? packageSelections[idx].size : (sizes[0] ?? null);
                    const priceBySize = (() => {
                      try {
                        if (!selectedSize) return null;
                        const prices = [];
                        items.forEach((it) => {
                          const vs = Array.isArray(it?.variants) ? it.variants : [];
                          vs.forEach((v) => {
                            const match = (v?.size || '—') === selectedSize;
                            if (match) {
                              const p = v?.price;
                              if (p !== undefined && p !== null && String(p) !== '' && !Number.isNaN(Number(p))) prices.push(Number(p));
                            }
                          });
                        });
                        if (prices.length) return Math.min(...prices);
                        return null;
                      } catch { return null; }
                    })();
                    const bestVar = variantPrices.length ? Math.min(...variantPrices) : null;
                    const price = (priceBySize != null ? priceBySize : (bestVar != null ? bestVar : base));
                    const priceNode = (price != null && !Number.isNaN(price)) ? (
                      <div
                        className="font-extrabold text-emerald-600 unified-price"
                        style={{ marginBottom: 8, fontSize: 16, textAlign: 'center' }}
                      >
                        ₹{price}
                      </div>
                    ) : null;
                    const termsRaw = combo?.terms || combo?.term || '';
                    const termsArr = Array.isArray(termsRaw)
                      ? termsRaw
                      : String(termsRaw || '')
                          .split(/\r?\n|,|;|\u2022/g)
                          .map((s) => s.trim())
                          .filter(Boolean);
                    const terms = termsArr.join(', ');
                    const imgSrc = (() => {
                      const isValidImg = (val) => {
                        if (!val) return false;
                        const s = String(val || '');
                        if (!s) return false;
                        // Ignore broken dummy upload paths
                        if (s.includes('/uploads/undefined')) return false;
                        return true;
                      };

                      const normalize = (val) => {
                        const s = String(val || '');
                        if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
                        if (s.startsWith('/')) return `${ASSET_BASE_URL}${s}`;
                        return `${ASSET_BASE_URL}/${s}`;
                      };

                      // 1) Try perSize entry for the selected size
                      try {
                        if (selectedSize && perSizeArr.length) {
                          const ps = perSizeArr.find((p) => String(p?.size || '') === String(selectedSize));
                          if (ps && isValidImg(ps.imageUrl || ps.iconUrl)) {
                            return normalize(ps.imageUrl || ps.iconUrl);
                          }
                        }
                      } catch {}

                      // 2) Try combo-level images (icon/image)
                      try {
                        const direct = combo?.imageUrl || combo?.iconUrl;
                        if (isValidImg(direct)) return normalize(direct);
                      } catch {}

                      // 3) Try any good variant/image on items, prioritising selectedSize
                      try {
                        const pickVariantImg = (preferSize) => {
                          for (const it of items) {
                            const vs = Array.isArray(it?.variants) ? it.variants : [];
                            for (const v of vs) {
                              if (preferSize && String(v?.size || '—') !== String(preferSize)) continue;
                              const cand = v?.imageUrl || v?.image || it?.imageUrl || it?.image;
                              if (isValidImg(cand)) return normalize(cand);
                            }
                          }
                          return null;
                        };

                        // First: exact selected size
                        if (selectedSize) {
                          const fromSelected = pickVariantImg(selectedSize);
                          if (fromSelected) return fromSelected;
                        }

                        // Then: any good variant image
                        const anyVariant = pickVariantImg(null);
                        if (anyVariant) return anyVariant;
                      } catch {}

                      // 4) Fallback to any combo-level candidate (supports multiple uploads)
                      const cand = comboImageCandidates.find((v) => isValidImg(v)) || null;
                      if (!cand) return null;
                      return normalize(cand);
                    })();
                    return (
                      <section key={`pkg-${idx}`} style={{ flex: '1 1 320px', minWidth: 300, marginBottom: 0 }}>
                        <div
                          style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: 12,
                            padding: 16,
                            background: '#D6EEDE',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            width: '100%',
                            minHeight: 420,
                            height: '100%',
                            justifyContent: 'flex-start',
                          }}
                        >
                          <h2 style={{ margin: 0, textAlign: 'center', fontSize: 30, fontWeight: 600 }}>{name}</h2>
                          {imgSrc ? (
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <img
                                src={imgSrc}
                                alt={name}
                                style={{ width: '100%', maxWidth: 260, height: 160, objectFit: 'cover', borderRadius: 12 }}
                              />
                            </div>
                          ) : null}
                          {priceNode}
                          {includesLabel ? (
                            <div style={{ fontSize: 16, color: '#374151' }}>
                              <span style={{ fontWeight: 600 }}>Includes: </span>
                              <span>{includesLabel}</span>
                            </div>
                          ) : null}
                          {termsArr.length ? (
                            <ul style={{ margin: 0, paddingLeft: 18, color: '#6b7280', fontSize: 12 }}>
                              {termsArr.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          ) : null}
                          {/* Size selector */}
                          {sizes && sizes.length ? (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 400, color: "#111827", marginBottom: 6, fontFamily: 'Poppins' }}>
                                {isDrivingSchool && idx === 0
                                  ? 'Select vehicle type'
                                  : isDrivingSchool && idx === 1
                                  ? 'Select combo type'
                                  : 'Size'}
                              </div>
                              <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setComboSizeDropdownOpen((prev) => {
                                      const current = prev && prev[idx];
                                      return { ...(prev || {}), [idx]: !current };
                                    })
                                  }
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    minWidth: 220,
                                    padding: '10px 16px',
                                    borderRadius: 999,
                                    border: '1px solid rgba(148, 163, 184, 0.9)',
                                    background: '#ffffff',
                                    color: '#111827',
                                    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.18)',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    letterSpacing: 0.2,
                                    transition: 'transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.28)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.18)';
                                  }}
                                >
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {selectedSize || 'Select size'}
                                  </span>
                                  <span style={{ fontSize: 20, lineHeight: 1 }}>▾</span>
                                </button>

                                {!!comboSizeDropdownOpen?.[idx] && (
                                  <div
                                    style={{
                                      marginTop: 8,
                                      zIndex: 1,
                                      width: '100%',
                                      maxHeight: '45vh',
                                      overflowY: 'auto',
                                      padding: 8,
                                      borderRadius: 14,
                                      background: 'rgba(255, 255, 255, 0.98)',
                                      boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
                                      overscrollBehavior: 'contain',
                                    }}
                                  >
                                    {sizes.map((s) => {
                                      const value = String(s || '');
                                      return (
                                        <button
                                          key={value}
                                          type="button"
                                          onClick={() => {
                                            setPackageSelections((prev) => ({
                                              ...prev,
                                              [idx]: { ...(prev[idx] || {}), size: value },
                                            }));
                                            setComboSizeDropdownOpen((prev) => ({ ...(prev || {}), [idx]: false }));
                                          }}
                                          style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '8px 10px',
                                            marginBottom: 4,
                                            borderRadius: 10,
                                            border: '1px solid rgba(148, 163, 184, 0.8)',
                                            background: value === String(selectedSize || '') ? '#e5f0ff' : '#ffffff',
                                            color: '#0f172a',
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            transition: 'background 140ms ease, transform 140ms ease, box-shadow 140ms ease',
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#e5f0ff';
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.18)';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.background = value === String(selectedSize || '') ? '#e5f0ff' : '#ffffff';
                                            e.currentTarget.style.boxShadow = 'none';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                          }}
                                        >
                                          <span
                                            style={{
                                              display: 'block',
                                              whiteSpace: 'nowrap',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              fontWeight: 600,
                                            }}
                                          >
                                            {s}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                          <button
                            onClick={() => alert(`Booking ${name}`)}
                            style={{
                              marginTop: 'auto',
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: 28,
                              border: 'none',
                              background: 'rgb(245 158 11)',
                              color: '#111827',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Enroll Now
                          </button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {/* <h2 style={{ margin: '0', padding: '0 0 10px 0' }}>Individuals</h2> */}
            {isDrivingSchool ? (
              <div style={{ textAlign: "center", marginBottom: 20, fontFamily: "Poppins, sans-serif" }}>
                <h2 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>Individual Driving Courses</h2>
                <p style={{ margin: "6px 0 0", fontSize: 18, color: "#4b5563" }}>
                  Choose specialized training for specific vehicle types, with or without a license.
                </p>
              </div>
            ) : null}
            {renderTree(categoryTree)}
          </main>
          <BenefitsSection
            categoryName={String(categoryTree?.name || "").toLowerCase()}
            businessName={vendor?.businessName}
          />
          <AboutSection
            categoryName={String(categoryTree?.name || "").toLowerCase()}
            businessName={vendor?.businessName}
          />
          <ContactSection
            contactNumber={vendor?.customerId?.fullNumber || vendor?.phone || "-"}
            location={location}
            vendorId={vendorId}
            businessHours={vendor?.businessHours || []}
            onLocationUpdate={(newLoc) => {
              setLocation(newLoc);
              setVendor((prev) => ({ ...prev, location: newLoc }));
            }}
          />
          <Footer
            businessName={vendor?.businessName}
            categoryName={categoryTree?.name || "Driving School"}
            navLinks={[
              { label: "Home", href: "#home" },
              { label: "Our Services", href: "#products" },
              { label: "Why Us", href: "#benefits" },
              { label: "About", href: "#about" },
              { label: "Contact", href: "#contact" },
            ]}
            popularCourses={serviceLabels}
            reachUs={{
              phone: vendor?.customerId?.fullNumber || vendor?.phone || "-",
              address:
                location
                  ? (() => {
                      try {
                        const loc = location || {};
                        const primary = (loc.areaCity || "").trim();
                        if (primary) return primary;

                        const text = [
                          loc.area,
                          loc.city,
                          loc.address,
                          loc.addressLine1,
                        ]
                          .map((v) => (v || "").trim())
                          .filter(Boolean)
                          .join(", ");
                        if (text) return text;

                        const plat = Number(loc.lat);
                        const plng = Number(loc.lng);
                        if (Number.isFinite(plat) && Number.isFinite(plng)) {
                          return `${plat.toFixed(4)}, ${plng.toFixed(4)}`;
                        }
                        return "-";
                      } catch {
                        return "-";
                      }
                    })()
                  : "-",
              hours: (vendor?.businessHours && vendor.businessHours[0]?.hours) ||
                "Mon-Fri: 8:00 AM - 8:00 PM",
            }}
          />
        </>
      )}
    </div>
  );
}
