// --- TICKET CONFIGURATION ---
// Channel for True Positive alerts. Override via script property TICKET_TP_CHANNEL_ID.
const TICKET_APP_URL = "https://YOUR-APP-URL.example.com/APP_ID";
const TICKET_CHANNEL_ID = PropertiesService.getScriptProperties().getProperty("TICKET_TP_CHANNEL_ID") || "YOUR_TICKET_CHANNEL_ID";

// Enable Gmail Advanced Service before running
function base64UrlSafeEncode(rawString) {
  return Utilities.base64EncodeWebSafe(rawString, Utilities.Charset.UTF_8);
}

function getFormattedTimestamp() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM d, yyyy hh:mm:ss a");
}

/**
 * MASTER FUNCTION (USE THIS IN TRIGGER)
 * Ensures failure alerts always go to L1 & L2
 */
function detectTruePositiveAndNotify_WITH_AUDIT_ALERT() {
  globalThis._interceptedLogs = [];
  
  globalThis._customLog = function(msg) {
    console.log(msg); 
    globalThis._interceptedLogs.push(msg); 
  };
  try {
    // Read and run your untouched TP_CORE logic
    let coreStr = detectTruePositiveAndNotify_CORE.toString();
    coreStr = coreStr.replace(/console\.log/g, "globalThis._customLog");
    eval("(" + coreStr + ")()");
    
  } catch (err) {
    const ALERT_MAIL = [
      "redacted@example.com",
      "redacted@example.com"]; // Replace with your actual alert mailing list
    
    // Grab the exact logs captured right before the crash
    const capturedLogs = globalThis._interceptedLogs && globalThis._interceptedLogs.length > 0 
      ? globalThis._interceptedLogs.join("\n") 
      : "No console logs captured before failure.";

    // Construct the email body using your exact template
    const mailBody = `Hello Team,

The True Positive automation encountered a critical failure during execution.

Failure Summary
• Function: detectTruePositiveAndNotify_WITH_AUDIT_ALERT
• Reason: ${err.message}
• Timestamp: ${getFormattedTimestamp()}

Error Details:
${err.toString()}

Execution Logs:
${capturedLogs}

Execution terminated unexpectedly.

This requires immediate review.

Regards,
AVANA Automation,
Cyber Defence
YOUR COMPANY`;

    // Send the customized alert email
    MailApp.sendEmail(
      ALERT_MAIL.join(","),
      "[ALERT] TP Automation Execution Failure - Action Required",
      mailBody
    );

    // Throw the error so the Apps Script dashboard still registers the failure
    throw err;
    
  } finally {
    // Even if it crashes and sends the email, still attempt to export whatever logs we have to Drive
    const captured = globalThis._interceptedLogs || [];
    console.log("📊 TP Wrapper Finishing... Captured " + captured.length + " log lines.");
    
    if (captured.length > 0) {
      _dlpExportLogsToDrive(captured);
    } else {
      console.log("⚠️ No logs captured. Something went wrong with the hijack.");
    }
  }
}

/**
 * UNIQUE EXPORT FUNCTION (Unified for FP and TP with Ticket Support - Root Drive Version)
 */
function _dlpExportLogsToDrive(logArray) {
  const now = new Date();
  const timeZone = Session.getScriptTimeZone();
  
  const year = now.getFullYear().toString();
  const month = Utilities.formatDate(now, timeZone, "MMMM"); 
  const dateString = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");
  const timestamp = Utilities.formatDate(now, timeZone, "hh:mm:ss a");

  console.log("📁 Connecting to Google Drive...");

  // Pointing back to your personal Drive Root
  const rootLogFolder = _dlpUniqueGetFolder(DriveApp.getRootFolder(), "AVANA Google DLP Execution Logs");
  const yearFolder = _dlpUniqueGetFolder(rootLogFolder, year);
  const monthFolder = _dlpUniqueGetFolder(yearFolder, month);
  const dateFolder = _dlpUniqueGetFolder(monthFolder, dateString);

  console.log(`📁 Folder Path Verified: Drive Root > AVANA Google DLP Execution Logs > ${year} > ${month} > ${dateString}`);

  const fileName = "AVANA Google DLP Master Logs" + dateString; // Unified sheet name
  const files = dateFolder.getFilesByName(fileName);
  let ss, sheet;

  if (files.hasNext()) {
    // Open the existing spreadsheet for today
    ss = SpreadsheetApp.openById(files.next().getId());
    sheet = ss.getSheets()[0];
    console.log("📄 Found existing sheet for today. Appending logs...");
  } else {
    // Build a brand new spreadsheet for today
    ss = SpreadsheetApp.create(fileName);
    const file = DriveApp.getFileById(ss.getId());
    file.moveTo(dateFolder); 
    
    sheet = ss.getSheets()[0];
    // Added Ticket Column
    sheet.appendRow(["Timestamp", "Thread ID", "Subject", "Internal Emails", "External Emails", "Outcome", "Ticket Ticket"]);
    sheet.getRange("A1:G1").setFontWeight("bold");
    sheet.setColumnWidths(1, 7, 200); 
    console.log("📄 Created brand new sheet for today.");
  }

  // ==========================================
  // SMART UNIFIED PARSER
  // ==========================================
  let parsedRows = [];
  let currentThread = null;

  for (let i = 0; i < logArray.length; i++) {
    let line = String(logArray[i]);

    if (line.includes("FAST EXIT")) {
      parsedRows.push(["N/A", "N/A", "NONE", "NONE", "Fast Exit (No Unread Emails)", "N/A"]);
      break; 
    }

    if (line.includes("Thread ID: ")) {
      if (currentThread) parsedRows.push(currentThread); 
      // Template: [ID, Subject, Internal, External, Outcome, Ticket]
      currentThread = ["", "", "NONE", "NONE", "Processing...", "N/A"]; 
      currentThread[0] = line.split("Thread ID: ")[1].trim();
    }

    if (currentThread) {
      if (line.includes("Subject: ")) currentThread[1] = line.split("Subject: ")[1].trim();
      
      // Parse FP Emails
      if (line.includes("Internal Emails: ")) {
        let extracted = line.split("Internal Emails: ")[1].trim();
        if (extracted !== "NONE") {
          currentThread[2] = currentThread[2] === "NONE" ? extracted : currentThread[2] + ", " + extracted;
        }
      }
      if (line.includes("External Emails: ")) {
        let extracted = line.split("External Emails: ")[1].trim();
        if (extracted !== "NONE") {
          currentThread[3] = currentThread[3] === "NONE" ? extracted : currentThread[3] + ", " + extracted;
        }
      }

      // Parse TP Emails (TP script uses slightly different logging phrasing)
      if (line.includes("Emails Found: ")) {
         // TP script logs all emails here. We put them in internal as a baseline
         let extracted = line.split("Emails Found: ")[1].trim();
         if (extracted !== "NONE") {
            currentThread[2] = currentThread[2] === "NONE" ? extracted : currentThread[2] + ", " + extracted;
         }
      }
      if (line.includes("External Emails Found: ")) {
        let extracted = line.split("External Emails Found: ")[1].trim();
        if (extracted !== "NONE") {
          currentThread[3] = currentThread[3] === "NONE" ? extracted : currentThread[3] + ", " + extracted;
        }
      }

      // Identify Outcomes
      if (line.includes("SUCCESS: FALSE POSITIVE")) currentThread[4] = "FALSE POSITIVE (Replied)";
      if (line.includes("TRUE POSITIVE CONDITION DETECTED")) currentThread[4] = "TRUE POSITIVE (Skipped to TP Script)";
      if (line.includes("✓ Auto in-thread reply sent to L1 & L2.")) currentThread[4] = "TRUE POSITIVE (Escalated to L1/L2)";
      if (line.includes("No external emails detected in thread.")) currentThread[4] = "TRUE POSITIVE RUN (Skipped - No External)";

      // Ticket ticket is captured below by the unified parser

      // Capture Ticket
      if (line.includes("✓ Ticket Created: ")) {
        currentThread[5] = line.split("✓ Ticket Created: ")[1].trim();
      }
      if (line.includes("✗ Ticket Error: ")) {
        currentThread[5] = "FAILED TO CREATE TICKET";
      }
    }
  }
  
  if (currentThread) parsedRows.push(currentThread);

  // ==========================================
  // WRITE TO SHEET
  // ==========================================
  for (let j = 0; j < parsedRows.length; j++) {
    let finalRow = [timestamp].concat(parsedRows[j]);
    sheet.appendRow(finalRow);
  }

  console.log("✅ SUCCESS: Logs safely written to Drive.");
  console.log("🔗 CLICK HERE TO VIEW SHEET: " + ss.getUrl());
}

/**
 * UNIQUE HELPER FUNCTION: Prevents naming collisions with Logging.gs
 */
function _dlpUniqueGetFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(folderName);
  }
}

/**
 * █████ CORE PROCESSING LOGIC █████
 * (DO NOT USE THIS IN TRIGGER)
 */
function detectTruePositiveAndNotify_CORE() {

  let LOG = [];
  const ALERT_MAIL = [
    "redacted@example.com",
    "redacted@example.com"
  ];

  const L1_L2_MAIL = [
    "redacted@example.com",
    "redacted@example.com"
  ];

  const CHECK_MAILBOX = "redacted@example.com";
  const FROM_MAIL = "redacted@example.com";
  const MY_MAIL = Session.getActiveUser().getEmail();


  try {

    const internalDomains = [
      // === SANITIZED FOR PUBLIC/PERSONAL REPO ===
      // Original production allowlist removed. Replace with your own values.
      "yourcompany.com", "yourcompany.co.in",
      // Whitelisted domains:
      "partner-a.example.com", "partner-b.example.com",
      // Approved External Audit Review:
      "auditor@example.com",
      // Merchants and Auditors:
      "merchant1.example.com", "merchant2.example.com", "gateway.example.com",
      "merchant3.example.com", "merchant4.example.com"
    ];

    const TARGET_SUBJECTS = [
      "Rule triggered: Prevent sharing Global - Email address",
      "Rule triggered: Credit Card DLP",
      "Rule triggered: Aadhar Card Matching Rule",
      "Rule triggered: Prevent sharing Global - Phone Number",
      "Rule triggered: Prevent sharing India - Personal Permanent Account Number (PAN)",
      "Rule triggered: Prevent sharing Global - Credit card number",
      "Rule triggered: Credit Card Number Template - Drive"
    ];

    LOG.push("====================================================");
    LOG.push("DLP TRUE POSITIVE HANDLER STARTED");
    LOG.push("Execution Time: " + new Date());
    LOG.push("Running As: " + MY_MAIL);
    LOG.push("====================================================");

    // FAST EXIT IF NO UNREAD MAILS
    const unreadCheck = GmailApp.search(`to:${CHECK_MAILBOX} is:unread`, 0, 1);
    if (unreadCheck.length === 0) {
      LOG.push("FAST EXIT → No unread messages in cyberdefence inbox.");
      LOG.push("Execution End: " + new Date());
      LOG.forEach(l => console.log(l));
      return;
    }

    // PROCEED WITH SUBJECT FILTER ONLY
    const SUBJECT_QUERY = TARGET_SUBJECTS.map(s => `subject:"${s}"`).join(" OR ");
    const SEARCH_QUERY = `to:${CHECK_MAILBOX} (${SUBJECT_QUERY}) is:unread`;
    LOG.push("SEARCH QUERY: " + SEARCH_QUERY);

    const threads = GmailApp.search(SEARCH_QUERY, 0, 400);
    LOG.push("Threads Found: " + threads.length);

    if (threads.length === 0) {
      LOG.push("No matching threads after subject filter. Exiting.");
      LOG.push("Execution End: " + new Date());
      LOG.push("Running As: " + MY_MAIL);
              // ⭐ ADD YOUR CLOSING HEADER HERE ⭐
      LOG.push("====================================================");
      LOG.push("DLP TRUE POSITIVE HANDLER COMPLETED");
      LOG.push("Completion Time: " + getFormattedTimestamp());
      LOG.push("Processed By (MY_MAIL): " + MY_MAIL);
      LOG.push("====================================================");
      LOG.forEach(l => console.log(l));
      return;
    }

    let processed = 0;

    // PROCESS EACH THREAD
    threads.forEach((thread, index) => {
      try {
        LOG.push("----------------------------------------------------");
        LOG.push(`Thread ${index + 1}/${threads.length}`);
        LOG.push("Thread ID: " + thread.getId());
        LOG.push("Subject: " + thread.getFirstMessageSubject());
        LOG.push("----------------------------------------------------");

        const messages = thread.getMessages().filter(m => m.isUnread()); // ONLY UNREAD MESSAGES
        LOG.push("Unread Messages in Thread: " + messages.length);

        if (messages.length === 0) {
          LOG.push("No unread messages in this thread. Skipping.");
          return;
        }

        const alreadyReplied = messages.some(m =>
          (m.getFrom() || "").includes(FROM_MAIL)
        );

        if (alreadyReplied)
          LOG.push("Automation reply already exists (skipping reply).");

        let externalFound = false;
        let allExternalEmails = [];
        let messageLinks = [];

        // CHECK EACH MESSAGE
        messages.forEach((msg, idx) => {
          LOG.push(`Checking Message ${idx + 1}`);
          LOG.push("From: " + msg.getFrom());

          const body = msg.getPlainBody();
          const found = body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g);
          if (found) LOG.push("Emails Found: " + found.join(", "));
          else LOG.push("No emails found in message.");

          if (!found) return;

          // Filter external emails
          const ext = found.filter(e => !internalDomains.some(d => e.toLowerCase().endsWith(d)));
          if (ext.length > 0) {
            externalFound = true;
            allExternalEmails.push(...ext);
            messageLinks.push(`https://mail.google.com/mail/u/0/#inbox/${msg.getId()}`);
            LOG.push("External Emails Found: " + ext.join(", "));
            LOG.push("Direct Message Link: " + messageLinks[messageLinks.length - 1]);
          }
        });

        if (!externalFound) {
          LOG.push("No external emails detected in thread.");
          return;
        }

        // Deduplicate external emails
        allExternalEmails = [...new Set(allExternalEmails)];
// -------- TICKET TICKET GENERATION BLOCK --------
        let ticketTicketUrl = "Ticket creation failed or skipped";
        let ticketTicketId = "Ticket Creation Failed";

        try {
          const ruleName = thread.getFirstMessageSubject().replace("Rule triggered: ", "");
          const ticketTitle = `AVANA DLP Alert - ${ruleName}`;
          
          const ticketDescription =
            `Auto generated from AVANA TP Automation\n\n` +
            `Rule: ${ruleName}\n\n` +
            `External Recipients:\n${allExternalEmails.join(", ")}\n\n` +
            `Message Link:\n${messageLinks[0]}`;

          // Create the ticket in the dedicated True Positive channel
          const ticket = createTicketTP(ticketTitle, ticketDescription);

          ticketTicketId = ticket.ticketId; 
          
          // Construct the web app deep-link for the TP channel
          ticketTicketUrl = buildTicketUrl(TICKET_CHANNEL_ID, ticket);
          
          LOG.push("✓ Ticket Created: " + ticketTicketId);
        } catch (e) {
          LOG.push("✗ Ticket Error: " + e.message);
          ticketTicketUrl = "FAILED";
        }
        // -------- END TICKET TICKET GENERATION BLOCK --------

        // SEND IN-THREAD REPLY IF NOT ALREADY SENT
        if (!alreadyReplied) {
          const lastMsg = messages[messages.length - 1];
          const msgId = lastMsg.getHeader("Message-ID");
          const refs = lastMsg.getHeader("References") || msgId;
          const replyBody =
            "Hello,\n\n" +

            "This email thread has been flagged due to the presence of external recipient(s).\n\n" +

            "Details:\n" +
            `• Subject : ${thread.getFirstMessageSubject()}\n` +
            `• External Recipient(s): ${allExternalEmails.join(", ")}\n` +
            `• Detected At : ${getFormattedTimestamp()}\n\n` +

            "Initial assessment indicates this could be a potential True Positive.\n" +
            "We request you to review and confirm whether this communication is expected and appropriate.\n\n" +
(ticketTicketUrl !== "FAILED" && ticketTicketUrl !== "Ticket creation failed or skipped"
           ? `Tracking Reference:\n• ${ticketTicketUrl}\n\n`
           : ""
           ) + 
            "Next Steps:\n" +
            "• Verify if the external sharing was intended\n" +
            "• Check if any sensitive information was involved\n" +
            "• Report back if any action is required\n\n" +

            "Regards,\n" +
            "AVANA Automation\n" +
            "Cyber Defence\n" +
            "YOUR COMPANY";

          const TO_HEADER = L1_L2_MAIL.join(",").replace(/\s+/g, ""); // sanitize spaces

          const raw = [
            `To: ${TO_HEADER}`,
            `From: ${FROM_MAIL}`,
            `Subject: ${thread.getFirstMessageSubject()}`,
            `In-Reply-To: ${msgId}`,
            `References: ${refs} ${msgId}`,
            `Content-Type: text/plain; charset="UTF-8"`,
            "",
            replyBody
          ].join("\r\n");

          const encoded = base64UrlSafeEncode(raw);
          Gmail.Users.Messages.send({ raw: encoded, threadId: thread.getId() }, "me");

          LOG.push("✓ Auto in-thread reply sent to L1 & L2.");
        }

        // Collect content of messages that triggered the alert
        const triggeringMessagesContent = messages
          .filter(msg => {
            // Check if this message has any of the external emails
            const body = msg.getPlainBody();
            return allExternalEmails.some(email => body.includes(email));
          })
          .map(msg => {
            return `--- Message from: ${msg.getFrom()} | Date: ${msg.getDate()} ---
        ${msg.getPlainBody()}`;
          })
          .join("\n\n"); // join multiple messages if more than one triggered

        // Construct notifyBody
        const notifyBody =
          "Hello Team,\n\n" +

          "DLP Alert – Potential True Positive Identified\n\n" +

          "Summary:\n" +
          "An email thread has been flagged due to interaction with external recipient(s).\n" +
          "This activity may represent a potential True Positive and requires validation from the security team.\n\n" +

          "Alert Details:\n" +
          `• Rule Triggered : ${thread.getFirstMessageSubject().replace("Rule triggered: ", "")}\n` +
          `• External Emails: ${allExternalEmails.join(", ")}\n` +
          `• Detection Time : ${getFormattedTimestamp()}\n\n` +

          "Reference Links:\n" +
          `${messageLinks.join("\n")}\n\n` +
"Ticket Tracking:\n" +
           (ticketTicketUrl !== "FAILED" && ticketTicketUrl !== "Ticket creation failed or skipped"
           ? `• ${ticketTicketUrl}\n\n`
           : "• Ticket ticket creation failed\n\n"
           ) +

          "Required Actions:\n" +
          "• Validate whether the external communication is business-justified\n" +
          "• Check if any sensitive or regulated data was shared\n" +
          "• Review the email content using the reference links above\n" +
          "• Update the Ticket ticket with investigation findings\n" +
          "• Escalate immediately if any policy violation is identified\n\n" +

          "Notes:\n" +
          "This is an automated alert and does not confirm a True Positive.\n" +
          "Final classification must be determined after manual investigation.\n\n" +

          "Regards,\n" +
          "AVANA Automation\n" +
          "Cyber Defence\n" +
          "YOUR COMPANY";

          GmailApp.sendEmail(
          L1_L2_MAIL.join(","),
          "[Alert] TRUE POSITIVE DETECTED",
          notifyBody
          );
        LOG.push("✓ Notification sent to L1 & L2 with ORIGINAL CONTENT block.");

        // Post the structured (metadata-only) alert to the dedicated Ticket channel
        try {
          const webhookResult = sendTicketAlert({
            title: "TRUE POSITIVE DETECTED",
            summary: "An email thread was flagged for interaction with external recipient(s). Potential True Positive — requires validation from the security team.",
            fields: [
              { label: "Rule Triggered", value: thread.getFirstMessageSubject().replace("Rule triggered: ", "") },
              { label: "External Emails", value: allExternalEmails.join(", ") },
              { label: "Detection Time", value: getFormattedTimestamp() }
            ],
            ticketUrl: (ticketTicketUrl !== "FAILED" && ticketTicketUrl !== "Ticket creation failed or skipped") ? ticketTicketUrl : null
          });
          if (webhookResult.ok) LOG.push("✓ Ticket channel alert posted.");
          else LOG.push("⚠️ Ticket channel alert failed: HTTP " + webhookResult.httpStatus + " | " + (webhookResult.response || ""));
        } catch (webhookErr) {
          LOG.push("⚠️ Ticket channel alert exception: " + webhookErr);
        }

        // MARK ALL PROCESSED UNREAD MESSAGES AS READ
        messages.forEach(m => m.markRead());
        LOG.push("✓ All processed unread messages in thread marked as read.");

        processed++;

      } catch (threadErr) {
        LOG.push("✗ THREAD ERROR: " + threadErr);
      }
    });

    LOG.push("====================================================");
    LOG.push("TP PROCESSING COMPLETE");
    LOG.push("Total Threads Processed: " + processed);
    LOG.push("Execution End: " + new Date());
    LOG.push("====================================================");

        // ⭐ ADD YOUR CLOSING HEADER HERE ⭐
    LOG.push("====================================================");
    LOG.push("DLP TRUE POSITIVE HANDLER COMPLETED");
    LOG.push("Completion Time: " + getFormattedTimestamp());
    LOG.push("Processed By (MY_MAIL): " + MY_MAIL);
    LOG.push("====================================================");

  } catch (err) {
    LOG.push("✗ CRITICAL ERROR: " + err.toString());
    LOG.push("Execution Stopped At: " + new Date());

    MailApp.sendEmail(
      ALERT_MAIL.join(","),
      "[ALERT] TP Automation Failed",
      "Script Error:\n" + err.toString() + "\n\nLOGS:\n" + LOG.join("\n")
    );

    throw err;
  }

  LOG.forEach(l => console.log(l));
}