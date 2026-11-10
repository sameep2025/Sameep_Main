"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import {
  formatPrepaidActivityValue,
  getPrepaidActivityPresentation,
} from "./prepaidActivityPresentation.mjs";
import { getMembershipRenewalAvailability } from "./membershipRenewalUi.mjs";
import "./MembershipPlansDashboard.css";

const DURATION_OPTIONS = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half yearly" },
  { value: "ANNUAL", label: "Annual" },
];

const PAYMENT_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "ONLINE", label: "Online" },
];

const PLAN_TYPE_OPTIONS = [
  {
    value: "DISCOUNT",
    label: "Discount Membership",
    description: "Offer special discounts on eligible services",
    example: "20% off on services",
  },
  {
    value: "PREPAID_VALUE",
    label: "Prepaid Wallet",
    description: "Collect payment upfront and offer additional wallet value",
    example: "Pay ₹5,000, get ₹6,500",
  },
  {
    value: "PREPAID_SESSIONS",
    label: "Prepaid Packages",
    description: "Collect payment upfront for a fixed number of services",
    example: "5 facials for ₹3,000",
  },
];

const EMPTY_FORM = {
  planType: "DISCOUNT",
  name: "",
  description: "",
  duration: "MONTHLY",
  sellingPrice: "",
  discountPercentage: "",
  eligibleMenuItemIds: [],
  minimumBillAmount: "",
  allowAdditionalDiscountOnMembershipItems: false,
  allowRewardsOnMembershipItems: false,
  prepaidValue: "",
  eligibleItemId: "",
  eligibleItemSource: "",
  paidQuantity: "",
  creditedQuantity: "",
};

const EMPTY_ACTIVATION_FORM = {
  customerMobile: "",
  membershipPlanId: "",
  paymentMethod: "CASH",
  paymentReference: "",
  paymentAmount: "",
  idempotencyKey: "",
};

const EMPTY_RENEWAL_FORM = {
  paymentMethod: "CASH",
  paymentReference: "",
  paymentAmount: "",
  idempotencyKey: "",
};

const SERVICE_SCOPE_OPTIONS = {
  ALL_ACTIVE_AND_SCHEDULED: "ALL_ACTIVE_AND_SCHEDULED",
  FUTURE_ONLY: "FUTURE_ONLY",
};

const BENEFIT_SCOPE_OPTIONS = SERVICE_SCOPE_OPTIONS;

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `₹${amount.toLocaleString("en-IN", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  })}`;
}

function formatPaise(value) {
  return formatCurrency(Number(value || 0) / 100);
}

function normalizePlanType(value) {
  return String(value || "").trim().toUpperCase() || "DISCOUNT";
}

function formatPlanType(value) {
  const normalized = normalizePlanType(value);
  return PLAN_TYPE_OPTIONS.find((option) => option.value === normalized)?.label || normalized;
}

function createIdempotencyKey(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function formatDuration(value) {
  return DURATION_OPTIONS.find((option) => option.value === value)?.label || value || "-";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCustomerIdentity(name, mobile) {
  const cleanName = String(name || "").trim();
  const cleanMobile = String(mobile || "").trim();
  return cleanName ? `${cleanName} · ${cleanMobile}` : cleanMobile;
}

function addCalendarMonths(date, months) {
  const target = new Date(date.getTime());
  const originalDay = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(originalDay, lastDay));
  return target;
}

function calculateDisplayExpiry(duration, startDate = new Date()) {
  const monthsByDuration = {
    MONTHLY: 1,
    QUARTERLY: 3,
    HALF_YEARLY: 6,
    ANNUAL: 12,
  };
  const months = monthsByDuration[duration];
  return months ? addCalendarMonths(startDate, months) : null;
}

function normalizeFormFromPlan(plan) {
  const planType = normalizePlanType(plan?.planType);
  return {
    planType,
    name: plan?.name || "",
    description: plan?.description || "",
    duration: plan?.duration || "MONTHLY",
    sellingPrice: String(plan?.sellingPrice ?? ""),
    discountPercentage: String(plan?.discountPercentage ?? ""),
    eligibleMenuItemIds: Array.isArray(plan?.eligibleMenuItemIds)
      ? plan.eligibleMenuItemIds.map(String)
      : [],
    minimumBillAmount: String(plan?.minimumBillAmount ?? ""),
    allowAdditionalDiscountOnMembershipItems: plan?.allowAdditionalDiscountOnMembershipItems === true,
    allowRewardsOnMembershipItems: plan?.allowRewardsOnMembershipItems === true,
    prepaidValue: String(plan?.prepaidValueConfig?.prepaidValue ?? ""),
    eligibleItemId: String(plan?.prepaidSessionsConfig?.eligibleItemId ?? ""),
    eligibleItemSource: String(plan?.prepaidSessionsConfig?.eligibleItemSource ?? ""),
    paidQuantity: String(plan?.prepaidSessionsConfig?.paidQuantity ?? ""),
    creditedQuantity: String(plan?.prepaidSessionsConfig?.creditedQuantity ?? ""),
  };
}

function buildPlanPayload(form) {
  if (form.planType === "PREPAID_VALUE") {
    const sellingPrice = Number(form.sellingPrice || 0);
    const prepaidValue = Number(form.prepaidValue || 0);
    return {
      planType: form.planType,
      name: form.name.trim(),
      description: form.description.trim(),
      duration: form.duration,
      sellingPrice,
      prepaidValueConfig: {
        prepaidValue,
        bonusValue: Math.round((prepaidValue - sellingPrice) * 100) / 100,
      },
    };
  }
  if (form.planType === "PREPAID_SESSIONS") {
    return {
      planType: form.planType,
      name: form.name.trim(),
      description: form.description.trim(),
      duration: form.duration,
      sellingPrice: Number(form.sellingPrice || 0),
      prepaidSessionsConfig: {
        eligibleItemId: form.eligibleItemId,
        eligibleItemSource: form.eligibleItemSource,
        paidQuantity: Number(form.paidQuantity),
        creditedQuantity: Number(form.creditedQuantity),
      },
    };
  }
  return {
    planType: "DISCOUNT",
    name: form.name.trim(),
    description: form.description.trim(),
    duration: form.duration,
    sellingPrice: Number(form.sellingPrice || 0),
    discountPercentage: Number(form.discountPercentage || 0),
    eligibleMenuItemIds: form.eligibleMenuItemIds,
    minimumBillAmount: Number(form.minimumBillAmount || 0),
    allowAdditionalDiscountOnMembershipItems: form.allowAdditionalDiscountOnMembershipItems,
    allowRewardsOnMembershipItems: form.allowRewardsOnMembershipItems,
  };
}

function sameStringSet(left = [], right = []) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right.map(String));
  return left.map(String).every((value) => rightSet.has(value));
}

function collectBillableIds(nodes = []) {
  const ids = [];

  function walk(node) {
    if (node?.isBillable) ids.push(String(node.id));
    (node?.children || []).forEach(walk);
  }

  nodes.forEach(walk);
  return ids;
}

function collectExpandableIds(nodes = []) {
  const ids = [];

  function walk(node) {
    if ((node?.children || []).length > 0) ids.push(String(node.id));
    (node?.children || []).forEach(walk);
  }

  nodes.forEach(walk);
  return ids;
}

function buildFallbackTree(items = []) {
  return [
    {
      id: "membership:fallback-root",
      name: "Eligible Services",
      isBillable: false,
      eligibleDescendantCount: items.length,
      children: items.map((item) => ({
        id: String(item.id),
        sourceType: item.sourceType,
        name: item.name || "Unnamed item",
        price: Number(item.price || 0),
        status: item.status || "",
        path: Array.isArray(item.path) ? item.path : [],
        isLeaf: true,
        isBillable: true,
        eligibleDescendantCount: 1,
        children: [],
      })),
    },
  ];
}

function getPrepaidItemKey(item = {}) {
  return `${item.itemSource || ""}:${item.itemId || ""}`;
}

function buildPrepaidEligibleTree(items = []) {
  const roots = [];
  const groups = new Map();

  items.forEach((item) => {
    const itemName = String(item?.name || "Unnamed item").trim();
    const rawPath = Array.isArray(item?.categoryPath)
      ? item.categoryPath.map((part) => String(part || "").trim()).filter(Boolean)
      : [];
    const categoryPath = rawPath[rawPath.length - 1]?.toLowerCase() === itemName.toLowerCase()
      ? rawPath.slice(0, -1)
      : rawPath;
    const categories = categoryPath.length > 0
      ? categoryPath
      : [item?.itemKind === "PACKAGE" ? "Packages" : "Services"];
    let children = roots;
    let parentKey = "";

    categories.forEach((category) => {
      const groupKey = `${parentKey}/${category.toLowerCase()}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          id: `prepaid-group:${groupKey}`,
          name: category,
          isBillable: false,
          children: [],
        };
        groups.set(groupKey, group);
        children.push(group);
      }
      children = group.children;
      parentKey = groupKey;
    });

    children.push({
      id: getPrepaidItemKey(item),
      sourceType: item.itemSource,
      name: itemName,
      price: Number(item.price || 0),
      path: rawPath,
      isLeaf: true,
      isBillable: true,
      itemKind: item.itemKind,
      prepaidItem: item,
      children: [],
    });
  });

  const addCounts = (nodes) => nodes.map((node) => {
    const children = addCounts(node.children || []);
    return {
      ...node,
      children,
      eligibleDescendantCount: node.isBillable
        ? 1
        : children.reduce((total, child) => total + child.eligibleDescendantCount, 0),
    };
  });

  return addCounts(roots);
}

function nodeMatchesSearch(node, query) {
  if (!query) return true;
  const haystack = [
    node?.name,
    ...(Array.isArray(node?.path) ? node.path : []),
    node?.sourceType,
    node?.itemKind,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function filterTreeBySearch(nodes = [], rawQuery = "") {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return nodes;

  return nodes
    .map((node) => {
      const children = filterTreeBySearch(node.children || [], rawQuery);
      if (nodeMatchesSearch(node, query) || children.length > 0) {
        return { ...node, children };
      }
      return null;
    })
    .filter(Boolean);
}

function TreeCheckbox({ checked, indeterminate, onChange, ariaLabel }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={ariaLabel}
      ref={(element) => {
        if (element) element.indeterminate = indeterminate;
      }}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function MembershipMenuTreeNode({
  node,
  depth,
  expandedIds,
  selectedIds,
  onToggleExpand,
  onSetSelection,
  forceExpanded,
  selectionMode = "multiple",
  onSelectItem,
}) {
  const children = Array.isArray(node.children) ? node.children : [];
  const hasChildren = children.length > 0;
  const billableIds = useMemo(() => collectBillableIds([node]), [node]);
  const selectedCount = billableIds.filter((id) => selectedIds.has(id)).length;
  const checked = billableIds.length > 0 && selectedCount === billableIds.length;
  const indeterminate = selectedCount > 0 && selectedCount < billableIds.length;
  const isExpanded = forceExpanded || expandedIds.has(String(node.id));
  const isLeafBenefit = node.isBillable === true;
  const isSingleSelection = selectionMode === "single";
  const isSelectedSingleItem = isSingleSelection && selectedIds.has(String(node.id));

  return (
    <div className="membership-tree-node">
      <div
        className={`membership-tree-row ${isSelectedSingleItem ? "single-selected" : ""}`}
        style={{ "--membership-tree-depth": depth }}
      >
        <button
          type="button"
          className={`membership-tree-expander ${hasChildren ? "" : "empty"}`}
          onClick={() => hasChildren && onToggleExpand(node.id)}
          aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
        >
          {hasChildren ? (isExpanded ? "−" : "+") : ""}
        </button>
        {isSingleSelection ? (
          isLeafBenefit ? (
            <input
              type="radio"
              name="prepaidEligibleItem"
              checked={selectedIds.has(String(node.id))}
              aria-label={`Select ${node.name}`}
              onChange={() => onSelectItem(node.prepaidItem)}
            />
          ) : (
            <span className="membership-tree-selection-placeholder" aria-hidden="true" />
          )
        ) : (
          <TreeCheckbox
            checked={checked}
            indeterminate={indeterminate}
            ariaLabel={`Select ${node.name}`}
            onChange={(nextChecked) => onSetSelection(billableIds, nextChecked)}
          />
        )}
        <div className="membership-tree-label">
          <strong>{node.name || "Unnamed item"}</strong>
          <small>
            {isLeafBenefit ? formatCurrency(node.price) : `${billableIds.length} eligible item${billableIds.length === 1 ? "" : "s"}`}
          </small>
        </div>
        <span className={`membership-tree-type ${isLeafBenefit ? "leaf" : ""}`}>
          {isLeafBenefit ? (node.itemKind || "Service") : "Group"}
        </span>
      </div>

      {hasChildren && isExpanded && (
        <div className="membership-tree-children">
          {children.map((child) => (
            <MembershipMenuTreeNode
              key={`${child.sourceType || "node"}:${child.id}`}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              selectedIds={selectedIds}
              onToggleExpand={onToggleExpand}
              onSetSelection={onSetSelection}
              forceExpanded={forceExpanded}
              selectionMode={selectionMode}
              onSelectItem={onSelectItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MembershipPlansDashboard({ vendorId }) {
  const [plans, setPlans] = useState([]);
  const [customerMemberships, setCustomerMemberships] = useState([]);
  const [eligibleItems, setEligibleItems] = useState([]);
  const [eligibleTree, setEligibleTree] = useState([]);
  const [prepaidEligibleItems, setPrepaidEligibleItems] = useState([]);
  const [prepaidEligibilityRejectedCount, setPrepaidEligibilityRejectedCount] = useState(0);
  const [prepaidItemSearch, setPrepaidItemSearch] = useState("");
  const [prepaidCapabilityEnabled, setPrepaidCapabilityEnabled] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [baselineForm, setBaselineForm] = useState(EMPTY_FORM);
  const [editingPlanId, setEditingPlanId] = useState("");
  const [originalEditingItemIds, setOriginalEditingItemIds] = useState([]);
  const [serviceEligibilityScope, setServiceEligibilityScope] = useState(
    ""
  );
  const [benefitRulesScope, setBenefitRulesScope] = useState(
    BENEFIT_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED
  );
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isServiceScopeConfirmOpen, setIsServiceScopeConfirmOpen] = useState(false);
  const [editorView, setEditorView] = useState("details");
  const [isActivationOpen, setIsActivationOpen] = useState(false);
  const [activationForm, setActivationForm] = useState(EMPTY_ACTIVATION_FORM);
  const [activationBaselineForm, setActivationBaselineForm] = useState(EMPTY_ACTIVATION_FORM);
  const [activationCustomerLookup, setActivationCustomerLookup] = useState(null);
  const [activationSaving, setActivationSaving] = useState(false);
  const [activationLookupLoading, setActivationLookupLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [serviceSearch, setServiceSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusChangingId, setStatusChangingId] = useState("");
  const [activeView, setActiveView] = useState("home");
  const [membershipSearch, setMembershipSearch] = useState("");
  const [membershipStatusFilter, setMembershipStatusFilter] = useState("ALL");
  const [membershipSort, setMembershipSort] = useState("newest");
  const [membershipPage, setMembershipPage] = useState(1);
  const [membershipPagination, setMembershipPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    hasMore: false,
  });
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [plansLoadError, setPlansLoadError] = useState("");
  const [membershipsLoadError, setMembershipsLoadError] = useState("");
  const [selectedMembership, setSelectedMembership] = useState(null);
  const [selectedMembershipHistory, setSelectedMembershipHistory] = useState([]);
  const [selectedMembershipWallet, setSelectedMembershipWallet] = useState(null);
  const [selectedMembershipLedger, setSelectedMembershipLedger] = useState([]);
  const [detailServiceSearch, setDetailServiceSearch] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [renewalMembership, setRenewalMembership] = useState(null);
  const [renewalForm, setRenewalForm] = useState(EMPTY_RENEWAL_FORM);
  const [renewalSaving, setRenewalSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const saveInFlightRef = useRef(false);

  const allEligibleItemIds = useMemo(
    () => eligibleItems.map((item) => String(item.id)),
    [eligibleItems]
  );
  const selectedIdSet = useMemo(
    () => new Set(form.eligibleMenuItemIds.map(String)),
    [form.eligibleMenuItemIds]
  );
  const visibleTree = useMemo(
    () => filterTreeBySearch(eligibleTree, serviceSearch),
    [eligibleTree, serviceSearch]
  );
  const visibleItemCount = useMemo(
    () => collectBillableIds(visibleTree).length,
    [visibleTree]
  );
  const unavailableSelectedIds = useMemo(() => {
    const activeIds = new Set(allEligibleItemIds);
    return form.eligibleMenuItemIds.filter((id) => !activeIds.has(String(id)));
  }, [allEligibleItemIds, form.eligibleMenuItemIds]);
  const eligibleServicesChanged = useMemo(
    () => Boolean(editingPlanId) && !sameStringSet(form.eligibleMenuItemIds, originalEditingItemIds),
    [editingPlanId, form.eligibleMenuItemIds, originalEditingItemIds]
  );
  const removedEligibleServiceCount = useMemo(() => {
    if (!eligibleServicesChanged) return 0;
    const selected = new Set(form.eligibleMenuItemIds.map(String));
    return originalEditingItemIds.filter((id) => !selected.has(String(id))).length;
  }, [eligibleServicesChanged, form.eligibleMenuItemIds, originalEditingItemIds]);
  const benefitRulesChanged = useMemo(
    () => Boolean(editingPlanId) && (
      form.allowAdditionalDiscountOnMembershipItems !==
        baselineForm.allowAdditionalDiscountOnMembershipItems ||
      form.allowRewardsOnMembershipItems !== baselineForm.allowRewardsOnMembershipItems
    ),
    [baselineForm, editingPlanId, form]
  );
  const selectedEligibleServices = useMemo(
    () => Array.isArray(selectedMembership?.eligibleServices)
      ? selectedMembership.eligibleServices
      : [],
    [selectedMembership]
  );
  const selectedPrepaidItem = useMemo(
    () => prepaidEligibleItems.find((item) =>
      String(item.itemId) === String(form.eligibleItemId) &&
      item.itemSource === form.eligibleItemSource
    ) || null,
    [form.eligibleItemId, form.eligibleItemSource, prepaidEligibleItems]
  );
  const prepaidEligibleTree = useMemo(
    () => buildPrepaidEligibleTree(prepaidEligibleItems),
    [prepaidEligibleItems]
  );
  const visiblePrepaidTree = useMemo(
    () => filterTreeBySearch(prepaidEligibleTree, prepaidItemSearch),
    [prepaidEligibleTree, prepaidItemSearch]
  );
  const visiblePrepaidItemCount = useMemo(
    () => collectBillableIds(visiblePrepaidTree).length,
    [visiblePrepaidTree]
  );
  const selectedPrepaidItemKeys = useMemo(
    () => new Set(form.eligibleItemId
      ? [`${form.eligibleItemSource}:${form.eligibleItemId}`]
      : []),
    [form.eligibleItemId, form.eligibleItemSource]
  );
  const prepaidValueBonus = Math.max(
    Math.round((Number(form.prepaidValue || 0) - Number(form.sellingPrice || 0)) * 100) / 100,
    0
  );
  const prepaidSessionBonus = Math.max(
    Number(form.creditedQuantity || 0) - Number(form.paidQuantity || 0),
    0
  );
  const filteredSelectedEligibleServices = useMemo(() => {
    const search = detailServiceSearch.trim().toLocaleLowerCase();
    if (!search) return selectedEligibleServices;
    return selectedEligibleServices.filter((service) =>
      [service.name, ...(service.path || [])]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search)
    );
  }, [detailServiceSearch, selectedEligibleServices]);
  const removedBenefitLabels = useMemo(() => {
    if (!benefitRulesChanged) return [];
    const labels = [];
    if (
      baselineForm.allowAdditionalDiscountOnMembershipItems &&
      !form.allowAdditionalDiscountOnMembershipItems
    ) {
      labels.push("extra discounts");
    }
    if (baselineForm.allowRewardsOnMembershipItems && !form.allowRewardsOnMembershipItems) {
      labels.push("loyalty points");
    }
    return labels;
  }, [baselineForm, benefitRulesChanged, form]);
  const formIsDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baselineForm),
    [baselineForm, form]
  );
  const activeMembershipPlans = useMemo(
    () => plans.filter((plan) => {
      if (plan.status !== "ACTIVE") return false;
      const type = normalizePlanType(plan.planType);
      return type === "DISCOUNT" || (prepaidCapabilityEnabled && ["PREPAID_VALUE", "PREPAID_SESSIONS"].includes(type));
    }),
    [plans, prepaidCapabilityEnabled]
  );
  const selectedActivationPlan = useMemo(
    () => activeMembershipPlans.find((plan) => plan.id === activationForm.membershipPlanId) || null,
    [activationForm.membershipPlanId, activeMembershipPlans]
  );
  const activationExpiry = useMemo(
    () => calculateDisplayExpiry(selectedActivationPlan?.duration),
    [selectedActivationPlan]
  );
  const activationIsDirty = useMemo(
    () => JSON.stringify(activationForm) !== JSON.stringify(activationBaselineForm),
    [activationBaselineForm, activationForm]
  );
  const renewalStartsAt = useMemo(() => {
    if (!renewalMembership) return null;
    if (normalizePlanType(renewalMembership.membershipType) !== "DISCOUNT") {
      return new Date();
    }
    const expiresAt = renewalMembership.expiresAt ? new Date(renewalMembership.expiresAt) : null;
    const now = new Date();
    return renewalMembership.status === "ACTIVE" && expiresAt && expiresAt.getTime() > now.getTime()
      ? expiresAt
      : now;
  }, [renewalMembership]);
  const selectedRenewalPlan = useMemo(
    () => activeMembershipPlans.find((plan) => plan.id === renewalMembership?.membershipPlanId) || null,
    [activeMembershipPlans, renewalMembership]
  );
  const renewalExpiresAt = useMemo(
    () => renewalStartsAt
      ? calculateDisplayExpiry(selectedRenewalPlan?.duration || renewalMembership?.planSnapshot?.duration, renewalStartsAt)
      : null,
    [renewalMembership, renewalStartsAt, selectedRenewalPlan]
  );

  const loadMembershipData = async () => {
    if (!vendorId) return;

    try {
      setLoading(true);
      setError("");
      setPlansLoadError("");
      setMembershipsLoadError("");

      const headers = getVendorAuthHeaders(vendorId);
      const [plansRes, itemsRes, membershipsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/vendor/membership-plans/${encodeURIComponent(vendorId)}`, {
          cache: "no-store",
          headers,
        }),
        fetch(
          `${API_BASE_URL}/api/vendor/membership-plans/${encodeURIComponent(vendorId)}/eligible-items`,
          {
            cache: "no-store",
            headers,
          }
        ),
        fetch(`${API_BASE_URL}/api/vendor/customer-memberships/${encodeURIComponent(vendorId)}`, {
          cache: "no-store",
          headers,
        }),
      ]);

      const [plansJson, itemsJson, membershipsJson] = await Promise.all([
        plansRes.json(),
        itemsRes.json(),
        membershipsRes.json(),
      ]);

      if (!plansRes.ok || !plansJson?.success) {
        throw new Error(plansJson?.message || "Failed to load membership plans");
      }
      if (!itemsRes.ok || !itemsJson?.success) {
        throw new Error(itemsJson?.message || "Failed to load eligible services");
      }
      if (!membershipsRes.ok || !membershipsJson?.success) {
        throw new Error(membershipsJson?.message || "Failed to load customer memberships");
      }

      setPlans(Array.isArray(plansJson.data) ? plansJson.data : []);
      const prepaidEnabled = plansJson.capabilities?.prepaidMembershipWallets === true &&
        itemsJson.capabilities?.prepaidMembershipWallets === true;
      setPrepaidCapabilityEnabled(prepaidEnabled);
      setPrepaidEligibleItems(
        prepaidEnabled && Array.isArray(itemsJson.prepaidEligibleItems)
          ? itemsJson.prepaidEligibleItems
          : []
      );
      setPrepaidEligibilityRejectedCount(
        prepaidEnabled ? Number(itemsJson.prepaidEligibilityRejectedCount || 0) : 0
      );
      setCustomerMemberships(
        Array.isArray(membershipsJson.data) ? membershipsJson.data : []
      );
      setMembershipPagination({
        page: membershipsJson.pagination?.page || 1,
        limit: membershipsJson.pagination?.limit || 25,
        total: membershipsJson.pagination?.total || 0,
        hasMore: membershipsJson.pagination?.hasMore === true,
      });
      const nextItems = Array.isArray(itemsJson.data) ? itemsJson.data : [];
      const nextTree = Array.isArray(itemsJson.tree) && itemsJson.tree.length > 0
        ? itemsJson.tree
        : buildFallbackTree(nextItems);
      setEligibleItems(nextItems);
      setEligibleTree(nextTree);
      setActiveMenu(itemsJson.activeMenu || null);
      setExpandedIds(new Set(collectExpandableIds(nextTree).slice(0, 12)));
    } catch (loadError) {
      console.error("Membership dashboard load failed", loadError);
      setPlans([]);
      setCustomerMemberships([]);
      setEligibleItems([]);
      setEligibleTree([]);
      setPrepaidEligibleItems([]);
      setPrepaidEligibilityRejectedCount(0);
      setPrepaidCapabilityEnabled(false);
      setActiveMenu(null);
      setPlansLoadError(loadError?.message || "Unable to load membership plans");
      setMembershipsLoadError(loadError?.message || "Unable to load customer memberships");
      setError(loadError?.message || "Unable to load membership plans");
    } finally {
      setLoading(false);
    }
  };

  const loadCustomerMemberships = async (nextPage = membershipPage) => {
    if (!vendorId) return;

    try {
      setMembershipsLoading(true);
      setError("");
      setMembershipsLoadError("");
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: "25",
        sort: membershipSort,
      });
      if (membershipSearch.trim()) params.set("search", membershipSearch.trim());
      if (membershipStatusFilter !== "ALL") params.set("status", membershipStatusFilter);

      const res = await fetch(
        `${API_BASE_URL}/api/vendor/customer-memberships/${encodeURIComponent(vendorId)}?${params.toString()}`,
        {
          cache: "no-store",
          headers: getVendorAuthHeaders(vendorId),
        }
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Failed to load customer memberships");
      }

      setCustomerMemberships(Array.isArray(json.data) ? json.data : []);
      setMembershipPage(json.pagination?.page || nextPage);
      setMembershipPagination({
        page: json.pagination?.page || nextPage,
        limit: json.pagination?.limit || 25,
        total: json.pagination?.total || 0,
        hasMore: json.pagination?.hasMore === true,
      });
    } catch (loadError) {
      console.error("Customer memberships load failed", loadError);
      setCustomerMemberships([]);
      setMembershipPagination({ page: nextPage, limit: 25, total: 0, hasMore: false });
      setMembershipsLoadError(loadError?.message || "Unable to load customer memberships");
      setError(loadError?.message || "Unable to load customer memberships");
    } finally {
      setMembershipsLoading(false);
    }
  };

  useEffect(() => {
    loadMembershipData();
  }, [vendorId]);

  useEffect(() => {
    if (activeView !== "customers") return;
    loadCustomerMemberships(1);
  }, [activeView, membershipStatusFilter, membershipSort]);

  useEffect(() => {
    if (
      (!isEditorOpen &&
        !isServiceScopeConfirmOpen &&
        !isActivationOpen &&
        !selectedMembership &&
        !renewalMembership) ||
      typeof document === "undefined"
    ) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [
    isEditorOpen,
    isServiceScopeConfirmOpen,
    isActivationOpen,
    selectedMembership,
    renewalMembership,
  ]);

  const resetForm = () => {
    setEditingPlanId("");
    setOriginalEditingItemIds([]);
    setServiceEligibilityScope("");
    setIsServiceScopeConfirmOpen(false);
    setBenefitRulesScope(BENEFIT_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED);
    setForm(EMPTY_FORM);
    setBaselineForm(EMPTY_FORM);
    setEditorView("details");
    setPrepaidItemSearch("");
    setMessage("");
    setError("");
  };

  const openCreateEditor = () => {
    setEditingPlanId("");
    setOriginalEditingItemIds([]);
    setServiceEligibilityScope("");
    setIsServiceScopeConfirmOpen(false);
    setBenefitRulesScope(BENEFIT_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED);
    setForm(EMPTY_FORM);
    setBaselineForm(EMPTY_FORM);
    setEditorView("details");
    setPrepaidItemSearch("");
    setMessage("");
    setError("");
    setIsEditorOpen(true);
  };

  const goHome = () => {
    setActiveView("home");
    setSelectedMembership(null);
    setMessage("");
    setError("");
  };

  const goPlans = () => {
    setActiveView("plans");
    setSelectedMembership(null);
    setMessage("");
    setError("");
  };

  const goCustomers = () => {
    setMembershipsLoading(true);
    setActiveView("customers");
    setSelectedMembership(null);
    setMessage("");
    setError("");
  };

  const requestCloseEditor = () => {
    if (saving) return;
    if (formIsDirty && typeof window !== "undefined") {
      const confirmed = window.confirm("Discard unsaved membership plan changes?");
      if (!confirmed) return;
    }
    resetForm();
    setIsEditorOpen(false);
  };

  const openActivationModal = () => {
    const defaultPlanId = activeMembershipPlans[0]?.id || "";
    const nextForm = {
      ...EMPTY_ACTIVATION_FORM,
      membershipPlanId: defaultPlanId,
      idempotencyKey: createIdempotencyKey("membership-enrollment"),
      paymentAmount: defaultPlanId
        ? String(activeMembershipPlans.find((plan) => plan.id === defaultPlanId)?.sellingPrice ?? "")
        : "",
    };
    setActivationForm(nextForm);
    setActivationBaselineForm(nextForm);
    setActivationCustomerLookup(null);
    setMessage("");
    setError("");
    setIsActivationOpen(true);
  };

  const requestCloseActivation = () => {
    if (activationSaving) return;
    if (activationIsDirty && typeof window !== "undefined") {
      const confirmed = window.confirm("Discard unsaved membership activation?");
      if (!confirmed) return;
    }
    setActivationForm(EMPTY_ACTIVATION_FORM);
    setActivationBaselineForm(EMPTY_ACTIVATION_FORM);
    setActivationCustomerLookup(null);
    setIsActivationOpen(false);
  };

  const updateForm = (field, value) => {
    setForm((current) => {
      if (field === "planType") {
        return { ...EMPTY_FORM, planType: value, name: current.name, description: current.description, duration: current.duration };
      }
      return { ...current, [field]: value };
    });
  };

  const updateActivationForm = (field, value) => {
    setActivationForm((current) => {
      if (field === "membershipPlanId") {
        const plan = activeMembershipPlans.find((entry) => entry.id === value);
        return {
          ...current,
          membershipPlanId: value,
          paymentAmount: plan ? String(plan.sellingPrice ?? "") : current.paymentAmount,
        };
      }
      return { ...current, [field]: value };
    });
    if (field === "customerMobile") setActivationCustomerLookup(null);
  };

  const lookupActivationCustomer = async () => {
    if (!vendorId || !activationForm.customerMobile.trim()) return;
    try {
      setActivationLookupLoading(true);
      setError("");
      const res = await fetch(
        `${API_BASE_URL}/api/vendor/customer-memberships/${encodeURIComponent(vendorId)}/customer-lookup?mobile=${encodeURIComponent(activationForm.customerMobile)}`,
        {
          cache: "no-store",
          headers: getVendorAuthHeaders(vendorId),
        }
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Failed to lookup customer");
      }
      setActivationCustomerLookup(json);
    } catch (lookupError) {
      console.error("Membership customer lookup failed", lookupError);
      setActivationCustomerLookup(null);
      setError(lookupError?.message || "Unable to lookup customer");
    } finally {
      setActivationLookupLoading(false);
    }
  };

  const activateCustomerMembership = async (event) => {
    event.preventDefault();
    if (!vendorId || !selectedActivationPlan) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Activate ${selectedActivationPlan.name} for ${activationForm.customerMobile.trim()}?`
      );
      if (!confirmed) return;
    }

    try {
      setActivationSaving(true);
      setMessage("");
      setError("");

      const res = await fetch(
        `${API_BASE_URL}/api/vendor/customer-memberships/${encodeURIComponent(vendorId)}/activate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify({
            customerMobile: activationForm.customerMobile,
            membershipPlanId: activationForm.membershipPlanId,
            paymentMethod: activationForm.paymentMethod,
            paymentReference: activationForm.paymentReference,
            paymentAmount: Number(activationForm.paymentAmount || 0),
            ...(normalizePlanType(selectedActivationPlan.planType) !== "DISCOUNT"
              ? { idempotencyKey: activationForm.idempotencyKey }
              : {}),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Failed to activate membership");
      }

      setMessage("Customer membership activated");
      setActivationForm(EMPTY_ACTIVATION_FORM);
      setActivationBaselineForm(EMPTY_ACTIVATION_FORM);
      setActivationCustomerLookup(null);
      setIsActivationOpen(false);
      setSelectedMembership(json.data || null);
      setActiveView("customers");
      setMembershipSearch("");
      setMembershipStatusFilter("ALL");
      setMembershipSort("newest");
      setMembershipPage(1);
      await loadMembershipData();
    } catch (activationError) {
      console.error("Membership activation failed", activationError);
      setError(activationError?.message || "Unable to activate membership");
    } finally {
      setActivationSaving(false);
    }
  };

  const openMembershipDetails = async (membership) => {
    if (!vendorId || !membership?.id) return;
    setSelectedMembership(membership);
    setSelectedMembershipHistory([]);
    setSelectedMembershipWallet(null);
    setSelectedMembershipLedger([]);
    setDetailServiceSearch("");
    setDetailLoading(true);
    setError("");

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/vendor/customer-memberships/${encodeURIComponent(vendorId)}/${encodeURIComponent(membership.id)}`,
        {
          cache: "no-store",
          headers: getVendorAuthHeaders(vendorId),
        }
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Failed to load membership details");
      }
      setSelectedMembership(json.data || membership);
      setSelectedMembershipHistory(Array.isArray(json.history) ? json.history : []);
      setSelectedMembershipWallet(json.wallet || null);
      setSelectedMembershipLedger(Array.isArray(json.walletLedger) ? json.walletLedger : []);
    } catch (detailError) {
      console.error("Membership detail load failed", detailError);
      setError(detailError?.message || "Unable to load membership details");
    } finally {
      setDetailLoading(false);
    }
  };

  const openRenewalModal = (membership) => {
    const renewalAvailability = getMembershipRenewalAvailability(membership);
    if (!renewalAvailability.allowed) {
      setError(renewalAvailability.reason);
      return;
    }
    const currentPlan = activeMembershipPlans.find((plan) => plan.id === membership?.membershipPlanId);
    setRenewalMembership(membership);
    setRenewalForm({
      ...EMPTY_RENEWAL_FORM,
      idempotencyKey: createIdempotencyKey("membership-renewal"),
      paymentAmount: String(currentPlan?.sellingPrice ?? membership?.planSnapshot?.sellingPrice ?? membership?.sellingPriceAtPurchase ?? ""),
    });
    setMessage("");
    setError("");
  };

  const closeRenewalModal = () => {
    if (renewalSaving) return;
    setRenewalMembership(null);
    setRenewalForm(EMPTY_RENEWAL_FORM);
  };

  const updateRenewalForm = (field, value) => {
    setRenewalForm((current) => ({ ...current, [field]: value }));
  };

  const renewCustomerMembership = async (event) => {
    event.preventDefault();
    if (!vendorId || !renewalMembership?.id) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Renew ${renewalMembership.planSnapshot?.name || "membership"} for ${renewalMembership.customerMobileSnapshot}?`
      );
      if (!confirmed) return;
    }

    try {
      setRenewalSaving(true);
      setMessage("");
      setError("");
      const res = await fetch(
        `${API_BASE_URL}/api/vendor/customer-memberships/${encodeURIComponent(vendorId)}/${encodeURIComponent(renewalMembership.id)}/renew`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify({
            paymentMethod: renewalForm.paymentMethod,
            paymentReference: renewalForm.paymentReference,
            paymentAmount: Number(renewalForm.paymentAmount || 0),
            ...(normalizePlanType(renewalMembership.membershipType) !== "DISCOUNT"
              ? { idempotencyKey: renewalForm.idempotencyKey }
              : {}),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Failed to renew membership");
      }

      setMessage(json.data?.status === "SCHEDULED" ? "Membership renewal scheduled" : "Membership renewed");
      setRenewalMembership(null);
      setRenewalForm(EMPTY_RENEWAL_FORM);
      setSelectedMembership(json.data || null);
      setActiveView("customers");
      await loadCustomerMemberships(1);
      if (json.data?.id) {
        await openMembershipDetails(json.data);
      }
    } catch (renewError) {
      console.error("Membership renewal failed", renewError);
      setError(renewError?.message || "Unable to renew membership");
    } finally {
      setRenewalSaving(false);
    }
  };

  const setEligibleSelection = (itemIds, checked) => {
    setForm((current) => {
      const next = new Set(current.eligibleMenuItemIds.map(String));
      itemIds.map(String).forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return {
        ...current,
        eligibleMenuItemIds: Array.from(next),
      };
    });
  };

  const selectPrepaidItem = (item) => {
    if (!item) return;
    setForm((current) => ({
      ...current,
      eligibleItemId: String(item.itemId || ""),
      eligibleItemSource: String(item.itemSource || ""),
    }));
  };

  const openPrepaidItemSelector = () => {
    setExpandedIds(new Set(collectExpandableIds(prepaidEligibleTree).slice(0, 12)));
    setEditorView("services");
  };

  const selectAllItems = () => {
    setForm((current) => ({
      ...current,
      eligibleMenuItemIds: Array.from(
        new Set([...current.eligibleMenuItemIds.filter((id) => unavailableSelectedIds.includes(id)), ...allEligibleItemIds])
      ),
    }));
  };

  const deselectAllItems = () => {
    setForm((current) => ({ ...current, eligibleMenuItemIds: [] }));
  };

  const toggleExpand = (nodeId) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      const id = String(nodeId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const editPlan = (plan) => {
    const nextForm = normalizeFormFromPlan(plan);
    setEditingPlanId(plan.id);
    setOriginalEditingItemIds(
      Array.isArray(plan?.eligibleMenuItemIds) ? plan.eligibleMenuItemIds.map(String) : []
    );
    setServiceEligibilityScope("");
    setIsServiceScopeConfirmOpen(false);
    setBenefitRulesScope(BENEFIT_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED);
    setForm(nextForm);
    setBaselineForm(nextForm);
    setEditorView("details");
    setPrepaidItemSearch("");
    setMessage("");
    setError("");
    setIsEditorOpen(true);
  };

  const persistPlan = async (confirmedServiceScope = "") => {
    if (!vendorId || saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    try {
      setSaving(true);
      setMessage("");
      setError("");

      const isEditing = Boolean(editingPlanId);
      const url = isEditing
        ? `${API_BASE_URL}/api/vendor/membership-plans/${encodeURIComponent(vendorId)}/${encodeURIComponent(editingPlanId)}`
        : `${API_BASE_URL}/api/vendor/membership-plans/${encodeURIComponent(vendorId)}`;

      let payload = buildPlanPayload(form);
      if (form.planType !== "DISCOUNT") {
        // Prepaid plans have immutable types and do not use Discount service propagation.
      } else if (isEditing && sameStringSet(form.eligibleMenuItemIds, originalEditingItemIds)) {
        payload = { ...payload };
        delete payload.eligibleMenuItemIds;
      } else if (unavailableSelectedIds.length > 0) {
        throw new Error("Remove unavailable services before saving service selection changes");
      } else if (isEditing) {
        if (!Object.values(SERVICE_SCOPE_OPTIONS).includes(confirmedServiceScope)) {
          throw new Error("Choose how service changes apply before updating the plan");
        }
        payload.serviceEligibilityScope = confirmedServiceScope;
      }
      if (form.planType === "DISCOUNT" && isEditing && benefitRulesChanged) {
        if (
          removedBenefitLabels.length > 0 &&
          benefitRulesScope === BENEFIT_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED
        ) {
          const confirmed = window.confirm(
            `This removes ${removedBenefitLabels.join(" and ")} from existing active/scheduled members. Continue?`
          );
          if (!confirmed) {
            setSaving(false);
            return;
          }
        }
        payload.benefitRulesScope = benefitRulesScope;
      }

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...getVendorAuthHeaders(vendorId),
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Failed to save membership plan");
      }

      const serviceUpdate = json?.serviceEligibilityUpdate;
      const benefitUpdate = json?.benefitRulesUpdate;
      const updateMessages = [];
      if (serviceUpdate?.scope === SERVICE_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED) {
        const count = Number(serviceUpdate.affectedMembershipCount || 0);
        updateMessages.push(
          `Service changes applied to ${count} active/scheduled member${count === 1 ? "" : "s"}`
        );
      } else if (serviceUpdate?.scope === SERVICE_SCOPE_OPTIONS.FUTURE_ONLY) {
        updateMessages.push("Existing member periods kept their previous eligible services");
      }
      if (benefitUpdate?.scope === BENEFIT_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED) {
        const count = Number(benefitUpdate.affectedMembershipCount || 0);
        updateMessages.push(
          `Benefit changes applied to ${count} active/scheduled member${count === 1 ? "" : "s"}`
        );
      } else if (benefitUpdate?.scope === BENEFIT_SCOPE_OPTIONS.FUTURE_ONLY) {
        updateMessages.push("Existing member periods kept their previous benefits");
      }
      if (updateMessages.length > 0) {
        setMessage(`Membership plan updated. ${updateMessages.join(". ")}.`);
      } else {
        setMessage(isEditing ? "Membership plan updated" : "Membership plan created as inactive");
      }
      await loadMembershipData();
      resetForm();
      setIsEditorOpen(false);
    } catch (saveError) {
      console.error("Membership save failed", saveError);
      setError(saveError?.message || "Unable to save membership plan");
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const savePlan = (event) => {
    event.preventDefault();
    if (!vendorId || saving || saveInFlightRef.current) return;

    if (form.planType === "DISCOUNT" && eligibleServicesChanged) {
      if (unavailableSelectedIds.length > 0) {
        setError("Remove unavailable services before saving service selection changes");
        return;
      }
      setMessage("");
      setError("");
      setServiceEligibilityScope("");
      setIsServiceScopeConfirmOpen(true);
      return;
    }

    persistPlan();
  };

  const cancelServiceScopeConfirmation = () => {
    if (saving) return;
    setServiceEligibilityScope("");
    setIsServiceScopeConfirmOpen(false);
  };

  const confirmServiceScopeUpdate = () => {
    if (!serviceEligibilityScope || saving || saveInFlightRef.current) return;
    persistPlan(serviceEligibilityScope);
  };

  const togglePlanStatus = async (plan) => {
    if (!vendorId || !plan?.id) return;

    const nextStatus = plan.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      setStatusChangingId(plan.id);
      setMessage("");
      setError("");

      const res = await fetch(
        `${API_BASE_URL}/api/vendor/membership-plans/${encodeURIComponent(vendorId)}/${encodeURIComponent(plan.id)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getVendorAuthHeaders(vendorId),
          },
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      const json = await res.json();

      if (!res.ok || !json?.success) {
        throw new Error(json?.message || "Failed to update plan status");
      }

      setPlans((current) => current.map((entry) => (entry.id === plan.id ? json.data : entry)));
      setMessage(`Plan marked ${nextStatus.toLowerCase()}`);
    } catch (statusError) {
      console.error("Membership status update failed", statusError);
      setError(statusError?.message || "Unable to update membership status");
    } finally {
      setStatusChangingId("");
    }
  };

  return (
    <section className="membership-dashboard">
      <div className="membership-dashboard-intro">
        <div>
          <p className="membership-dashboard-eyebrow">Memberships</p>
          <h2>
            {activeView === "plans"
              ? "Membership Plans"
              : activeView === "customers"
                ? "Customer Memberships"
                : "Memberships Home"}
          </h2>
          <p>
            Configure plans, activate memberships, and view enrolled customers without changing billing rules yet.
          </p>
          {activeView === "plans" && activeMenu?.label && (
            <div className="membership-active-menu-note">
              Active selector source: <strong>{activeMenu.label}</strong>
            </div>
          )}
        </div>
        <div className="membership-dashboard-summary">
          <strong>{activeView === "customers" ? membershipPagination.total : plans.length}</strong>
          <span>{activeView === "customers" ? "Enrolled" : "Total plans"}</span>
        </div>
      </div>

      {message && <div className="membership-message success">{message}</div>}
      {error &&
        !(activeView === "plans" && plansLoadError) &&
        !(activeView === "customers" && membershipsLoadError) ? (
        <div className="membership-message error">{error}</div>
      ) : null}

      {activeView === "home" && (
        <div className="membership-home-grid">
          <button type="button" className="membership-home-card" onClick={goPlans}>
            <span>Membership Plans</span>
            <strong>{plans.length}</strong>
            <small>Create, edit, activate or deactivate membership plans.</small>
          </button>
          <button
            type="button"
            className="membership-home-card"
            onClick={openActivationModal}
            disabled={loading || activeMembershipPlans.length === 0}
          >
            <span>Activate Membership</span>
            <strong>{activeMembershipPlans.length}</strong>
            <small>Assign an active plan to a new or existing customer.</small>
          </button>
          <button type="button" className="membership-home-card" onClick={goCustomers}>
            <span>Customer Memberships</span>
            <strong>{membershipPagination.total || customerMemberships.length}</strong>
            <small>Search enrolled customers and inspect purchased plan snapshots.</small>
          </button>
        </div>
      )}

      {activeView === "plans" && (
        <>
          <div className="membership-main-actions">
            <button type="button" className="membership-secondary-action" onClick={goHome}>
              Back
            </button>
            <button
              type="button"
              className="membership-create-button"
              onClick={openCreateEditor}
              disabled={loading}
            >
              Create Membership Plan
            </button>
          </div>

          <div className="membership-plan-list">
          <div className="membership-card-heading">
            <div>
              <h3>Configured Plans</h3>
              <p>Manage Discount Membership, Prepaid Wallet and Prepaid Packages available to your customers.</p>
            </div>
          </div>

          {loading ? (
            <div className="membership-loading-state" role="status" aria-live="polite">
              <span className="membership-loading-spinner" aria-hidden="true" />
              Loading membership plans...
            </div>
          ) : plansLoadError ? (
            <div className="membership-message error" role="alert">{plansLoadError}</div>
          ) : plans.length === 0 ? (
            <div className="membership-empty-state">
              No membership plans yet. Create your first membership plan.
            </div>
          ) : (
            <div className="membership-plan-stack">
              {plans.map((plan) => (
                <article key={plan.id} className="membership-plan-card">
                  <div className="membership-plan-card-head">
                    <div>
                      <span className="membership-type-label">{formatPlanType(plan.planType)}</span>
                      <h4>{plan.name}</h4>
                      <p>{plan.description || "No description added"}</p>
                    </div>
                    <span className={`membership-status ${plan.status === "ACTIVE" ? "active" : ""}`}>
                      {plan.status}
                    </span>
                  </div>

                  <div className="membership-plan-metrics">
                    <span>
                      <strong>{formatCurrency(plan.sellingPrice)}</strong>
                      Selling price
                    </span>
                    {normalizePlanType(plan.planType) === "DISCOUNT" ? (
                      <span><strong>{Number(plan.discountPercentage || 0)}%</strong>Discount</span>
                    ) : null}
                    {normalizePlanType(plan.planType) === "PREPAID_VALUE" ? (
                      <>
                        <span><strong>{formatCurrency(plan.prepaidValueConfig?.prepaidValue)}</strong>Usable value</span>
                        <span><strong>{formatCurrency(plan.prepaidValueConfig?.bonusValue)}</strong>Bonus value</span>
                      </>
                    ) : null}
                    {normalizePlanType(plan.planType) === "PREPAID_SESSIONS" ? (
                      <>
                        <span><strong>{plan.prepaidSessionsConfig?.paidQuantity || 0}</strong>Paid sessions</span>
                        <span><strong>{plan.prepaidSessionsConfig?.creditedQuantity || 0}</strong>Credited sessions</span>
                      </>
                    ) : null}
                    <span>
                      <strong>{formatDuration(plan.duration)}</strong>
                      Duration
                    </span>
                    {normalizePlanType(plan.planType) === "DISCOUNT" ? <span>
                      <strong>{plan.eligibleMenuItemIds?.length || 0}</strong>
                      Items
                    </span> : null}
                  </div>

                  {normalizePlanType(plan.planType) === "DISCOUNT" ? <div className="membership-plan-flags">
                    <span>
                      Min bill {formatCurrency(plan.minimumBillAmount)}
                    </span>
                    <span>
                      Extra discount {plan.allowAdditionalDiscountOnMembershipItems ? "on" : "off"}
                    </span>
                    <span>
                      Membership points {plan.allowRewardsOnMembershipItems ? "on" : "off"}
                    </span>
                  </div> : null}
                  {normalizePlanType(plan.planType) === "PREPAID_SESSIONS" ? (
                    <div className="membership-plan-flags">
                      <span>{plan.prepaidSessionsConfig?.eligibleItemKind || "Item"}</span>
                      <span>
                        {prepaidEligibleItems.find((item) =>
                          item.itemId === plan.prepaidSessionsConfig?.eligibleItemId &&
                          item.itemSource === plan.prepaidSessionsConfig?.eligibleItemSource
                        )?.name || "Eligible item unavailable"}
                      </span>
                      <span>
                        Bonus {Math.max(Number(plan.prepaidSessionsConfig?.creditedQuantity || 0) - Number(plan.prepaidSessionsConfig?.paidQuantity || 0), 0)}
                      </span>
                    </div>
                  ) : null}

                  <div className="membership-plan-actions">
                    <button
                      type="button"
                      onClick={() => editPlan(plan)}
                      disabled={!["DISCOUNT", "PREPAID_VALUE", "PREPAID_SESSIONS"].includes(normalizePlanType(plan.planType))}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={plan.status === "ACTIVE" ? "danger" : "success"}
                      onClick={() => togglePlanStatus(plan)}
                      disabled={statusChangingId === plan.id}
                    >
                      {statusChangingId === plan.id
                        ? "Updating..."
                        : plan.status === "ACTIVE"
                          ? "Deactivate"
                          : "Activate"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        </>
      )}

      {activeView === "customers" && (
        <div className="membership-plan-list">
          <div className="membership-card-heading">
            <div>
              <h3>Customer Memberships</h3>
              <p>Purchased memberships are tracked separately from service bills.</p>
            </div>
            <button type="button" className="membership-text-button" onClick={goHome}>
              Back
            </button>
          </div>

          <div className="membership-filter-bar">
            <input
              type="search"
              value={membershipSearch}
              onChange={(event) => setMembershipSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") loadCustomerMemberships(1);
              }}
              placeholder="Search mobile or plan name"
            />
            <select
              value={membershipStatusFilter}
              onChange={(event) => {
                setMembershipPage(1);
                setMembershipStatusFilter(event.target.value);
              }}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="DEPLETED">Depleted</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select
              value={membershipSort}
              onChange={(event) => {
                setMembershipPage(1);
                setMembershipSort(event.target.value);
              }}
            >
              <option value="newest">Newest</option>
              <option value="activation_date">Activation date</option>
              <option value="expiry_date">Expiry date</option>
            </select>
            <button type="button" onClick={() => loadCustomerMemberships(1)} disabled={membershipsLoading}>
              {membershipsLoading ? "Searching..." : "Search"}
            </button>
          </div>

          {membershipsLoading ? (
            <div className="membership-loading-state" role="status" aria-live="polite">
              <span className="membership-loading-spinner" aria-hidden="true" />
              Loading customer memberships...
            </div>
          ) : membershipsLoadError ? (
            <div className="membership-message error" role="alert">{membershipsLoadError}</div>
          ) : customerMemberships.length === 0 ? (
            <div className="membership-empty-state">
              No customer memberships activated yet.
            </div>
          ) : (
            <div className="membership-plan-stack">
              {customerMemberships.map((membership) => {
                const renewalAvailability = getMembershipRenewalAvailability(membership);
                const showRenewal = ["ACTIVE", "DEPLETED", "EXPIRED"].includes(membership.status);
                return <article key={membership.id} className="membership-plan-card membership-customer-card">
                  <div className="membership-plan-card-head">
                    <div>
                      <span className="membership-type-label">{formatPlanType(membership.membershipType)}</span>
                      <h4>{membership.planSnapshot?.name || "Membership"}</h4>
                      <p>{formatCustomerIdentity(membership.customerName, membership.customerMobileSnapshot)}</p>
                    </div>
                    <span className={`membership-status ${membership.status === "ACTIVE" ? "active" : ""}`}>
                      {membership.status}
                    </span>
                  </div>
                  <div className="membership-plan-metrics">
                    <span>
                      <strong>{formatCurrency(membership.sellingPriceAtPurchase)}</strong>
                      Paid
                    </span>
                    {normalizePlanType(membership.membershipType) === "DISCOUNT" ? <span>
                      <strong>{Number(membership.planSnapshot?.discountPercentage || 0)}%</strong>
                      Discount
                    </span> : null}
                    <span>
                      <strong>{formatDate(membership.activatedAt)}</strong>
                      Activated
                    </span>
                    <span>
                      <strong>{formatDate(membership.expiresAt)}</strong>
                      Expires
                    </span>
                  </div>
                  <div className="membership-plan-flags">
                    <span>Payment {membership.payment?.method || "-"}</span>
                    {membership.payment?.reference ? (
                      <span>Ref {membership.payment.reference}</span>
                    ) : null}
                  </div>
                  <div className="membership-plan-actions">
                    <button type="button" onClick={() => openMembershipDetails(membership)}>
                      View Details
                    </button>
                    {showRenewal ? (
                      <button
                        type="button"
                        className="success"
                        onClick={() => openRenewalModal(membership)}
                        disabled={!renewalAvailability.allowed}
                        title={renewalAvailability.reason || undefined}
                      >
                        Renew
                      </button>
                    ) : null}
                  </div>
                  {showRenewal && !renewalAvailability.allowed ? (
                    <p className="membership-renewal-note">{renewalAvailability.reason}</p>
                  ) : null}
                </article>
              })}
            </div>
          )}

          <div className="membership-pagination">
            <button
              type="button"
              onClick={() => loadCustomerMemberships(Math.max(membershipPage - 1, 1))}
              disabled={membershipsLoading || membershipPage <= 1}
            >
              Previous
            </button>
            <span>
              Page {membershipPagination.page || membershipPage}
              {membershipPagination.total ? ` • ${membershipPagination.total} total` : ""}
            </span>
            <button
              type="button"
              onClick={() => loadCustomerMemberships(membershipPage + 1)}
              disabled={membershipsLoading || !membershipPagination.hasMore}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedMembership && (
        <div className="membership-editor-overlay" role="dialog" aria-modal="true">
          <div className="membership-editor-modal membership-detail-modal">
            <header className="membership-editor-header">
              <div>
                <p className="membership-dashboard-eyebrow">Membership detail</p>
                <h3>{selectedMembership.planSnapshot?.name || "Customer Membership"}</h3>
              </div>
              <button type="button" className="membership-editor-close" onClick={() => setSelectedMembership(null)}>
                Close
              </button>
            </header>
            <div className="membership-editor-body">
              {detailLoading && <div className="membership-empty-small">Loading membership history...</div>}
              <div className="membership-detail-grid">
                <span>
                  <strong>{selectedMembership.customerName || selectedMembership.customerMobileSnapshot}</strong>
                  {selectedMembership.customerName ? selectedMembership.customerMobileSnapshot : "Customer mobile"}
                </span>
                <span><strong>{selectedMembership.status}</strong>Status</span>
                <span><strong>{formatCurrency(selectedMembership.sellingPriceAtPurchase)}</strong>Paid</span>
                <span><strong>{selectedMembership.payment?.method || "-"}</strong>Payment</span>
                <span><strong>{formatDate(selectedMembership.activatedAt)}</strong>Activated</span>
                <span><strong>{formatDate(selectedMembership.expiresAt)}</strong>Expires</span>
                <span><strong>{formatPlanType(selectedMembership.membershipType)}</strong>Type</span>
                {normalizePlanType(selectedMembership.membershipType) === "DISCOUNT" ? <span><strong>{Number(selectedMembership.planSnapshot?.discountPercentage || 0)}%</strong>Discount</span> : null}
                {normalizePlanType(selectedMembership.membershipType) === "DISCOUNT" ? <span>
                  <strong>{selectedMembership.effectiveEligibleMenuItemIds?.length || 0}</strong>
                  Eligible items
                </span> : null}
              </div>
              {selectedMembershipWallet && normalizePlanType(selectedMembership.membershipType) === "PREPAID_VALUE" ? (
                <div className="membership-wallet-summary">
                  <span><strong>{formatPaise(selectedMembership.prepaidValueSnapshot?.paidAmountPaise)}</strong>Amount paid</span>
                  <span><strong>{formatPaise(selectedMembershipWallet.creditedAmountPaise)}</strong>Initial credit</span>
                  <span><strong>{formatPaise(selectedMembershipWallet.consumedAmountPaise)}</strong>Used value</span>
                  <span><strong>{formatPaise(selectedMembershipWallet.remainingAmountPaise)}</strong>Remaining balance</span>
                </div>
              ) : null}
              {selectedMembershipWallet && normalizePlanType(selectedMembership.membershipType) === "PREPAID_SESSIONS" ? (
                <div className="membership-wallet-summary">
                  <span><strong>{selectedMembership.prepaidSessionsSnapshot?.itemName || "Eligible item"}</strong>{selectedMembership.prepaidSessionsSnapshot?.eligibleItemKind || "Item"}</span>
                  <span><strong>{selectedMembership.prepaidSessionsSnapshot?.paidQuantity || 0}</strong>Paid sessions</span>
                  <span><strong>{selectedMembershipWallet.creditedQuantity || 0}</strong>Credited sessions</span>
                  <span><strong>{selectedMembershipWallet.consumedQuantity || 0}</strong>Used sessions</span>
                  <span><strong>{selectedMembershipWallet.remainingQuantity || 0}</strong>Remaining sessions</span>
                </div>
              ) : null}
              {selectedMembership.planSnapshot?.description ? (
                <div className="membership-detail-note">
                  {selectedMembership.planSnapshot.description}
                </div>
              ) : null}
              {selectedMembership.payment?.reference ? (
                <div className="membership-detail-note">
                  Payment reference: {selectedMembership.payment.reference}
                </div>
              ) : null}
              {normalizePlanType(selectedMembership.membershipType) === "DISCOUNT" ? <div className="membership-eligible-services-section">
                <div className="membership-eligible-services-head">
                  <div>
                    <h4>Eligible Services</h4>
                    <span>
                      {detailServiceSearch.trim()
                        ? `${filteredSelectedEligibleServices.length} of ${selectedEligibleServices.length} services`
                        : `${selectedEligibleServices.length} services`}
                    </span>
                  </div>
                  {selectedEligibleServices.length ? (
                    <input
                      type="search"
                      value={detailServiceSearch}
                      onChange={(event) => setDetailServiceSearch(event.target.value)}
                      placeholder="Search eligible services..."
                      aria-label="Search eligible membership services"
                    />
                  ) : null}
                </div>
                {detailLoading ? (
                  <div className="membership-empty-small">Loading eligible services...</div>
                ) : selectedEligibleServices.length === 0 ? (
                  <div className="membership-empty-small">No eligible services recorded for this membership.</div>
                ) : filteredSelectedEligibleServices.length === 0 ? (
                  <div className="membership-empty-small">No matching services found</div>
                ) : (
                  <div className="membership-eligible-services-list">
                    {filteredSelectedEligibleServices.map((service) => (
                      <div key={service.id} className="membership-eligible-service-row">
                        <strong>{service.name}</strong>
                        {service.path?.length ? <span>{service.path.join(" / ")}</span> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div> : null}
              {normalizePlanType(selectedMembership.membershipType) !== "DISCOUNT" ? (
                <div className="membership-history-section">
                  <h4>Wallet Activity</h4>
                  {selectedMembershipLedger.length === 0 ? (
                    <div className="membership-empty-small">No wallet activity recorded.</div>
                  ) : (
                    <div className="membership-history-list">
                      {selectedMembershipLedger.map((entry) => {
                        const presentation = getPrepaidActivityPresentation(entry.eventType);
                        return (
                          <div key={entry.id} className="membership-history-row membership-wallet-activity-row">
                            <div>
                              <strong>{presentation.label}</strong>
                              <span>{formatDate(entry.occurredAt)}</span>
                            </div>
                            <div>
                              <strong className={`membership-wallet-activity-amount ${presentation.tone}`}>
                                {formatPrepaidActivityValue(entry)}
                              </strong>
                              <span>{presentation.description}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
              <div className="membership-history-section">
                <h4>Membership History</h4>
                {selectedMembershipHistory.length === 0 ? (
                  <div className="membership-empty-small">No renewal history available yet.</div>
                ) : (
                  <div className="membership-history-list">
                    {selectedMembershipHistory.map((entry) => (
                      <div key={entry.id} className="membership-history-row">
                        <div>
                          <strong>{entry.planSnapshot?.name || "Membership"}</strong>
                          <span>
                            {formatDate(entry.activatedAt)} to {formatDate(entry.expiresAt)}
                          </span>
                        </div>
                        <div>
                          <strong>{entry.status}</strong>
                          <span>{formatCurrency(entry.payment?.amount ?? entry.sellingPriceAtPurchase)} • {entry.payment?.method || "-"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <footer className="membership-editor-footer">
              {["ACTIVE", "DEPLETED", "EXPIRED"].includes(selectedMembership.status) ? (
                <button
                  type="button"
                  className="membership-secondary-button"
                  onClick={() => openRenewalModal({ ...selectedMembership, wallet: selectedMembershipWallet })}
                  disabled={!getMembershipRenewalAvailability({
                    ...selectedMembership,
                    wallet: selectedMembershipWallet,
                  }).allowed}
                  title={getMembershipRenewalAvailability({
                    ...selectedMembership,
                    wallet: selectedMembershipWallet,
                  }).reason || undefined}
                >
                  Renew Membership
                </button>
              ) : null}
              <button type="button" className="membership-primary-button" onClick={() => {
                setSelectedMembership(null);
                setSelectedMembershipHistory([]);
                setSelectedMembershipWallet(null);
                setSelectedMembershipLedger([]);
                setDetailServiceSearch("");
              }}>
                Done
              </button>
            </footer>
          </div>
        </div>
      )}

      {renewalMembership && (
        <div className="membership-editor-overlay" role="dialog" aria-modal="true">
          <form className="membership-editor-modal membership-renewal-modal" onSubmit={renewCustomerMembership}>
            <header className="membership-editor-header">
              <div>
                <p className="membership-dashboard-eyebrow">Manual renewal</p>
                <h3>Renew Membership</h3>
              </div>
              <button type="button" className="membership-editor-close" onClick={closeRenewalModal}>
                Close
              </button>
            </header>

            <div className="membership-editor-body">
              {error && <div className="membership-message error">{error}</div>}
              <div className="membership-detail-grid">
                <span><strong>{renewalMembership.customerMobileSnapshot}</strong>Customer mobile</span>
                <span><strong>{renewalMembership.planSnapshot?.name || "Membership"}</strong>Plan</span>
                <span><strong>{formatDate(renewalMembership.expiresAt)}</strong>Current expiry</span>
                <span><strong>{formatDate(renewalStartsAt)}</strong>Renewal starts</span>
                <span><strong>{formatDate(renewalExpiresAt)}</strong>New expiry</span>
                <span><strong>{formatCurrency(selectedRenewalPlan?.sellingPrice ?? renewalMembership.planSnapshot?.sellingPrice)}</strong>Current price</span>
                {normalizePlanType(renewalMembership.membershipType) === "DISCOUNT" ? (
                  <span><strong>{Number(selectedRenewalPlan?.discountPercentage ?? renewalMembership.planSnapshot?.discountPercentage ?? 0)}%</strong>Current discount</span>
                ) : null}
                <span><strong>{formatDuration(selectedRenewalPlan?.duration || renewalMembership.planSnapshot?.duration)}</strong>Duration</span>
              </div>
              {normalizePlanType(renewalMembership.membershipType) === "PREPAID_VALUE" ? (
                <div className="membership-detail-note">
                  A new independent wallet with {formatCurrency(selectedRenewalPlan?.prepaidValueConfig?.prepaidValue)} credit will begin on {formatDate(renewalStartsAt)}. Existing balances are not merged.
                </div>
              ) : null}
              {normalizePlanType(renewalMembership.membershipType) === "PREPAID_SESSIONS" ? (
                <div className="membership-detail-note">
                  A new independent wallet with {selectedRenewalPlan?.prepaidSessionsConfig?.creditedQuantity || 0} sessions will begin on {formatDate(renewalStartsAt)}. Scheduled credits are unavailable before that date.
                </div>
              ) : null}
              {!selectedRenewalPlan && (
                <div className="membership-message error">
                  The original plan is not currently active. Renewal will be rejected until this plan is active.
                </div>
              )}

              <div className="membership-form-row">
                <label className="membership-field">
                  <span>Payment method</span>
                  <select
                    value={renewalForm.paymentMethod}
                    onChange={(event) => updateRenewalForm("paymentMethod", event.target.value)}
                    required
                  >
                    {PAYMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="membership-field">
                  <span>Renewal amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={renewalForm.paymentAmount}
                    onChange={(event) => updateRenewalForm("paymentAmount", event.target.value)}
                    required
                  />
                </label>
              </div>

              <label className="membership-field">
                <span>Payment reference {renewalForm.paymentMethod === "CASH" ? "(optional)" : ""}</span>
                <input
                  type="text"
                  value={renewalForm.paymentReference}
                  onChange={(event) => updateRenewalForm("paymentReference", event.target.value)}
                  placeholder={renewalForm.paymentMethod === "CASH" ? "Optional note" : "UPI / card / online reference"}
                  maxLength={160}
                  required={renewalForm.paymentMethod !== "CASH"}
                />
              </label>
            </div>

            <footer className="membership-editor-footer">
              <button type="button" className="membership-secondary-button" onClick={closeRenewalModal}>
                Cancel
              </button>
              <button type="submit" className="membership-primary-button" disabled={renewalSaving || !selectedRenewalPlan}>
                {renewalSaving ? "Recording..." : "Record Renewal"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {isEditorOpen && (
        <div className="membership-editor-overlay" role="dialog" aria-modal="true">
          <form className="membership-editor-modal" onSubmit={savePlan}>
            <header className="membership-editor-header">
              <div>
                <p className="membership-dashboard-eyebrow">{formatPlanType(form.planType)}</p>
                <h3>{editingPlanId ? "Edit Membership Plan" : "Create Membership Plan"}</h3>
              </div>
              <button type="button" className="membership-editor-close" onClick={requestCloseEditor}>
                Close
              </button>
            </header>

            <div className="membership-editor-body">
              {error && <div className="membership-message error">{error}</div>}

              {editorView === "details" ? (
                <>
                  <fieldset className="membership-type-selector" disabled={Boolean(editingPlanId)}>
                    <legend>Membership type</legend>
                    <div className="membership-type-card-grid">
                      {PLAN_TYPE_OPTIONS.map((option) => {
                        const selected = form.planType === option.value;
                        const capabilityUnavailable = option.value !== "DISCOUNT" && !prepaidCapabilityEnabled;
                        return (
                          <label
                            key={option.value}
                            className={`membership-type-card ${selected ? "selected" : ""} ${capabilityUnavailable ? "unavailable" : ""}`}
                          >
                            <input
                              type="radio"
                              name="membershipPlanType"
                              value={option.value}
                              checked={selected}
                              onChange={() => updateForm("planType", option.value)}
                              disabled={Boolean(editingPlanId) || capabilityUnavailable}
                            />
                            <span className="membership-type-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                            <strong>{option.label}</strong>
                            <span>{option.description}</span>
                            <small>{option.example}</small>
                            {capabilityUnavailable ? <em>Not enabled</em> : null}
                          </label>
                        );
                      })}
                    </div>
                    <small>{editingPlanId ? "Membership type cannot be changed after creation." : "Choose how customers receive membership benefits."}</small>
                  </fieldset>
                  <label className="membership-field">
                    <span>Plan name</span>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) => updateForm("name", event.target.value)}
                      placeholder="Gold Hair Care"
                      maxLength={120}
                      required
                    />
                  </label>

                  <label className="membership-field">
                    <span>Description</span>
                    <textarea
                      value={form.description}
                      onChange={(event) => updateForm("description", event.target.value)}
                      placeholder="Short note shown to your team while managing plans"
                      rows={3}
                      maxLength={1000}
                    />
                  </label>

                  <div className="membership-form-row">
                    <label className="membership-field">
                      <span>Duration</span>
                      <select
                        value={form.duration}
                        onChange={(event) => updateForm("duration", event.target.value)}
                      >
                        {DURATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="membership-field">
                      <span>{form.planType === "PREPAID_VALUE" ? "Customer pays" : "Selling price"}</span>
                      <input
                        type="number"
                        min={form.planType === "DISCOUNT" ? "0" : "0.01"}
                        step="0.01"
                        value={form.sellingPrice}
                        onChange={(event) => updateForm("sellingPrice", event.target.value)}
                        placeholder="999"
                        required
                      />
                    </label>
                  </div>

                  {form.planType === "DISCOUNT" ? <>
                  <div className="membership-form-row">
                    <label className="membership-field">
                      <span>Discount %</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form.discountPercentage}
                        onChange={(event) => updateForm("discountPercentage", event.target.value)}
                        placeholder="10"
                        required
                      />
                    </label>

                    <label className="membership-field">
                      <span>Minimum bill</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.minimumBillAmount}
                        onChange={(event) => updateForm("minimumBillAmount", event.target.value)}
                        placeholder="0"
                      />
                    </label>
                  </div>

                  <div className="membership-toggle-card membership-benefit-card">
                    <div className="membership-benefit-card-head">
                      <strong>Additional Membership Benefits</strong>
                      <span>Services without a membership discount follow normal billing rules.</span>
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.allowAdditionalDiscountOnMembershipItems}
                        onChange={(event) =>
                          updateForm("allowAdditionalDiscountOnMembershipItems", event.target.checked)
                        }
                      />
                      <span>
                        Allow Extra Discount on Membership Services
                        <small>Allow a manual discount in addition to the membership discount.</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.allowRewardsOnMembershipItems}
                        onChange={(event) =>
                          updateForm("allowRewardsOnMembershipItems", event.target.checked)
                        }
                      />
                      <span>
                        Allow Loyalty Points on Membership Services
                        <small>Give loyalty points even when a service receives a membership discount.</small>
                      </span>
                    </label>
                  </div>

                  {benefitRulesChanged && (
                    <div className="membership-service-scope-card membership-benefit-scope-card">
                      <strong>Apply benefit changes</strong>
                      <p>
                        Choose whether these extra discount and loyalty settings should also affect
                        customers who already bought this plan. Purchased price, discount %, duration,
                        minimum bill and eligible services stay unchanged.
                      </p>
                      <label>
                        <input
                          type="radio"
                          name="benefitRulesScope"
                          value={BENEFIT_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED}
                          checked={benefitRulesScope === BENEFIT_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED}
                          onChange={() =>
                            setBenefitRulesScope(BENEFIT_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED)
                          }
                        />
                        <span>
                          <strong>Apply to Existing & Future Members</strong>
                          <small>Recommended. Update these benefits for current and scheduled memberships too.</small>
                        </span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="benefitRulesScope"
                          value={BENEFIT_SCOPE_OPTIONS.FUTURE_ONLY}
                          checked={benefitRulesScope === BENEFIT_SCOPE_OPTIONS.FUTURE_ONLY}
                          onChange={() => setBenefitRulesScope(BENEFIT_SCOPE_OPTIONS.FUTURE_ONLY)}
                        />
                        <span>
                          <strong>Apply to Future Members Only</strong>
                          <small>Existing memberships keep their current benefits.</small>
                        </span>
                      </label>
                      {removedBenefitLabels.length > 0 &&
                        benefitRulesScope === BENEFIT_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED ? (
                        <div className="membership-service-scope-warning">
                          Existing active/scheduled members will lose {removedBenefitLabels.join(" and ")}
                          after confirmation.
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="membership-service-summary">
                    <div>
                      <h4>Eligible Services — {form.eligibleMenuItemIds.length} selected</h4>
                      <p>
                        {activeMenu?.label
                          ? `Selections come from the active ${activeMenu.label}.`
                          : "Choose eligible billable services for this plan."}
                      </p>
                    </div>
                    <button type="button" onClick={() => setEditorView("services")}>
                      Manage Services
                    </button>
                  </div>

                  {unavailableSelectedIds.length > 0 && (
                    <div className="membership-unavailable-selection">
                      <strong>{unavailableSelectedIds.length} saved selection{unavailableSelectedIds.length === 1 ? "" : "s"} unavailable</strong>
                      <span>
                        These IDs are from an inactive or unavailable menu source. They are preserved for
                        this existing plan, but must be removed before saving service selection changes.
                      </span>
                      <button
                        type="button"
                        onClick={() => setEligibleSelection(unavailableSelectedIds, false)}
                      >
                        Remove unavailable selections
                      </button>
                    </div>
                  )}
                  </> : null}

                  {form.planType === "PREPAID_VALUE" ? (
                    <>
                      <label className="membership-field">
                        <span>Total usable wallet value</span>
                        <input
                          type="number"
                          min={form.sellingPrice || "0.01"}
                          step="0.01"
                          value={form.prepaidValue}
                          onChange={(event) => updateForm("prepaidValue", event.target.value)}
                          placeholder="13000"
                          required
                        />
                      </label>
                      <div className="membership-prepaid-summary">
                        <span><strong>{formatCurrency(form.sellingPrice)}</strong>Customer pays</span>
                        <span><strong>{formatCurrency(form.prepaidValue)}</strong>Usable value</span>
                        <span><strong>{formatCurrency(prepaidValueBonus)}</strong>Bonus value</span>
                      </div>
                    </>
                  ) : null}

                  {form.planType === "PREPAID_SESSIONS" ? (
                    <>
                      <div className="membership-service-summary">
                        <div>
                          <h4>Eligible Service or Package</h4>
                          <p>
                            {selectedPrepaidItem
                              ? "One item selected. Choosing another item replaces it."
                              : "Choose one canonically verified Service or Package."}
                          </p>
                        </div>
                        <button type="button" onClick={openPrepaidItemSelector}>
                          {selectedPrepaidItem ? "Change Item" : "Choose Item"}
                        </button>
                      </div>
                      {prepaidEligibleItems.length === 0 ? <div className="membership-empty-small">No canonically classified Service or Package is available. Offers and unclassified items cannot be selected.</div> : null}
                      {prepaidEligibilityRejectedCount > 0 ? <div className="membership-tree-search-note">{prepaidEligibilityRejectedCount} menu item{prepaidEligibilityRejectedCount === 1 ? " was" : "s were"} excluded because the backend could not verify a supported Service or Package classification.</div> : null}
                      {form.eligibleItemId && !selectedPrepaidItem ? (
                        <div className="membership-unavailable-selection">
                          <strong>Saved item is currently unavailable</strong>
                          <span>Its canonical identity remains preserved. Choose another eligible item before saving changes.</span>
                        </div>
                      ) : null}
                      {selectedPrepaidItem ? (
                        <div className="membership-selected-item">
                          <strong>{selectedPrepaidItem.name}</strong>
                          <span>{selectedPrepaidItem.itemKind} · {formatCurrency(selectedPrepaidItem.price)}</span>
                          {selectedPrepaidItem.categoryPath?.length ? <small>{selectedPrepaidItem.categoryPath.join(" / ")}</small> : null}
                          {selectedPrepaidItem.itemKind === "PACKAGE" && selectedPrepaidItem.packageIncludes ? <p><b>Package Includes:</b> {selectedPrepaidItem.packageIncludes}</p> : null}
                        </div>
                      ) : null}
                      <div className="membership-form-row">
                        <label className="membership-field">
                          <span>Paid quantity</span>
                          <input type="number" min="1" step="1" value={form.paidQuantity} onChange={(event) => updateForm("paidQuantity", event.target.value)} required />
                        </label>
                        <label className="membership-field">
                          <span>Credited quantity</span>
                          <input type="number" min={form.paidQuantity || "1"} step="1" value={form.creditedQuantity} onChange={(event) => updateForm("creditedQuantity", event.target.value)} required />
                        </label>
                      </div>
                      <div className="membership-prepaid-summary">
                        <span><strong>{form.paidQuantity || 0}</strong>Paid sessions</span>
                        <span><strong>{form.creditedQuantity || 0}</strong>Total sessions</span>
                        <span><strong>{prepaidSessionBonus}</strong>Bonus sessions</span>
                        <span><strong>{formatCurrency(form.sellingPrice)}</strong>Membership price</span>
                      </div>
                    </>
                  ) : null}
                </>
              ) : form.planType === "PREPAID_SESSIONS" ? (
                <div className="membership-service-picker membership-service-picker-modal">
                  <div className="membership-service-picker-head">
                    <div>
                      <h4>Choose One Service or Package</h4>
                      <p>Selecting another item replaces the current selection.</p>
                    </div>
                  </div>

                  <div className="membership-tree-toolbar">
                    <input
                      type="search"
                      value={prepaidItemSearch}
                      onChange={(event) => setPrepaidItemSearch(event.target.value)}
                      placeholder="Search service, package or category"
                      aria-label="Search prepaid eligible items"
                    />
                    <div className="membership-tree-toolbar-actions">
                      <button
                        type="button"
                        onClick={() => setExpandedIds(new Set(collectExpandableIds(prepaidEligibleTree)))}
                      >
                        Expand
                      </button>
                      <button type="button" onClick={() => setExpandedIds(new Set())}>
                        Collapse
                      </button>
                    </div>
                  </div>

                  <div className="membership-service-list membership-tree-list">
                    {prepaidEligibleItems.length === 0 ? (
                      <div className="membership-empty-small">
                        No canonically classified Service or Package is available.
                      </div>
                    ) : visiblePrepaidTree.length === 0 ? (
                      <div className="membership-empty-small">
                        No eligible Service or Package matches this search. The current selection is preserved.
                      </div>
                    ) : (
                      visiblePrepaidTree.map((node) => (
                        <MembershipMenuTreeNode
                          key={node.id}
                          node={node}
                          depth={0}
                          expandedIds={expandedIds}
                          selectedIds={selectedPrepaidItemKeys}
                          onToggleExpand={toggleExpand}
                          onSetSelection={setEligibleSelection}
                          forceExpanded={Boolean(prepaidItemSearch.trim())}
                          selectionMode="single"
                          onSelectItem={selectPrepaidItem}
                        />
                      ))
                    )}
                  </div>

                  {prepaidItemSearch.trim() ? (
                    <div className="membership-tree-search-note">
                      Showing {visiblePrepaidItemCount} matching eligible item{visiblePrepaidItemCount === 1 ? "" : "s"}.
                    </div>
                  ) : null}
                  {selectedPrepaidItem ? (
                    <div className="membership-selected-item membership-selected-item-compact">
                      <strong>{selectedPrepaidItem.name}</strong>
                      <span>{selectedPrepaidItem.itemKind} · {formatCurrency(selectedPrepaidItem.price)}</span>
                      {selectedPrepaidItem.categoryPath?.length ? <small>{selectedPrepaidItem.categoryPath.join(" / ")}</small> : null}
                      {selectedPrepaidItem.itemKind === "PACKAGE" && selectedPrepaidItem.packageIncludes ? <p><b>Package Includes:</b> {selectedPrepaidItem.packageIncludes}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="membership-service-picker membership-service-picker-modal">
                  <div className="membership-service-picker-head">
                    <div>
                      <h4>Eligible Services — {form.eligibleMenuItemIds.length} selected</h4>
                      <p>
                        {activeMenu?.label
                          ? `Select billable items from ${activeMenu.label}.`
                          : "Select the menu items covered by this discount plan."}
                      </p>
                    </div>
                    <div className="membership-service-actions">
                      <button type="button" onClick={selectAllItems} disabled={allEligibleItemIds.length === 0}>
                        Select All
                      </button>
                      <button type="button" onClick={deselectAllItems} disabled={form.eligibleMenuItemIds.length === 0}>
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="membership-tree-toolbar">
                    <input
                      type="search"
                      value={serviceSearch}
                      onChange={(event) => setServiceSearch(event.target.value)}
                      placeholder="Search services or categories"
                    />
                    <div className="membership-tree-toolbar-actions">
                      <button
                        type="button"
                        onClick={() => setExpandedIds(new Set(collectExpandableIds(eligibleTree)))}
                      >
                        Expand
                      </button>
                      <button type="button" onClick={() => setExpandedIds(new Set())}>
                        Collapse
                      </button>
                    </div>
                  </div>

                  <div className="membership-service-list membership-tree-list">
                    {eligibleItems.length === 0 ? (
                      <div className="membership-empty-small">
                        {activeMenu?.label
                          ? `No active billable items found in ${activeMenu.label}.`
                          : "No active menu is available for membership selection."}
                      </div>
                    ) : visibleTree.length === 0 ? (
                      <div className="membership-empty-small">
                        No services match this search. Existing selections are preserved.
                      </div>
                    ) : (
                      visibleTree.map((node) => (
                        <MembershipMenuTreeNode
                          key={`${node.sourceType || "node"}:${node.id}`}
                          node={node}
                          depth={0}
                          expandedIds={expandedIds}
                          selectedIds={selectedIdSet}
                          onToggleExpand={toggleExpand}
                          onSetSelection={setEligibleSelection}
                          forceExpanded={Boolean(serviceSearch.trim())}
                        />
                      ))
                    )}
                  </div>

                  {serviceSearch.trim() && (
                    <div className="membership-tree-search-note">
                      Showing {visibleItemCount} matching eligible item{visibleItemCount === 1 ? "" : "s"}.
                      Selections outside the search remain unchanged.
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer className="membership-editor-footer">
              {editorView === "services" ? (
                <button type="button" className="membership-primary-button" onClick={() => setEditorView("details")}>
                  Done
                </button>
              ) : (
                <>
                  <button type="button" className="membership-secondary-button" onClick={requestCloseEditor}>
                    Cancel
                  </button>
                  <button type="submit" className="membership-primary-button" disabled={saving || loading}>
                    {saving ? "Saving..." : editingPlanId ? "Update Plan" : "Create Plan"}
                  </button>
                </>
              )}
            </footer>
          </form>
        </div>
      )}

      {isServiceScopeConfirmOpen && (
        <div
          className="membership-editor-overlay membership-propagation-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="membership-propagation-title"
        >
          <div className="membership-editor-modal membership-propagation-modal">
            <header className="membership-editor-header">
              <div>
                <p className="membership-dashboard-eyebrow">Confirm service update</p>
                <h3 id="membership-propagation-title">Apply Eligible Service Changes</h3>
              </div>
              <button
                type="button"
                className="membership-editor-close"
                onClick={cancelServiceScopeConfirmation}
                disabled={saving}
              >
                Close
              </button>
            </header>

            <div className="membership-editor-body membership-propagation-body">
              {error && <div className="membership-message error">{error}</div>}
              <p className="membership-propagation-copy">
                The eligible service list has changed. Choose who should receive the updated list.
                Existing purchased price, discount percentage, duration and minimum bill remain unchanged.
              </p>

              <div className="membership-service-scope-card membership-propagation-options">
                <label>
                  <input
                    type="radio"
                    name="serviceEligibilityScopeConfirmation"
                    value={SERVICE_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED}
                    checked={serviceEligibilityScope === SERVICE_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED}
                    onChange={() =>
                      setServiceEligibilityScope(SERVICE_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED)
                    }
                    disabled={saving}
                  />
                  <span>
                    <strong>Apply service changes to existing members and future memberships</strong>
                    <small>Active and scheduled members will use this updated service list.</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="serviceEligibilityScopeConfirmation"
                    value={SERVICE_SCOPE_OPTIONS.FUTURE_ONLY}
                    checked={serviceEligibilityScope === SERVICE_SCOPE_OPTIONS.FUTURE_ONLY}
                    onChange={() => setServiceEligibilityScope(SERVICE_SCOPE_OPTIONS.FUTURE_ONLY)}
                    disabled={saving}
                  />
                  <span>
                    <strong>Apply only to new memberships and renewals</strong>
                    <small>Existing active and scheduled periods keep their current eligible services.</small>
                  </span>
                </label>
                {removedEligibleServiceCount > 0 &&
                serviceEligibilityScope === SERVICE_SCOPE_OPTIONS.ALL_ACTIVE_AND_SCHEDULED ? (
                  <div className="membership-service-scope-warning">
                    {removedEligibleServiceCount} service{removedEligibleServiceCount === 1 ? "" : "s"} will be
                    removed from existing active and scheduled members.
                  </div>
                ) : null}
              </div>
            </div>

            <footer className="membership-editor-footer">
              <button
                type="button"
                className="membership-secondary-button"
                onClick={cancelServiceScopeConfirmation}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="membership-primary-button"
                onClick={confirmServiceScopeUpdate}
                disabled={!serviceEligibilityScope || saving}
              >
                {saving ? "Updating..." : "Confirm Update"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {isActivationOpen && (
        <div className="membership-editor-overlay" role="dialog" aria-modal="true">
          <form className="membership-editor-modal membership-activation-modal" onSubmit={activateCustomerMembership}>
            <header className="membership-editor-header">
              <div>
                <p className="membership-dashboard-eyebrow">Customer membership</p>
                <h3>Activate Membership</h3>
              </div>
              <button type="button" className="membership-editor-close" onClick={requestCloseActivation}>
                Close
              </button>
            </header>

            <div className="membership-editor-body">
              {error && <div className="membership-message error">{error}</div>}

              <label className="membership-field">
                <span>Customer mobile number</span>
                <div className="membership-lookup-row">
                  <input
                    type="tel"
                    value={activationForm.customerMobile}
                    onChange={(event) => updateActivationForm("customerMobile", event.target.value)}
                    placeholder="9876543210"
                    required
                  />
                  <button type="button" onClick={lookupActivationCustomer} disabled={activationLookupLoading}>
                    {activationLookupLoading ? "Checking..." : "Lookup"}
                  </button>
                </div>
              </label>

              {activationCustomerLookup && (
                <div className={`membership-message ${activationCustomerLookup.found ? "success" : "error"}`}>
                  {activationCustomerLookup.found
                    ? "Existing customer found for this vendor."
                    : "No prior customer record found for this vendor. Activation will create or attach the mobile number safely."}
                </div>
              )}

              <label className="membership-field">
                <span>Membership plan</span>
                <select
                  value={activationForm.membershipPlanId}
                  onChange={(event) => updateActivationForm("membershipPlanId", event.target.value)}
                  required
                >
                  <option value="">Select active plan</option>
                  {activeMembershipPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {formatPlanType(plan.planType)} — {formatCurrency(plan.sellingPrice)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedActivationPlan && (
                <div className="membership-activation-summary">
                  <span>
                    <strong>{formatCurrency(selectedActivationPlan.sellingPrice)}</strong>
                    Selling price
                  </span>
                  <span>
                    <strong>{formatDuration(selectedActivationPlan.duration)}</strong>
                    Duration
                  </span>
                  <span>
                    <strong>{formatDate(activationExpiry)}</strong>
                    Expiry
                  </span>
                  {normalizePlanType(selectedActivationPlan.planType) === "PREPAID_VALUE" ? (
                    <span><strong>{formatCurrency(selectedActivationPlan.prepaidValueConfig?.prepaidValue)}</strong>Initial wallet credit</span>
                  ) : null}
                  {normalizePlanType(selectedActivationPlan.planType) === "PREPAID_SESSIONS" ? (
                    <>
                      <span><strong>{selectedActivationPlan.prepaidSessionsConfig?.creditedQuantity || 0}</strong>Initial session credits</span>
                      <span>
                        <strong>{prepaidEligibleItems.find((item) => item.itemId === selectedActivationPlan.prepaidSessionsConfig?.eligibleItemId && item.itemSource === selectedActivationPlan.prepaidSessionsConfig?.eligibleItemSource)?.name || "Eligible item"}</strong>
                        Service or Package
                      </span>
                    </>
                  ) : null}
                </div>
              )}

              {selectedActivationPlan && normalizePlanType(selectedActivationPlan.planType) !== "DISCOUNT" ? (
                <div className="membership-detail-note">
                  This records the advance payment and creates one independent prepaid wallet after the server confirms activation.
                </div>
              ) : null}

              <div className="membership-form-row">
                <label className="membership-field">
                  <span>Payment method</span>
                  <select
                    value={activationForm.paymentMethod}
                    onChange={(event) => updateActivationForm("paymentMethod", event.target.value)}
                    required
                  >
                    {PAYMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="membership-field">
                  <span>Payment amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={activationForm.paymentAmount}
                    onChange={(event) => updateActivationForm("paymentAmount", event.target.value)}
                    required
                  />
                </label>
              </div>

              <label className="membership-field">
                <span>Payment reference {activationForm.paymentMethod === "CASH" ? "(optional)" : ""}</span>
                <input
                  type="text"
                  value={activationForm.paymentReference}
                  onChange={(event) => updateActivationForm("paymentReference", event.target.value)}
                  placeholder={activationForm.paymentMethod === "CASH" ? "Optional note" : "UPI / card / online reference"}
                  maxLength={160}
                  required={activationForm.paymentMethod !== "CASH"}
                />
              </label>
            </div>

            <footer className="membership-editor-footer">
              <button type="button" className="membership-secondary-button" onClick={requestCloseActivation}>
                Cancel
              </button>
              <button
                type="submit"
                className="membership-primary-button"
                disabled={activationSaving || !selectedActivationPlan}
              >
                {activationSaving ? "Activating..." : "Activate Membership"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
