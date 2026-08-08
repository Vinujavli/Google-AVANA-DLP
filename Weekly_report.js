function sendWeeklyDLPReport() {
  Logger.log("=== Weekly DLP Report Execution Started ===");

  const SENDER_EMAIL = "redacted@example.com";

  // ----- Calculate last full week (Mon–Sun) -----
  const TEST_MODE = false; // 🔁 switch to false for prod

  let weekStart, weekEnd;

  if (TEST_MODE) {
    // Manual testing window
    weekStart = new Date("2026-01-12T00:00:00");
    weekEnd   = new Date("2026-01-18T23:59:59");
  } else {
    // Production logic
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? 6 : day - 1);

    weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - diffToMonday - 1);
    weekEnd.setHours(23, 59, 59, 999);

    weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
  }
  /*
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon
  const diffToMonday = (day === 0 ? 6 : day - 1);

  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() - diffToMonday - 1);
  weekEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  */

  Logger.log("Weekly Time window → " + weekStart + " to " + weekEnd);

  // Gmail search for weekly emails
  const threads = GmailApp.search(
    `from:${SENDER_EMAIL} after:${Math.floor(weekStart.getTime() / 1000)} before:${Math.floor(weekEnd.getTime() / 1000)}`
  );

  Logger.log("Threads found: " + threads.length);

  let fpTotal = 0;
  let tpTotal = 0;
  let failureTotal = 0;

  // Predefined rules (same as daily)
  const RULE_LIST = [
    "Rule triggered: Prevent sharing Global - Email address",
    "Rule triggered: Credit Card DLP",
    "Rule triggered: Aadhar Card Matching Rule",
    "Rule triggered: Prevent sharing Global - Phone Number",
    "Rule triggered: Prevent sharing India - Personal Permanent Account Number (PAN)",
    "Rule triggered: Prevent sharing Global - Credit card number",
    "Gmail Password Reset Action by Admin",
    "Alert: User suspended (by admin)"
  ];

  const RULES = {};
  RULE_LIST.forEach(r => {
    RULES[r] = { FP: 0, TP: 0, Failures: 0 };
  });

  // ----- Process messages -----
  threads.forEach(thread => {
    const msgs = thread.getMessages();

    msgs.forEach(msg => {
      const subject = msg.getSubject();
      const body = msg.getPlainBody().replace(/\r\n|\n|\r/g, " ");

      let rule = RULE_LIST.find(r => subject.includes(r)) || "Unknown Rule";
      if (!RULES[rule]) RULES[rule] = { FP: 0, TP: 0, Failures: 0 };

      // FP extraction
      const fpMatch = body.match(/Internal-domain alerts identified in this thread:\s*(\d+)/i);
      if (fpMatch) {
        const fpValue = parseInt(fpMatch[1], 10);
        RULES[rule].FP += fpValue;
        fpTotal += fpValue;
      }

      // TP extraction
      if (
          /true positive/i.test(body) ||
          /external recipient/i.test(body)
      ) {
          RULES[rule].TP++;
          tpTotal++;
      }

      // Failure detection
      if (subject.includes("Automation Execution Failure - Action Required")) {
        RULES[rule].Failures++;
        failureTotal++;
      }
    });
  });

  // ----- Build weekly email body -----
  const startLabel = Utilities.formatDate(weekStart, Session.getScriptTimeZone(), "dd MMM yyyy");
  const endLabel = Utilities.formatDate(weekEnd, Session.getScriptTimeZone(), "dd MMM yyyy");

  let ruleSummary = "";
  RULE_LIST.forEach(rule => {
    const r = RULES[rule];
    ruleSummary +=
      `• ${rule}\n` +
      `   - TP: ${r.TP}\n` +
      `   - FP: ${r.FP}\n` +
      `   - Failures: ${r.Failures}\n\n`;
  });

  const report =
    `Hi Team,\n\n` +
    `Please find below the AVANA DLP Automation Weekly Summary.\n` +
    `Reporting Period: ${startLabel} – ${endLabel}\n\n` +
    `--- Overall Weekly Summary ---\n` +
    `Potential True Positives Encountered: ${tpTotal}\n` +
    `False Positives Encountered: ${fpTotal}\n` +
    `Automation Failures: ${failureTotal}\n\n` +
    `--- Rule-wise Breakdown ---\n` +
    `${ruleSummary}` +
    `Notes:\n` +
    `1. TP (True Positives) indicate alerts correctly detected and closed.\n` +
    `2. FP (False Positives) indicate alerts reviewed and classified as non-actionable.\n` +
    `3. Failures indicate automation execution issues requiring manual intervention.\n\n` +
    `Regards,\n` +
    `Avana Automation\n` +
    'Cyber Defence\n' +
    `YOUR COMPANY\n`;

  const subject = `AVANA Google DLP Weekly Summary Report | ${startLabel} – ${endLabel}`;

  const recipients = [
    "redacted@example.com",
    "redacted@example.com",
    "redacted@example.com",
    "redacted@example.com"
  ].join(",");

  MailApp.sendEmail(recipients, subject, report);

  Logger.log("=== WEEKLY TOTALS ===");
  Logger.log("Total FP: " + fpTotal);
  Logger.log("Total TP: " + tpTotal);
  Logger.log("Total Failures: " + failureTotal);
  Logger.log("Weekly report sent successfully.");
  Logger.log("=== Script Completed Successfully ===");
}
