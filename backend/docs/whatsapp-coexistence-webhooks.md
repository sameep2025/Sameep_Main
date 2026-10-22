# WhatsApp Business App Coexistence Webhooks

## Supported fields

YNOT recognizes `history`, `smb_app_state_sync`, and `smb_message_echoes` only for
connections explicitly persisted as verified Coexistence connections.

The Coexistence webhook branch requires a valid `X-Hub-Signature-256`. Standard
WhatsApp webhook fields continue through the pre-existing handler.

## Identity rules

- The webhook entry must resolve to exactly one WABA ID.
- When a Phone Number ID is present, every discovered value must agree and must
  match both the connection and its Coexistence evidence.
- A WABA-only event is accepted only when exactly one verified Coexistence
  connection exists across the `DummyVendor` and `Vendor` collections.
- Ambiguous, missing, mismatched, standard, and legacy connections are not
  persisted by the Coexistence handler.

## Idempotency

Meta does not expose one documented event-ID location shared by all three event
types. YNOT therefore uses the same conservative exact-retry strategy for each:

- `history`: HMAC-SHA256 of the canonical change value and verified connection
  identity.
- `smb_app_state_sync`: HMAC-SHA256 of the canonical change value and verified
  connection identity.
- `smb_message_echoes`: HMAC-SHA256 of the canonical change value and verified
  connection identity, without assuming a message ID is always present.

The Meta app secret keys the HMAC. Raw payloads, message bodies, customer phone
numbers, and conversation content are not stored. A unique MongoDB index plus an
atomic upsert prevents duplicate processing across retries and application
instances. Distinct out-of-order events are recorded independently and do not
mutate vendor or billing state.

## Deferred synchronization

Phase 3 records verified event receipt with `synchronization_deferred` status.
It does not request `smb_app_data`, import history, or synchronize conversations.
Those operations remain deferred until the exact endpoint, payload, timing,
permissions, retention, and privacy requirements can be verified against
accessible official Meta documentation.
