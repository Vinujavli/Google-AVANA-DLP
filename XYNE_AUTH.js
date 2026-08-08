/**
 * XYNE AUTH — creates a real ticket with full audit logging.
 *
 * Every call (success or failure) is appended to:
 *   Drive > AVANA Xyne Audit Logs > <yyyy> > <MMMM> > yyyy-MM-dd > "XYNE Ticket Audit yyyy-MM-dd"
 *
 * Config:
 *   Defaults below work out of the box. Any value can be overridden via
 *   Script Properties:
 *     XYNE_TOKEN              (required)
 *     XYNE_PROJECT_ID
 *     XYNE_BOARD_ID
 *     XYNE_CHANNEL_ID         (default/cyber-defence channel)
 *     XYNE_TP_CHANNEL_ID      (True Positive alerts channel)
 */

const XYNE_DEFAULTS = {
  APP_URL: "https://YOUR-APP-URL.example.com/APP_ID",
  PROJECT_ID: "cmpmgs0wr0oig10jzvszx5x4s",
  BOARD_ID: "cmq86x24i01j9lfm05cykuvwr",
  CHANNEL_ID: "cms8qrg54en09n285eujqgy84",   // dedicated AVANA/DLP channel
  TP_CHANNEL_ID: "cms8qrg54en09n285eujqgy84" // True Positive alerts (same dedicated channel)
};

/**
 * Returns the channel ID TP alerts should go to.
 * Script property XYNE_TP_CHANNEL_ID overrides the built-in default.
 */
function getXyneTPChannelId() {
  return PropertiesService.getScriptProperties().getProperty("XYNE_TP_CHANNEL_ID") ||
    XYNE_DEFAULTS.TP_CHANNEL_ID;
}

/**
 * Builds the Xyne web app deep-link for a created ticket.
 */
function buildXyneTicketUrl(channelId, ticket) {
  return XYNE_DEFAULTS.APP_URL + "/chat/dir/" + channelId + "/" +
    ticket.conversationId + "/" + ticket.messageId + "?selectedTab=details";
}

function createXyneTicket(title, description) {
  return _xyneCreateTicketWithAudit_("createXyneTicket", title, description);
}

/**
 * Posts a message to the dedicated Xyne channel via webhook.
 * Authenticated with the script's Google OAuth token.
 * Set Script Property XYNE_CHANNEL_WEBHOOK_URL to override the default URL.
 *
 * Uses Slack-style "blocks" + "attachments" (verified working via format probe).
 */
function sendXyneChannelMessage(text, title) {
  return _xynePostToWebhook_({
    text: (title ? "*" + title + "*\n" : "") + text
  });
}

/**
 * Posts a Slack-style rich alert to the dedicated Xyne channel.
 *
 * Renders exactly ONE heading (the title). Body contains only the summary
 * and the caller-supplied bullet fields. No Reference Links section, no
 * footer.
 *
 * @param {Object} opts
 * @param {string} opts.title        Alert headline, e.g. "TRUE POSITIVE DETECTED"
 * @param {string} opts.summary      One-line description (mrkdwn supported)
 * @param {Array<{label:string,value:string}>} opts.fields  Bullet fields
 * @param {string}  opts.ticketUrl   Xyne ticket deep-link (optional)
 * @param {string}  opts.color       Attachment bar color (default: red #d93025)
 */
function sendXyneChannelAlert(opts) {
  const mrkdwn = (s) => (s == null ? "" : String(s));

  const fieldLines = (opts.fields || [])
    .map(f => "• *" + mrkdwn(f.label) + ":* " + mrkdwn(f.value))
    .join("\n");

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

  return _xynePostToWebhook_(payload);
}

/**
 * Low-level webhook POST with shared error handling.
 */
function _xynePostToWebhook_(payloadBody) {
  const webhookUrl = (PropertiesService.getScriptProperties().getProperty("XYNE_CHANNEL_WEBHOOK_URL") ||
    "https://YOUR-WEBHOOK-URL-HERE.example.com/webhook").trim();

  if (!webhookUrl) {
    console.log("Xyne channel webhook: no URL configured, skipping.");
    return { ok: false, skipped: true };
  }

  let oauthToken = "";
  try {
    oauthToken = ScriptApp.getOAuthToken();
  } catch (e) {
    console.log("Xyne channel webhook: ScriptApp.getOAuthToken failed: " + e);
    return { ok: false, httpStatus: "", response: "OAuth token failure: " + e };
  }

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payloadBody),
    headers: { Authorization: "Bearer " + oauthToken },
    muteHttpExceptions: true
  };

  try {
    const resp = UrlFetchApp.fetch(webhookUrl, options);
    return { ok: [200, 201, 202, 204].indexOf(resp.getResponseCode()) !== -1, httpStatus: resp.getResponseCode(), response: resp.getContentText() };
  } catch (e) {
    console.log("Xyne channel webhook: fetch failed: " + e);
    return { ok: false, httpStatus: "ERR", response: String(e) };
  }
}

/**
 * Creates a ticket in the dedicated True Positive channel.
 */
function createXyneTicketTP(title, description) {
  return _xyneCreateTicketWithAudit_("createXyneTicketTP", title, description, getXyneTPChannelId());
}

function _xyneCreateTicketWithAudit_(caller, title, description, channelIdOverride) {
  const startedAt = new Date();
  const timestamp = Utilities.formatDate(startedAt, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
  const durationMs = () => (new Date().getTime() - startedAt.getTime());

  const log = (entry) => {
    const row = Object.assign({ caller: caller, title: title, timestamp: timestamp }, entry);
    console.log(JSON.stringify(row));
    _xyneWriteAuditRow_([
      timestamp,
      caller,
      title,
      row.channelId || "",
      row.outcome || "",
      row.httpStatus || "",
      row.xyneId || "",
      row.ticketId || "",
      row.error || "",
      row.rawResponse || "",
      row.durationMs || ""
    ]);
  };

  const props = PropertiesService.getScriptProperties();

  const token = props.getProperty("XYNE_TOKEN");
  const projectId = props.getProperty("XYNE_PROJECT_ID") || XYNE_DEFAULTS.PROJECT_ID;
  const boardId = props.getProperty("XYNE_BOARD_ID") || XYNE_DEFAULTS.BOARD_ID;
  const channelId = channelIdOverride ||
    props.getProperty("XYNE_CHANNEL_ID") ||
    XYNE_DEFAULTS.CHANNEL_ID;

  // Validate config up-front
  const missing = [];
  if (!token) missing.push("XYNE_TOKEN");
  if (!projectId) missing.push("XYNE_PROJECT_ID");
  if (!boardId) missing.push("XYNE_BOARD_ID");
  if (!channelId) missing.push("XYNE_CHANNEL_ID or XYNE_DEFAULT_CHANNEL_ID");

  if (missing.length > 0) {
    const errMsg = "Xyne not configured. Missing script properties: " + missing.join(", ");
    log({ outcome: "FAIL", error: errMsg, durationMs: durationMs() });
    throw new Error(errMsg);
  }

  log({
    outcome: "STARTED",
    channelId: channelId,
    descriptionPreview: (description || "").slice(0, 200)
  });

  const payload = {
    title: title,
    description: description,
    projectId: projectId,
    boardId: boardId,
    channelId: channelId
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

  let responseCode = "";
  let responseBody = "";

  try {
    const response = UrlFetchApp.fetch(
      "https://YOUR-API-URL.example.com/api/apps/ticket/createTicket",
      options
    );
    responseCode = response.getResponseCode();
    responseBody = response.getContentText();
  } catch (fetchErr) {
    log({
      outcome: "FAIL",
      channelId: channelId,
      error: fetchErr.toString(),
      durationMs: durationMs()
    });
    throw new Error("Xyne Ticket Creation Failed: network error - " + fetchErr.toString());
  }

  if (responseCode !== 201) {
    log({
      outcome: "FAIL",
      channelId: channelId,
      httpStatus: responseCode,
      rawResponse: responseBody.slice(0, 500),
      error: "HTTP " + responseCode,
      durationMs: durationMs()
    });
    throw new Error("Xyne Ticket Creation Failed (HTTP " + responseCode + "): " + responseBody);
  }

  let data;
  try {
    data = JSON.parse(responseBody);
  } catch (parseErr) {
    log({
      outcome: "FAIL",
      channelId: channelId,
      httpStatus: responseCode,
      rawResponse: responseBody.slice(0, 500),
      error: "Invalid JSON - " + parseErr.toString(),
      durationMs: durationMs()
    });
    throw new Error("Xyne returned invalid JSON: " + parseErr.toString());
  }

  const ticket = {
    xyneId: data.xyneId,
    ticketId: data.ticketId,
    conversationId: data.conversationId,
    messageId: data.messageId
  };

  log({
    outcome: "SUCCESS",
    channelId: channelId,
    httpStatus: responseCode,
    xyneId: ticket.xyneId,
    ticketId: ticket.ticketId,
    conversationId: ticket.conversationId,
    messageId: ticket.messageId,
    durationMs: durationMs()
  });

  return ticket;
}

/**
 * Audit row writer. Column order matches _XYNE_AUDIT_HEADERS_.
 */
function _xyneWriteAuditRow_(row) {
  try {
    const now = new Date();
    const timeZone = Session.getScriptTimeZone();
    const year = now.getFullYear().toString();
    const month = Utilities.formatDate(now, timeZone, "MMMM");
    const dateString = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");

    const rootFolder = _dlpUniqueGetFolder(DriveApp.getRootFolder(), "AVANA Xyne Audit Logs");
    const yearFolder = _dlpUniqueGetFolder(rootFolder, year);
    const monthFolder = _dlpUniqueGetFolder(yearFolder, month);
    const dateFolder = _dlpUniqueGetFolder(monthFolder, dateString);

    const fileName = "XYNE Ticket Audit " + dateString;
    const files = dateFolder.getFilesByName(fileName);
    let ss, sheet;

    if (files.hasNext()) {
      ss = SpreadsheetApp.openById(files.next().getId());
      sheet = ss.getSheets()[0];
    } else {
      ss = SpreadsheetApp.create(fileName);
      DriveApp.getFileById(ss.getId()).moveTo(dateFolder);
      sheet = ss.getSheets()[0];
      sheet.appendRow([
        "Timestamp", "Caller", "Title", "Channel ID", "Outcome", "HTTP Status",
        "Xyne ID", "Ticket ID", "Error", "Raw Response", "Duration (ms)"
      ]);
      sheet.getRange("A1:K1").setFontWeight("bold");
      sheet.setColumnWidths(1, 11, 180);
    }

    sheet.appendRow(row);
  } catch (sheetErr) {
    console.error("XYNE AUDIT WRITE FAILED: " + sheetErr);
  }
}
