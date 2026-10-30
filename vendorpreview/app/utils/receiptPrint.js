export function formatReceiptCurrency(value) {
  const amount = Number(value || 0);
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function getReceiptDisplayBillId(value) {
  return String(value || "").slice(-8).toUpperCase();
}

export function formatReceiptPaise(value) {
  const paise = Number(value);
  if (!Number.isSafeInteger(paise) || paise < 0) return "";
  return formatReceiptCurrency(paise / 100);
}

export function printReceiptSnapshot(receiptSnapshot) {
  if (!receiptSnapshot || typeof window === "undefined") return false;

  const printWindow = window.open("", "_blank", "width=420,height=720");
  if (!printWindow) {
    alert("Unable to open print window. Please allow pop-ups and try again.");
    return false;
  }

  const doc = printWindow.document;
  doc.open();
  doc.write(`<!doctype html>
    <html>
      <head>
        <title>Print Bill</title>
        <style>
          @page { margin: 3mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #fff;
            color: #000;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            line-height: 1.35;
          }
          .receipt {
            width: 100%;
            max-width: 80mm;
            padding: 3mm;
            margin: 0 auto;
          }
          .center { text-align: center; }
          .business {
            font-size: 16px;
            font-weight: 800;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .muted { font-size: 11px; color: #222; word-break: break-word; }
          .title {
            font-size: 14px;
            font-weight: 800;
            margin: 12px 0 8px;
            padding: 6px 0;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
          }
          .cancelled {
            margin: 8px 0;
            padding: 5px 0;
            border: 1px solid #000;
            font-weight: 900;
            text-align: center;
            letter-spacing: 0.12em;
          }
          .sample-watermark {
            margin: 8px 0;
            padding: 7px 4px;
            border: 2px solid #000;
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-align: center;
          }
          .meta-row,
          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin: 3px 0;
          }
          .meta-row span:first-child,
          .total-row span:first-child {
            color: #222;
          }
          .items {
            margin-top: 10px;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 6px 0;
          }
          .gst-meta,
          .gst-totals {
            margin-top: 10px;
            border-top: 1px dashed #000;
            padding-top: 7px;
          }
          .gst-item {
            margin: 7px 0;
            padding-bottom: 7px;
            border-bottom: 1px dotted #777;
          }
          .gst-item:last-child { border-bottom: 0; }
          .gst-item strong,
          .gst-item span { display: block; }
          .item-header,
          .item-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 24px minmax(46px, max-content) minmax(52px, max-content);
            gap: 6px;
            align-items: start;
          }
          .item-header {
            font-weight: 800;
            margin-bottom: 4px;
          }
          .item-row {
            margin: 5px 0;
          }
          .right { text-align: right; }
          .item-name {
            word-break: break-word;
            overflow-wrap: anywhere;
            min-width: 0;
          }
          .totals {
            margin-top: 10px;
          }
          .net {
            font-size: 14px;
            font-weight: 900;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 5px 0;
            margin-top: 6px;
          }
          .footer {
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px dashed #000;
            text-align: center;
            font-size: 11px;
          }
          @media screen {
            body { background: #f3f3f3; }
            .receipt {
              background: #fff;
              box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
            }
          }
          @media print {
            .receipt {
              max-width: 80mm;
            }
          }
        </style>
      </head>
      <body><main id="receipt-root" class="receipt"></main></body>
    </html>`);
  doc.close();

  const root = doc.getElementById("receipt-root");
  const addText = (text, className = "", parent = root) => {
    const el = doc.createElement("div");
    if (className) el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
  };
  const addRow = (label, value, className = "meta-row", parent = root) => {
    const row = doc.createElement("div");
    row.className = className;
    const labelEl = doc.createElement("span");
    labelEl.textContent = label;
    const valueEl = doc.createElement("strong");
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    parent.appendChild(row);
  };

  const header = doc.createElement("div");
  header.className = "center";
  root.appendChild(header);

  const business = doc.createElement("div");
  business.className = "business";
  business.textContent = receiptSnapshot.vendorName;
  header.appendChild(business);

  if (receiptSnapshot.vendorPhone) {
    const phone = doc.createElement("div");
    phone.className = "muted";
    phone.textContent = receiptSnapshot.vendorPhone;
    header.appendChild(phone);
  }

  if (receiptSnapshot.vendorAddress) {
    const address = doc.createElement("div");
    address.className = "muted";
    address.textContent = receiptSnapshot.vendorAddress;
    header.appendChild(address);
  }

  const gstInvoice = receiptSnapshot.gstInvoice || null;
  const isNonTaxGstDocument = gstInvoice?.documentMode === "NON_TAX_INVOICE";
  if (gstInvoice) {
    const isTestGstDocument =
      receiptSnapshot.isSampleGstInvoice === true || gstInvoice.documentMode === "TEST";
    const gstTotals = gstInvoice.totals || {};
    const issueDate = new Date(gstInvoice.invoiceIssueDate);

    addText(
      isTestGstDocument
        ? "GST TEST RECORD"
        : isNonTaxGstDocument
          ? "GST CALCULATION STATEMENT"
          : "GST TAX INVOICE",
      "title center"
    );
    if (receiptSnapshot.status === "CANCELLED") {
      addText("CANCELLED", "cancelled");
    }

    const gstMeta = doc.createElement("section");
    gstMeta.className = "gst-meta";
    root.appendChild(gstMeta);
    addRow(
      isNonTaxGstDocument ? "Document Ref." : "Invoice No.",
      String(gstInvoice.invoiceNumber || ""),
      "meta-row",
      gstMeta
    );
    if (!Number.isNaN(issueDate.getTime())) {
      addRow(
        isNonTaxGstDocument ? "Document Date" : "Invoice Date",
        new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }).format(issueDate),
        "meta-row",
        gstMeta
      );
    }
    addRow("Legal Name", String(gstInvoice.supplier?.legalName || ""), "meta-row", gstMeta);
    addRow("GSTIN", String(gstInvoice.supplier?.gstin || ""), "meta-row", gstMeta);
    addRow(
      "Registered Address",
      String(gstInvoice.supplier?.registeredAddress || ""),
      "meta-row",
      gstMeta
    );
    addRow(
      "Place of Supply",
      `State code ${String(gstInvoice.placeOfSupply?.stateCode || "")}`,
      "meta-row",
      gstMeta
    );
    if (isTestGstDocument) {
      addRow("Document Type", "Non-production test record - not a tax invoice", "meta-row", gstMeta);
    } else if (isNonTaxGstDocument) {
      addRow("Document Type", "Not a tax invoice", "meta-row", gstMeta);
    }
    addRow("Customer", receiptSnapshot.customerLabel, "meta-row", gstMeta);

    const itemsBlock = doc.createElement("section");
    itemsBlock.className = "items";
    root.appendChild(itemsBlock);
    const itemHeader = doc.createElement("div");
    itemHeader.className = "item-header";
    ["Item", "Qty", "Unit", "Line total"].forEach((text, index) => {
      const el = doc.createElement("span");
      el.className = index === 0 ? "" : "right";
      el.textContent = text;
      itemHeader.appendChild(el);
    });
    itemsBlock.appendChild(itemHeader);

    (gstInvoice.items || []).forEach((item, index) => {
      const row = doc.createElement("div");
      row.className = "item-row";
      const description = doc.createElement("span");
      description.className = "item-name";
      const billItem = Array.isArray(receiptSnapshot.items) ? receiptSnapshot.items[index] : null;
      const secondary = [
        `${Number(item.gstRateBps || 0) / 100}% GST`,
        String(billItem?.hierarchy || "").trim(),
        String(billItem?.resourceName || "").trim()
          ? `Staff: ${String(billItem.resourceName).trim()}`
          : "",
      ].filter(Boolean);
      description.textContent = `${String(item.name || "Item")} · ${secondary.join(" · ")}`;
      const qty = doc.createElement("span");
      qty.className = "right";
      qty.textContent = String(Number(item.quantity || 0));
      const unitPrice = doc.createElement("span");
      unitPrice.className = "right";
      unitPrice.textContent = formatReceiptPaise(item.unitPricePaise) || "-";
      const total = doc.createElement("strong");
      total.className = "right";
      total.textContent = formatReceiptPaise(item.grossAmountPaise);
      row.append(description, qty, unitPrice, total);
      itemsBlock.appendChild(row);
    });

    const totals = doc.createElement("section");
    totals.className = "totals";
    root.appendChild(totals);
    addRow("Services Subtotal", formatReceiptPaise(gstTotals.grossAmountPaise), "total-row", totals);
    if (Number(gstTotals.membershipDiscountPaise) > 0) {
      const membershipLabel = receiptSnapshot.membershipPlanName
        ? `Membership Discount - ${receiptSnapshot.membershipPlanName}`
        : "Membership Discount";
      addRow(membershipLabel, `-${formatReceiptPaise(gstTotals.membershipDiscountPaise)}`, "total-row", totals);
    }
    if (Number(gstTotals.manualDiscountPaise) > 0) {
      addRow("Manual Discount", `-${formatReceiptPaise(gstTotals.manualDiscountPaise)}`, "total-row", totals);
    }
    if (Number(gstTotals.loyaltyRedemptionPaise) > 0) {
      addRow("Loyalty Redemption", `-${formatReceiptPaise(gstTotals.loyaltyRedemptionPaise)}`, "total-row", totals);
    }
    addRow("Taxable Value", formatReceiptPaise(gstTotals.taxableValuePaise), "total-row", totals);
    if (Number(gstTotals.cgstPaise) > 0) addRow("CGST", formatReceiptPaise(gstTotals.cgstPaise), "total-row", totals);
    if (Number(gstTotals.sgstPaise) > 0) addRow("SGST", formatReceiptPaise(gstTotals.sgstPaise), "total-row", totals);
    if (Number(gstTotals.utgstPaise) > 0) addRow("UTGST", formatReceiptPaise(gstTotals.utgstPaise), "total-row", totals);
    if (Number(gstTotals.igstPaise) > 0) addRow("IGST", formatReceiptPaise(gstTotals.igstPaise), "total-row", totals);
    addRow("Total GST", formatReceiptPaise(gstTotals.totalGstPaise), "total-row", totals);
    addRow("Invoice Total", formatReceiptPaise(gstTotals.invoiceTotalPaise), "total-row", totals);
    addRow("FINAL AMOUNT PAID", formatReceiptPaise(gstTotals.customerPayablePaise), "total-row net", totals);
    addRow("Points Earned", String(Number(receiptSnapshot.pointsEarned || 0)), "total-row", totals);
    if (Number(receiptSnapshot.pointsRedeemed || 0) > 0) {
      addRow("Points Redeemed", String(Number(receiptSnapshot.pointsRedeemed)), "total-row", totals);
    }
    addRow(
      "Payment Mode",
      receiptSnapshot.paymentMode === "CASH" ? "Cash" : "Online",
      "total-row",
      totals
    );
    addText(
      gstInvoice.pricingMode === "inclusive"
        ? "GST is included in the item prices."
        : "GST is added to the taxable item prices.",
      "center muted"
    );
    addText("Thank you for visiting!", "footer");
    addText("Powered by YNOT", "center muted");

    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
    return true;
  }

  addText("BILL", "title center");
  if (receiptSnapshot.status === "CANCELLED") {
    addText("CANCELLED", "cancelled");
  }
  addRow(
    "Date",
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(receiptSnapshot.completedAt))
  );
  if (receiptSnapshot.billingSessionId) {
    addRow("Bill ID", getReceiptDisplayBillId(receiptSnapshot.billingSessionId));
  }
  addRow("Customer", receiptSnapshot.customerLabel);

  const itemsBlock = doc.createElement("section");
  itemsBlock.className = "items";
  root.appendChild(itemsBlock);

  const itemHeader = doc.createElement("div");
  itemHeader.className = "item-header";
  ["Service", "Qty", "Amount"].forEach((text, index) => {
    const el = doc.createElement("span");
    el.className = index === 0 ? "" : "right";
    el.textContent = text;
    itemHeader.appendChild(el);
  });
  itemsBlock.appendChild(itemHeader);

  (receiptSnapshot.items || []).forEach((item) => {
    const row = doc.createElement("div");
    row.className = "item-row";

    const name = doc.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;

    const qty = doc.createElement("span");
    qty.className = "right";
    qty.textContent = String(item.qty);

    const total = doc.createElement("span");
    total.className = "right";
    total.textContent = formatReceiptCurrency(item.total);

    row.append(name, qty, total);
    itemsBlock.appendChild(row);
  });

  const totals = doc.createElement("section");
  totals.className = "totals";
  root.appendChild(totals);
  addRow("Bill Value", formatReceiptCurrency(receiptSnapshot.grossAmount), "total-row", totals);
  const membershipDiscountAmount = Number(receiptSnapshot.membershipDiscountAmount || 0);
  const additionalManualDiscountAmount = Number(receiptSnapshot.additionalManualDiscountAmount || 0);
  const showSplitDiscounts = membershipDiscountAmount > 0;
  if (showSplitDiscounts && membershipDiscountAmount > 0) {
    const membershipLabel = receiptSnapshot.membershipPlanName
      ? `Membership Discount - ${receiptSnapshot.membershipPlanName}`
      : "Membership Discount";
    addRow(
      membershipLabel,
      `-${formatReceiptCurrency(membershipDiscountAmount)}`,
      "total-row",
      totals
    );
  }
  if (showSplitDiscounts && additionalManualDiscountAmount > 0) {
    const additionalDiscountLabel = Number(receiptSnapshot.manualDiscountPercent || 0) > 0
      ? `Additional Discount (${Number(receiptSnapshot.manualDiscountPercent)}%)`
      : "Additional Discount";
    addRow(
      additionalDiscountLabel,
      `-${formatReceiptCurrency(additionalManualDiscountAmount)}`,
      "total-row",
      totals
    );
  }
  if (!showSplitDiscounts && Number(receiptSnapshot.discountAmount || 0) > 0) {
    addRow("Discount", `-${formatReceiptCurrency(receiptSnapshot.discountAmount)}`, "total-row", totals);
  }
  if (showSplitDiscounts && Number(receiptSnapshot.discountAmount || 0) > 0) {
    addRow("Total Savings", formatReceiptCurrency(receiptSnapshot.discountAmount), "total-row", totals);
  }
  if (Number(receiptSnapshot.rewardsRedeemed || 0) > 0) {
    addRow("Rewards Redeemed", `-${formatReceiptCurrency(receiptSnapshot.rewardsRedeemed)}`, "total-row", totals);
  }
  if (Number(receiptSnapshot.pointsEarned || 0) > 0) {
    addRow("Loyalty Points Earned", String(Number(receiptSnapshot.pointsEarned || 0)), "total-row", totals);
  }
  addRow("NET COLLECTED", formatReceiptCurrency(receiptSnapshot.netCollected), "total-row net", totals);
  addRow(
    "Payment Mode",
    receiptSnapshot.paymentMode === "CASH" ? "Cash" : "Online",
    "total-row",
    totals
  );

  addText("Thank you for visiting!", "footer");
  addText("Powered by YNOT", "center muted");

  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);

  return true;
}
