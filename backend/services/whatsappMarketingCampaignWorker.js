const WhatsappMarketingCampaign = require("../models/WhatsappMarketingCampaign");
const WhatsappMarketingCampaignRecipient = require("../models/WhatsappMarketingCampaignRecipient");
const {
  claimCampaignRecipient,
  ensureCampaignRecipientRecords,
  processClaimedCampaignRecipient,
  recoverExpiredRecipientClaims,
  refreshCampaignDeliverySummary,
} = require("./whatsappMarketingCampaignExecutionService");
const { isWhatsappMarketingEnabled } = require("./whatsappMarketingCapability");
const { loadVendorMetaConnection } = require("../controllers/vendorWhatsappMarketingController");

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function getCampaignWorkerConfig(env = process.env) {
  return {
    enabled:
      isWhatsappMarketingEnabled(env) &&
      String(env.WHATSAPP_MARKETING_CAMPAIGN_WORKER_ENABLED || "true").toLowerCase() !== "false",
    concurrency: boundedInteger(env.WHATSAPP_MARKETING_CAMPAIGN_CONCURRENCY, 2, 1, 10),
    ratePerSecond: boundedInteger(env.WHATSAPP_MARKETING_CAMPAIGN_RATE_PER_SECOND, 2, 1, 20),
    pollMs: boundedInteger(env.WHATSAPP_MARKETING_CAMPAIGN_POLL_MS, 1000, 250, 30000),
    leaseMs: boundedInteger(env.WHATSAPP_MARKETING_CAMPAIGN_LEASE_MS, 120000, 30000, 600000),
    maxAttempts: boundedInteger(env.WHATSAPP_MARKETING_CAMPAIGN_MAX_ATTEMPTS, 3, 1, 5),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prepareQueuedCampaigns({ CampaignModel = WhatsappMarketingCampaign } = {}) {
  const campaigns = await CampaignModel.find({
    status: "QUEUED",
    "execution.runId": { $type: "string" },
    "execution.preparedAt": null,
  })
    .sort({ "execution.queuedAt": 1, _id: 1 })
    .limit(5);
  for (const campaign of campaigns) {
    await ensureCampaignRecipientRecords(campaign, { CampaignModel });
  }
  return campaigns.length;
}

async function refreshActiveCampaigns({ CampaignModel = WhatsappMarketingCampaign } = {}) {
  const campaigns = await CampaignModel.find({ status: { $in: ["QUEUED", "RUNNING"] } })
    .sort({ updatedAt: 1, _id: 1 })
    .limit(50)
    .select("_id")
    .lean();
  for (const campaign of campaigns) {
    await refreshCampaignDeliverySummary(campaign._id, { CampaignModel });
  }
}

async function runCampaignWorkerTick({ config = getCampaignWorkerConfig(), dependencies = {} } = {}) {
  const CampaignModel = dependencies.CampaignModel || WhatsappMarketingCampaign;
  const connectionCache = new Map();
  const loadConnection = dependencies.loadVendorMetaConnection || ((vendorId) => {
    const key = String(vendorId);
    if (!connectionCache.has(key)) {
      connectionCache.set(key, loadVendorMetaConnection(key, { verifyAccount: false }));
    }
    return connectionCache.get(key);
  });
  const processingDependencies = {
    ...dependencies,
    loadVendorMetaConnection: loadConnection,
  };
  await recoverExpiredRecipientClaims({ dependencies });
  await prepareQueuedCampaigns({ CampaignModel });

  const claims = [];
  for (let index = 0; index < config.concurrency; index += 1) {
    const recipient = await claimCampaignRecipient({
      leaseMs: config.leaseMs,
      dependencies,
    });
    if (!recipient) break;
    claims.push(recipient);
  }

  const spacingMs = Math.ceil(1000 / config.ratePerSecond);
  await Promise.all(claims.map(async (recipient, index) => {
    if (index > 0) await sleep(spacingMs * index);
    await CampaignModel.updateOne(
      { _id: recipient.campaignId, status: "QUEUED" },
      { $set: { status: "RUNNING", "execution.startedAt": new Date() } }
    );
    await processClaimedCampaignRecipient(recipient, {
      maxAttempts: config.maxAttempts,
      dependencies: processingDependencies,
    });
  }));

  const affectedCampaignIds = [...new Set(claims.map((recipient) => String(recipient.campaignId)))];
  for (const campaignId of affectedCampaignIds) {
    await refreshCampaignDeliverySummary(campaignId, { ...dependencies, CampaignModel });
  }
  await refreshActiveCampaigns({ CampaignModel });
  return { claimed: claims.length, affectedCampaignIds };
}

function startWhatsappMarketingCampaignWorker({ env = process.env, logger = console } = {}) {
  const config = getCampaignWorkerConfig(env);
  if (!config.enabled) return { started: false, stop: () => {} };
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await runCampaignWorkerTick({ config });
    } catch (error) {
      logger.error("WhatsApp Marketing campaign worker failed", {
        code: String(error?.code || "campaign_worker_failed").slice(0, 80),
      });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, config.pollMs);
  timer.unref?.();
  tick();
  logger.log("WhatsApp Marketing campaign worker started", {
    concurrency: config.concurrency,
    ratePerSecond: config.ratePerSecond,
  });
  return {
    started: true,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

async function initializeWhatsappMarketingCampaignWorker({ env = process.env, logger = console } = {}) {
  const config = getCampaignWorkerConfig(env);
  if (!config.enabled) return { started: false, stop: () => {} };
  try {
    await Promise.all([
      WhatsappMarketingCampaign.init(),
      WhatsappMarketingCampaignRecipient.init(),
    ]);
  } catch (error) {
    logger.error("WhatsApp Marketing campaign worker index initialization failed", {
      code: String(error?.code || "campaign_worker_index_initialization_failed").slice(0, 80),
    });
    return { started: false, stop: () => {} };
  }
  return startWhatsappMarketingCampaignWorker({ env, logger });
}

module.exports = {
  getCampaignWorkerConfig,
  initializeWhatsappMarketingCampaignWorker,
  prepareQueuedCampaigns,
  refreshActiveCampaigns,
  runCampaignWorkerTick,
  startWhatsappMarketingCampaignWorker,
};
