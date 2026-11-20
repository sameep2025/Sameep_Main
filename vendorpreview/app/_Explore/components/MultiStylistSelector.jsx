import { useRef } from "react";
import {
  getItemStylistAllocations,
  getStylistAllocationTotalPercent,
  getStylistAllocationError,
  getStylistSelectionSummary,
} from "../stylistAllocation.mjs";

export default function MultiStylistSelector({
  item,
  resources,
  resourceLabel,
  onToggle,
  onPercentChange,
}) {
  const detailsRef = useRef(null);
  const allocations = getItemStylistAllocations(item);
  const selectedIds = new Set(allocations.map(({ resourceId }) => resourceId));
  const error = getStylistAllocationError(item);
  const totalPercent = getStylistAllocationTotalPercent(item);
  const summary = getStylistSelectionSummary(item, resourceLabel);

  return (
    <div className="quick-billing-stylist-selector">
      <div className="quick-billing-stylist-label">{resourceLabel}</div>
      <details ref={detailsRef} className="quick-billing-stylist-dropdown">
        <summary>
          <span title={summary}>{summary}</span>
          <span className="quick-billing-stylist-chevron" aria-hidden="true" />
        </summary>
        <div className="quick-billing-stylist-menu">
          <div className="quick-billing-stylist-options">
            {resources.length ? resources.map((resource) => {
              const resourceId = String(resource._id);
              const selected = selectedIds.has(resourceId);
              const allocation = allocations.find((entry) => entry.resourceId === resourceId);
              return (
                <div key={resourceId} className={`quick-billing-stylist-row${selected ? " selected" : ""}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggle(resource)}
                    />
                    <span>{resource.name}</span>
                  </label>
                  {selected ? (
                    allocations.length > 1 ? (
                      <span className="quick-billing-stylist-percent-input">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`${resource.name} allocation percentage`}
                          value={allocation?.allocationPercent || ""}
                          onChange={(event) => onPercentChange(resourceId, event.target.value)}
                          aria-invalid={Boolean(error)}
                        />
                        <span>%</span>
                      </span>
                    ) : (
                      <span className="quick-billing-stylist-single-percent">100%</span>
                    )
                  ) : null}
                </div>
              );
            }) : (
              <div className="quick-billing-stylist-empty">No active stylists available</div>
            )}
          </div>
          {allocations.length > 1 ? (
            <div className={`quick-billing-stylist-total${error ? " invalid" : ""}`}>
              <span>Total</span>
              <strong>{totalPercent === null ? "Invalid" : `${totalPercent}%`}</strong>
            </div>
          ) : null}
          {error ? <div className="quick-billing-stylist-error" role="alert">{error}</div> : null}
          <button
            type="button"
            className="quick-billing-stylist-done"
            disabled={Boolean(error)}
            onClick={() => {
              if (detailsRef.current) detailsRef.current.open = false;
            }}
          >
            Done
          </button>
        </div>
      </details>
    </div>
  );
}
