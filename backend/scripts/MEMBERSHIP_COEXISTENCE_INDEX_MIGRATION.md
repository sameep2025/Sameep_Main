# Membership Coexistence Index Migration

> **Retired:** mutation modes are disabled. Unlimited membership activation no
> longer uses active-membership uniqueness. Use
> `migrateUnlimitedMembershipIndexes.js` for the separately authorized removal
> of legacy entitlement indexes. This utility remains dry-run-only for audit
> history and cannot create or drop indexes.

This utility targets only `cluster0.ddzqz7y.mongodb.net/categoryApp.customermemberships`.
It uses `MONGODB_AUDIT_URI`, disables Mongoose auto-indexing, never calls
`syncIndexes()`, and never modifies membership records.

## Commands

Run all commands from `backend/`.

Dry-run (default, read-only):

```bash
node scripts/migrateMembershipCoexistenceIndexes.js \
  --expected-host=cluster0.ddzqz7y.mongodb.net \
  --expected-db=categoryApp \
  --expected-collection=customermemberships
```

Create the two replacement indexes while preserving the global index:

```bash
node scripts/migrateMembershipCoexistenceIndexes.js \
  --expected-host=cluster0.ddzqz7y.mongodb.net \
  --expected-db=categoryApp \
  --expected-collection=customermemberships \
  --create-replacements
```

Drop only the old global index after the cutover guards are independently verified:

```bash
node scripts/migrateMembershipCoexistenceIndexes.js \
  --expected-host=cluster0.ddzqz7y.mongodb.net \
  --expected-db=categoryApp \
  --expected-collection=customermemberships \
  --drop-old-index \
  --confirm-drop=DROP_vendorId_1_customerId_1_FROM_categoryApp.customermemberships \
  --membership-writes-paused=true \
  --old-backends-stopped=true \
  --global-index-recreation-prevented=true
```

The final two flags attest that every old backend instance has stopped and the
deployment artifact no longer declares the global ACTIVE index. Do not set them
based only on an intended deployment plan.

## LOCAL/TEST Cutover

1. Run the dry-run and retain its sanitized result.
2. Pause membership activation, enrollment, renewal, and lifecycle writes.
3. Run create-only. Verify both replacement indexes exactly match the approved
   keys, uniqueness, and partial filters while `vendorId_1_customerId_1` remains.
4. Deploy or stage the coexistence-capable backend, but do not permit an old
   backend process to remain available for membership writes.
5. Verify all old backend instances are stopped. This prevents Mongoose
   auto-indexing in an old binary from recreating the global index after removal.
6. Keep membership writes paused and run a fresh dry-run.
7. Run the guarded drop-only command once.
8. Run dry-run again. It must report both replacements as `verified`, the legacy
   index as `absent`, and no duplicate or unsupported membership records.
9. Resume membership writes and smoke-test Discount then Prepaid, Prepaid then
   Discount, and duplicate rejection within each entitlement slot.

## Rollback Limitations

Creating replacement indexes is additive and can be left in place if deployment
is delayed. After the global index is dropped and coexistence records are
created, recreating it may fail because one vendor/customer can legitimately
have two ACTIVE memberships. Rollback therefore requires pausing writes,
auditing for coexistence records, and making a business decision about those
records; this utility never deletes or rewrites them. It also never drops the
replacement indexes.

PRE-PROD and Production require independent identity, index, duplicate, and
legacy-type audits. Never reuse LOCAL/TEST results as approval for another
database.
