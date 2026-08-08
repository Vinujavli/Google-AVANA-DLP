/**
 * DIAGNOSTIC — posts the exact production alert payload to the webhook
 * and logs full request/response details so we can see why Xyne is
 * returning 400 invalid_payload.
 *
 * Run from the Apps Script editor manually.
 */
function diagnoseWebhookPayload() {
  const opts = {
    title: "TRUE POSITIVE DETECTED",
    summary: "An email thread was flagged for interaction with external recipient(s). Potential True Positive — requires validation from the security team.",
    fields: [
      { label: "Rule Triggered", value: "Credit Card DLP" },
      { label: "External Emails", value: "redacted@example.com, redacted@example.com" },
      { label: "Detection Time", value: "Jul 31, 2026 03:14:58 PM" }
    ],
    ticketUrl: "https://YOUR-APP-URL.example.com/test"
  };

  const mrkdwn = (s) => (s == null ? "" : String(s));
  const fieldLines = (opts.fields || [])
    .map(f => "• *" + mrkdwn(f.label) + ":* " + mrkdwn(f.value))
    .join("\n");

  // Build the exact payload the failing run sent
  const payload = {
    text: mrkdwn(opts.title),
    attachments: [
      {
        color: opts.color || "#d93025",
        text:
          "*" + mrkdwn(opts.title) + "*\n\n" +
          mrkdwn(opts.summary) +
          (fieldLines ? "\n\n" + fieldLines : "") +
          (opts.ticketUrl ? "\n\n*Xyne Ticket:*\n" + opts.ticketUrl : "")
      }
    ]
  };

  const url = PropertiesService.getScriptProperties().getProperty("XYNE_CHANNEL_WEBHOOK_URL") ||
    "https://YOUR-WEBHOOK-URL-HERE.example.com/webhook";

  const oauthToken = ScriptApp.getOAuthToken();

  Logger.log("=== REQUEST URL ===");
  Logger.log(url);
  Logger.log("=== REQUEST BODY ===");
  Logger.log(JSON.stringify(payload, null, 2));

  const resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    headers: { Authorization: "Bearer " + oauthToken },
    muteHttpExceptions: true
  });

  Logger.log("=== RESPONSE STATUS ===");
  Logger.log(resp.getResponseCode());
  Logger.log("=== RESPONSE HEADERS ===");
  Logger.log(JSON.stringify(resp.getAllHeaders(), null, 2));
  Logger.log("=== RESPONSE BODY ===");
  Logger.log(resp.getContentText());
}

/**
 * DIAGNOSTIC 2 — bisect the webhook payload to find which field/shape
 * triggers the 400 invalid_payload. Sends 8 variants.
 * Run from the Apps Script editor manually.
 */
function diagnoseWebhookVariants() {
  const url = PropertiesService.getScriptProperties().getProperty("XYNE_CHANNEL_WEBHOOK_URL") ||
    "https://YOUR-WEBHOOK-URL-HERE.example.com/webhook";
  const oauthToken = ScriptApp.getOAuthToken();

  const variants = [
    { name: "1 text only",
      payload: { text: "hello" } },

    { name: "2 text + 1 empty attachment",
      payload: { text: "hello", attachments: [{}] } },

    { name: "3 text + attachment.text only",
      payload: { text: "hello", attachments: [{ text: "world" }] } },

    { name: "4 text + attachment.color only",
      payload: { text: "hello", attachments: [{ color: "#d93025" }] } },

    { name: "5 text + attachment.fallback + text",
      payload: { text: "hello", attachments: [{ fallback: "fb", text: "world" }] } },

    { name: "6 attachment has title + fallback + text + color",
      payload: { text: "hello", attachments: [{ title: "T", fallback: "fb", text: "world", color: "#d93025" }] } },

    { name: "7 plain ASCII body (no unicode bullets)",
      payload: { text: "TRUE POSITIVE DETECTED",
                 attachments: [{ color: "#d93025",
                                 text: "*TRUE POSITIVE DETECTED*\n\nSummary line.\n\n- Rule Triggered: X\n- External Emails: redacted@example.com" }] } },

    { name: "8 blocks instead of attachments",
      payload: { text: "hello",
                 blocks: [{ type: "section", text: { type: "mrkdwn", text: "*Hello* world" } }] } }
  ];

  variants.forEach(function (v) {
    const resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(v.payload),
      headers: { Authorization: "Bearer " + oauthToken },
      muteHttpExceptions: true
    });
    Logger.log(v.name + "  ->  " + resp.getResponseCode() + "  " + resp.getContentText());
  });
}

function createXyneTestTicket() {

  const token = PropertiesService
    .getScriptProperties()
    .getProperty("XYNE_TOKEN");

  const payload = {
    title: "Avana Automation Test",
    description: "Testing ticket creation from Apps Script",
    projectId: "cmpmgs0wr0oig10jzvszx5x4s",
    boardId: "cmq86x24i01j9lfm05cykuvwr",
    channelId: "cms8qrg54en09n285eujqgy84"
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    headers: {
      Authorization: "Bearer " + token
    }
  };

  const response = UrlFetchApp.fetch(
    "https://YOUR-API-URL.example.com/api/apps/ticket/createTicket",
    options
  );

  Logger.log("Response Code: " + response.getResponseCode());
  Logger.log("Response Body: " + response.getContentText());
}