/**
 * TICKET AUTH — creates a real ticket with full audit logging.
 *
 * Every call (success or failure) is appended to:
 *   Drive > AVANA Ticket Audit Logs > <yyyy> > <MMMM> > yyyy-MM-dd > "Ticket Audit yyyy-MM-dd"
 *
 * Config:
 *   Defaults below work out of the box. Any value can be overridden via
 *   Script Properties:
 *     TICKET_TOKEN         (required)
 *     TICKET_PROJECT_ID
 *     TICKET_BOARD_ID
 *     TICKET_CHANNEL_ID      (default channel)
 *     TICKET_TP_CHANNEL_ID   (True Positive alerts channel)
 */

const TICKET_DEFAULTS = {
  APP_URL: "https://YOUR-APP-URL.example.com/APP_ID",
  PROJECT_ID: "cmpmgs0wr0oig10jzvszx5x4s",
  BOARD_ID: "cmq86x24i01j9lfm05cykuvwr",
  CHANNEL_ID: "YOUR_TICKET_CHANNEL_ID",   // dedicated AVANA/DLP channel
  TP_CHANNEL_ID: "YOUR_TICKET_CHANNEL_ID" // True Positive alerts (same dedicated channel)
};

/**
 * Returns the channel ID TP alerts should go to.
 * Script property TICKET_TP_CHANNEL_ID overrides the built-in default.
 */
function getTicketChannelId() {
  return PropertiesService.getScriptProperties().getProperty("TICKET_TP_CHANNEL_ID") ||
    TICKET_DEFAULTS.TP_CHANNEL_ID;
}

/**
 * Builds the Ticket web app deep-link for a created ticket.
 */
function buildTicketUrl(channelId, ticket) {
  return TICKET_DEFAULTS.APP_URL + "/chat/dir/" + channelId + "/" +
    ticket.conversationId + "/" + ticket.messageId + "?selectedTab=details";
}

function createTicket(title, description) {
  return _createTicketWithAudit_("createTicket", title, description);
}

/**
 * Posts a message to the dedicated ticketing channel via webhook.
 * Authenticated with the script's Google OAuth token.
 * Set Script Property TICKET_CHANNEL_WEBHOOK_URL to override the default URL.
 *
 * Uses Slack-style "blocks" + "attachments" (verified working via format probe).
 */
function sendTicketChannelMessage(text, title) {
  return _postToTicketWebhook_({
    text: (title ? "*" + title + "*\n" : "") + text
  });
}

/**
 * Posts a rich alert to the ticketing channel.
 *
 * Renders exactly ONE heading (the title). Body contains only the summary
 * and the caller-supplied bullet fields. No Reference Links section, no
 * footer.
 *
 * @param {Object} opts
 * @param {string} opts.title        Alert headline, e.g. "TRUE POSITIVE DETECTED"
 * @param {string} opts.summary      One-line description (mrkdwn supported)
 * @param {Array<{label:string,value:string}>} opts.fields  Bullet fields
 * @param {string}  opts.ticketUrl   Ticket deep-link (optional)
 * @param {string}  opts.color       Attachment bar color (default: red #d93025)
 */
function sendTicketAlert(opts) {
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
          (opts.ticketUrl ? "\n\n*Ticket Ticket:*\n" + opts.ticketUrl : "")
      }
    ]
  };

  return _postToTicketWebhook_(payload);
}

/**
 * Low-level webhook POST with shared error handling.
 */
function _postToTicketWebhook_(payloadBody) {
  const webhookUrl = (PropertiesService.getScriptProperties().getProperty("TICKET_CHANNEL_WEBHOOK_URL") ||
    "https://YOUR-WEBHOOK-URL-HERE.example.com/webhook").trim();

  if (!webhookUrl) {
    console.log("Ticket channel webhook: no URL configured, skipping.");
    return { ok: false, skipped: true };
  }

  let oauthToken = "";
  try {
    oauthToken = ScriptApp.getOAuthToken();
  } catch (e) {
    console.log("Ticket channel webhook: ScriptApp.getOAuthToken failed: " + e);
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
    console.log("Ticket channel webhook: fetch failed: " + e);
    return { ok: false, httpStatus: "ERR", response: String(e) };
  }
}

/**
 * Creates a ticket in the dedicated True Positive channel.
 */
function createTicketTP(title, description) {
  return _createTicketWithAudit_("createTicketTP", title, description, getTicketChannelId());
}

function _createTicketWithAudit_(caller, title, description, channelIdOverride) {
  const startedAt = new Date();
  const timestamp = Utilities.formatDate(startedAt, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
  const durationMs = () => (new Date().getTime() - startedAt.getTime());

  const log = (entry) => {
    const row = Object.assign({ caller: caller, title: title, timestamp: timestamp }, entry);
    console.log(JSON.stringify(row));
    _ticketWriteAuditRow_([
      timestamp,
      caller,
      title,
      row.channelId || "",
      row.outcome || "",
      row.httpStatus || "",
      row.ticketId || "",
      row.ticketId || "",
      row.error || "",
      row.rawResponse || "",
      row.durationMs || ""
    ]);
  };

  const props = PropertiesService.getScriptProperties();

  const token = props.getProperty("TICKET_TOKEN");
  const projectId = props.getProperty("TICKET_PROJECT_ID") || TICKET_DEFAULTS.PROJECT_ID;
  const boardId = props.getProperty("TICKET_BOARD_ID") || TICKET_DEFAULTS.BOARD_ID;
  const channelId = channelIdOverride ||
    props.getProperty("TICKET_CHANNEL_ID") ||
    TICKET_DEFAULTS.CHANNEL_ID;

  // Validate config up-front
  const missing = [];
  if (!token) missing.push("TICKET_TOKEN");
  if (!projectId) missing.push("TICKET_PROJECT_ID");
  if (!boardId) missing.push("TICKET_BOARD_ID");
  if (!channelId) missing.push("TICKET_CHANNEL_ID or TICKET_DEFAULT_CHANNEL_ID");

  if (missing.length > 0) {
    const errMsg = "Ticket not configured. Missing script properties: " + missing.join(", ");
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
    throw new Error("Ticket Ticket Creation Failed: network error - " + fetchErr.toString());
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
    throw new Error("Ticket Ticket Creation Failed (HTTP " + responseCode + "): " + responseBody);
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
    throw new Error("Ticket returned invalid JSON: " + parseErr.toString());
  }

  const ticket = {
    ticketId: data.ticketId,
    ticketId: data.ticketId,
    conversationId: data.conversationId,
    messageId: data.messageId
  };

  log({
    outcome: "SUCCESS",
    channelId: channelId,
    httpStatus: responseCode,
    ticketId: ticket.ticketId,
    ticketId: ticket.ticketId,
    conversationId: ticket.conversationId,
    messageId: ticket.messageId,
    durationMs: durationMs()
  });

  return ticket;
}

/**
 * Audit row writer. Column order matches _TICKET_AUDIT_HEADERS_.
 */
function _ticketWriteAuditRow_(row) {
  try {
    const now = new Date();
    const timeZone = Session.getScriptTimeZone();
    const year = now.getFullYear().toString();
    const month = Utilities.formatDate(now, timeZone, "MMMM");
    const dateString = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");

    const rootFolder = _dlpUniqueGetFolder(DriveApp.getRootFolder(), "AVANA Ticket Audit Logs");
    const yearFolder = _dlpUniqueGetFolder(rootFolder, year);
    const monthFolder = _dlpUniqueGetFolder(yearFolder, month);
    const dateFolder = _dlpUniqueGetFolder(monthFolder, dateString);

    const fileName = "TICKET Ticket Audit " + dateString;
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
        "Ticket ID", "Ticket ID", "Error", "Raw Response", "Duration (ms)"
      ]);
      sheet.getRange("A1:K1").setFontWeight("bold");
      sheet.setColumnWidths(1, 11, 180);
    }

    sheet.appendRow(row);
  } catch (sheetErr) {
    console.error("TICKET AUDIT WRITE FAILED: " + sheetErr);
  }
}
