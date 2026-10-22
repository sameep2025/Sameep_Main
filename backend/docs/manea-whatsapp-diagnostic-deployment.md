# Manea WhatsApp registration diagnostic

This temporary diagnostic bypasses only Meta phone-registration readiness for the
exact Manea vendor and Meta assets. Connection, messaging, display-name, template,
test-message, explicit activation, and the global Meta routing checks remain active.

## Production configuration

Deploy the code with the diagnostic disabled, then configure these exact values:

```text
YNOT_RUNTIME_ENVIRONMENT=production
WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED=true
MANEA_WHATSAPP_DIAGNOSTIC_ENABLED=false
MANEA_WHATSAPP_DIAGNOSTIC_VENDOR_ID=69d3a74c7f444571dd02ae3d
MANEA_WHATSAPP_DIAGNOSTIC_WABA_ID=4402848216525508
MANEA_WHATSAPP_DIAGNOSTIC_PHONE_NUMBER_ID=1335446439659507
```

No BillingSession ID, recipient, or bill-count variable is used. After every
application instance runs this version, change only
`MANEA_WHATSAPP_DIAGNOSTIC_ENABLED` to `true`. Confirm the dashboard reports Limited
or Available messaging before activating Manea through the normal vendor action.

## Rollback

To stop the registration bypass, set `MANEA_WHATSAPP_DIAGNOSTIC_ENABLED=false` and
verify all instances received the setting. Manea then immediately returns to normal
registration validation; if Meta still reports PIN disabled, its subsequent bills
route through MSG91 even when its stored activation preference remains enabled.

Keep the stable vendor, WABA, and phone identity variables during the temporary
diagnostic and rollback window. They allow the sender to recognize and block any
historical one-session claims created by the previous diagnostic implementation.
Before removing those identity variables or rolling back to claim-unaware code,
verify read-only that the `maneawhatsappdiagnosticuses` collection contains no claim
for a bill that can still be retried or resent. If a claim exists, retain this code
and the identity variables until that bill is operationally retired.

Do not automatically retry a failed or uncertain Meta send through MSG91. The normal
router intentionally keeps a selected Meta attempt on one provider to avoid duplicate
delivery.
