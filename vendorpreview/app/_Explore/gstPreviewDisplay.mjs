function formatRateBps(rateBps) {
  return `${Number((rateBps / 100).toFixed(2))}%`;
}

export function getGstSummaryPercentages(lines, totals) {
  const taxableRates = new Set(
    (Array.isArray(lines) ? lines : [])
      .filter((line) => Number(line?.taxableValuePaise) > 0)
      .map((line) => Number(line?.gstRateBps))
      .filter(Number.isInteger)
  );

  if (taxableRates.size !== 1) return null;

  const [totalRateBps] = taxableRates;
  const splitRate = formatRateBps(totalRateBps / 2);
  return {
    total: formatRateBps(totalRateBps),
    cgst: Number(totals?.cgstPaise) > 0 ? splitRate : null,
    sgst: Number(totals?.sgstPaise) > 0 ? splitRate : null,
    utgst: Number(totals?.utgstPaise) > 0 ? splitRate : null,
    igst: Number(totals?.igstPaise) > 0 ? formatRateBps(totalRateBps) : null,
  };
}

