# Unlimited Membership Index Migration

This utility removes only the three historical indexes that limit active
membership counts. It uses `MONGODB_AUDIT_URI` exclusively, defaults to a
read-only dry-run, disables Mongoose automatic index creation, never calls
`syncIndexes()`, and never modifies membership records.

Run each environment independently after substituting its verified host and
database identity. Never reuse credentials or audit results across environments.

## Dry-run

```bash
node scripts/migrateUnlimitedMembershipIndexes.js \
  --environment=test \
  --expected-host=<TEST_ATLAS_HOST> \
  --expected-db=<TEST_DATABASE> \
  --expected-collection=customermemberships
```

## Controlled removal

Only after every backend instance runs code that no longer declares the active
membership unique indexes, membership writes are paused, and rollback/autoscaling
cannot restart old code:

```bash
node scripts/migrateUnlimitedMembershipIndexes.js \
  --environment=test \
  --expected-host=<TEST_ATLAS_HOST> \
  --expected-db=<TEST_DATABASE> \
  --expected-collection=customermemberships \
  --drop-active-membership-unique-indexes \
  --confirm-drop=DROP_ACTIVE_MEMBERSHIP_UNIQUES_FROM_TEST_<TEST_DATABASE>_customermemberships \
  --membership-writes-paused=true \
  --all-backends-updated=true \
  --index-recreation-prevented=true
```

Use `--environment=preprod` or `--environment=production` and the corresponding
uppercase confirmation value for those independently audited environments.

The only indexes eligible for removal are:

- `vendorId_1_customerId_1`
- `customer_membership_active_discount_unique`
- `customer_membership_active_prepaid_unique`

The utility fails closed if a named index has an unexpected definition or an
unknown unique `{ vendorId: 1, customerId: 1 }` index exists. It verifies the
membership document count before and after the operation.

After removal, rerun dry-run and confirm all three indexes are absent. Once
multiple active memberships exist, rolling back to application code that assumes
one active membership is unsafe and may cause index recreation failures.
