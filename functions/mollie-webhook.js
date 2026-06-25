const { getMollieApiKey } = require("./mollie-products");

const knownStatuses = new Set([
  "paid",
  "open",
  "pending",
  "failed",
  "canceled",
  "expired",
  "refunded",
  "charged_back",
]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return textResponse(405, "Method not allowed");
  }

  const paymentId = getPaymentId(event);

  if (!paymentId) {
    console.warn("Mollie webhook without payment id");
    return textResponse(400, "Missing payment id");
  }

  const apiKey = getMollieApiKey();

  if (!apiKey) {
    console.error("Mollie webhook missing API key configuration");
    return textResponse(500, "Payment configuration missing");
  }

  try {
    const mollieResponse = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const payment = await mollieResponse.json();

    if (!mollieResponse.ok) {
      console.error("Mollie webhook fetch failed", {
        paymentId,
        status: mollieResponse.status,
        title: payment.title,
      });

      return textResponse(200, "Webhook received");
    }

    const status = payment.status;
    const safeStatus = knownStatuses.has(status) ? status : "unknown";

    console.log("Mollie payment status", {
      paymentId: payment.id,
      status: safeStatus,
      productKey: payment.metadata?.productKey,
      productName: payment.metadata?.productName,
      customerEmail: payment.metadata?.customerEmail,
      amountInclVat: payment.metadata?.amountInclVat,
    });

    if (status === "paid") {
      console.log("Max Webstudio payment received", {
        paymentId: payment.id,
        metadata: payment.metadata || {},
      });
    }

    return textResponse(200, "Webhook processed");
  } catch (error) {
    console.error("Mollie webhook error", {
      paymentId,
      message: error.message,
    });

    return textResponse(200, "Webhook received");
  }
};

function getPaymentId(event) {
  const body = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  const contentType = event.headers?.["content-type"] || event.headers?.["Content-Type"] || "";

  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(body);
      return payload.id || payload.paymentId || "";
    } catch (error) {
      return "";
    }
  }

  const params = new URLSearchParams(body);
  return params.get("id") || "";
}

function textResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body,
  };
}
