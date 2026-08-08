# AVANA (Automated Vigilance & Advanced Notification Assistant)

Unified DLP (Data Loss Prevention) Workflow Automation for CyberDefence Operations. Built as a Google Apps Script project, AVANA automates the detection, review, and notification pipeline for Google Workspace DLP alerts.

## Overview

AVANA orchestrates your organization's DLP incident triage through Gmail and Google Workspace Admin audit logs, with built-in routing to JIRA and Xyne for CyberDefence operations.

### Key Capabilities

| Feature | Description |
|---|---|
| True Positive (TP) Detection | Auto-detects genuine DLP incidents and queues them for SOC review |
| False Positive (FP) Handling | Filters noise, suppresses duplicates, and auto-closes non-issues |
| Multi-Channel Alerts | Notifies via Email + Xyne real-time webhooks |
| Internal Domain Allowlist | Handles intra-org mail with a configurable whitelist |
| Daily & Weekly Reporting | Auto-generates summary digests for CyberDefence leadership |
| JIRA Integration | Validates tickets against Atlassian Cloud |

## Architecture

```
Gmail DLP Alert
    |
    v
+---------------------------------+
|   AVANA Automation Engine       |
| (Google Apps Script)            |
| - detect() | classify() | report|
+---------------------------------+
    |
    +---> Email alerts  (TP/FP)
    +---> Xyne webhooks (real-time channel)
    +---> JIRA tickets  (Atlassian Cloud)
    +---> Daily/Weekly digests
```

## Project Structure

```
├── True Positive.js         # TP detection & alert pipeline
├── False Positive.js        # FP filtering & auto-closure
├── Daily_report.js          # Daily summary digest automation
├── Weekly_report.js         # Weekly summary digest automation
├── JIRA_Auth.js             # JIRA Cloud auth helper
├── XYNE_AUTH.js             # Xyne webhook integration
├── XYNE_Test.js             # Xyne diagnostics suite
├── appsscript.json          # Apps Script manifest
└── .clasp.json              # Clasp project mapping
```

## Setup

### Prerequisites

- Google Workspace (Gmail + Admin SDK) with CyberDefence mailbox
- [clasp](https://github.com/google/clasp) installed: `npm i -g @google/clasp`
- Xyne instance with a dedicated channel & webhook URL
- JIRA Cloud (Atlassian) tenant

### 1. Clone & configure

```bash
git clone https://github.com/Vinujavli/Google-AVANA-DLP.git
cd Google-AVANA-DLP
clasp login
```

### 2. Set your Script ID

Edit `.clasp.json` and replace the placeholder with your Apps Script ID:

```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE"
}
```

### 3. Set Script Properties

In your Apps Script project, go to **Project Settings → Script Properties**:

| Property | Value |
|---|---|
| `NEW_TOKEN` | JIRA Personal API Token |
| `XYNE_TOKEN` | Xyne API token |
| `XYNE_CHANNEL_WEBHOOK_URL` | Xyne channel webhook URL |

### 4. Update internal domains

Edit `True Positive.js` and `False Positive.js` — replace the placeholder `internalDomains` array with your organization's actual whitelist.

### 5. Deploy

```bash
clasp push
```

Then set up your time-driven triggers in Apps Script:

| Function | Schedule |
|---|---|
| `detectTruePositiveAndNotify()` | Every 5 min |
| `detectFalsePositiveAndClose()` | Every 5 min |
| `sendDailyReport()` | Daily, 9 AM |
| `sendWeeklyReport()` | Mon, 9 AM |

## Security Considerations

⚠️ **This repo has been sanitized for a personal portfolio.** The original production code contains:

- Internal Juspay/SOC email addresses
- Live webhook secrets (`b17f358...`)
- Real Google Apps Script Project IDs
- Internal domain allowlists (vendor/merchant relationships)

If you're deploying to a live environment:
1. Rotate any exposed webhook tokens
2. Configure Script Properties with fresh credentials
3. Replace all `example.com` placeholders with real values
4. **Never commit live API tokens or webhook URLs to git**

## Support

For internal CyberDefence/L1-L2 escalation: contact your Security Operations admin.

---

*AVANA is an internal security automation tool. Built with Google Apps Script.*
