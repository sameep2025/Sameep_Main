"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_BASE_URL } from "../../utils/config";

const CUSTOMER_PORTAL_TOKEN_KEY = "ynot_customer_portal_token";
const DEFAULT_COUNTRY_CODE = "91";
const DEFAULT_BILL_LIMIT = 20;
const CONFIGURED_VENDOR_PREVIEW_ROOT_URL = (
  process.env.NEXT_PUBLIC_VENDOR_PREVIEW_ROOT_URL ||
  process.env.NEXT_PUBLIC_HARISH_PREVIEW_BASE_URL ||
  process.env.NEXT_PUBLIC_PREVIEW_BASE_URL ||
  ""
)
  .trim()
  .replace(/\/$/, "");

function normalizeMobile(value) {
  return String(value || "").replace(/\D/g, "").replace(/^0+/, "");
}

function maskFullNumber(countryCode, phone) {
  const digits = `${countryCode}${phone}`.replace(/\D/g, "");
  if (digits.length <= 4) return `+${digits}`;
  return `+${digits.slice(0, 2)} ${"*".repeat(Math.max(digits.length - 6, 0))}${digits.slice(-4)}`;
}

function formatCurrency(value) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: safe % 1 === 0 ? 0 : 2,
  }).format(safe);
}

function formatDate(value, options = {}) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}

function formatDateTime(value) {
  return formatDate(value, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getErrorMessage(err, fallback) {
  return err?.message || fallback;
}

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pluralizePoints(points) {
  return `${points.toLocaleString("en-IN")} ${points === 1 ? "point" : "points"}`;
}

function getRewardId(reward) {
  return String(reward?.rewardId || "").trim();
}

function getEarnActivityDetail(entry) {
  if (entry?.type !== "EARN") return null;

  const earnedPoints = Math.max(toSafeNumber(entry.points), 0);
  const remainingPoints = Math.max(toSafeNumber(entry.remainingPoints), 0);

  if (remainingPoints <= 0) {
    return { text: "Fully redeemed", isExpired: false };
  }

  const hasExpiry = Boolean(entry.expiryDate);
  const expiryDate = hasExpiry ? new Date(entry.expiryDate) : null;
  const hasValidExpiry = expiryDate && !Number.isNaN(expiryDate.getTime());
  const isPartiallyRedeemed = remainingPoints < earnedPoints;

  if (!hasValidExpiry) {
    return {
      text: isPartiallyRedeemed
        ? `${pluralizePoints(remainingPoints)} remaining · No expiry`
        : "No expiry",
      isExpired: false,
    };
  }

  const formattedExpiry = formatDate(entry.expiryDate);
  const isExpired = expiryDate < new Date();

  if (isExpired) {
    return {
      text: isPartiallyRedeemed
        ? `${pluralizePoints(remainingPoints)} expired on ${formattedExpiry}`
        : `Expired on ${formattedExpiry}`,
      isExpired: true,
    };
  }

  return {
    text: isPartiallyRedeemed
      ? `${pluralizePoints(remainingPoints)} remaining · Expires on ${formattedExpiry}`
      : `Expires on ${formattedExpiry}`,
    isExpired: false,
  };
}

function getVendorPreviewRootUrl() {
  if (CONFIGURED_VENDOR_PREVIEW_ROOT_URL) {
    return CONFIGURED_VENDOR_PREVIEW_ROOT_URL;
  }

  if (typeof window === "undefined") {
    return "";
  }

  const { hostname, origin } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  if (isLocalhost) {
    return "http://localhost:4000";
  }

  return origin.replace(/\/$/, "");
}

function buildBusinessUrl(subdomain) {
  const normalized = String(subdomain || "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalized)) return "";

  const rootUrl = getVendorPreviewRootUrl();
  if (!rootUrl) return "";

  try {
    const url = new URL(rootUrl);
    url.hostname = `${normalized}.${url.hostname}`;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

async function portalRequest(path, { method = "GET", token, body } = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));

  if (!res.ok || payload?.success === false) {
    const error = new Error(payload?.message || "Request failed");
    error.status = res.status;
    error.code = payload?.code;
    throw error;
  }

  return payload;
}

function LoginCard({ onOtpRequested }) {
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedCountry = DEFAULT_COUNTRY_CODE;
    const normalizedMobile = normalizeMobile(mobile);

    if (normalizedCountry === "91" && normalizedMobile.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    if (!/^[1-9]\d{7,14}$/.test(`${normalizedCountry}${normalizedMobile}`)) {
      setError("Enter a valid mobile number.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await portalRequest("/api/customer-portal/auth/request-otp", {
        method: "POST",
        body: {
          countryCode: normalizedCountry,
          phone: normalizedMobile,
        },
      });
      onOtpRequested({
        countryCode: normalizedCountry,
        phone: normalizedMobile,
        maskedPhone: maskFullNumber(normalizedCountry, normalizedMobile),
      });
    } catch (err) {
      setError(getErrorMessage(err, "Unable to send OTP. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="portalAuthCard">
      <p className="portalEyebrow">Customer portal</p>
      <h1>My Bills & Rewards</h1>
      <p className="portalIntro">
        Enter your mobile number to view your bills and reward points from
        businesses using YNOT.
      </p>

      <form className="portalForm" onSubmit={handleSubmit}>
        <label htmlFor="portalMobile">Mobile Number</label>
        <div className="portalPhoneRow">
          <div className="portalCountryCode" aria-label="Country code">
            +{DEFAULT_COUNTRY_CODE}
          </div>
          <input
            id="portalMobile"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="93815 20396"
            value={mobile}
            onChange={(event) => setMobile(event.target.value)}
          />
        </div>
        {error ? <p className="portalError">{error}</p> : null}
        <button className="portalPrimaryButton" type="submit" disabled={loading}>
          {loading ? "Sending OTP..." : "Send OTP"}
        </button>
      </form>
    </section>
  );
}

function OtpCard({ pendingPhone, onBack, onVerified }) {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setResendCooldown((value) => Math.max(value - 1, 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function handleVerify(event) {
    event.preventDefault();
    const normalizedOtp = normalizeMobile(otp);
    if (!/^\d{4,8}$/.test(normalizedOtp)) {
      setError("Enter the OTP sent to your mobile number.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const payload = await portalRequest("/api/customer-portal/auth/verify-otp", {
        method: "POST",
        body: {
          countryCode: pendingPhone.countryCode,
          phone: pendingPhone.phone,
          otp: normalizedOtp,
        },
      });
      onVerified(payload);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to verify OTP. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    try {
      setResending(true);
      setError("");
      setMessage("");
      await portalRequest("/api/customer-portal/auth/request-otp", {
        method: "POST",
        body: {
          countryCode: pendingPhone.countryCode,
          phone: pendingPhone.phone,
        },
      });
      setMessage("OTP sent again.");
      setResendCooldown(30);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to resend OTP. Please try again."));
    } finally {
      setResending(false);
    }
  }

  function handleOtpChange(event) {
    setOtp(normalizeMobile(event.target.value).slice(0, 6));
  }

  return (
    <section className="portalAuthCard">
      <p className="portalEyebrow">Verify mobile</p>
      <h1>Enter OTP</h1>
      <p className="portalIntro">Enter the OTP sent to {pendingPhone.maskedPhone}.</p>

      <form className="portalForm" onSubmit={handleVerify}>
        <label htmlFor="portalOtp">OTP</label>
        <div className="portalOtpBoxGroup">
          <input
            id="portalOtp"
            className="portalOtpInput"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={handleOtpChange}
            aria-label="Enter 6 digit OTP"
          />
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              className={otp.length === index ? "active" : ""}
              key={`otp-box-${index}`}
              aria-hidden="true"
            >
              {otp[index] || ""}
            </span>
          ))}
        </div>
        {error ? <p className="portalError">{error}</p> : null}
        {message ? <p className="portalSuccess">{message}</p> : null}
        <button className="portalPrimaryButton" type="submit" disabled={loading}>
          {loading ? "Verifying..." : "Verify OTP"}
        </button>
      </form>

      <div className="portalAuthActions">
        <button type="button" onClick={onBack}>
          Change mobile number
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || resendCooldown > 0}
        >
          {resendCooldown > 0
            ? `Resend OTP in ${resendCooldown}s`
            : resending
              ? "Resending..."
              : "Resend OTP"}
        </button>
      </div>
    </section>
  );
}

function PortalHeader({ customer, onLogout, loggingOut }) {
  return (
    <header className="customerPortalHeader">
      <a className="customerPortalBrand" href="/" aria-label="YNOT home">
        <img src="/ynot-logo.svg" alt="YNOT" />
      </a>
      <div className="customerPortalHeaderText">
        <p>Customer portal</p>
        <h1>My Bills & Rewards</h1>
        <span>View your bills and reward points from businesses using YNOT.</span>
      </div>
      <div className="customerPortalHeaderActions">
        {customer?.phone ? <span>{customer.phone}</span> : null}
        <button type="button" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </div>
    </header>
  );
}

function RewardActivity({ activity = [] }) {
  if (!activity.length) return null;

  return (
    <div className="portalActivity">
      <h4>Recent Activity</h4>
      {activity.map((entry, index) => {
        const activityDetail = getEarnActivityDetail(entry);

        return (
          <div className="portalActivityRow" key={`${entry.createdAt || "activity"}-${index}`}>
            <span className="portalActivityText">
              <span className={entry.signedPoints >= 0 ? "portalPositive" : "portalNegative"}>
                {entry.signedPoints >= 0 ? "+" : ""}
                {entry.signedPoints} {entry.type === "REDEEM" ? "Redeemed" : "Earned"}
              </span>
              {activityDetail?.text ? (
                <span
                  className={`portalActivityDetail${
                    activityDetail.isExpired ? " portalNegative" : ""
                  }`}
                >
                  {activityDetail.text}
                </span>
              ) : null}
            </span>
            <span>{formatDate(entry.createdAt)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ScratchCanvas({ disabled = false, onReveal }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const drawingRef = useRef(false);
  const revealedRef = useRef(false);
  const lastCheckRef = useRef(0);

  const drawCover = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = Math.max(148, Math.floor(container.clientWidth || 180));
    const height = width;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#fff2b8");
    gradient.addColorStop(0.48, "#e2b545");
    gradient.addColorStop(1, "#8a5a0a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    for (let x = -width; x < width * 2; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 80, height);
      ctx.lineTo(x + 50, height);
      ctx.lineTo(x - 30, 0);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2 - 24, Math.max(width * 0.12, 18), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fffdf5";
    ctx.font = "900 28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", width / 2, height / 2 - 24);

    ctx.font = "900 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("SCRATCH", width / 2, height / 2 + 14);
    ctx.fillText("TO REVEAL", width / 2, height / 2 + 36);

    ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
    ctx.fillText("Swipe over the card", width / 2, height - 20);
  }, []);

  useEffect(() => {
    revealedRef.current = false;
    drawCover();
    window.addEventListener("resize", drawCover);
    return () => window.removeEventListener("resize", drawCover);
  }, [drawCover]);

  const scratchAt = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas || disabled || revealedRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();
  }, [disabled]);

  const maybeReveal = useCallback(({ force = false } = {}) => {
    const canvas = canvasRef.current;
    if (!canvas || disabled || revealedRef.current) return;

    const now = Date.now();
    if (!force && now - lastCheckRef.current < 180) return;
    lastCheckRef.current = now;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const sampleStep = 8;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    let total = 0;

    for (let y = 0; y < canvas.height; y += sampleStep) {
      for (let x = 0; x < canvas.width; x += sampleStep) {
        const alphaIndex = (y * canvas.width + x) * 4 + 3;
        total += 1;
        if (image[alphaIndex] < 32) transparent += 1;
      }
    }

    if (total > 0 && transparent / total >= 0.55) {
      revealedRef.current = true;
      onReveal();
    }
  }, [disabled, onReveal]);

  return (
    <div className="portalScratchCanvasWrap" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="portalScratchCanvas"
        aria-label="Scratch to reveal reward"
        onPointerDown={(event) => {
          if (disabled) return;
          drawingRef.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          scratchAt(event);
          maybeReveal();
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current || disabled) return;
          event.preventDefault();
          scratchAt(event);
          maybeReveal();
        }}
        onPointerUp={(event) => {
          drawingRef.current = false;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          maybeReveal({ force: true });
        }}
        onPointerCancel={() => {
          drawingRef.current = false;
        }}
      />
    </div>
  );
}

function NewRewardScratchCard({
  reward,
  revealedReward,
  revealing,
  revealError,
  onReveal,
}) {
  if (!reward && !revealedReward) return null;

  const displayReward = revealedReward || reward;
  const vendorName =
    displayReward?.vendor?.businessName || reward?.vendor?.businessName || "Business";
  const expiryText = revealedReward?.expiryDate ? formatDate(revealedReward.expiryDate) : "";

  return (
    <section
      className={`portalScratchRewardCard${revealedReward ? " is-revealed" : ""}${
        revealing ? " is-revealing" : ""
      }`}
      aria-label={revealedReward ? `Revealed reward from ${vendorName}` : "Scratch to reveal reward"}
    >
      {revealedReward ? (
        <div className="portalScratchResult">
          <strong>{toSafeNumber(revealedReward.points).toLocaleString("en-IN")}</strong>
          <em>Points</em>
          <p className="portalScratchVendorName" title={vendorName}>{vendorName}</p>
          {expiryText ? <p className="portalScratchExpiry">Expires {expiryText}</p> : null}
        </div>
      ) : (
        <>
          <ScratchCanvas disabled={revealing} onReveal={onReveal} />
          {revealing ? <div className="portalScratchRevealing">Revealing...</div> : null}
          {revealError ? (
            <div className="portalScratchError">
              <p>Reveal failed</p>
              <button type="button" onClick={onReveal} disabled={revealing}>
                Try Again
              </button>
            </div>
          ) : null}
          {!revealError && !revealing ? (
            <button
              className="portalTextButton portalScratchFallback"
              type="button"
              onClick={onReveal}
            >
              Tap to reveal
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function RewardsOverallSummary({ summary }) {
  return (
    <section className="portalRewardsOverview" aria-label="Overall rewards summary">
      <div className="portalRewardsOverviewTop">
        <div>
          <p className="portalSectionKicker">Your Rewards</p>
          <h2>Your Reward Points</h2>
          <p className="portalRewardsNote">
            See all your reward points from YNOT businesses in one place.
          </p>
        </div>
        <div className="portalRewardsAvailable">
          <strong>{summary.availablePoints.toLocaleString("en-IN")}</strong>
          <span>Points Available</span>
        </div>
      </div>

      <div className="portalRewardsSummaryGrid">
        <div>
          <span>Earned</span>
          <strong>{summary.totalEarnedPoints.toLocaleString("en-IN")}</strong>
        </div>
        <div>
          <span>Redeemed</span>
          <strong>{summary.totalRedeemedPoints.toLocaleString("en-IN")}</strong>
        </div>
        <div>
          <span>Expired</span>
          <strong>{summary.totalExpiredPoints.toLocaleString("en-IN")}</strong>
        </div>
      </div>

      {summary.expiringSoonPoints > 0 ? (
        <div className="portalRewardsExpiryNotice">
          {summary.expiringSoonPoints.toLocaleString("en-IN")} points expire in the next 7 days
        </div>
      ) : null}

      <p className="portalRewardsFinePrint">
        Use your points at the same business where you earned them.
      </p>
    </section>
  );
}

function RewardsTab({ token, onAuthExpired }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vendors, setVendors] = useState([]);
  const [unrevealedRewards, setUnrevealedRewards] = useState([]);
  const [scratchRewards, setScratchRewards] = useState([]);
  const [expandedVendorKey, setExpandedVendorKey] = useState("");
  const [revealedRewardsById, setRevealedRewardsById] = useState({});
  const [revealingRewardIds, setRevealingRewardIds] = useState({});
  const [revealErrors, setRevealErrors] = useState({});
  const revealedRewardsRef = useRef({});
  const revealingRewardIdsRef = useRef({});

  const overallRewards = useMemo(
    () =>
      vendors.reduce(
        (summary, vendorReward) => ({
          availablePoints: summary.availablePoints + toSafeNumber(vendorReward.availablePoints),
          totalEarnedPoints: summary.totalEarnedPoints + toSafeNumber(vendorReward.totalEarnedPoints),
          totalRedeemedPoints:
            summary.totalRedeemedPoints + toSafeNumber(vendorReward.totalRedeemedPoints),
          totalExpiredPoints:
            summary.totalExpiredPoints + toSafeNumber(vendorReward.totalExpiredPoints),
          expiringSoonPoints: summary.expiringSoonPoints + toSafeNumber(vendorReward.expiringSoonPoints),
        }),
        {
          availablePoints: 0,
          totalEarnedPoints: 0,
          totalRedeemedPoints: 0,
          totalExpiredPoints: 0,
          expiringSoonPoints: 0,
        }
      ),
    [vendors]
  );

  const sortedVendorRewards = useMemo(
    () =>
      vendors
        .map((vendorReward, index) => ({ vendorReward, index }))
        .sort((a, b) => {
          const aAvailable = toSafeNumber(a.vendorReward.availablePoints);
          const bAvailable = toSafeNumber(b.vendorReward.availablePoints);
          const aHasAvailable = aAvailable > 0;
          const bHasAvailable = bAvailable > 0;

          if (aHasAvailable !== bHasAvailable) return aHasAvailable ? -1 : 1;
          if (aHasAvailable && bHasAvailable && aAvailable !== bAvailable) {
            return bAvailable - aAvailable;
          }
          return a.index - b.index;
        })
        .map(({ vendorReward }) => vendorReward),
    [vendors]
  );

  const mergeScratchRewards = useCallback((nextUnrevealedRewards) => {
    setScratchRewards((currentRewards) => {
      const incomingById = new Map(
        nextUnrevealedRewards
          .map((reward) => [getRewardId(reward), reward])
          .filter(([rewardId]) => rewardId)
      );
      const revealedById = revealedRewardsRef.current;
      const seenIds = new Set();
      const mergedRewards = [];

      currentRewards.forEach((reward) => {
        const rewardId = getRewardId(reward);
        if (!rewardId || seenIds.has(rewardId)) return;

        if (revealedById[rewardId]) {
          mergedRewards.push(revealedById[rewardId]);
          seenIds.add(rewardId);
          return;
        }

        if (incomingById.has(rewardId)) {
          mergedRewards.push(incomingById.get(rewardId));
          seenIds.add(rewardId);
        }
      });

      nextUnrevealedRewards.forEach((reward) => {
        const rewardId = getRewardId(reward);
        if (!rewardId || seenIds.has(rewardId)) return;
        mergedRewards.push(reward);
        seenIds.add(rewardId);
      });

      return mergedRewards;
    });
  }, []);

  const loadRewards = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError("");
      }
      const payload = await portalRequest("/api/customer-portal/rewards", { token });
      const nextUnrevealedRewards = Array.isArray(payload?.data?.unrevealedRewards)
        ? payload.data.unrevealedRewards
        : [];
      setVendors(Array.isArray(payload?.data?.vendors) ? payload.data.vendors : []);
      setUnrevealedRewards(nextUnrevealedRewards);
      mergeScratchRewards(nextUnrevealedRewards);
    } catch (err) {
      if ([401, 403].includes(err.status)) {
        onAuthExpired();
        return;
      }
      if (!silent) {
        setError("Unable to load your rewards. Please try again.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [mergeScratchRewards, onAuthExpired, token]);

  useEffect(() => {
    loadRewards();
  }, [loadRewards]);

  const revealReward = useCallback(async (reward) => {
    const rewardId = getRewardId(reward);
    if (
      !rewardId ||
      revealingRewardIdsRef.current[rewardId] ||
      revealingRewardIds[rewardId] ||
      revealedRewardsById[rewardId]
    ) {
      return;
    }

    try {
      revealingRewardIdsRef.current = {
        ...revealingRewardIdsRef.current,
        [rewardId]: true,
      };
      setRevealingRewardIds((current) => ({ ...current, [rewardId]: true }));
      setRevealErrors((current) => ({ ...current, [rewardId]: "" }));
      const payload = await portalRequest(
        `/api/customer-portal/rewards/${encodeURIComponent(rewardId)}/reveal`,
        {
          method: "POST",
          token,
        }
      );
      const nextRevealedReward = payload?.data || null;
      if (!getRewardId(nextRevealedReward)) {
        throw new Error("Reveal response did not include reward details");
      }
      revealedRewardsRef.current = {
        ...revealedRewardsRef.current,
        [rewardId]: nextRevealedReward,
      };
      setRevealedRewardsById(revealedRewardsRef.current);
      setScratchRewards((currentRewards) =>
        currentRewards.map((currentReward) =>
          getRewardId(currentReward) === rewardId ? nextRevealedReward : currentReward
        )
      );
      await loadRewards({ silent: true });
    } catch (err) {
      if ([401, 403].includes(err.status)) {
        onAuthExpired();
        return;
      }
      setRevealErrors((current) => ({
        ...current,
        [rewardId]: "Couldn't reveal your reward. Tap to try again.",
      }));
    } finally {
      const nextInFlight = { ...revealingRewardIdsRef.current };
      delete nextInFlight[rewardId];
      revealingRewardIdsRef.current = nextInFlight;
      setRevealingRewardIds((current) => {
        const next = { ...current };
        delete next[rewardId];
        return next;
      });
    }
  }, [loadRewards, onAuthExpired, revealedRewardsById, revealingRewardIds, token]);

  if (loading) return <div className="portalStateCard">Loading rewards...</div>;

  if (error) {
    return (
      <div className="portalStateCard">
        <p>{error}</p>
        <button type="button" onClick={loadRewards}>Try again</button>
      </div>
    );
  }

  if (!vendors.length && !unrevealedRewards.length && !scratchRewards.length) {
    return (
      <div className="portalStateCard">
        <h3>No reward points yet.</h3>
        <p>Your rewards from businesses using YNOT will appear here.</p>
      </div>
    );
  }

  return (
    <>
      {scratchRewards.length > 0 ? (
        <section className="portalScratchRewardsSection" aria-label="New rewards">
          <div className="portalScratchSectionHeader">
            <p className="portalSectionKicker">New Rewards</p>
            <h2>Scratch to see what you earned</h2>
          </div>
          <div className="portalScratchGrid">
            {scratchRewards.map((reward, index) => {
              const rewardId = getRewardId(reward);
              const revealedReward = revealedRewardsById[rewardId] || null;

              return (
                <NewRewardScratchCard
                  key={rewardId || `scratch-reward-${index}`}
                  reward={reward}
                  revealedReward={revealedReward}
                  revealing={Boolean(revealingRewardIds[rewardId])}
                  revealError={revealErrors[rewardId] || ""}
                  onReveal={() => revealReward(reward)}
                />
              );
            })}
          </div>
        </section>
      ) : null}
      <RewardsOverallSummary summary={overallRewards} />
      <div className="portalRewardsSectionHeading">Rewards by business</div>
      <div className="portalCardStack">
        {sortedVendorRewards.map((vendorReward, index) => {
          const vendorKey = vendorReward.vendor?.subdomain || `vendor-${index}`;
          const isExpanded = expandedVendorKey === vendorKey;
          const businessUrl = buildBusinessUrl(vendorReward.vendor?.subdomain);
          const expiringSoonPoints = Number(vendorReward.expiringSoonPoints || 0);

          return (
            <article className="portalRewardCard" key={vendorKey}>
              <div className="portalRewardCompact">
                <div className="portalVendorHeader">
                  <div>
                    <h3>{vendorReward.vendor?.businessName || "Business"}</h3>
                    {businessUrl ? (
                      <a href={businessUrl} target="_blank" rel="noreferrer">
                        Visit Business
                      </a>
                    ) : null}
                  </div>
                  {vendorReward.vendor?.logoUrl ? (
                    <img src={vendorReward.vendor.logoUrl} alt="" />
                  ) : null}
                </div>

                <div className="portalPointsHero">
                  <strong>{Number(vendorReward.availablePoints || 0).toLocaleString("en-IN")}</strong>
                  <span>Available Points</span>
                </div>
              </div>

              {expiringSoonPoints > 0 ? (
                <div className="portalExpiryNotice">
                  {expiringSoonPoints.toLocaleString("en-IN")} points expiring soon
                </div>
              ) : null}

              <div className="portalMiniGrid">
                <div>
                  <span>Earned</span>
                  <strong>{Number(vendorReward.totalEarnedPoints || 0).toLocaleString("en-IN")}</strong>
                </div>
                <div>
                  <span>Redeemed</span>
                  <strong>{Number(vendorReward.totalRedeemedPoints || 0).toLocaleString("en-IN")}</strong>
                </div>
                <div>
                  <span>Expired</span>
                  <strong>{Number(vendorReward.totalExpiredPoints || 0).toLocaleString("en-IN")}</strong>
                </div>
              </div>

              {isExpanded ? (
                <div className="portalRewardDetails">
                  {expiringSoonPoints > 0 ? (
                    <div className="portalExpiryBox">
                      <strong>
                        {expiringSoonPoints.toLocaleString("en-IN")} points expiring soon
                      </strong>
                      {(vendorReward.expiryBatches || []).map((batch, batchIndex) => (
                        <p key={`${batch.expiryDate || "expiry"}-${batchIndex}`}>
                          {formatDate(batch.expiryDate)} —{" "}
                          {Number(batch.points || 0).toLocaleString("en-IN")} points
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <RewardActivity activity={vendorReward.recentActivity || []} />
                </div>
              ) : null}

              <button
                className="portalTextButton"
                type="button"
                onClick={() => setExpandedVendorKey(isExpanded ? "" : vendorKey)}
              >
                {isExpanded ? "Hide Details" : "View Reward Details"}
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}

function BillRows({ bill, showAmountPaid = true }) {
  return (
    <div className="portalBillRows">
      <div>
        <span>Bill Value</span>
        <strong>{formatCurrency(bill.billValue)}</strong>
      </div>
      {Number(bill.discountAmount || 0) > 0 ? (
        <div>
          <span>Discount</span>
          <strong>-{formatCurrency(bill.discountAmount)}</strong>
        </div>
      ) : null}
      {Number(bill.rewardsRedeemed || 0) > 0 ? (
        <div>
          <span>Rewards</span>
          <strong>-{formatCurrency(bill.rewardsRedeemed)}</strong>
        </div>
      ) : null}
      {showAmountPaid ? (
        <div className="portalAmountPaid">
          <span>Amount Paid</span>
          <strong>{formatCurrency(bill.netCollected)}</strong>
        </div>
      ) : null}
    </div>
  );
}

function BillDetailPanel({ bill, loading, error, onClose }) {
  const isOpen = Boolean(bill || loading || error);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="portalDetailOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Bill detail"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="portalDetailPanel">
        <button className="portalDetailClose" type="button" onClick={onClose}>
          Close
        </button>
        {loading ? <div className="portalStateCard">Loading bill...</div> : null}
        {error ? <div className="portalStateCard">{error}</div> : null}
        {bill ? (
          <>
            <div className="portalDetailTitle">
              <p>Bill detail</p>
              <h2>{bill.vendor?.businessName || "Business"}</h2>
              <span>{formatDateTime(bill.date)}</span>
            </div>

            <div className="portalItemsTable">
              <div className="portalItemsHeader">
                <span>Item</span>
                <span>Qty</span>
                <span>Total</span>
              </div>
              {(bill.items || []).map((item, index) => (
                <div className="portalItemRow" key={`${item.name || "item"}-${index}`}>
                  <div>
                    <strong>{item.name || "Item"}</strong>
                    {Number(item.unitPrice || 0) > 0 ? (
                      <span>{formatCurrency(item.unitPrice)} each</span>
                    ) : null}
                    {item.staffName ? (
                      <span>Stylist: {item.staffName}</span>
                    ) : null}
                  </div>
                  <span>{Number(item.quantity || 0).toLocaleString("en-IN")}</span>
                  <strong>{formatCurrency(item.itemTotal)}</strong>
                </div>
              ))}
            </div>

            <BillRows bill={bill} showAmountPaid={false} />

            {bill.paymentMode ? (
              <p className="portalPaymentPill">{bill.paymentMode}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function BillsTab({ token, onAuthExpired }) {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [bills, setBills] = useState([]);
  const [pagination, setPagination] = useState({ hasMore: false, nextCursor: null });
  const [detail, setDetail] = useState({ loading: false, error: "", bill: null });

  const loadBills = useCallback(async ({ cursor = null, append = false } = {}) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError("");
      const params = new URLSearchParams({ limit: String(DEFAULT_BILL_LIMIT) });
      if (cursor) params.set("cursor", cursor);
      const payload = await portalRequest(`/api/customer-portal/bills?${params.toString()}`, {
        token,
      });
      const nextBills = Array.isArray(payload?.data?.bills) ? payload.data.bills : [];
      setBills((current) => (append ? [...current, ...nextBills] : nextBills));
      setPagination(payload?.data?.pagination || { hasMore: false, nextCursor: null });
    } catch (err) {
      if ([401, 403].includes(err.status)) {
        onAuthExpired();
        return;
      }
      setError("Unable to load your bills. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [onAuthExpired, token]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  async function openBillDetail(billId) {
    try {
      setDetail({ loading: true, error: "", bill: null });
      const payload = await portalRequest(`/api/customer-portal/bills/${encodeURIComponent(billId)}`, {
        token,
      });
      setDetail({ loading: false, error: "", bill: payload?.data?.bill || null });
    } catch (err) {
      if ([401, 403].includes(err.status)) {
        onAuthExpired();
        return;
      }
      setDetail({
        loading: false,
        error: "Unable to load this bill. Please try again.",
        bill: null,
      });
    }
  }

  if (loading) return <div className="portalStateCard">Loading bills...</div>;

  if (error) {
    return (
      <div className="portalStateCard">
        <p>{error}</p>
        <button type="button" onClick={() => loadBills()}>Try again</button>
      </div>
    );
  }

  if (!bills.length) {
    return (
      <div className="portalStateCard">
        <h3>No bills yet.</h3>
        <p>Your completed bills from businesses using YNOT will appear here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="portalCardStack">
        {bills.map((bill) => (
          <article className="portalBillCard" key={bill.billId}>
            <div className="portalBillTop">
              <div>
                <h3>{bill.vendor?.businessName || "Business"}</h3>
                <p>{formatDate(bill.date)}</p>
              </div>
              <div className="portalBillPaid">
                <span>Amount Paid</span>
                <strong>{formatCurrency(bill.netCollected)}</strong>
              </div>
            </div>
            <BillRows bill={bill} />
            {bill.paymentMode ? <p className="portalPaymentPill">{bill.paymentMode}</p> : null}
            <button
              className="portalSecondaryButton"
              type="button"
              onClick={() => openBillDetail(bill.billId)}
            >
              View Bill
            </button>
          </article>
        ))}
      </div>

      {pagination.hasMore ? (
        <button
          className="portalLoadMoreButton"
          type="button"
          onClick={() => loadBills({ cursor: pagination.nextCursor, append: true })}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading..." : "Load More"}
        </button>
      ) : null}

      <BillDetailPanel
        bill={detail.bill}
        loading={detail.loading}
        error={detail.error}
        onClose={() => setDetail({ loading: false, error: "", bill: null })}
      />
    </>
  );
}

export default function CustomerPortalPage() {
  const [restoreState, setRestoreState] = useState("loading");
  const [token, setToken] = useState("");
  const [customer, setCustomer] = useState(null);
  const [pendingPhone, setPendingPhone] = useState(null);
  const [activeTab, setActiveTab] = useState("bills");
  const [loggingOut, setLoggingOut] = useState(false);

  const isAuthenticated = restoreState === "authenticated" && token;

  const clearPortalSession = useCallback(() => {
    window.localStorage.removeItem(CUSTOMER_PORTAL_TOKEN_KEY);
    setToken("");
    setCustomer(null);
    setRestoreState("login");
    setPendingPhone(null);
  }, []);

  const restoreSession = useCallback(async () => {
    const storedToken = window.localStorage.getItem(CUSTOMER_PORTAL_TOKEN_KEY);
    if (!storedToken) {
      setRestoreState("login");
      return;
    }

    try {
      setRestoreState("loading");
      const payload = await portalRequest("/api/customer-portal/me", {
        token: storedToken,
      });
      setToken(storedToken);
      setCustomer(payload?.data?.customer || null);
      setRestoreState("authenticated");
    } catch (err) {
      window.localStorage.removeItem(CUSTOMER_PORTAL_TOKEN_KEY);
      setToken("");
      setCustomer(null);
      setRestoreState("login");
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const handleVerified = useCallback((payload) => {
    const nextToken = payload?.token;
    if (!nextToken) {
      setRestoreState("login");
      return;
    }
    window.localStorage.setItem(CUSTOMER_PORTAL_TOKEN_KEY, nextToken);
    setToken(nextToken);
    setCustomer(payload?.customer || null);
    setPendingPhone(null);
    setRestoreState("authenticated");
  }, []);

  async function handleLogout() {
    try {
      setLoggingOut(true);
      if (token) {
        await portalRequest("/api/customer-portal/logout", {
          method: "POST",
          token,
        });
      }
    } catch (err) {
      // Local logout still succeeds if the server session is already expired.
    } finally {
      setLoggingOut(false);
      clearPortalSession();
    }
  }

  const content = useMemo(() => {
    if (restoreState === "loading") {
      return <section className="portalAuthCard">Loading your portal...</section>;
    }

    if (!isAuthenticated && pendingPhone) {
      return (
        <OtpCard
          pendingPhone={pendingPhone}
          onBack={() => setPendingPhone(null)}
          onVerified={handleVerified}
        />
      );
    }

    if (!isAuthenticated) {
      return <LoginCard onOtpRequested={setPendingPhone} />;
    }

    return (
      <section className="customerPortalDashboard">
        <PortalHeader customer={customer} onLogout={handleLogout} loggingOut={loggingOut} />
        <div className="portalTabs" role="tablist" aria-label="Customer portal sections">
          <button
            type="button"
            className={activeTab === "bills" ? "active" : ""}
            onClick={() => setActiveTab("bills")}
          >
            Bills
          </button>
          <button
            type="button"
            className={activeTab === "rewards" ? "active" : ""}
            onClick={() => setActiveTab("rewards")}
          >
            Rewards
          </button>
        </div>
        {activeTab === "rewards" ? (
          <RewardsTab token={token} onAuthExpired={clearPortalSession} />
        ) : (
          <BillsTab token={token} onAuthExpired={clearPortalSession} />
        )}
      </section>
    );
  }, [
    activeTab,
    clearPortalSession,
    customer,
    handleVerified,
    isAuthenticated,
    loggingOut,
    pendingPhone,
    restoreState,
    token,
  ]);

  return (
    <main className="customerPortalPage">
      <div className="customerPortalBackdrop" />
      <div className="customerPortalShell">{content}</div>
    </main>
  );
}
