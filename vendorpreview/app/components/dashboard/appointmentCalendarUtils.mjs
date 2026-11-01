function text(value) {
  return String(value ?? "").trim();
}

export function buildAppointmentServiceIndex(nodes, ancestors = [], result = []) {
  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    const name = text(node?.name || node?.title);
    const nodePath = name ? [...ancestors, name] : ancestors;
    const children = Array.isArray(node?.children) ? node.children : [];

    if (children.length) {
      buildAppointmentServiceIndex(children, nodePath, result);
      return;
    }

    const itemId = node?.vendorMenuNodeId || node?.vendorPriceNodeId || node?._id || node?.id;
    if (!itemId || node?.price === null || node?.price === undefined) return;

    const categorySegments = nodePath.slice(0, -1);
    const categoryPath = categorySegments.join(" / ");
    result.push({
      itemId: String(itemId),
      name,
      categorySegments,
      categoryPath,
      fullPath: nodePath.join(" / "),
      searchText: `${name} ${categoryPath}`.toLocaleLowerCase("en-IN"),
    });
  });
  return result;
}

export function filterAppointmentServices(services, query, categoryPath = []) {
  const normalizedQuery = text(query).toLocaleLowerCase("en-IN");
  const selectedPath = Array.isArray(categoryPath) ? categoryPath : [];

  return (Array.isArray(services) ? services : []).filter((service) => {
    if (normalizedQuery) return service.searchText.includes(normalizedQuery);
    return selectedPath.every((segment, index) => service.categorySegments[index] === segment);
  });
}

export function getNextCategoryChoices(services, categoryPath = []) {
  const selectedPath = Array.isArray(categoryPath) ? categoryPath : [];
  const choices = new Set();

  (Array.isArray(services) ? services : []).forEach((service) => {
    if (!selectedPath.every((segment, index) => service.categorySegments[index] === segment)) return;
    const next = service.categorySegments[selectedPath.length];
    if (next) choices.add(next);
  });

  return [...choices];
}

export function serializeAppointmentLocalDateTime(dateValue, timeValue) {
  const date = text(dateValue);
  const time = text(timeValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid appointment date.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a valid appointment time.");

  const [year, month, day] = date.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) throw new Error("Choose a valid appointment date.");

  return `${date}T${time}`;
}

export function normalizeAppointmentPhone(value) {
  return String(value ?? "").replace(/\D/g, "").slice(-10);
}

export function addDistinctServiceId(selectedIds, itemId) {
  const ids = Array.isArray(selectedIds) ? selectedIds : [];
  const normalizedId = text(itemId);
  if (!normalizedId || ids.includes(normalizedId)) return ids;
  return [...ids, normalizedId];
}

export function removeServiceId(selectedIds, itemId) {
  const ids = Array.isArray(selectedIds) ? selectedIds : [];
  return ids.filter((id) => id !== itemId);
}

export function formatAppointmentServiceLabel(service) {
  const name = text(service?.name) || "Service";
  const quantity = Number(service?.quantity);
  return Number.isFinite(quantity) && quantity > 1 ? `${name} × ${quantity}` : name;
}

export function summarizeAppointmentServices(services, limit = 2) {
  const labels = (Array.isArray(services) ? services : []).map(formatAppointmentServiceLabel);
  if (!labels.length) return "Service not specified";
  const visibleLimit = Math.max(1, Number(limit) || 2);
  const visible = labels.slice(0, visibleLimit).join(", ");
  return labels.length > visibleLimit ? `${visible} +${labels.length - visibleLimit} more` : visible;
}

function dateParts(dateValue) {
  const match = text(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function monthFromDate(dateValue) {
  const parts = dateParts(dateValue);
  return parts ? `${parts.year}-${String(parts.month).padStart(2, "0")}` : "";
}

export function shiftCalendarMonth(monthValue, offset) {
  const match = text(monthValue).match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + Number(offset || 0), 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildCalendarMonth(monthValue) {
  const match = text(monthValue).match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return [];
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const gridStart = new Date(Date.UTC(year, monthIndex, 1 - firstWeekday));

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart.getTime() + index * 24 * 60 * 60 * 1000);
    const date = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
    return {
      date,
      day: day.getUTCDate(),
      inMonth: day.getUTCFullYear() === year && day.getUTCMonth() === monthIndex,
    };
  });
}
