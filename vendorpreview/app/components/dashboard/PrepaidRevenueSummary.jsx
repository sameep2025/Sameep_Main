"use client";

import "./PrepaidRevenueSummary.css";

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizePrepaidReporting(source = {}) {
  return {
    serviceActivity: number(source.serviceActivity),
    freshCollections: number(source.freshCollections),
    membershipCollections: number(source.membershipCollections),
    membershipsSold: number(source.membershipsSold),
    membershipsRenewed: number(source.membershipsRenewed),
    prepaidValueCollections: number(source.prepaidValueCollections),
    prepaidSessionsCollections: number(source.prepaidSessionsCollections),
    membershipCashCollections: number(source.membershipCashCollections),
    membershipOnlineCollections: number(source.membershipOnlineCollections),
    membershipUpiCollections: number(source.membershipUpiCollections),
    membershipCardCollections: number(source.membershipCardCollections),
    prepaidServiceActivity: number(source.prepaidServiceActivity),
    valueWalletRedemptionBills: number(source.valueWalletRedemptionBills),
    valueWalletUsed: number(source.valueWalletUsed),
    sessionWalletRedemptionBills: number(source.sessionWalletRedemptionBills),
    sessionsUsed: number(source.sessionsUsed),
    sessionServiceActivity: number(source.sessionServiceActivity),
    reversedValueWalletBills: number(source.reversedValueWalletBills),
    reversedValueWallet: number(source.reversedValueWallet),
    reversedSessionBills: number(source.reversedSessionBills),
    reversedSessions: number(source.reversedSessions),
  };
}

export function addPrepaidReporting(rows = []) {
  return rows.reduce((total, row) => {
    const normalized = normalizePrepaidReporting(row);
    Object.keys(total).forEach((key) => {
      total[key] += normalized[key];
    });
    return total;
  }, normalizePrepaidReporting());
}

export default function PrepaidRevenueSummary({ reporting, title = "Prepaid Membership" }) {
  const data = normalizePrepaidReporting(reporting);
  const hasPrepaidActivity =
    data.membershipCollections > 0 ||
    data.prepaidServiceActivity > 0 ||
    data.valueWalletUsed > 0 ||
    data.sessionsUsed > 0 ||
    data.reversedValueWallet > 0 ||
    data.reversedSessions > 0;

  return (
    <section className="prepaid-revenue-summary" aria-label={`${title} reporting`}>
      <div className="prepaid-revenue-heading">
        <div>
          <strong>{title}</strong>
          <p>Wallet usage is previously purchased credit, not new money collected.</p>
        </div>
        {!hasPrepaidActivity ? <span>No prepaid activity</span> : null}
      </div>
      <div className="prepaid-revenue-grid">
        <div><span>Service Sales</span><strong>{currencyFmt.format(data.serviceActivity)}</strong></div>
        <div><span>Money Collected</span><strong>{currencyFmt.format(data.freshCollections)}</strong></div>
        <div><span>Membership Payments</span><strong>{currencyFmt.format(data.membershipCollections)}</strong></div>
        <div><span>Prepaid Service Activity</span><strong>{currencyFmt.format(data.prepaidServiceActivity)}</strong></div>
        <div><span>Wallet Used</span><strong>{currencyFmt.format(data.valueWalletUsed)}</strong></div>
        <div><span>Sessions Used</span><strong>{data.sessionsUsed}</strong></div>
      </div>
      {hasPrepaidActivity ? (
        <div className="prepaid-revenue-meta">
          <span>{data.membershipsSold} sold</span>
          <span>{data.membershipsRenewed} renewed</span>
          <span>Value payments {currencyFmt.format(data.prepaidValueCollections)}</span>
          <span>Session payments {currencyFmt.format(data.prepaidSessionsCollections)}</span>
          <span>Cash {currencyFmt.format(data.membershipCashCollections)}</span>
          <span>Online {currencyFmt.format(data.membershipOnlineCollections)}</span>
          <span>UPI {currencyFmt.format(data.membershipUpiCollections)}</span>
          <span>Card {currencyFmt.format(data.membershipCardCollections)}</span>
          <span>{data.valueWalletRedemptionBills} value-wallet bill(s)</span>
          <span>{data.sessionWalletRedemptionBills} session-wallet bill(s)</span>
          {data.reversedValueWalletBills || data.reversedSessionBills ? (
            <span>
              Reversed: {currencyFmt.format(data.reversedValueWallet)} / {data.reversedSessions} session(s)
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
