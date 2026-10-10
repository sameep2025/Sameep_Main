"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "../../config";
import {
  extractEmbeddedSignupSessionInfo,
  getMetaEmbeddedSignupDiagnostics,
  hasCompleteEmbeddedSignupResult,
  parseMetaEmbeddedSignupMessage,
} from "../utils/whatsappEmbeddedSignup";
import "./whatsapp-connect.css";

const FACEBOOK_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
const SIGNUP_MODE_STANDARD = "standard";
const SIGNUP_MODE_COEXISTENCE_TEST = "coexistence_test";

function logMetaDiagnostic(message, details = {}) {
  if (!IS_DEVELOPMENT) return;
  console.info(message, details);
}

function logCompletionReadiness({ authCode, sessionInfo }) {
  const readiness = {
    authCodeReceived: Boolean(authCode),
    sessionInfoReceived: Boolean(sessionInfo),
    wabaIdReceived: Boolean(sessionInfo?.wabaId),
    phoneNumberIdReceived: Boolean(sessionInfo?.phoneNumberId),
    readyToCallBackend: hasCompleteEmbeddedSignupResult({ code: authCode, sessionInfo }),
  };

  logMetaDiagnostic("YNOT Meta completion readiness", readiness);
  return readiness;
}

function parseApiError(res, payload, fallback) {
  const message = payload?.message || fallback;
  console.error("WhatsApp Connect API error", {
    status: res.status,
    statusText: res.statusText,
    message,
    code: payload?.code,
  });
  return new Error(message);
}

async function readApiResponse(res, fallback) {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.success) {
    throw parseApiError(res, payload, fallback);
  }
  return payload;
}

function loadFacebookSdk({ appId, graphApiVersion }) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Meta setup must run in the browser"));
      return;
    }

    if (window.FB) {
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: graphApiVersion,
      });
      resolve(window.FB);
      return;
    }

    window.fbAsyncInit = function initFacebookSdk() {
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: graphApiVersion,
      });
      resolve(window.FB);
    };

    const existingScript = document.getElementById("facebook-jssdk");
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.FB) resolve(window.FB);
      }, { once: true });
      existingScript.addEventListener("error", () => {
        reject(new Error("Unable to load Meta setup"));
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = FACEBOOK_SDK_SRC;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Unable to load Meta setup"));
    document.body.appendChild(script);
  });
}

function getFrontendMetaConfig() {
  return {
    appId: process.env.NEXT_PUBLIC_META_APP_ID || "",
    embeddedSignupConfigId: process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID || "",
    graphApiVersion: process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION || "v26.0",
  };
}

function logMetaEmbeddedSignupDiagnostic({ metaConfig, loginOptions }) {
  if (typeof window === "undefined") return;

  logMetaDiagnostic("[Meta Embedded Signup Diagnostic]", {
    pageOrigin: window.location.origin,
    pagePathname: window.location.pathname,
    pageSearchPresent: Boolean(window.location.search),
    pageHrefWithoutQuery: `${window.location.origin}${window.location.pathname}`,
    explicitRedirectUri: loginOptions.redirect_uri || null,
    configId: metaConfig?.embeddedSignupConfigId || "",
    responseType: loginOptions.response_type || "",
  });
}

function WhatsappConnectContent() {
  const searchParams = useSearchParams();
  const connectToken = searchParams.get("connectToken") || "";
  const completionStartedRef = useRef(false);
  const activeSignupModeRef = useRef(SIGNUP_MODE_STANDARD);
  const [status, setStatus] = useState("Preparing");
  const [error, setError] = useState("");
  const [metaConfig, setMetaConfig] = useState(null);
  const [returnUrl, setReturnUrl] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [sessionInfo, setSessionInfo] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      if (!connectToken) {
        setError("WhatsApp setup link is missing or expired. Please start again from your dashboard.");
        setStatus("Error");
        return;
      }

      try {
        setStatus("Preparing");
        const res = await fetch(
          `${API_BASE_URL}/api/vendor/whatsapp-business/meta/config?connectToken=${encodeURIComponent(connectToken)}`,
          { cache: "no-store" }
        );
        const payload = await readApiResponse(res, "Unable to load WhatsApp setup");
        const frontendConfig = getFrontendMetaConfig();
        const config = {
          appId: frontendConfig.appId || payload.data?.appId || "",
          embeddedSignupConfigId:
            frontendConfig.embeddedSignupConfigId ||
            payload.data?.embeddedSignupConfigId ||
            "",
          graphApiVersion:
            frontendConfig.graphApiVersion ||
            payload.data?.graphApiVersion ||
            "v26.0",
          isEmbeddedSignupConfigured:
            Boolean(frontendConfig.appId || payload.data?.appId) &&
            Boolean(frontendConfig.embeddedSignupConfigId || payload.data?.embeddedSignupConfigId),
        };

        if (!cancelled) {
          setMetaConfig(config);
          setReturnUrl(payload.data?.returnUrl || "");
          if (!config.isEmbeddedSignupConfigured) {
            setStatus("Error");
            setError("Meta Embedded Signup is not configured for this environment.");
          } else {
            setStatus("Ready");
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("WhatsApp setup config failed", err);
          setStatus("Error");
          setError("Unable to prepare WhatsApp setup. Please try again from your dashboard.");
        }
      }
    }

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, [connectToken]);

  useEffect(() => {
    const handleMessage = (event) => {
      const diagnostics = getMetaEmbeddedSignupDiagnostics(event);
      if (diagnostics) {
        logMetaDiagnostic("Meta Embedded Signup message received", diagnostics);

        if (!diagnostics.originAccepted) {
          logMetaDiagnostic("Meta Embedded Signup message rejected by origin check", {
            origin: diagnostics.origin,
          });
        }
      }

      const payload = parseMetaEmbeddedSignupMessage(event);
      if (!payload) return;

      logMetaDiagnostic("Meta Embedded Signup session event", {
        event: payload.event,
        hasData: Boolean(payload.data),
      });

      if (
        activeSignupModeRef.current === SIGNUP_MODE_COEXISTENCE_TEST &&
        (payload.event === "FINISH" ||
          payload.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING")
      ) {
        setStatus("Test Completed");
        setError("");
        setSuccessMessage(
          "Coexistence signup test completed in Meta. This test flow is not connected to the YNOT backend yet, so no WhatsApp account changes were saved in YNOT."
        );
        return;
      }

      if (payload.event === "FINISH") {
        const nextSessionInfo = extractEmbeddedSignupSessionInfo(payload);
        setSessionInfo(nextSessionInfo);

        if (!nextSessionInfo.phoneNumberId) {
          setStatus("Waiting for phone number details");
          setError("Meta signup completed. YNOT is waiting for phone number details.");
        }
      }

      if (payload.event === "CANCEL" || payload.event === "ERROR") {
        if (activeSignupModeRef.current === SIGNUP_MODE_COEXISTENCE_TEST) {
          setStatus("Test Closed");
          setError("");
          setSuccessMessage(
            "Coexistence signup was closed in Meta. This test flow is not connected to the YNOT backend, so no WhatsApp settings were saved or changed."
          );
          return;
        }

        setStatus("Error");
        setError("WhatsApp Business setup was not completed. Please try again when you are ready.");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    async function completeConnection() {
      if (completionStartedRef.current) return;
      const readiness = logCompletionReadiness({ authCode, sessionInfo });

      if (!readiness.readyToCallBackend) {
        if (authCode && !sessionInfo) {
          setStatus("Waiting for signup details");
          setError("Meta authorization received. YNOT is waiting for signup details.");
        } else if (sessionInfo?.wabaId && !sessionInfo.phoneNumberId) {
          setStatus("Waiting for phone number details");
          setError("Meta signup completed. YNOT is waiting for phone number details.");
        } else if (sessionInfo && !authCode) {
          setStatus("Waiting for Meta authorization");
          setError("WhatsApp account details received. YNOT is waiting for Meta authorization.");
        }
        return;
      }

      try {
        completionStartedRef.current = true;
        setStatus("Verifying");
        setError("");
        logMetaDiagnostic("Calling YNOT Meta completion endpoint", {
          connectTokenPresent: Boolean(connectToken),
          authorizationCodePresent: Boolean(authCode),
          wabaIdPresent: Boolean(sessionInfo?.wabaId),
          phoneNumberIdPresent: Boolean(sessionInfo?.phoneNumberId),
        });

        const res = await fetch(`${API_BASE_URL}/api/vendor/whatsapp-business/meta/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectToken,
            code: authCode,
            wabaId: sessionInfo.wabaId,
            phoneNumberId: sessionInfo.phoneNumberId,
            signupData: sessionInfo,
          }),
        });

        const payload = await readApiResponse(
          res,
          "Unable to complete WhatsApp Business connection"
        );

        logMetaDiagnostic("YNOT Meta completion response", {
          httpStatus: res.status,
          success: Boolean(payload?.success),
          message: payload?.message || "",
          code: payload?.code || "",
        });

        setStatus("Connected");
        setSuccessMessage("WhatsApp Business connected successfully. You can close this tab and return to your vendor dashboard.");
        setReturnUrl(payload.returnUrl || returnUrl || "");
      } catch (err) {
        console.error("WhatsApp setup completion failed", err);
        setStatus("Error");
        setError(
          "Your WhatsApp Business connection could not be completed. YNOT will continue sending bills from the YNOT WhatsApp number."
        );
      }
    }

    completeConnection();
  }, [authCode, connectToken, returnUrl, sessionInfo]);

  const startMetaSignup = async (signupMode = SIGNUP_MODE_STANDARD) => {
    if (!metaConfig?.isEmbeddedSignupConfigured) {
      setError("Meta Embedded Signup is not configured for this environment.");
      setStatus("Error");
      return;
    }

    try {
      activeSignupModeRef.current = signupMode;
      completionStartedRef.current = false;
      setAuthCode("");
      setSessionInfo(null);
      setSuccessMessage("");
      setStatus("Connecting");
      setError("");
      const fb = await loadFacebookSdk({
        appId: metaConfig.appId,
        graphApiVersion: metaConfig.graphApiVersion,
      });
      const loginOptions =
        signupMode === SIGNUP_MODE_COEXISTENCE_TEST
          ? {
              config_id: metaConfig.embeddedSignupConfigId,
              response_type: "code",
              override_default_response_type: true,
              extras: {
                version: "v4",
                sessionInfoVersion: "3",
                featureType: "whatsapp_business_app_onboarding",
              },
            }
          : {
              config_id: metaConfig.embeddedSignupConfigId,
              response_type: "code",
              override_default_response_type: true,
              extras: { version: "v4" },
            };

      logMetaEmbeddedSignupDiagnostic({ metaConfig, loginOptions });

      fb.login(
        (response) => {
          const code = response?.authResponse?.code || "";
          logMetaDiagnostic("FB.login callback", {
            callbackReceived: Boolean(response),
            authorizationCodeReceived: signupMode === SIGNUP_MODE_STANDARD && Boolean(code),
            signupMode,
            status: response?.status || "",
          });

          if (signupMode === SIGNUP_MODE_COEXISTENCE_TEST) {
            setStatus("Test Started");
            setError("");
            setSuccessMessage(
              "Coexistence signup was opened in Meta. This diagnostic flow will not connect to the YNOT backend or save WhatsApp settings. If you complete or close the Meta popup, no YNOT account state will be changed."
            );
            return;
          }

          if (!code) {
            setStatus("Error");
            setError("WhatsApp Business setup was cancelled. Please try again when you are ready.");
            return;
          }

          setAuthCode(code);
        },
        loginOptions
      );
    } catch (err) {
      console.error("Meta SDK launch failed", err);
      setStatus("Error");
      setError("Unable to open Meta WhatsApp setup. Please try again.");
    }
  };

  return (
    <main className="whatsapp-connect-page">
      <section className="whatsapp-connect-card">
        <div className="whatsapp-connect-mark">Y</div>
        <p className="whatsapp-connect-kicker">YNOT WhatsApp Business</p>
        <h1>Connect Your WhatsApp Business</h1>
        <p className="whatsapp-connect-copy">
          Connect the WhatsApp Business number you want YNOT to use for bills and customer messages.
          Your number will be verified and connected securely through Meta.
        </p>

        <div className={`whatsapp-connect-status ${status.toLowerCase()}`}>
          {status}
        </div>

        {error && <div className="whatsapp-connect-error">{error}</div>}
        {successMessage && (
          <div className="whatsapp-connect-success">
            {successMessage}
            {returnUrl && (
              <a href={returnUrl} className="whatsapp-connect-return-link">
                Return to vendor dashboard
              </a>
            )}
          </div>
        )}

        <button
          type="button"
          className="whatsapp-connect-button"
          disabled={status === "Connecting" || status === "Verifying" || status === "Connected"}
          onClick={() => startMetaSignup(SIGNUP_MODE_STANDARD)}
        >
          {status === "Connecting" || status === "Verifying"
            ? "Working..."
            : "Connect New WhatsApp Number"}
        </button>

        <button
          type="button"
          className="whatsapp-connect-button whatsapp-connect-button-secondary"
          disabled={status === "Connecting" || status === "Verifying" || status === "Connected"}
          onClick={() => startMetaSignup(SIGNUP_MODE_COEXISTENCE_TEST)}
        >
          Connect Existing WhatsApp Business Number
        </button>

        <p className="whatsapp-connect-footnote">
          YNOT will continue using the current WhatsApp billing setup until your Meta connection
          and templates are fully ready.
        </p>
      </section>
    </main>
  );
}

export default function WhatsappConnectPage() {
  return (
    <Suspense fallback={<main className="whatsapp-connect-page">Preparing...</main>}>
      <WhatsappConnectContent />
    </Suspense>
  );
}
