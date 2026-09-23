"use client";

import { useEffect, useState } from "react";
import "./RevenuePanels.css";

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function getNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatGeneratedAt(value) {
  if (!value) return "";

  return value.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatPercent(value, total) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function getDefaultFileName(generatedAt) {
  const date = generatedAt || new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `ynot-revenue-report-${year}-${month}-${day}.png`;
}

function normalizeSummary(source) {
  const summary = source || {};
  return {
    billValue: getNumber(summary.billValue),
    discountsGiven: getNumber(summary.discountsGiven),
    rewardsRedeemed: getNumber(summary.rewardsRedeemed),
    netCollected: getNumber(summary.netCollected),
    totalBills: getNumber(summary.totalBills ?? summary.totalOrders),
    onlineCollected: getNumber(summary.onlineCollected),
    cashCollected: getNumber(summary.cashCollected),
    notRecordedCollected: getNumber(summary.notRecordedCollected),
    pointsDistributed: getNumber(summary.pointsDistributed ?? summary.totalDistributed),
  };
}

function drawRoundRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function drawCard(context, x, y, width, height, radius, fill, stroke = "rgba(230,195,122,0.22)") {
  drawRoundRect(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = 1.5;
  context.stroke();
}

function drawText(context, text, x, y, options = {}) {
  context.fillStyle = options.color || "#f8f1dc";
  context.font = `${options.weight || 700} ${options.size || 28}px ${options.family || "Arial, sans-serif"}`;
  context.textAlign = options.align || "left";
  context.textBaseline = options.baseline || "top";
  context.fillText(String(text ?? ""), x, y);
}

function renderSnapshotToPngBlob({
  businessName,
  title,
  periodLabel,
  generatedAt,
  data,
  showPointsDistributed,
}) {
  if (typeof document === "undefined") {
    throw new Error("Image generation is not available.");
  }

  const width = 920;
  const height = showPointsDistributed ? 1060 : 980;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  const bgGradient = context.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, "#151410");
  bgGradient.addColorStop(1, "#070707");
  context.fillStyle = bgGradient;
  context.fillRect(0, 0, width, height);

  const glowGradient = context.createRadialGradient(90, 60, 10, 90, 60, 360);
  glowGradient.addColorStop(0, "rgba(230,195,122,0.28)");
  glowGradient.addColorStop(1, "rgba(230,195,122,0)");
  context.fillStyle = glowGradient;
  context.fillRect(0, 0, width, 360);

  drawRoundRect(context, 24, 24, width - 48, height - 48, 42);
  context.strokeStyle = "rgba(230,195,122,0.32)";
  context.lineWidth = 2;
  context.stroke();

  let y = 62;
  drawText(context, businessName || "Your Business", 64, y, {
    size: 32,
    weight: 800,
    color: "rgba(248,241,220,0.82)",
  });

  y += 86;
  drawText(context, String(title || "Revenue Summary").toUpperCase(), 64, y, {
    size: 42,
    weight: 900,
    color: "#f5d97a",
  });
  if (periodLabel) {
    drawText(context, periodLabel, 64, y + 56, {
      size: 25,
      weight: 700,
      color: "rgba(248,241,220,0.68)",
    });
  }

  y += 122;
  const heroGradient = context.createLinearGradient(64, y, width - 64, y + 162);
  heroGradient.addColorStop(0, "rgba(230,195,122,0.24)");
  heroGradient.addColorStop(1, "rgba(255,255,255,0.04)");
  drawCard(context, 64, y, width - 128, 162, 32, heroGradient, "rgba(230,195,122,0.38)");
  drawText(context, "NET COLLECTED", 96, y + 30, {
    size: 20,
    weight: 900,
    color: "rgba(248,241,220,0.68)",
  });
  drawText(context, currencyFmt.format(data.netCollected), 96, y + 66, {
    size: 64,
    weight: 900,
    color: "#f7dd83",
  });
  drawText(context, data.totalBills, width - 116, y + 48, {
    size: 52,
    weight: 900,
    color: "#fff7df",
    align: "right",
  });
  drawText(context, data.totalBills === 1 ? "BILL" : "BILLS", width - 116, y + 106, {
    size: 19,
    weight: 900,
    color: "rgba(248,241,220,0.66)",
    align: "right",
  });

  y += 190;
  const averageBill = data.totalBills > 0 ? data.netCollected / data.totalBills : 0;
  const metricCards = [
    ["Bill Value", currencyFmt.format(data.billValue)],
    ["Discounts Given", currencyFmt.format(data.discountsGiven)],
    ["Rewards Redeemed", currencyFmt.format(data.rewardsRedeemed)],
    ["Avg. Collected / Bill", currencyFmt.format(averageBill)],
  ];
  const metricWidth = (width - 148) / 2;
  metricCards.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 64 + column * (metricWidth + 20);
    const cardY = y + row * 118;
    drawCard(context, x, cardY, metricWidth, 98, 24, "rgba(255,255,255,0.04)", "rgba(230,195,122,0.16)");
    drawText(context, label.toUpperCase(), x + 24, cardY + 20, {
      size: 17,
      weight: 900,
      color: "rgba(248,241,220,0.62)",
    });
    drawText(context, value, x + 24, cardY + 50, {
      size: 30,
      weight: 900,
      color: "#fff7df",
    });
  });

  y += 258;
  drawCard(context, 64, y, width - 128, 148, 26, "rgba(230,195,122,0.07)", "rgba(230,195,122,0.22)");
  drawText(context, "PAYMENT BREAKDOWN", 92, y + 22, {
    size: 20,
    weight: 900,
    color: "#f5d97a",
  });

  const paymentTotal = data.onlineCollected + data.cashCollected + data.notRecordedCollected;
  const payments = [
    ["Online", data.onlineCollected],
    ["Cash", data.cashCollected],
    ["Not Recorded", data.notRecordedCollected],
  ];
  payments.forEach(([label, value], index) => {
    const cellWidth = (width - 184) / 3;
    const x = 92 + index * cellWidth;
    drawText(context, label.toUpperCase(), x, y + 66, {
      size: 16,
      weight: 900,
      color: "rgba(248,241,220,0.62)",
    });
    drawText(context, currencyFmt.format(value), x, y + 92, {
      size: 25,
      weight: 900,
      color: "#fff7df",
    });
    drawText(context, formatPercent(value, paymentTotal), x, y + 124, {
      size: 15,
      weight: 700,
      color: "rgba(248,241,220,0.46)",
    });
  });

  if (showPointsDistributed) {
    y += 172;
    drawCard(context, 64, y, width - 128, 78, 22, "rgba(255,255,255,0.04)", "rgba(230,195,122,0.16)");
    drawText(context, "POINTS DISTRIBUTED", 92, y + 25, {
      size: 17,
      weight: 900,
      color: "rgba(248,241,220,0.62)",
    });
    drawText(context, data.pointsDistributed, width - 92, y + 20, {
      size: 32,
      weight: 900,
      color: "#fff7df",
      align: "right",
    });
  }

  const footerY = height - 86;
  drawText(context, `Generated at ${formatGeneratedAt(generatedAt)}`, 64, footerY, {
    size: 18,
    weight: 700,
    color: "rgba(248,241,220,0.52)",
  });
  drawText(context, "Powered by YNOT • ynot.co.in", width - 64, footerY, {
    size: 18,
    weight: 900,
    color: "rgba(245,217,122,0.72)",
    align: "right",
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not create report image."));
      }
    }, "image/png");
  });
}

export default function RevenueSnapshot({
  isOpen,
  onClose,
  businessName = "Your Business",
  title,
  periodLabel,
  summary,
  showPointsDistributed = true,
  fileName,
}) {
  const [generatedAt, setGeneratedAt] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setGeneratedAt(new Date());
      setStatusMessage("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof navigator === "undefined") return;

    try {
      const probeFile = new File([""], "ynot-revenue-report.png", { type: "image/png" });
      setShareSupported(
        Boolean(navigator.share && navigator.canShare?.({ files: [probeFile] }))
      );
    } catch {
      setShareSupported(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const data = normalizeSummary(summary);
  const averageBill = data.totalBills > 0 ? data.netCollected / data.totalBills : 0;
  const paymentTotal = data.onlineCollected + data.cashCollected + data.notRecordedCollected;
  const metrics = [
    { label: "Bill Value", value: currencyFmt.format(data.billValue) },
    { label: "Discounts Given", value: currencyFmt.format(data.discountsGiven) },
    { label: "Rewards Redeemed", value: currencyFmt.format(data.rewardsRedeemed) },
    { label: "Avg. Collected / Bill", value: currencyFmt.format(averageBill) },
  ];
  const resolvedFileName = fileName || getDefaultFileName(generatedAt);

  const createImageBlob = async () =>
    renderSnapshotToPngBlob({
      businessName,
      title,
      periodLabel,
      generatedAt,
      data,
      showPointsDistributed,
    });

  const handleDownload = async () => {
    try {
      setIsGenerating(true);
      setStatusMessage("");
      const blob = await createImageBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = resolvedFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatusMessage("Image downloaded.");
    } catch (error) {
      console.error("Revenue snapshot image download failed", error);
      setStatusMessage("Could not generate the image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!shareSupported) {
      setStatusMessage(
        "Image sharing is not supported on this device. Download the image and share it through WhatsApp."
      );
      return;
    }

    try {
      setIsGenerating(true);
      setStatusMessage("");
      const blob = await createImageBlob();
      const file = new File([blob], resolvedFileName, { type: "image/png" });

      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        setStatusMessage(
          "Image sharing is not supported on this device. Download the image and share it through WhatsApp."
        );
        return;
      }

      await navigator.share({
        title: "YNOT Revenue Snapshot",
        text: "Revenue summary generated from YNOT.",
        files: [file],
      });

      setStatusMessage("Share sheet opened.");
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Revenue snapshot image share failed", error);
        setStatusMessage("Could not share the image. You can download it instead.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="revenue-snapshot-overlay" role="dialog" aria-modal="true">
      <div className="revenue-snapshot-shell">
        <div className="revenue-snapshot-controls">
          <button
            type="button"
            className="revenue-snapshot-control-btn"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="revenue-snapshot-control-btn"
            onClick={handleShare}
            disabled={isGenerating}
          >
            Share Image
          </button>
          <button
            type="button"
            className="revenue-snapshot-control-btn primary"
            onClick={handleDownload}
            disabled={isGenerating}
          >
            Download Image
          </button>
        </div>

        <div className="revenue-snapshot-card">
          <div className="revenue-snapshot-brand-row">
            <div>
              <div className="revenue-snapshot-business">{businessName || "Your Business"}</div>
            </div>
          </div>

          <div className="revenue-snapshot-heading">
            <h2>{title}</h2>
            {periodLabel ? <p>{periodLabel}</p> : null}
            <p>Generated at {formatGeneratedAt(generatedAt)}</p>
          </div>

          <div className="revenue-snapshot-hero">
            <div>
              <span>Net Collected</span>
              <strong>{currencyFmt.format(data.netCollected)}</strong>
            </div>
            <div className="revenue-snapshot-bill-count">
              <strong>{data.totalBills}</strong>
              <span>{data.totalBills === 1 ? "Bill" : "Bills"}</span>
            </div>
          </div>

          <div className="revenue-snapshot-metrics">
            {metrics.map((metric) => (
              <div key={metric.label} className="revenue-snapshot-metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>

          <div className="revenue-snapshot-breakdown">
            <div className="revenue-snapshot-section-title">Payment Breakdown</div>
            <div className="revenue-snapshot-breakdown-grid">
              <div className="revenue-snapshot-breakdown-cell">
                <span>Online</span>
                <strong>{currencyFmt.format(data.onlineCollected)}</strong>
                <small>{formatPercent(data.onlineCollected, paymentTotal)}</small>
              </div>
              <div className="revenue-snapshot-breakdown-cell">
                <span>Cash</span>
                <strong>{currencyFmt.format(data.cashCollected)}</strong>
                <small>{formatPercent(data.cashCollected, paymentTotal)}</small>
              </div>
              <div className="revenue-snapshot-breakdown-cell">
                <span>Not Recorded</span>
                <strong>{currencyFmt.format(data.notRecordedCollected)}</strong>
                <small>{formatPercent(data.notRecordedCollected, paymentTotal)}</small>
              </div>
            </div>
          </div>

          {showPointsDistributed ? (
            <div className="revenue-snapshot-points">
              <span>Points Distributed</span>
              <strong>{data.pointsDistributed}</strong>
            </div>
          ) : null}

          <div className="revenue-snapshot-footer">
            <span>Generated at {formatGeneratedAt(generatedAt)}</span>
            <strong>Powered by YNOT • ynot.co.in</strong>
          </div>
        </div>

        {statusMessage ? (
          <div className="revenue-snapshot-status" role="status">
            {statusMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
