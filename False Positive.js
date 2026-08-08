// Enable Gmail Advanced Service before running
function base64UrlSafeEncode(rawString) {
  return Utilities.base64EncodeWebSafe(rawString, Utilities.Charset.UTF_8);
}

function getFormattedTimestamp() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM d, yyyy hh:mm:ss a");
}

/**
 * MASTER WRAPPER (keep alert logic)
 */
function closeFalsePositiveThreads_FINAL_WITH_ALERT() {
  globalThis._interceptedLogs = [];
  
  globalThis._customLog = function(msg) {
    console.log(msg); 
    globalThis._interceptedLogs.push(msg); 
  };


  try {
    let coreStr = closeFalsePositiveThreads_CORE.toString();
    coreStr = coreStr.replace(/console\.log/g, "globalThis._customLog");
    eval("(" + coreStr + ")()");
    
  } catch (err) {
    const ALERT_MAIL = ["redacted@example.com","redacted@example.com"];
    // Grab the exact logs captured right before the crash
    const capturedLogs = globalThis._interceptedLogs && globalThis._interceptedLogs.length > 0 
      ? globalThis._interceptedLogs.join("\n") 
      : "No console logs captured before failure.";

    // Construct the email body using your exact template
    const mailBody = `Hello Team,

The True Positive automation encountered a critical failure during execution.

Failure Summary
• Function: closeFalsePositiveThreads_FINAL_WITH_ALERT
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
      "[CRITICAL] FP Automation Execution Failure - Action Required",
      "MASTER FUNCTION ERROR:\n\n" + err.stack
    );
    throw err;
  } finally {
    const captured = globalThis._interceptedLogs || [];
    console.log("📊 Wrapper Finishing... Captured " + captured.length + " log lines.");
    
    if (captured.length > 0) {
      // 🚨 UPDATED: Passing the raw array instead of a joined string
      _dlpExportLogsToDrive(captured);
    } else {
      console.log("⚠️ No logs captured. Something went wrong with the hijack.");
    }
  }
}

/**
 * UNIQUE EXPORT FUNCTION (Unified for FP and TP with Jira Support - Root Drive Version)
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
    // Added Jira Ticket Column
    sheet.appendRow(["Timestamp", "Thread ID", "Subject", "Internal Emails", "External Emails", "Outcome", "Jira Ticket"]);
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
      // Template: [ID, Subject, Internal, External, Outcome, Jira]
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

      // Capture Jira Ticket
      if (line.includes("Jira Ticket Created: ")) {
        currentThread[5] = line.split("Jira Ticket Created: ")[1].trim();
      }
      if (line.includes("✗ Jira error: ")) {
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
 * UPDATED FP CORE SCRIPT – CLEAN LOGGING (Same style as TP script)
 */
function closeFalsePositiveThreads_CORE() {
  let LOG = [];

  const ALERT_MAIL = ["redacted@example.com"];
  const CHECK_MAILBOX = "redacted@example.com";
  const FROM_MAIL = "redacted@example.com";
  const MY_MAIL = Session.getActiveUser().getEmail();

  try {
    const TARGET_SUBJECTS = [
      "Rule triggered: Prevent sharing Global - Email address",
      "Rule triggered: Credit Card DLP",
      "Rule triggered: Aadhar Card Matching Rule",
      "Rule triggered: Prevent sharing Global - Phone Number",
      "Rule triggered: Prevent sharing India - Personal Permanent Account Number (PAN)",
      "Rule triggered: Prevent sharing Global - Credit card number",
      "Rule triggered: Gmail Password Reset Action by Admin",
      "Alert: User suspended (by admin)",
      "Rule triggered: Credit Card Number Template - Drive"
    ];

    // ✅ ADDED: multiple internal domains support
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

    LOG.push("====================================================");
    LOG.push("DLP FALSE POSITIVE HANDLER STARTED");
    LOG.push("Execution Time: " + getFormattedTimestamp());
    LOG.push("Running As (MY_MAIL): " + MY_MAIL);
    LOG.push("====================================================");

    const unreadCheck = GmailApp.search(`to:${CHECK_MAILBOX} is:unread`, 0, 1);
    if (unreadCheck.length === 0) {
      LOG.push("FAST EXIT → No unread messages. Stopping FP routine.");
      LOG.push("Execution End: " + getFormattedTimestamp());
      LOG.push("====================================================");
      LOG.forEach(l => console.log(l));
      return;
    }

    const SUBJECT_QUERY = TARGET_SUBJECTS.map(s => `subject:"${s}"`).join(" OR ");
    const SEARCH_QUERY = `to:${CHECK_MAILBOX} (${SUBJECT_QUERY}) is:unread`;

    LOG.push("SEARCH QUERY USED: " + SEARCH_QUERY);

    const threads = GmailApp.search(SEARCH_QUERY, 0, 50);
    LOG.push("Threads Found: " + threads.length);

    if (threads.length === 0) {
      LOG.push("No matching unread threads → exiting.");
      LOG.push("Execution End: " + getFormattedTimestamp());
      LOG.push("====================================================");
      LOG.push("DLP FALSE POSITIVE HANDLER COMPLETED");
      LOG.push("Completion Time: " + getFormattedTimestamp());
      LOG.push("Processed By (MY_MAIL): " + MY_MAIL);
      LOG.push("====================================================");
      LOG.forEach(l => console.log(l));
      return;
    }

    let processed = 0;

    threads.forEach((thread, tIndex) => {
      try {
        LOG.push("----------------------------------------------------");
        LOG.push(`Processing Thread ${tIndex + 1}/${threads.length}`);
        LOG.push("Thread ID: " + thread.getId());
        LOG.push("Subject: " + thread.getFirstMessageSubject());
        LOG.push("----------------------------------------------------");

        const messages = thread.getMessages().filter(m => m.isUnread());
        LOG.push("Unread Messages in Thread: " + messages.length);

        if (messages.length === 0) {
          LOG.push("No unread messages → skipping thread.");
          return;
        }

        // ✅ TP detection flag
        let isTruePositive = false;

        messages.forEach((msg, mIndex) => {
          LOG.push(`Checking Message ${mIndex + 1}`);

          const from = msg.getFrom();
          LOG.push("From: " + from);

          const body = msg.getBody();
          const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
          const foundEmails = body.match(emailRegex);

          LOG.push("Found Emails Raw: " + (foundEmails ? foundEmails.join(", ") : "NONE"));

          // ✅ UPDATED: multi-domain internal/external classification
          const internalEmails = (foundEmails || []).filter(e =>
            internalDomains.some(domain => e.toLowerCase().endsWith(domain))
          );

          const externalEmails = (foundEmails || []).filter(e =>
            !internalDomains.some(domain => e.toLowerCase().endsWith(domain))
          );

          LOG.push("Internal Emails: " + (internalEmails.join(", ") || "NONE"));
          LOG.push("External Emails: " + (externalEmails.join(", ") || "NONE"));

          if (externalEmails.length > 0) {
            LOG.push("🚨 TRUE POSITIVE CONDITION DETECTED → External email present");
            isTruePositive = true;
          } else {
            LOG.push("No external emails → eligible for FALSE POSITIVE.");
          }
        });

        // ✅ SKIP if TP
        if (isTruePositive) {
          LOG.push("⛔ Skipping thread → handled by TP script");

          // Ensure messages stay unread (explicit control)
          messages.forEach(m => m.markUnread());
          return;
        }

        const lastMsg = messages[messages.length - 1];
        const msgId = lastMsg.getHeader("Message-ID");
        const refs = lastMsg.getHeader("References") || msgId;

        LOG.push("Last Message Message-ID: " + msgId);
        LOG.push("Last Message References: " + refs);

        const replyBody =
          "Hello Team,\n\n" +
          "This email is being Reviewed and Classified as a False Positive, as no external domains were detected.\n\n" +
          `• Timestamp: ${getFormattedTimestamp()}\n\n` +
          `• Internal-domain alerts identified in this thread: ${messages.length}\n\n` +
          "Regards,\nAVANA Automation,\nCyber Defence,\nYOUR COMPANY";

        const raw = [
          `To: redacted@example.com`,
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

        LOG.push("✓ SUCCESS: FALSE POSITIVE reply sent inside thread.");

        messages.forEach(m => m.markRead());

        processed++;

      } catch (threadErr) {
        LOG.push("✗ THREAD ERROR: " + threadErr);
      }
    });

    LOG.push("====================================================");
    LOG.push("FP PROCESSING COMPLETE");
    LOG.push("Total Threads Marked FP: " + processed);
    LOG.push("Execution End: " + getFormattedTimestamp());
    LOG.push("====================================================");

    LOG.push("====================================================");
    LOG.push("DLP FALSE POSITIVE HANDLER COMPLETED");
    LOG.push("Completion Time: " + getFormattedTimestamp());
    LOG.push("Processed By (MY_MAIL): " + MY_MAIL);
    LOG.push("====================================================");

  } catch (err) {
    LOG.push("✗ CRITICAL ERROR: " + err.toString());
    LOG.push("Execution End: " + getFormattedTimestamp());

    MailApp.sendEmail(
      ALERT_MAIL.join(","),
      "[ALERT] FP Automation Failed",
      "Script Error:\n" + err.toString() +
      "\n\nLOGS:\n" + LOG.join("\n")
    );

    throw err;
  }

  LOG.forEach(l => console.log(l));
}