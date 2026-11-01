const mongoose = require('mongoose');
const Category = require('../models/Category');
const DummyCategory = require('../models/dummyCategory');
const DummyVendor = require('../models/DummyVendor');
const Enquiry = require('../models/Enquiry');
const Vendor = require('../models/Vendor');
const VendorMenuNode = require('../models/VendorMenuNode');
const VendorPriceNode = require('../models/VendorPriceNode');
const VendorResource = require('../models/VendorResource');

const APPOINTMENT_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 330;
const APPOINTMENT_STATUSES = new Set([
  'REQUESTED',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
]);

class AppointmentValidationError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'AppointmentValidationError';
    this.code = code;
    this.status = status;
  }
}

function cleanText(value, maxLength = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '').slice(-10);
}

function parseIstLocalDateTime(value) {
  const match = String(value || '').trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/
  );
  if (!match) {
    throw new AppointmentValidationError(
      'Appointment date and time must use YYYY-MM-DDTHH:mm',
      'invalid_appointment_datetime'
    );
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const [year, month, day, hour, minute] = parts;
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MINUTES * 60 * 1000;
  const date = new Date(utcMs);
  const istCheck = new Date(utcMs + IST_OFFSET_MINUTES * 60 * 1000);

  if (
    istCheck.getUTCFullYear() !== year ||
    istCheck.getUTCMonth() !== month - 1 ||
    istCheck.getUTCDate() !== day ||
    istCheck.getUTCHours() !== hour ||
    istCheck.getUTCMinutes() !== minute
  ) {
    throw new AppointmentValidationError('Appointment date and time is invalid', 'invalid_appointment_datetime');
  }
  return date;
}

function getIstDayBounds(dateValue) {
  const match = String(dateValue || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new AppointmentValidationError('Date must use YYYY-MM-DD', 'invalid_appointment_date');
  }
  const start = parseIstLocalDateTime(`${dateValue}T00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function getIstMonthBounds(monthValue) {
  const match = String(monthValue || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new AppointmentValidationError('Month must use YYYY-MM', 'invalid_appointment_month');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new AppointmentValidationError('Month is invalid', 'invalid_appointment_month');
  }
  const start = parseIstLocalDateTime(`${match[1]}-${match[2]}-01T00:00`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = parseIstLocalDateTime(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00`);
  return { start, end };
}

function isAppointmentEnquiryConfig(category) {
  return String(category?.enquiryConfig?.enquiryType || '').trim().toLowerCase() === 'appointment';
}

function getAppointmentDateField(category) {
  const fields = Array.isArray(category?.enquiryConfig?.fields)
    ? category.enquiryConfig.fields
    : [];
  const candidates = fields.filter((field) => {
    if (field?.active === false || field?.enabled === false) return false;
    const type = String(field?.fieldType || '').trim().toLowerCase();
    return ['datetime', 'datetime-local', 'date & time', 'dateandtime', 'date_time'].includes(type);
  });
  if (candidates.length !== 1) {
    throw new AppointmentValidationError(
      'Appointment configuration must contain exactly one date and time field',
      'invalid_appointment_configuration'
    );
  }
  return candidates[0];
}

function getCustomerName(attributes = {}) {
  const entry = Object.entries(attributes).find(([key]) => {
    const normalized = String(key).trim().toLowerCase();
    return normalized === 'name' || normalized.includes('customer name') || normalized.includes('full name');
  });
  return cleanText(entry?.[1], 120);
}

function sanitizeAttributes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 30)
      .map(([key, fieldValue]) => [cleanText(key, 80), cleanText(fieldValue, 500)])
      .filter(([key, fieldValue]) => key && fieldValue)
  );
}

function sanitizePublicMeta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowedKeys = [
    'template', 'enquiryType', 'serviceInterest', 'serviceInterestLabel', 'cartQty',
    'cartLineCount', 'cartItems', 'cartSummary', 'checkoutProvider',
  ];
  return Object.fromEntries(allowedKeys.filter((key) => value[key] !== undefined).map((key) => {
    if (key === 'cartItems') return [key, normalizeAppointmentServices(value[key])];
    if (['cartQty', 'cartLineCount'].includes(key)) {
      return [key, Math.max(0, Math.min(1000, Number(value[key]) || 0))];
    }
    return [key, cleanText(value[key], key === 'cartSummary' ? 1000 : 160)];
  }));
}

function normalizeAppointmentServices(cartItems = [], fallback = {}) {
  const source = Array.isArray(cartItems) && cartItems.length ? cartItems : [fallback];
  return source
    .slice(0, 30)
    .map((item) => ({
      itemId: cleanText(item?.itemId || item?.categoryId || '', 80),
      name: cleanText(item?.name || item?.serviceName || fallback?.serviceName || 'Service', 160),
      quantity: Math.max(1, Math.floor(Number(item?.qty || item?.quantity || 1) || 1)),
      categoryPath: (Array.isArray(item?.categoryPath) ? item.categoryPath : [])
        .slice(0, 10)
        .map((part) => cleanText(part, 100))
        .filter(Boolean),
    }))
    .filter((item) => item.itemId || item.name);
}

async function resolvePublicSubmissionContext(body = {}) {
  const vendorId = cleanText(body.vendorId, 80);
  const categoryId = cleanText(body.categoryId, 80);
  if (!mongoose.Types.ObjectId.isValid(vendorId) || !mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new AppointmentValidationError('Vendor and category are required', 'invalid_enquiry_identity');
  }

  const [dummyVendor, legacyVendor, dummyCategory, legacyCategory] = await Promise.all([
    DummyVendor.findById(vendorId).select('_id categoryId status').lean(),
    Vendor.findById(vendorId).select('_id categoryId status').lean(),
    DummyCategory.findById(categoryId).select('_id enquiryConfig').lean(),
    Category.findById(categoryId).select('_id').lean(),
  ]);
  const vendor = dummyVendor || legacyVendor;
  const category = dummyCategory || legacyCategory;
  if (!vendor || !category || String(vendor.categoryId) !== categoryId) {
    throw new AppointmentValidationError('Vendor or category is invalid', 'invalid_enquiry_identity', 404);
  }
  return { vendor, category, vendorId, categoryId };
}

async function buildPublicEnquiryPayload(body = {}) {
  const { category, vendorId, categoryId } = await resolvePublicSubmissionContext(body);
  const attributes = sanitizeAttributes(body.attributes);
  const meta = sanitizePublicMeta(body.meta);
  const phone = normalizePhone(body.phone || body.customerId);
  const payload = {
    vendorId,
    categoryId,
    customerId: cleanText(body.customerId, 80),
    phone,
    categoryPath: (Array.isArray(body.categoryPath) ? body.categoryPath : []).slice(0, 10).map((v) => cleanText(v, 100)),
    categoryIds: (Array.isArray(body.categoryIds) ? body.categoryIds : []).slice(0, 20).map((v) => cleanText(v, 80)),
    serviceName: cleanText(body.serviceName, 160),
    source: cleanText(body.source, 120),
    attributes,
    price: Number.isFinite(Number(body.price)) && Number(body.price) >= 0 ? Number(body.price) : null,
    terms: cleanText(body.terms, 1000),
    meta,
  };

  if (isAppointmentEnquiryConfig(category)) {
    const dateField = getAppointmentDateField(category);
    const startAt = parseIstLocalDateTime(attributes[dateField.name]);
    const customerName = getCustomerName(attributes);
    if (!customerName || phone.length !== 10) {
      throw new AppointmentValidationError(
        'Customer name and 10-digit phone are required for appointments',
        'invalid_appointment_customer'
      );
    }
    if (dateField?.rules?.noPastDates && startAt.getTime() < Date.now()) {
      throw new AppointmentValidationError('Appointment time cannot be in the past', 'appointment_time_in_past');
    }
    const maxDaysAheadRaw = dateField?.rules?.maxDaysAhead;
    const maxDaysAhead = Number(maxDaysAheadRaw);
    if (maxDaysAheadRaw !== null && maxDaysAheadRaw !== '' && Number.isFinite(maxDaysAhead) && maxDaysAhead >= 0) {
      const latest = Date.now() + maxDaysAhead * 24 * 60 * 60 * 1000;
      if (startAt.getTime() > latest) {
        throw new AppointmentValidationError('Appointment is beyond the allowed booking window', 'appointment_time_too_far');
      }
    }
    const submissionKey = cleanText(body.submissionKey, 120);
    if (!submissionKey) {
      throw new AppointmentValidationError('Appointment submission key is required', 'appointment_submission_key_required');
    }
    payload.status = 'Requested';
    payload.statusHistory = [{ status: 'Requested', changedAt: new Date() }];
    payload.appointment = {
      source: 'ONLINE',
      submissionKey,
      startAt,
      timezone: APPOINTMENT_TIMEZONE,
      status: 'REQUESTED',
      customerName,
      services: normalizeAppointmentServices(meta.cartItems, payload),
      version: 0,
      history: [{
        action: 'CREATED',
        toStatus: 'REQUESTED',
        nextStartAt: startAt,
        actorType: 'PUBLIC',
        changedAt: new Date(),
      }],
    };
  }
  return payload;
}

async function resolveCanonicalServices(vendorId, requestedServices) {
  if (!Array.isArray(requestedServices) || requestedServices.length === 0) {
    throw new AppointmentValidationError('Select at least one service', 'appointment_service_required');
  }
  if (requestedServices.length > 30) {
    throw new AppointmentValidationError('Too many appointment services', 'too_many_appointment_services');
  }

  const services = [];
  const requestedItemIds = new Set();
  for (const requested of requestedServices) {
    const itemId = cleanText(requested?.itemId, 80);
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      throw new AppointmentValidationError('Appointment service is invalid', 'invalid_appointment_service');
    }
    if (requestedItemIds.has(itemId)) {
      throw new AppointmentValidationError(
        'The same service cannot be selected more than once',
        'duplicate_appointment_service'
      );
    }
    requestedItemIds.add(itemId);
    const [menuNode, priceNode] = await Promise.all([
      VendorMenuNode.findOne({
        _id: itemId,
        vendorId,
        isLeaf: true,
        datasetStatus: 'active',
        pricingStatus: 'Active',
      }).select('_id name pathNames').lean(),
      VendorPriceNode.findOne({
        _id: itemId,
        vendorId,
        isLeaf: true,
        pricingStatus: 'Active',
      }).select('_id name').lean(),
    ]);
    const node = menuNode || priceNode;
    if (!node) {
      throw new AppointmentValidationError('Appointment service does not belong to this vendor', 'invalid_appointment_service');
    }
    services.push({
      itemId: String(node._id),
      name: cleanText(node.name, 160),
      quantity: Math.max(1, Math.floor(Number(requested.quantity || 1) || 1)),
      categoryPath: (Array.isArray(node.pathNames) ? node.pathNames : []).map((part) => cleanText(part, 100)),
    });
  }
  return services;
}

async function resolveOptionalStaff(vendorId, resourceId) {
  if (!resourceId) return { staffResourceId: null, staffNameSnapshot: '' };
  if (!mongoose.Types.ObjectId.isValid(resourceId)) {
    throw new AppointmentValidationError('Staff selection is invalid', 'invalid_appointment_staff');
  }
  const resource = await VendorResource.findOne({ _id: resourceId, vendorId, status: 'Active' })
    .select('_id name')
    .lean();
  if (!resource) {
    throw new AppointmentValidationError('Staff member does not belong to this vendor', 'invalid_appointment_staff');
  }
  return { staffResourceId: resource._id, staffNameSnapshot: cleanText(resource.name, 120) };
}

function actorFromRequest(req) {
  const auth = req.vendorWriteAuth || {};
  return {
    actorType: auth.authType === 'admin' ? 'ADMIN' : 'VENDOR',
    actorId: cleanText(auth.customerId || auth.admin?.id || auth.admin?._id || auth.sessionId, 80),
  };
}

module.exports = {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TIMEZONE,
  AppointmentValidationError,
  actorFromRequest,
  buildPublicEnquiryPayload,
  cleanText,
  getIstDayBounds,
  getIstMonthBounds,
  normalizePhone,
  parseIstLocalDateTime,
  resolveCanonicalServices,
  resolveOptionalStaff,
};
