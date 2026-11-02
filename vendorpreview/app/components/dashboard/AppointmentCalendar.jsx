"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import {
  addDistinctServiceId,
  buildAppointmentServiceIndex,
  buildCalendarMonth,
  filterAppointmentServices,
  formatAppointmentServiceLabel,
  getNextCategoryChoices,
  monthFromDate,
  normalizeAppointmentPhone,
  removeServiceId,
  serializeAppointmentLocalDateTime,
  shiftCalendarMonth,
  summarizeAppointmentServices,
} from "./appointmentCalendarUtils.mjs";
import "./AppointmentCalendar.css";

function istDateValue(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function submissionKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `appointment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyForm(date) {
  return { customerName: "", phone: "", bookingDate: date, bookingTime: "", selectedServiceIds: [], staffResourceId: "", notes: "" };
}

function formatAppointmentTime(value) {
  const appointmentDate = value ? new Date(value) : null;
  if (!appointmentDate || Number.isNaN(appointmentDate.getTime())) return "Time unavailable";
  return appointmentDate.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit",
  });
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || "Appointment request failed");
  return data;
}

function ServicePicker({ services, selectedIds, onAdd, onRemove }) {
  const [query, setQuery] = useState("");
  const [categoryPath, setCategoryPath] = useState([]);
  const deferredQuery = useDeferredValue(query);
  const matchingServices = useMemo(
    () => filterAppointmentServices(services, deferredQuery, categoryPath),
    [services, deferredQuery, categoryPath]
  );
  const categoryChoices = useMemo(
    () => getNextCategoryChoices(services, categoryPath),
    [services, categoryPath]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedServices = selectedIds
    .map((itemId) => services.find((service) => service.itemId === itemId))
    .filter(Boolean);
  const visibleServices = matchingServices.slice(0, 60);

  return (
    <fieldset className="appointment-picker">
      <legend>Services</legend>
      {selectedServices.length > 0 && (
        <div className="appointment-selected-services" aria-label="Selected services">
          {selectedServices.map((service) => (
            <div className="appointment-selected-service" key={service.itemId}>
              <span><strong>{service.name}</strong><small>{service.categoryPath || "Service"}</small></span>
              <button type="button" onClick={() => onRemove(service.itemId)} aria-label={`Remove ${service.name}`}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <label className="appointment-search-field">
        <span>{selectedServices.length ? "Add another service" : "Find a service"}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search service or category path" autoComplete="off" />
      </label>
      {!query.trim() && (
        <div className="appointment-category-browser">
          {categoryPath.length > 0 && (
            <div className="appointment-category-path" aria-label="Selected service category">
              <button type="button" onClick={() => setCategoryPath([])}>All services</button>
              {categoryPath.map((segment, index) => (
                <button type="button" key={`${segment}-${index}`} onClick={() => setCategoryPath(categoryPath.slice(0, index + 1))}>{segment}</button>
              ))}
            </div>
          )}
          {categoryChoices.length > 0 && (
            <div className="appointment-category-chips" aria-label="Service categories">
              {categoryChoices.map((category) => (
                <button type="button" key={category} onClick={() => setCategoryPath([...categoryPath, category])}>{category}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="appointment-service-results" role="listbox" aria-label="Available services">
        {visibleServices.map((service) => {
          const selected = selectedIdSet.has(service.itemId);
          return (
            <button type="button" role="option" aria-selected={selected} disabled={selected} key={service.itemId} onClick={() => onAdd(service.itemId)}>
              <span><strong>{service.name}</strong><small>{service.categoryPath || "Service"}</small></span>
              <b>{selected ? "Added" : "Add"}</b>
            </button>
          );
        })}
        {visibleServices.length === 0 && <p>No matching services found.</p>}
        {matchingServices.length > visibleServices.length && <p>Refine your search to see more results.</p>}
      </div>
    </fieldset>
  );
}

function CustomerLookup({ vendorId, form, setForm }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [lookupError, setLookupError] = useState("");
  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    if (!vendorId || deferredQuery.length < 2) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ vendorId, search: deferredQuery, limit: "10" });
      fetch(`${API_BASE_URL}/api/vendor/dashboard/customer?${params}`, {
        cache: "no-store", headers: getVendorAuthHeaders(vendorId), signal: controller.signal,
      })
        .then(readJson)
        .then((data) => {
          setResults(Array.isArray(data?.data?.matches) ? data.data.matches : []);
          setLookupError("");
        })
        .catch((requestError) => {
          if (requestError.name !== "AbortError") {
            setResults([]);
            setLookupError("Customer search is temporarily unavailable. You can still enter details manually.");
          }
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [deferredQuery, vendorId]);

  function updateQuery(value) {
    setQuery(value); setResults([]); setLookupError("");
  }

  function selectCustomer(customer) {
    setForm((current) => ({
      ...current,
      customerName: String(customer?.name || ""),
      phone: normalizeAppointmentPhone(customer?.phone || customer?.fullNumber),
    }));
    setQuery(""); setResults([]);
  }

  return (
    <fieldset className="appointment-customer-lookup">
      <legend>Customer</legend>
      <label>
        <span>Find an existing customer <small>(optional)</small></span>
        <input type="search" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search by name or mobile number" autoComplete="off" />
      </label>
      {results.length > 0 && (
        <div className="appointment-customer-results" role="listbox" aria-label="Customer matches">
          {results.map((customer) => (
            <button type="button" role="option" aria-selected="false" key={customer.customerId} onClick={() => selectCustomer(customer)}>
              <strong>{customer.name || "Customer"}</strong><small>{customer.phone || customer.fullNumber || "Mobile unavailable"}</small>
            </button>
          ))}
        </div>
      )}
      {lookupError && <p className="appointment-inline-warning">{lookupError}</p>}
      <div className="appointment-form-grid">
        <label><span>Customer name</span><input required value={form.customerName} onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} /></label>
        <label>
          <span>Mobile number</span>
          <input required inputMode="numeric" autoComplete="tel" pattern="[0-9]{10}" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: normalizeAppointmentPhone(event.target.value) }))} placeholder="10-digit mobile number" />
        </label>
      </div>
    </fieldset>
  );
}

export function TodayAppointmentsWidget({ vendorId, onOpen }) {
  const [appointments, setAppointments] = useState([]);
  useEffect(() => {
    if (!vendorId) return undefined;
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/enquiries/appointments/today?vendorId=${encodeURIComponent(vendorId)}`, {
      cache: "no-store", headers: getVendorAuthHeaders(vendorId),
    }).then(readJson).then((data) => {
      if (!cancelled) setAppointments(Array.isArray(data?.appointments) ? data.appointments : []);
    }).catch(() => { if (!cancelled) setAppointments([]); });
    return () => { cancelled = true; };
  }, [vendorId]);
  return (
    <button type="button" className="today-appointments-widget" onClick={() => onOpen?.(istDateValue())}>
      <span><strong>Today&apos;s Appointments</strong></span>
      <span className="today-appointments-count">{appointments.length}</span>
    </button>
  );
}

export default function AppointmentCalendar({ vendorId, menuTree, resources, initialDate }) {
  const [date, setDate] = useState(() => initialDate || istDateValue());
  const [visibleMonth, setVisibleMonth] = useState(() => monthFromDate(initialDate || istDateValue()));
  const [monthSummary, setMonthSummary] = useState([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const manualSubmissionKeyRef = useRef(submissionKey());
  const [form, setForm] = useState(() => emptyForm(istDateValue()));
  const services = useMemo(() => buildAppointmentServiceIndex(menuTree), [menuTree]);
  const calendarDays = useMemo(() => buildCalendarMonth(visibleMonth), [visibleMonth]);
  const monthCounts = useMemo(() => new Map(monthSummary.map((day) => [day._id, day])), [monthSummary]);
  const monthHeading = useMemo(() => {
    const [year, month] = visibleMonth.split("-").map(Number);
    return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, 1)));
  }, [visibleMonth]);
  const selectedDayCounts = useMemo(() => {
    const active = appointments.filter((entry) => entry?.appointment?.status !== "CANCELLED");
    return {
      total: active.length,
      requested: active.filter((entry) => entry?.appointment?.status === "REQUESTED").length,
      confirmed: active.filter((entry) => entry?.appointment?.status === "CONFIRMED").length,
    };
  }, [appointments]);

  async function loadAppointments(selectedDate = date) {
    if (!vendorId) return;
    setLoading(true); setError("");
    try {
      const data = await readJson(await fetch(`${API_BASE_URL}/api/enquiries/appointments?vendorId=${encodeURIComponent(vendorId)}&date=${encodeURIComponent(selectedDate)}`, {
        cache: "no-store", headers: getVendorAuthHeaders(vendorId),
      }));
      setAppointments(Array.isArray(data?.appointments) ? data.appointments : []);
    } catch (requestError) {
      setError(requestError.message); setAppointments([]);
    } finally { setLoading(false); }
  }

  async function loadMonthSummary(selectedMonth = visibleMonth) {
    if (!vendorId || !selectedMonth) return;
    setMonthLoading(true);
    try {
      const data = await readJson(await fetch(
        `${API_BASE_URL}/api/enquiries/appointments/month-summary?vendorId=${encodeURIComponent(vendorId)}&month=${encodeURIComponent(selectedMonth)}`,
        { cache: "no-store", headers: getVendorAuthHeaders(vendorId) }
      ));
      setMonthSummary(Array.isArray(data?.days) ? data.days : []);
    } catch (requestError) {
      setMonthSummary([]);
      setError(requestError.message);
    } finally {
      setMonthLoading(false);
    }
  }

  useEffect(() => { loadAppointments(); }, [date, vendorId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadMonthSummary(); }, [visibleMonth, vendorId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!formOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape" && !saving) setFormOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [formOpen, saving]);

  function openBookingForm() {
    setForm((current) => ({ ...current, bookingDate: date }));
    setFormError(""); setFormOpen(true);
  }
  function closeBookingForm() { if (!saving) setFormOpen(false); }

  async function createManual(event) {
    event.preventDefault(); setFormError("");
    let startAt;
    try {
      startAt = serializeAppointmentLocalDateTime(form.bookingDate, form.bookingTime);
      if (!form.selectedServiceIds.length) throw new Error("Choose at least one service for this appointment.");
      if (!/^\d{10}$/.test(form.phone)) throw new Error("Enter a valid 10-digit mobile number.");
    } catch (validationError) { setFormError(validationError.message); return; }

    setSaving(true); setError("");
    try {
      await readJson(await fetch(`${API_BASE_URL}/api/enquiries/appointments/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getVendorAuthHeaders(vendorId) },
        body: JSON.stringify({
          vendorId, submissionKey: manualSubmissionKeyRef.current,
          customerName: form.customerName, phone: form.phone, startAt,
          staffResourceId: form.staffResourceId || null, notes: form.notes,
          services: form.selectedServiceIds.map((itemId) => ({ itemId, quantity: 1 })),
        }),
      }));
      const bookedDate = form.bookingDate;
      const bookedMonth = monthFromDate(bookedDate);
      manualSubmissionKeyRef.current = submissionKey();
      setDate(bookedDate);
      setVisibleMonth(bookedMonth);
      setForm(emptyForm(bookedDate)); setFormOpen(false);
      await Promise.all([loadAppointments(bookedDate), loadMonthSummary(bookedMonth)]);
    } catch (requestError) { setFormError(requestError.message); }
    finally { setSaving(false); }
  }

  async function patchAppointment(id, suffix, body) {
    setError("");
    try {
      await readJson(await fetch(`${API_BASE_URL}/api/enquiries/appointments/${encodeURIComponent(id)}/${suffix}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...getVendorAuthHeaders(vendorId) }, body: JSON.stringify(body),
      }));
      await Promise.all([loadAppointments(), loadMonthSummary()]);
    } catch (requestError) { setError(requestError.message); }
  }

  function changeStatus(entry, status) {
    const reason = status === "CANCELLED" ? window.prompt("Cancellation reason") : "";
    if (status === "CANCELLED" && !String(reason || "").trim()) return;
    patchAppointment(entry._id, "status", { status, reason, version: entry.appointment.version });
  }
  function reschedule(entry) {
    const next = window.prompt("New date and time (YYYY-MM-DDTHH:mm)");
    if (!next) return;
    patchAppointment(entry._id, "reschedule", { startAt: next, version: entry.appointment.version });
  }

  function selectCalendarDate(nextDate) {
    setDate(nextDate);
    const nextMonth = monthFromDate(nextDate);
    if (nextMonth && nextMonth !== visibleMonth) setVisibleMonth(nextMonth);
  }

  function moveMonth(offset) {
    const nextMonth = shiftCalendarMonth(visibleMonth, offset);
    if (!nextMonth) return;
    setVisibleMonth(nextMonth);
    setDate(`${nextMonth}-01`);
  }

  function selectToday() {
    const today = istDateValue();
    setVisibleMonth(monthFromDate(today));
    setDate(today);
  }

  return (
    <section className="appointment-calendar">
      <div className="appointment-month-card">
        <div className="appointment-month-header">
          <div className="appointment-month-title">
            <p>Appointment Calendar</p>
            <div className="appointment-month-navigation">
              <button type="button" className="appointment-month-arrow" onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button>
              <h2 aria-live="polite">{monthHeading}</h2>
              <button type="button" className="appointment-month-arrow" onClick={() => moveMonth(1)} aria-label="Next month">›</button>
            </div>
          </div>
          <div className="appointment-month-actions">
            <button type="button" className="appointment-secondary-button" onClick={selectToday}>Today</button>
            <button type="button" onClick={openBookingForm}>Book Appointment</button>
          </div>
        </div>
        <div className="appointment-weekdays" aria-hidden="true">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="appointment-month-grid" aria-label={monthHeading}>
          {calendarDays.map((calendarDay) => {
            const counts = monthCounts.get(calendarDay.date);
            const isSelected = calendarDay.date === date;
            const isToday = calendarDay.date === istDateValue();
            return (
              <button
                type="button"
                key={calendarDay.date}
                className={`${calendarDay.inMonth ? '' : 'outside-month'}${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
                aria-label={`${calendarDay.date}${counts?.total ? `, ${counts.total} appointments` : ', no appointments'}`}
                aria-pressed={isSelected}
                onClick={() => selectCalendarDate(calendarDay.date)}
              >
                <span>{calendarDay.day}</span>
                {counts?.total > 0 && <b>{counts.total}</b>}
              </button>
            );
          })}
        </div>
        {monthLoading && <p className="appointment-month-loading">Updating appointment counts...</p>}
      </div>
      {error && <p className="appointment-error" role="alert">{error}</p>}
      <div className="appointment-day-heading">
        <div><p>Selected date</p><h3>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))}</h3></div>
        <div className="appointment-day-summary" aria-label="Selected date appointment summary">
          <span><b>{selectedDayCounts.total}</b><small>Total</small></span>
          <span><b>{selectedDayCounts.requested}</b><small>Requested</small></span>
          <span><b>{selectedDayCounts.confirmed}</b><small>Confirmed</small></span>
        </div>
      </div>
      {loading ? <p>Loading appointments...</p> : appointments.length === 0 ? <p className="appointment-empty">No appointments for this date.</p> : (
        <div className="appointment-list">
          {appointments.map((entry) => {
            const appointment = entry.appointment || {};
            const terminal = ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appointment.status);
            const services = Array.isArray(appointment.services) ? appointment.services : [];
            return (
              <details className="appointment-card" key={entry._id}>
                <summary>
                  <span className="appointment-summary-heading">
                    <strong>{formatAppointmentTime(appointment.startAt)} · {appointment.customerName || "Customer"}</strong>
                    <span className={`appointment-status status-${String(appointment.status || "").toLowerCase()}`}>{appointment.status}</span>
                  </span>
                  <span className="appointment-summary-service">{summarizeAppointmentServices(services)}</span>
                  <span className="appointment-summary-staff">{appointment.staffNameSnapshot ? `Staff: ${appointment.staffNameSnapshot}` : "Staff not assigned"}</span>
                </summary>
                <div className="appointment-card-details">
                  <p><strong>Phone</strong><span>{entry.phone || "No phone"}</span></p>
                  <div className="appointment-service-details">
                    <strong>Services</strong>
                    <ul>{services.length > 0 ? services.map((service, index) => (
                      <li key={`${service.itemId || service.name || "service"}-${index}`}>
                        <span>{formatAppointmentServiceLabel(service)}</span>
                        {Array.isArray(service.categoryPath) && service.categoryPath.length > 0 && <small>{service.categoryPath.join(" / ")}</small>}
                      </li>
                    )) : <li>Service not specified</li>}</ul>
                  </div>
                  {!terminal && <label className="appointment-staff-control">
                    <span>Assigned staff</span>
                    <select aria-label={`Assign staff for ${appointment.customerName || "appointment"}`} value={appointment.staffResourceId || ""} onChange={(event) => patchAppointment(entry._id, "staff", { staffResourceId: event.target.value || null, version: appointment.version })}>
                      <option value="">No staff assigned</option>
                      {(Array.isArray(resources) ? resources : []).filter((item) => item?.status !== "Inactive").map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                    </select>
                  </label>}
                  {!terminal && <div className="appointment-actions">
                    {appointment.status === "REQUESTED" && <button type="button" onClick={() => changeStatus(entry, "CONFIRMED")}>Confirm</button>}
                    <button type="button" onClick={() => reschedule(entry)}>Reschedule</button>
                    <button type="button" onClick={() => changeStatus(entry, "COMPLETED")}>Complete</button>
                    <button type="button" onClick={() => changeStatus(entry, "NO_SHOW")}>No-show</button>
                    <button type="button" className="danger" onClick={() => changeStatus(entry, "CANCELLED")}>Cancel</button>
                  </div>}
                </div>
              </details>
            );
          })}
        </div>
      )}
      {formOpen && (
        <div className="appointment-booking-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeBookingForm(); }}>
          <section className="appointment-booking-dialog" role="dialog" aria-modal="true" aria-labelledby="appointment-booking-title">
            <header><div><p>Calendar</p><h2 id="appointment-booking-title">Book Appointment</h2></div><button type="button" className="appointment-close-button" onClick={closeBookingForm} aria-label="Close booking form">×</button></header>
            <form className="appointment-form" onSubmit={createManual}>
              <CustomerLookup vendorId={vendorId} form={form} setForm={setForm} />
              <fieldset className="appointment-date-time">
                <legend>Date and time</legend>
                <div className="appointment-form-grid">
                  <label><span>Appointment date</span><input required type="date" value={form.bookingDate} onChange={(event) => setForm((current) => ({ ...current, bookingDate: event.target.value }))} /></label>
                  <label><span>Appointment time</span><input required type="time" step="900" value={form.bookingTime} onChange={(event) => setForm((current) => ({ ...current, bookingTime: event.target.value }))} /></label>
                </div>
                <small className="appointment-timezone-note">Times are saved in India Standard Time (Asia/Kolkata).</small>
              </fieldset>
              <ServicePicker
                services={services}
                selectedIds={form.selectedServiceIds}
                onAdd={(itemId) => setForm((current) => ({
                  ...current,
                  selectedServiceIds: addDistinctServiceId(current.selectedServiceIds, itemId),
                }))}
                onRemove={(itemId) => setForm((current) => ({
                  ...current,
                  selectedServiceIds: removeServiceId(current.selectedServiceIds, itemId),
                }))}
              />
              <div className="appointment-form-grid">
                <label><span>Staff member <small>(optional)</small></span><select value={form.staffResourceId} onChange={(event) => setForm((current) => ({ ...current, staffResourceId: event.target.value }))}>
                  <option value="">No staff assigned</option>
                  {(Array.isArray(resources) ? resources : []).filter((item) => item?.status !== "Inactive").map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                </select></label>
                <label><span>Notes <small>(optional)</small></span><input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              </div>
              {formError && <p className="appointment-error" role="alert">{formError}</p>}
              <footer><button type="button" className="appointment-secondary-button" onClick={closeBookingForm}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Appointment"}</button></footer>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
