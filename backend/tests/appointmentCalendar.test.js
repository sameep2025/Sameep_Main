const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const Category = require('../models/Category');
const DummyCategory = require('../models/dummyCategory');
const DummyVendor = require('../models/DummyVendor');
const Enquiry = require('../models/Enquiry');
const VendorMenuNode = require('../models/VendorMenuNode');
const VendorPriceNode = require('../models/VendorPriceNode');
const Vendor = require('../models/Vendor');
const Session = require('../models/Session');
const controller = require('../controllers/appointmentController');
const { requireVendorAccessFromExistingAuth } = require('../utils/vendorWriteAuth');
const {
  buildPublicEnquiryPayload,
  getIstDayBounds,
  getIstMonthBounds,
  parseIstLocalDateTime,
  resolveCanonicalServices,
} = require('../services/appointmentService');

const VENDOR_ID = '692403a24d4d3a1b6a7f0ae5';
const CATEGORY_ID = '692403a24d4d3a1b6a7f0ae6';

function queryResult(value) {
  return { select: () => ({ lean: async () => value }) };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function runMiddleware(middleware, req) {
  const res = response();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('appointment timestamps and day boundaries are canonical Asia/Kolkata instants', () => {
  assert.equal(parseIstLocalDateTime('2026-11-01T09:30').toISOString(), '2026-11-01T04:00:00.000Z');
  const bounds = getIstDayBounds('2026-11-01');
  assert.equal(bounds.start.toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-11-01T18:30:00.000Z');
  assert.throws(() => parseIstLocalDateTime('2026-02-30T10:00'), /invalid/);
});

test('appointment month boundaries remain canonical across year rollover', () => {
  const november = getIstMonthBounds('2026-11');
  assert.equal(november.start.toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(november.end.toISOString(), '2026-11-30T18:30:00.000Z');
  const december = getIstMonthBounds('2026-12');
  assert.equal(december.end.toISOString(), '2026-12-31T18:30:00.000Z');
  assert.throws(() => getIstMonthBounds('2026-13'), /invalid/i);
});

test('month summary returns active status counts without loading appointment details', async () => {
  const originalAggregate = Enquiry.aggregate;
  let pipeline;
  Enquiry.aggregate = async (value) => {
    pipeline = value;
    return [{ _id: '2026-11-05', total: 3, requested: 1, confirmed: 2 }];
  };
  try {
    const res = response();
    await controller.getMonthSummary({
      vendorWriteAuth: { vendorId: VENDOR_ID },
      query: { vendorId: VENDOR_ID, month: '2026-11' },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.timezone, 'Asia/Kolkata');
    assert.deepEqual(res.payload.days, [{ _id: '2026-11-05', total: 3, requested: 1, confirmed: 2 }]);
    assert.equal(pipeline[0].$match.vendorId, VENDOR_ID);
    assert.equal(pipeline[0].$match['appointment.status'].$ne, 'CANCELLED');
    assert.equal(pipeline[1].$group._id.$dateToString.timezone, 'Asia/Kolkata');
    assert.equal(JSON.stringify(pipeline).includes('customerName'), false);
  } finally {
    Enquiry.aggregate = originalAggregate;
  }
});

test('public appointment submission ignores protected fields and creates normalized requested appointment', async () => {
  const originals = [DummyVendor.findById, Vendor.findById, DummyCategory.findById, Category.findById];
  DummyVendor.findById = () => queryResult({ _id: VENDOR_ID, categoryId: CATEGORY_ID });
  Vendor.findById = () => queryResult(null);
  DummyCategory.findById = () => queryResult({
    _id: CATEGORY_ID,
    enquiryConfig: {
      enquiryType: 'appointment',
      fields: [{ name: 'Appointment Time', fieldType: 'datetime-local', enabled: true }],
    },
  });
  Category.findById = () => queryResult(null);

  try {
    const payload = await buildPublicEnquiryPayload({
      vendorId: VENDOR_ID,
      categoryId: CATEGORY_ID,
      phone: '+91 99999 99999',
      submissionKey: 'browser-submit-1',
      status: 'Completed',
      appointment: { status: 'COMPLETED', audit: 'client-controlled' },
      attributes: { Name: '  Test Customer ', 'Appointment Time': '2026-11-01T09:30' },
      meta: { enquiryType: 'appointment', protected: true, cartItems: [
        { itemId: 'service-1', name: 'Hair Cut', qty: 1 },
        { itemId: 'service-2', name: 'Hair Spa', qty: 1 },
      ] },
    });
    assert.equal(payload.status, 'Requested');
    assert.equal(payload.appointment.status, 'REQUESTED');
    assert.equal(payload.appointment.customerName, 'Test Customer');
    assert.equal(payload.appointment.startAt.toISOString(), '2026-11-01T04:00:00.000Z');
    assert.deepEqual(payload.appointment.services.map((service) => service.name), ['Hair Cut', 'Hair Spa']);
    assert.equal(payload.meta.protected, undefined);
    assert.equal(payload.appointment.history[0].actorType, 'PUBLIC');
  } finally {
    [DummyVendor.findById, Vendor.findById, DummyCategory.findById, Category.findById] = originals;
  }
});

test('manual appointments resolve and persist multiple distinct canonical services', async () => {
  const serviceOneId = '692403a24d4d3a1b6a7f0aeb';
  const serviceTwoId = '692403a24d4d3a1b6a7f0aec';
  const originalMenuFindOne = VendorMenuNode.findOne;
  const originalPriceFindOne = VendorPriceNode.findOne;
  const records = {
    [serviceOneId]: { _id: serviceOneId, name: 'Hair Cut', pathNames: ['Hair', 'Cuts'] },
    [serviceTwoId]: { _id: serviceTwoId, name: 'Hair Spa', pathNames: ['Hair', 'Treatments'] },
  };
  VendorMenuNode.findOne = ({ _id }) => queryResult(records[String(_id)] || null);
  VendorPriceNode.findOne = () => queryResult(null);

  try {
    const services = await resolveCanonicalServices(VENDOR_ID, [
      { itemId: serviceOneId, quantity: 1 },
      { itemId: serviceTwoId, quantity: 1 },
    ]);
    assert.deepEqual(services.map((service) => service.name), ['Hair Cut', 'Hair Spa']);

    const appointment = new Enquiry({
      vendorId: VENDOR_ID,
      categoryId: CATEGORY_ID,
      appointment: {
        source: 'MANUAL', startAt: new Date(), status: 'CONFIRMED', services,
      },
    });
    assert.equal(appointment.validateSync(), undefined);
    assert.deepEqual(appointment.appointment.services.map((service) => service.name), ['Hair Cut', 'Hair Spa']);

    const single = await resolveCanonicalServices(VENDOR_ID, [{ itemId: serviceOneId, quantity: 1 }]);
    assert.equal(single.length, 1);
    await assert.rejects(
      resolveCanonicalServices(VENDOR_ID, [{ itemId: serviceOneId }, { itemId: serviceOneId }]),
      (error) => error.code === 'duplicate_appointment_service'
    );
  } finally {
    VendorMenuNode.findOne = originalMenuFindOne;
    VendorPriceNode.findOne = originalPriceFindOne;
  }
});

test('only newly created appointment records receive appointment data and duplicate protection', () => {
  const historical = new Enquiry({ vendorId: VENDOR_ID, categoryId: CATEGORY_ID, status: 'New' });
  assert.equal(historical.appointment, undefined);
  const indexes = Enquiry.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys['appointment.startAt'] === 1 && options.partialFilterExpression));
  assert.ok(indexes.some(([keys, options]) => keys['appointment.submissionKey'] === 1 && options.unique));
});

test('concurrent appointment updates fail with a version conflict instead of overwriting', async () => {
  const originalFindOne = Enquiry.findOne;
  const originalFindOneAndUpdate = Enquiry.findOneAndUpdate;
  Enquiry.findOne = () => queryResult({ appointment: { status: 'REQUESTED', version: 2 } });
  Enquiry.findOneAndUpdate = () => ({ lean: async () => null });
  try {
    const res = response();
    await controller.updateAppointmentStatus({
      params: { id: '692403a24d4d3a1b6a7f0ae7' },
      vendorWriteAuth: { vendorId: VENDOR_ID },
      body: { status: 'CONFIRMED', version: 2 },
    }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.payload.code, 'appointment_version_conflict');
  } finally {
    Enquiry.findOne = originalFindOne;
    Enquiry.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('enquiry and calendar routes require existing vendor ownership or admin authentication', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/enquiryRoutes.js'), 'utf8');
  assert.match(source, /router\.get\('\/', requireEnquiryListAccess/);
  assert.match(source, /appointments', requireAppointmentListAccess/);
  assert.match(source, /appointments\/month-summary', requireAppointmentListAccess/);
  assert.match(source, /appointments\/:id\/status'[\s\S]*requireOwnedDocumentVendorAccess\(Enquiry\)/);
  assert.match(source, /router\.put\('\/:id\/status', requireOwnedDocumentVendorAccess\(Enquiry\)/);
  assert.match(source, /router\.post\('\/', async/);
});

test('vendor authorization rejects missing and cross-vendor sessions and accepts owned vendor', async () => {
  const otherVendorId = '692403a24d4d3a1b6a7f0ae8';
  const customerId = '692403a24d4d3a1b6a7f0ae9';
  const originalFindOne = Session.findOne;
  const originalDummyExists = DummyVendor.exists;
  const originalVendorExists = Vendor.exists;
  const secret = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
  const token = jwt.sign({ customerId, vendorId: VENDOR_ID }, secret);
  Session.findOne = () => ({ sort: () => ({ lean: async () => ({
    _id: '692403a24d4d3a1b6a7f0aea',
    expiryTime: new Date(Date.now() + 60_000),
    isActive: true,
  }) }) });
  DummyVendor.exists = async () => ({ _id: VENDOR_ID });
  Vendor.exists = async () => null;

  try {
    const middleware = requireVendorAccessFromExistingAuth((req) => req.query.vendorId);
    const missing = await runMiddleware(middleware, { headers: {}, body: {}, query: { vendorId: VENDOR_ID } });
    assert.equal(missing.res.statusCode, 401);
    assert.equal(missing.nextCalled, false);

    const crossVendor = await runMiddleware(middleware, {
      headers: { authorization: `Bearer ${token}` }, body: {}, query: { vendorId: otherVendorId },
    });
    assert.equal(crossVendor.res.statusCode, 403);
    assert.equal(crossVendor.res.payload.code, 'vendor_mismatch');

    const owned = await runMiddleware(middleware, {
      headers: { authorization: `Bearer ${token}` }, body: {}, query: { vendorId: VENDOR_ID },
    });
    assert.equal(owned.nextCalled, true);
    assert.equal(owned.res.statusCode, 200);
  } finally {
    Session.findOne = originalFindOne;
    DummyVendor.exists = originalDummyExists;
    Vendor.exists = originalVendorExists;
  }
});

test('every existing protected Enquiries consumer now supplies its established authentication token', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const vendorDashboard = fs.readFileSync(path.join(repoRoot, 'vendorpreview/app/components/dashboard/EnquiriesDashboard.jsx'), 'utf8');
  const vendorProfile = fs.readFileSync(path.join(repoRoot, 'vendorpreview/app/Profile/Profile.jsx'), 'utf8');
  const legacyPreview = fs.readFileSync(path.join(repoRoot, 'preview-site/pages/preview/[vendorId]/[categoryId].jsx'), 'utf8');
  const adminList = fs.readFileSync(path.join(repoRoot, 'frontend/src/pages/EnquiriesPage.jsx'), 'utf8');
  const adminVendor = fs.readFileSync(path.join(repoRoot, 'frontend/src/pages/DummyVendorCategoriesDetailPage.jsx'), 'utf8');

  assert.match(vendorDashboard, /getVendorAuthHeaders\(vendorId\)/);
  assert.match(vendorProfile, /getVendorAuthHeaders\(vendorId\)/);
  assert.match(legacyPreview, /headers: getPreviewAuthHeaders\(\)/);
  assert.match(legacyPreview, /"Content-Type": "application\/json", \.\.\.getPreviewAuthHeaders\(\)/);
  assert.match(adminList, /API\.get\("\/api\/enquiries"\)/);
  assert.match(adminVendor, /Authorization: `Bearer \$\{token\}`/);
});
