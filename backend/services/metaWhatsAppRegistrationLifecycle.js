const PIN_RECOVERY_REQUIRED_CODE = "meta_registration_pin_recovery_required";

function emptyRegistrationRecovery() {
  return {
    required: false,
    wabaId: "",
    phoneNumberId: "",
    disconnectedAt: null,
  };
}

function buildDisconnectRegistrationRecovery(config, now = new Date()) {
  const current = config && typeof config === "object" ? config : {};
  const wabaId = String(current.wabaId || "").trim();
  const phoneNumberId = String(current.phoneNumberId || "").trim();
  const tracksMetaRegistration = current.provider === "meta" && Boolean(phoneNumberId);

  if (!tracksMetaRegistration) return emptyRegistrationRecovery();

  return {
    required: true,
    wabaId,
    phoneNumberId,
    disconnectedAt: now,
  };
}

function isRegistrationPinRecoveryRequired(config, identifiers = {}) {
  const current = config && typeof config === "object" ? config : {};
  const recovery = current.registrationRecovery || {};
  if (recovery.required !== true) return false;

  const phoneNumberId = String(
    identifiers.phoneNumberId || current.phoneNumberId || ""
  ).trim();
  const wabaId = String(identifiers.wabaId || current.wabaId || "").trim();

  return (
    Boolean(phoneNumberId) &&
    String(recovery.phoneNumberId || "").trim() === phoneNumberId &&
    (!String(recovery.wabaId || "").trim() ||
      !wabaId ||
      String(recovery.wabaId || "").trim() === wabaId)
  );
}

function applyReconnectRegistrationLifecycle({ current, connectedConfig }) {
  const previous = current && typeof current === "object" ? current : {};
  const next = connectedConfig && typeof connectedConfig === "object" ? connectedConfig : {};
  const sameAssetRequiresRecovery = isRegistrationPinRecoveryRequired(previous, {
    wabaId: next.wabaId,
    phoneNumberId: next.phoneNumberId,
  });
  const assetChanged =
    String(previous.wabaId || "") !== String(next.wabaId || "") ||
    String(previous.phoneNumberId || "") !== String(next.phoneNumberId || "");

  if (sameAssetRequiresRecovery) {
    return {
      ...next,
      metaRegistration: { pinEncrypted: "" },
      phoneRegistrationStatus: "registration_required",
      phoneRegisteredAt: null,
      phoneRegistrationLastError: PIN_RECOVERY_REQUIRED_CODE,
      registrationRecovery: {
        ...emptyRegistrationRecovery(),
        ...previous.registrationRecovery,
        required: true,
      },
    };
  }

  if (assetChanged) {
    return {
      ...next,
      metaRegistration: { pinEncrypted: "" },
      phoneRegistrationStatus: "registration_required",
      phoneRegisteredAt: null,
      phoneRegistrationLastError: "",
      registrationRecovery: emptyRegistrationRecovery(),
    };
  }

  return {
    ...next,
    registrationRecovery: previous.registrationRecovery || emptyRegistrationRecovery(),
  };
}

function buildRegistrationRecoveryState(config, now = new Date()) {
  const current = config && typeof config === "object" ? config : {};
  return {
    ...current,
    enabled: false,
    phoneRegistrationStatus: "error",
    phoneRegistrationLastError: PIN_RECOVERY_REQUIRED_CODE,
    registrationRecovery: {
      required: true,
      wabaId: String(current.wabaId || "").trim(),
      phoneNumberId: String(current.phoneNumberId || "").trim(),
      disconnectedAt: current.registrationRecovery?.disconnectedAt || now,
    },
  };
}

module.exports = {
  PIN_RECOVERY_REQUIRED_CODE,
  applyReconnectRegistrationLifecycle,
  buildDisconnectRegistrationRecovery,
  buildRegistrationRecoveryState,
  emptyRegistrationRecovery,
  isRegistrationPinRecoveryRequired,
};
