function sendDailyDLPReport() {
  Logger.log("=== Daily DLP Report Execution Started ===");

  const SENDER_EMAIL = "redacted@example.com";

  // Get yesterday start and end
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);

  Logger.log("Time window → " + start + " to " + end);

  // Gmail search for yesterday emails from sender
  const threads = GmailApp.search(`from:${SENDER_EMAIL} after:${Math.floor(start.getTime() / 1000)} before:${Math.floor(end.getTime() / 1000)}`);
  Logger.log("Threads found: " + threads.length);

  let fpTotal = 0;
  let tpTotal = 0;
  let failureTotal = 0;

  // Predefined rules for report order
  const RULE_LIST = [
    "Rule triggered: Prevent sharing Global - Email address",
    "Rule triggered: Credit Card DLP",
    "Rule triggered: Aadhar Card Matching Rule",
    "Rule triggered: Prevent sharing Global - Phone Number",
    "Rule triggered: Prevent sharing India - Personal Permanent Account Number (PAN)",
    "Rule triggered: Prevent sharing Global - Credit card number",
    "Gmail Password Reset Action by Admin",
    "Alert: User suspended (by admin)",
    "User Strong Auth Un Enroll",
    "Suspended user made active",
    "New user added"
  ];

  const RULES = {};
  RULE_LIST.forEach(r => {
    RULES[r] = { FP: 0, TP: 0, Failures: 0 };
  });

  

  // Process each thread
  threads.forEach(thread => {
    const msgs = thread.getMessages();
    Logger.log("Processing thread → messages: " + msgs.length);

    msgs.forEach(msg => {
      const subject = msg.getSubject();
      const body = msg.getPlainBody().replace(/\r\n|\n|\r/g, ' '); // Normalize

      Logger.log("Msg Subject: " + subject);

      // Determine rule
      let rule = RULE_LIST.find(r => subject.includes(r)) || "Unknown Rule";
      if (!RULES[rule]) RULES[rule] = { FP: 0, TP: 0, Failures: 0 };

      // Extract FP
      const fpMatch = body.match(/Internal-domain alerts identified in this thread:\s*(\d+)/i);
      if (fpMatch) {
        const fpValue = parseInt(fpMatch[1], 10);
        RULES[rule].FP += fpValue;
        fpTotal += fpValue;
        Logger.log(`FP found → Rule: '${rule}' | +${fpValue} | Rule FP total: ${RULES[rule].FP}`);
      }

      // Extract TP
      if (
          /true positive/i.test(body) &&
          /external recipient/i.test(body)
      ) {
        RULES[rule].TP++;
        tpTotal++;
        Logger.log(`TP found → Rule: '${rule}' | Rule TP total: ${RULES[rule].TP}`);
      }

      // Detect Failures
      if (subject.includes("Automation Execution Failure - Action Required")) {
        RULES[rule].Failures++;
        failureTotal++;
        Logger.log(`Failure found → Rule: '${rule}' | Total Failures: ${RULES[rule].Failures}`);
      }
    });
  });

  // Build professional email body
  const report =
    `Hi Team,\n\n` +
    `Please find below the AVANA DLP Automation Daily Summary for ${Utilities.formatDate(start, Session.getScriptTimeZone(), "dd MMM yyyy")}.\n\n` +
    `--- Overall Summary ---\n` +
    `Potential True Positives Encountered: ${tpTotal}\n` +
    `False Positives Encountered: ${fpTotal}\n` +
    `Automation Failures: ${failureTotal}\n\n` +
    `Notes:\n` +
    `1. TP (True Positives) indicate alerts reviewed and classified as actionable.\n` +
    `2. FP (False Positives) indicate alerts reviewed and classified as non-actionable.\n` +
    `3. Failures indicate automation execution issues requiring manual intervention.\n\n` +
    `Regards,\n` +
    `Avana Automation\n` +
    'Cyber Defence\n' +
    `YOUR COMPANY\n`;

  // Format date for email subject
  const formattedDate = Utilities.formatDate(start, Session.getScriptTimeZone(), "dd MMM yyyy");
  const subject = `AVANA Google DLP Daily Summary Report - ${formattedDate}`;

  // Send summary mail
  const recipients = [
    "redacted@example.com", 
    "redacted@example.com", 
    "redacted@example.com",
    "redacted@example.com"].join(","); // multiple recipients can be added
  Logger.log("Recipients: " + recipients);
  Logger.log("Subject: " + subject);

  MailApp.sendEmail(recipients, subject, report);

  Logger.log("=== FINAL TOTALS ===");
  Logger.log("Total FP: " + fpTotal);
  Logger.log("Total TP: " + tpTotal);
  Logger.log("Total Failures: " + failureTotal);
  Logger.log("Report email sent successfully.");
  Logger.log("=== Script Completed Successfully ===");
}
