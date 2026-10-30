export function getAverageServiceValue(revenue, services) {
  const revenueValue = Number(revenue);
  const serviceCount = Number(services);

  if (!Number.isFinite(revenueValue) || !Number.isFinite(serviceCount) || serviceCount <= 0) {
    return null;
  }

  return revenueValue / serviceCount;
}
