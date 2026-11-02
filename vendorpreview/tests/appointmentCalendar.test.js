/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const calendar = fs.readFileSync(path.join(root, 'app/components/dashboard/AppointmentCalendar.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app/components/dashboard/AppointmentCalendar.css'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'app/_Explore/Explore.jsx'), 'utf8');
const enquiries = fs.readFileSync(path.join(root, 'app/components/dashboard/EnquiriesDashboard.jsx'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'app/Profile/Profile.jsx'), 'utf8');
const utilsUrl = pathToFileURL(path.join(root, 'app/components/dashboard/appointmentCalendarUtils.mjs')).href;

test('Calendar is isolated in the vendor dashboard and widget is vendor-session only', () => {
  assert.match(explore, /title: "Calendar"/);
  assert.match(explore, /viewMode === "appointment-calendar"/);
  assert.match(explore, /new-dashboard-overlay appointment-calendar-dashboard-overlay/);
  assert.match(explore, /hasActiveVendorSession && viewMode === "preview"/);
  assert.match(explore, /<TodayAppointmentsWidget/);
});

test('Calendar reads and writes only through authenticated appointment APIs', () => {
  assert.match(calendar, /getVendorAuthHeaders\(vendorId\)/);
  assert.match(calendar, /appointments\/today/);
  assert.match(calendar, /appointments\/manual/);
  assert.match(calendar, /appointments\/month-summary/);
  assert.match(calendar, /"status"/);
  assert.match(calendar, /"reschedule"/);
  assert.match(calendar, /"staff"/);
});

test('monthly calendar supports six-week grids and year-boundary navigation', async () => {
  const { buildCalendarMonth, monthFromDate, shiftCalendarMonth } = await import(utilsUrl);
  const november = buildCalendarMonth('2026-11');
  assert.equal(november.length, 42);
  assert.equal(november.filter((day) => day.inMonth).length, 30);
  assert.equal(monthFromDate('2026-11-30'), '2026-11');
  assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01');
  assert.equal(shiftCalendarMonth('2027-01', -1), '2026-12');
  assert.match(calendar, /Previous month/);
  assert.match(calendar, /Next month/);
  assert.match(calendar, />Today</);
  assert.match(calendar, /selectedDayCounts\.total/);
  assert.match(calendar, /selectedDayCounts\.requested/);
  assert.match(calendar, /selectedDayCounts\.confirmed/);
});

test('month counts refresh after appointment mutations and exclude cancelled status', () => {
  assert.match(calendar, /Promise\.all\(\[loadAppointments\(\), loadMonthSummary\(\)\]\)/);
  assert.match(calendar, /status !== "CANCELLED"/);
  assert.match(calendar, /monthCounts\.get\(calendarDay\.date\)/);
});

test('monthly calendar uses compact controls and date cells without changing navigation', () => {
  assert.match(calendar, /appointment-month-header/);
  assert.match(calendar, /appointment-month-navigation[\s\S]*Previous month[\s\S]*monthHeading[\s\S]*Next month/);
  assert.match(calendar, /appointment-month-actions[\s\S]*Today[\s\S]*Book Appointment/);
  assert.match(css, /appointment-month-grid button[^}]*min-height: 38px/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*appointment-month-grid button[^}]*min-height: 44px/);
});

test('appointment rows are accessible collapsed summaries with full controls on expansion', () => {
  assert.match(calendar, /<details className="appointment-card"/);
  assert.match(calendar, /<summary>[\s\S]*appointment-summary-heading[\s\S]*appointment-summary-service[\s\S]*appointment-summary-staff[\s\S]*<\/summary>/);
  assert.match(calendar, /appointment-card-details[\s\S]*Phone[\s\S]*Services[\s\S]*Assigned staff[\s\S]*appointment-actions/);
  assert.match(css, /appointment-card summary:focus-visible/);
});

test('appointment service labels omit single quantities and retain larger quantities', async () => {
  const { formatAppointmentServiceLabel, summarizeAppointmentServices } = await import(utilsUrl);
  assert.equal(formatAppointmentServiceLabel({ name: 'Hair Cut', quantity: 1 }), 'Hair Cut');
  assert.equal(formatAppointmentServiceLabel({ name: 'Hair Cut', quantity: 3 }), 'Hair Cut × 3');
  assert.equal(summarizeAppointmentServices([
    { name: 'Hair Cut', quantity: 1 },
    { name: 'Shave', quantity: 1 },
    { name: 'Facial', quantity: 2 },
  ]), 'Hair Cut, Shave +1 more');
});

test('homepage widget explicitly opens Calendar on the current IST date', () => {
  assert.match(calendar, /onOpen\?\.\(istDateValue\(\)\)/);
  assert.match(explore, /setAppointmentCalendarInitialDate\(today\)/);
  assert.match(explore, /initialDate=\{appointmentCalendarInitialDate\}/);
  assert.match(calendar, /Today&apos;s Appointments/);
  assert.doesNotMatch(calendar, /Private vendor view/);
  assert.match(css, /today-appointments-widget[^}]*min-height: 46px/);
});

test('booking uses separate date and time controls with the selected Calendar date', () => {
  assert.doesNotMatch(calendar, /type="datetime-local"/);
  assert.match(calendar, /type="date" value=\{form\.bookingDate\}/);
  assert.match(calendar, /type="time" step="900" value=\{form\.bookingTime\}/);
  assert.match(calendar, /bookingDate: date/);
  assert.match(calendar, /serializeAppointmentLocalDateTime\(form\.bookingDate, form\.bookingTime\)/);
  assert.match(calendar, /Asia\/Kolkata/);
  assert.match(css, /color-scheme: dark/);
  assert.match(css, /::-webkit-calendar-picker-indicator/);
  assert.match(css, /cursor: pointer/);
});

test('appointment local date and time serialization rejects partial browser values', async () => {
  const { serializeAppointmentLocalDateTime } = await import(utilsUrl);
  assert.equal(serializeAppointmentLocalDateTime('2026-10-31', '11:00'), '2026-10-31T11:00');
  assert.throws(() => serializeAppointmentLocalDateTime('2026-10-31', ''), /valid appointment time/);
  assert.throws(() => serializeAppointmentLocalDateTime('2026-02-31', '11:00'), /valid appointment date/);
  assert.throws(() => serializeAppointmentLocalDateTime('31/10/2026', '11:00'), /valid appointment date/);
});

test('service picker indexes deeply nested services with canonical IDs and searchable paths', async () => {
  const { buildAppointmentServiceIndex, filterAppointmentServices, getNextCategoryChoices } = await import(utilsUrl);
  const menuTree = [{
    name: 'Hair',
    children: [{
      name: 'Cuts',
      children: [{ name: 'Children', children: [{ name: 'Boy Hair Cut', vendorPriceNodeId: 'canonical-1', price: 100 }] }],
    }],
  }];
  const services = buildAppointmentServiceIndex(menuTree);
  assert.deepEqual(services.map(({ itemId, name, categoryPath }) => ({ itemId, name, categoryPath })), [{
    itemId: 'canonical-1',
    name: 'Boy Hair Cut',
    categoryPath: 'Hair / Cuts / Children',
  }]);
  assert.equal(filterAppointmentServices(services, 'cuts / children').length, 1);
  assert.deepEqual(getNextCategoryChoices(services, []), ['Hair']);
  assert.deepEqual(getNextCategoryChoices(services, ['Hair', 'Cuts']), ['Children']);
});

test('multiple service selection remains distinct and supports individual removal', async () => {
  const { addDistinctServiceId, removeServiceId } = await import(utilsUrl);
  const first = addDistinctServiceId([], 'service-1');
  const second = addDistinctServiceId(first, 'service-2');
  assert.deepEqual(second, ['service-1', 'service-2']);
  assert.strictEqual(addDistinctServiceId(second, 'service-1'), second);
  assert.deepEqual(removeServiceId(second, 'service-1'), ['service-2']);
  assert.match(calendar, /selectedServiceIds: \[\]/);
  assert.match(calendar, /selectedIds=\{form\.selectedServiceIds\}/);
  assert.match(calendar, /services: form\.selectedServiceIds\.map\(\(itemId\) => \(\{ itemId, quantity: 1 \}\)\)/);
  assert.match(calendar, /Remove \$\{service\.name\}/);
  assert.match(calendar, /Choose at least one service/);
});

test('customer lookup reuses the authenticated vendor Billing search endpoint', () => {
  assert.match(calendar, /\/api\/vendor\/dashboard\/customer/);
  assert.match(calendar, /new URLSearchParams\(\{ vendorId, search: deferredQuery, limit: "10" \}\)/);
  assert.match(calendar, /headers: getVendorAuthHeaders\(vendorId\)/);
  assert.match(calendar, /data\?\.data\?\.matches/);
  assert.match(calendar, /normalizeAppointmentPhone/);
});

test('Calendar supports all agreed statuses, optional staff and no conflict blocking', () => {
  for (const label of ['Confirm', 'Reschedule', 'Complete', 'No-show', 'Cancel', 'No staff assigned']) {
    assert.match(calendar, new RegExp(label));
  }
  assert.doesNotMatch(calendar, /availability|overlap|conflict warning/i);
});

test('manual appointment retries retain one key until the server confirms creation', () => {
  assert.match(calendar, /manualSubmissionKeyRef = useRef\(submissionKey\(\)\)/);
  assert.match(calendar, /submissionKey: manualSubmissionKeyRef\.current/);
  assert.match(calendar, /await readJson[\s\S]*manualSubmissionKeyRef\.current = submissionKey\(\)/);
});

test('existing Enquiries consumers send vendor authentication', () => {
  assert.match(enquiries, /getVendorAuthHeaders\(vendorId\)/);
  assert.match(profile, /getVendorAuthHeaders\(vendorId\)/);
});

test('legacy public enquiry sends its duplicate key to enquiries, not OTP', () => {
  const createEnquiryBlock = explore.match(/const createEnquiry = async[\s\S]*?const requestOtp = async/)?.[0] || '';
  const requestOtpBlock = explore.match(/const requestOtp = async[\s\S]*?const verifyOtp/)?.[0] || '';
  assert.match(createEnquiryBlock, /submissionKey: createEnquirySubmissionKey\(\)/);
  assert.doesNotMatch(requestOtpBlock, /submissionKey/);
});

test('Calendar remains usable on narrow mobile screens', () => {
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /min-height: 100dvh/);
  assert.match(css, /appointment-booking-overlay[^}]*position: fixed/);
  assert.match(css, /appointment-booking-overlay[^}]*background: #080808/);
  assert.match(css, /appointment-service-results[^}]*max-height: 220px/);
  assert.match(css, /appointment-month-grid[^}]*repeat\(7, minmax\(0,1fr\)\)/);
  assert.match(css, /appointment-month-grid button[^}]*min-width: 0/);
  assert.match(css, /appointment-calendar-dashboard-overlay[^}]*background: #080808 !important/);
  assert.match(css, /appointment-calendar-dashboard-overlay \.new-dashboard-shell[^}]*background: #080808/);
});
