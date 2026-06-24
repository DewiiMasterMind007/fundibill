# FundiBill — Project Briefing for Claude Code

## What This Is

FundiBill is a South African desktop invoicing application built for small businesses and freelancers. It is sold as a lifetime licence for R99 via PayFast. The app is packaged as a Windows `.exe` installer using Electron. All data is stored in Supabase (cloud). There is a 7-day free trial with read-only mode after expiry.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 31 |
| UI framework | React 18 + Vite 5 |
| Routing | react-router-dom 6 (HashRouter) |
| Data / Auth | Supabase JS SDK v2 (`@supabase/supabase-js`) |
| Primary PDF | `@react-pdf/renderer` 4.5 — renders branded A4 PDFs |
| Legacy PDF | `jsPDF` + `jspdf-autotable` — lives in `src/utils/pdf.js`, largely unused; kept as backup |
| Charts | `recharts` 3 |
| Email (SMTP) | `nodemailer` 6 — runs in the Electron main process via IPC |
| Packaging | `electron-builder` 24 — produces `FundiBill-Setup-{version}.exe` |
| Dev tooling | `concurrently`, `wait-on`, `vite` |
| Edge functions | Deno (Supabase Edge Functions) |

---

## Project Structure

```
/
├── electron/
│   ├── main.js           — BrowserWindow, IPC handlers (PDF save, email send, shell)
│   ├── preload.js        — contextBridge exposing window.electronAPI and window.db
│   ├── license.js        — FNDBY key algorithm (FNV-1a checksum, validate/generate)
│   └── database.js       — Legacy (unused, kept for reference)
│
├── src/
│   ├── main.jsx          — React entry point, mounts <App />
│   ├── index.css         — Minimal global reset
│   ├── App.jsx           — Root: auth gate, context providers, Tutorial, sidebar layout
│   │
│   ├── context/
│   │   ├── AuthContext.jsx         — Supabase auth state; user ref stable across token refresh
│   │   ├── AppDataContext.jsx      — Global cache: profile, clients, catalog; loaded once on login
│   │   ├── TrialContext.jsx        — Trial start date, days remaining, isReadOnly flag
│   │   └── RecurringNotifContext.jsx — Amber banner notifications for auto-created recurring invoices
│   │
│   ├── pages/
│   │   ├── Auth.jsx        — Login / Register; shows confirmation screen after sign-up
│   │   ├── Dashboard.jsx   — Stat cards (revenue, overdue, etc.) + bar chart
│   │   ├── Invoices.jsx    — Full invoice CRUD, recurring invoices, manual reminder bell
│   │   ├── Estimates.jsx   — Estimate CRUD, convert-to-invoice
│   │   ├── Clients.jsx     — Client management with per-client invoice/estimate history
│   │   ├── Items.jsx       — Product/service catalog
│   │   ├── Expenses.jsx    — Expense tracking
│   │   └── Settings.jsx    — Business profile, branding, SMTP, payment terms, payment methods
│   │
│   ├── components/
│   │   ├── Sidebar.jsx         — Liquid-glass gradient sidebar; primaryColor theming
│   │   ├── HelpButton.jsx      — "?" popover with page-specific help bullets
│   │   ├── LicenseModal.jsx    — Trial-expired lockout + FNDBY key entry
│   │   ├── TrialBanner.jsx     — Top banner: days remaining, Buy button, PayFast polling
│   │   ├── SendEmailModal.jsx  — Compose and send invoice/estimate emails via SMTP
│   │   └── Tutorial.jsx        — 12-step click-through tutorial with spotlight overlay
│   │
│   ├── pdf/
│   │   ├── PdfDocument.jsx     — @react-pdf/renderer branded A4 document; fixed header/footer per page
│   │   └── PdfPreviewModal.jsx — Renders PDF in-app, Save to disk, triggers Send Email
│   │
│   ├── lib/
│   │   ├── supabase.js         — Supabase client (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
│   │   ├── auth.js             — Thin wrappers: signIn, signUp, signOut, getSession, onAuthStateChange
│   │   ├── payfast.js          — buildPayFastURL() → opens api.fundibill.online/fundibill-buy.php in browser
│   │   └── emailTemplates.js   — generateInvoiceEmail, generateEstimateEmail, generateReminderEmail,
│   │                             generateTestEmail, PLAIN_TEXT_FOOTER (all return full HTML strings)
│   │
│   └── utils/
│       └── pdf.js              — Legacy jsPDF builder (unused in current flow, kept for reference)
│
├── supabase/
│   └── functions/
│       └── send-payment-reminders/
│           ├── index.ts    — Deno edge function (deployed, scheduled but superseded by manual bell flow)
│           └── README.md   — Deploy/schedule instructions
│
├── assets/
│   └── icon.ico            — App icon for installer, taskbar, window title bar
│
├── public/
│   ├── favicon.ico         — Meerkat/FundiBill branded icon (Vite dev server + renderer)
│   └── FundiBill long.png  — Wide FundiBill wordmark logo (shown in sidebar + login screen)
│
├── scripts/
│   └── create-icon.js      — Generates icon assets for build
│
├── electron-builder.yml    — Windows NSIS installer config; icon, shortcut, artifact name
├── vite.config.js          — base: './', outDir: dist/renderer
├── package.json            — npm scripts: dev, build, build:win
├── index.html              — Root HTML; favicon link, React mount point
├── key-generator.html      — Internal tool (not deployed) — generates FNDBY license keys
└── CLAUDE.md               — This file
```

---

## Supabase Schema

All tables have RLS enabled with `auth.uid() = user_id` policies. All PKs are UUIDs.

### `profiles` — One row per user, created on first login
| Column | Type | Purpose |
|---|---|---|
| id | uuid | FK → auth.users |
| business_name | text | Shown on PDFs and emails |
| address | text | Business address for PDFs |
| email | text | Business contact email |
| phone | text | Business phone |
| vat_number | text | VAT reg number |
| logo_url | text | HTTPS URL to business logo |
| primary_color | text | Hex; drives PDF + sidebar/UI theming |
| accent_color | text | Hex; secondary colour |
| text_color | text | Hex |
| invoice_prefix | text | e.g. "INV-" |
| estimate_prefix | text | e.g. "EST-" |
| starting_invoice_number | integer | Next invoice seq start |
| starting_estimate_number | integer | Next estimate seq start |
| default_payment_terms | text | Dropdown label (legacy; UI removed) |
| default_payment_method | text | Pre-selected in Mark as Paid |
| terms | text | T&C printed on PDFs (note: DB column is `terms`, not `terms_conditions`) |
| banking_details | text | Printed on PDFs |
| payment_methods | text | JSON array of payment method names |
| expense_categories | text | JSON array of category names |
| smtp_host | text | SMTP server hostname |
| smtp_port | text | SMTP port (string; send null not "") |
| smtp_user | text | SMTP username / from address |
| smtp_password | text | SMTP password |
| smtp_from_name | text | Display name for outgoing email |
| trial_start | timestamptz | Set on first login; drives 7-day trial |
| is_licensed | boolean | Set true by PayFast webhook |
| payment_terms_days | integer | Days added to issue_date for due_date (default 7) |
| tutorial_completed | boolean | Suppresses auto-start after first run |

### `clients` — Client address book
| Column | Type | Purpose |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| name | text | Personal name (mirrors company_name) |
| company_name | text | Primary display name |
| email | text | |
| phone | text | |
| address | text | |
| website | text | |

### `items` — Reusable product/service catalog
| Column | Type | Purpose |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| name | text | Item name (autocomplete source) |
| description | text | Default description |
| unit_price | numeric | Default price |

### `invoices` — Invoice headers
| Column | Type | Purpose |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| invoice_number | text | e.g. "INV-0001" |
| client_id | uuid | FK → clients |
| issue_date | date | |
| due_date | date | |
| notes | text | Printed on PDF after payment reference |
| vat_enabled | boolean | |
| vat_rate | numeric | Always 15 when enabled |
| subtotal | numeric | Ex-VAT |
| vat_amount | numeric | |
| total | numeric | Inc-VAT |
| amount_paid | numeric | For partial payments |
| status | text | draft / sent / paid / overdue |
| from_recurring | boolean | Set when auto-created by recurring system |
| notification_dismissed | boolean | Controls amber banner visibility |
| sent_from_app | boolean | Set true when emailed via Send by Email |
| reminder_opted_in | boolean | Was previously used; now unused |
| reminder_sent_at | timestamptz | Was previously used; now unused |
| created_at | timestamptz | |

### `invoice_items` — Line items (no user_id column)
| Column | Type | Purpose |
|---|---|---|
| id | uuid | PK |
| invoice_id | uuid | FK → invoices |
| item_name | text | |
| description | text | |
| quantity | numeric | |
| unit_price | numeric | |
| line_total | numeric | quantity × unit_price |

### `estimates` — Estimate headers
| Column | Type | Purpose |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| estimate_number | text | e.g. "EST-0001" |
| client_id | uuid | FK → clients |
| issue_date | date | |
| expiry_date | date | |
| notes | text | |
| vat_enabled | boolean | |
| vat_rate | numeric | |
| subtotal, vat_amount, total | numeric | |
| status | text | draft / sent / approved / rejected / converted |
| created_at | timestamptz | |

### `estimate_items` — Estimate line items (no user_id column)
Same columns as `invoice_items` but FK → estimates.

### `expenses` — Business expense records
| Column | Type | Purpose |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| date | date | |
| description | text | |
| amount | numeric | |
| category | text | From expense_categories |
| notes | text | |
| created_at | timestamptz | |

### `recurring_invoices` — Recurring invoice schedules
| Column | Type | Purpose |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| client_id | uuid | FK → clients |
| interval | text | daily / weekly / monthly / yearly |
| next_send_date | date | Updated after each invoice is created |
| last_sent_date | date | When the last invoice was sent |
| is_active | boolean | Paused/resumed by user |
| items | jsonb | Line items array |
| vat_enabled | boolean | |
| notes | text | |
| email_subject | text | |
| email_message | text | |
| created_at | timestamptz | |

### `licenses` — License key records
| Column | Type | Purpose |
|---|---|---|
| id | uuid | PK |
| key | text | FNDBY-XXXX-XXXX-XXXX format |
| is_active | boolean | |
| user_id | uuid | Set on activation |
| activated_at | timestamptz | |

---

## Supabase Edge Functions

### `send-payment-reminders`
- **Location:** `supabase/functions/send-payment-reminders/index.ts`
- **Runtime:** Deno with `denomailer` for SMTP
- **Deploy:** `supabase functions deploy send-payment-reminders --no-verify-jwt`
- **Schedule:** Daily at 07:00 UTC (09:00 SAST) via pg_cron + pg_net
- **Status:** Deployed and scheduled, but the in-app reminder flow was changed to **manual** (bell icon). This edge function is now unused in the active user flow. It still exists and can be re-enabled.
- **Logic:** Queries overdue invoices with `reminder_opted_in = true`, checks `reminder_interval_days` since last send, emails via user's SMTP, updates `reminder_sent_at`.

---

## External Services & Files

### PayFast (payment processor)
- PHP page hosted at `https://api.fundibill.online/fundibill-buy.php`
- When user clicks "Buy FundiBill Lifetime Access — R99", `buildPayFastURL()` appends `user_id`, `email`, and `business_name` as URL params, then opens the URL in the system browser via `window.db.openExternal()`
- The PHP page handles PayFast form generation server-side
- On successful payment, a PayFast ITN webhook hits a PHP endpoint which sets `profiles.is_licensed = true` for the user's Supabase row
- `TrialBanner` polls `profiles.is_licensed` every 10 seconds for up to 10 minutes after the user clicks Buy, then reloads the app when confirmed
- **Do not touch:** `src/lib/payfast.js` URL or any PHP files

### `key-generator.html`
- Internal browser tool (not deployed) for generating FNDBY license keys
- Uses the same FNV-1a algorithm as `electron/license.js`
- Key format: `FNDBY-XXXX-XXXX-XXXX`

---

## Environment Variables

All in `.env` at project root (loaded by Vite as `import.meta.env`):

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key for client-side SDK |
| `VITE_PAYFAST_MERCHANT_ID` | PayFast merchant ID (referenced in PHP, may not be used client-side) |
| `VITE_PAYFAST_MERCHANT_KEY` | PayFast merchant key (same note) |

The Electron main process uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` via `Deno.env` inside edge functions only — these are NOT in the renderer `.env`.

---

## Features Built

1. **Authentication** — Email/password sign-up with confirmation email; sign-in; sign-out. Registration shows a 5-second countdown success screen before returning to login.
2. **Dashboard** — 6 stat cards (total invoiced, invoices issued, collected, overdue count, outstanding amount, estimates pending); monthly revenue/expenses bar chart; period filters; recent invoices table.
3. **Invoices** — Create, edit, delete; auto-number (max+1, skips existing, duplicate save blocked); PDF preview + download; send by email (SMTP); mark as sent/paid (with payment method selection); overdue auto-detection; status badges.
4. **Estimates** — Same as invoices; auto-number (same max+1 logic); convert to invoice (one click, auto-generates invoice number).
5. **Recurring Invoices** — Create schedule (daily/weekly/monthly/yearly); on save, immediately creates first invoice and advances `next_send_date`; pause/resume; notification banner when auto-invoice created; edit/delete.
6. **Clients** — Add/edit/delete; per-client invoice and estimate history panel.
7. **Items Catalog** — Add/edit/delete products/services. Items auto-saved when first used in an invoice or estimate; immediately available for autocomplete in same session via `refreshCatalog()`.
8. **Expenses** — Track business expenses; categories configurable in Settings.
9. **Settings** — Business profile, logo upload, branding colours (primary/accent/text), invoice/estimate prefixes, starting numbers, T&C, banking details, SMTP config, payment methods list, expense categories, payment terms days.
10. **PDF Generation** — Branded A4 documents via `@react-pdf/renderer`; fixed header/footer on every page; "Continues on page N" for multi-page; "Page X / Y" numbering; notes section; PAID watermark; dynamic header height based on content.
11. **Email (SMTP)** — Full HTML branded emails for invoices, estimates, reminders, and test emails; `nodemailer` in Electron main process; two IPC channels (`email:send` for test, `send-email` for full with PDF attachment).
12. **Trial System** — 7-day trial from `profiles.trial_start`; read-only after expiry; `TrialBanner` with Buy button.
13. **License System** — FNDBY key format; FNV-1a checksum; `LicenseModal` for entry; `licenses` table in Supabase; `is_licensed` on profile.
14. **Payment Reminders (manual)** — Amber bell 🔔 on overdue non-paid invoices in the list; clicking opens `ReminderModal` with pre-filled email; sends via SMTP; no automatic scheduling in current UI flow.
15. **Tutorial** — 12-step spotlight tutorial; auto-starts 2s after first login (`tutorial_completed` flag); restartable from sidebar; navigates to the correct page for each step.
16. **Help Buttons** — "?" popover on every page with page-specific bullet help content.
17. **Liquid Glass Sidebar** — Blue-to-green gradient (`#0891b2 → #0d9488 → #16a34a`); active NavLink uses frosted glass pill (`backdrop-filter: blur`); `primaryColor` from user's profile settings drives active state colour.
18. **AppDataContext (global cache)** — Loads `profile`, `clients`, `catalog` once on login; `refreshProfile()`, `refreshClients()`, `refreshCatalog()` called after writes; prevents spurious data reloads on Supabase token refresh.
19. **Auth Token Fix** — `AuthContext` compares user IDs before updating state, preventing token-refresh events from triggering page data reloads.
20. **Add Client in Invoice/Estimate** — Inline "Add New Client" modal; new client added to `extraClients` local state for immediate selection; `refreshClients()` updates global cache.
21. **Auto-complete Line Items** — Typing in item name field shows catalog suggestions; selecting pre-fills description and price.
22. **Invoice Status Auto-update** — When emailed via Send by Email, `status` is promoted from `draft` → `sent` and `sent_from_app = true` is set.

---

## Current App Flow

1. **Install:** User runs `FundiBill-Setup-{version}.exe` → installs to Program Files
2. **First launch:** Electron loads `dist/renderer/index.html`; React boots; Auth screen shows
3. **Sign up:** User registers → Supabase sends confirmation email → success screen shown → redirects to login after 5s
4. **Confirm email:** User clicks link in email → Supabase activates account
5. **Sign in:** User logs in → `AuthContext` sets stable `user` ref → `TrialProvider` checks/creates `trial_start` → `AppDataContext` loads profile + clients + catalog in one parallel fetch → Tutorial auto-starts after 2s if first login
6. **Daily use:**
   - Navigate via sidebar → correct page loads using cached data
   - Create invoice → number auto-generated (max+1, skips existing) → add client/items → save
   - Preview PDF → Send by Email → SMTP sends HTML email + PDF attachment
   - After email sent: invoice status → "sent"; amber banner appears if recurring
   - Overdue invoices show bell 🔔 → click → send manual reminder email
7. **Trial expiry:** After 7 days, `isReadOnly = true`; all write actions disabled; `TrialBanner` prompts purchase
8. **Purchase:** Click "Buy FundiBill Lifetime Access — R99" → PayFast page opens in browser → payment → webhook sets `is_licensed = true` → app polls and detects → reloads → full access

---

## License & Trial System

- **Trial:** `profiles.trial_start` set on first login. 7 days. After expiry: `isReadOnly = true` (all save/create/delete actions show "trial ended" tooltip or are disabled).
- **License key format:** `FNDBY-XXXX-XXXX-XXXX` — 5-char prefix + 3 × 4-char base-36 segments. SEG3 is a checksum: `toSeg(fnv1a32("FNDBY" + SEG1 + SEG2))`. Validated client-side in `LicenseModal` + stored in `licenses` table; `is_licensed` on profile is the source of truth for access.
- **PayFast flow:** PHP at `api.fundibill.online` handles merchant signature. ITN webhook sets `profiles.is_licensed = true`. `TrialBanner` polls every 10s for up to 10 minutes after Buy click.
- **Key generator:** `key-generator.html` — internal browser tool; not deployed; uses same algorithm as `electron/license.js`.

---

## Email System

### Two IPC channels (both use `nodemailer` in main process):

| Channel | Caller | Purpose |
|---|---|---|
| `email:send` (`window.db.email.send`) | Settings test email | Simple: smtp object + to/subject/text/html, optional attachment |
| `send-email` (`window.electronAPI.sendEmail`) | `SendEmailModal`, `ReminderModal` | Full: individual SMTP fields + optional pdfBuffer + fileName |

### Emails sent:
1. **Invoice email** — Branded HTML via `generateInvoiceEmail()`; PDF attached; sent from user's SMTP
2. **Estimate email** — `generateEstimateEmail()`; PDF attached
3. **Manual reminder** — `generateReminderEmail()`; no PDF; sent from `ReminderModal` in Invoices list
4. **Test email** — `generateTestEmail()`; no PDF; sent from Settings page

### HTML template (`emailTemplates.js`):
- `baseTemplate()` — outer chrome: coloured header → white body → FundiBill footer
- Footer: "Sent by **FundiBill** — SA Built Invoicing Software" + `fundibill.online` link (disclaimer line removed)
- All emails include `PLAIN_TEXT_FOOTER` as the plain-text fallback footer
- `primaryColor` from user's profile drives the header and accent colour

### SMTP config:
- Stored in `profiles` table (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `smtp_from_name`)
- `smtp_port` must be saved as `null` not empty string (integer column)
- TLS: `port === 465` → `secure: true`; otherwise `secure: false`
- `tls: { rejectUnauthorized: false }` — allows self-signed certs

---

## Recurring Invoices

- Managed in `recurring_invoices` table
- User creates a recurring invoice with: client, interval, first send date, line items, VAT, email subject/message
- **On first save:** the app immediately creates the first invoice (`invoices` table), inserts its line items (`invoice_items`), sets `from_recurring = true`, `notification_dismissed = false`, then updates `next_send_date` to the next occurrence (via `calcNextSendDate()`) and `last_sent_date` to the first send date
- **Amber notification banner:** `RecurringNotifContext` queries for `from_recurring = true, notification_dismissed = false, status = 'draft'` invoices and renders amber banners below the header. Clicking the banner text navigates to that invoice. Clicking × dismisses (sets `notification_dismissed = true`). Dismissed automatically when invoice is emailed.
- **Future invoices:** The `send-payment-reminders` edge function was originally the mechanism but has been replaced by manual flow. Future recurring invoice creation (for intervals beyond the first) requires a Supabase cron job or edge function triggered by pg_cron — **this has not been implemented for the ongoing schedule beyond the first invoice.**
- Pause/resume toggles `is_active`
- Edit pre-fills all form fields

---

## Payment Reminders

The automatic reminder system was removed. The current system is **manual**:

1. **Bell icon 🔔** (amber colour) appears in the Invoices list on any invoice where: `status !== 'paid' AND status !== 'draft' AND due_date < today`
2. Clicking the bell (with `e.stopPropagation()` so the row doesn't open the invoice) opens `ReminderModal`
3. `ReminderModal` pre-fills: To (client email), Subject ("Payment Reminder — Invoice X is Outstanding"), Message body (with invoice details)
4. All fields are editable before sending
5. Sends via `window.electronAPI.sendEmail` using user's SMTP — same channel as invoice send, no PDF attached
6. On success: shows "Reminder Sent" screen; `onReminderSent()` shows a toast "Reminder sent successfully."

The `reminder_opted_in` and `reminder_sent_at` columns still exist in `invoices` but are not actively used by the current UI.

---

## Known Issues & Notes

- **`invoice_items` has no `user_id` column** — RLS access is through the parent `invoices` row. Do not add `user_id` when inserting into `invoice_items`.
- **`estimate_items` has no `user_id` column** — same as above.
- **`profiles.terms` vs `terms_conditions`** — The Supabase column is named `terms` but the Settings form field is called `terms_conditions`. The `SUPABASE_COL` mapping handles this: `terms_conditions: 'terms'`.
- **`smtp_port` must be `null` not `""`** — The column is integer. The save handler explicitly converts empty strings to `null`.
- **PayFast URL** — `src/lib/payfast.js` points to `api.fundibill.online/fundibill-buy.php`. Do not change this URL.
- **Logo base64 data URLs** — Stripped by most email clients for security. Only `https://` logo URLs are used in emails; base64/local paths are filtered to empty string before generating email HTML.
- **`src/utils/pdf.js` (jsPDF)** — Legacy file, currently unused in the active flow. `PdfPreviewModal` and `PdfDocument` use `@react-pdf/renderer`. Do not delete — kept as reference.
- **Recurring invoice future scheduling** — Only the FIRST invoice is created by the frontend save flow. Subsequent invoices for monthly/weekly/etc. recurrence require a backend trigger (edge function + pg_cron) that has NOT been implemented yet.
- **`send-payment-reminders` edge function** — Exists in `supabase/functions/` and was deployed, but the in-app flow no longer triggers it. It remains as a reference/starting point.
- **Date input parsing** — `addDays()` and `calcNextSendDate()` guard against invalid/empty date strings with `isNaN(d.getTime())` checks, returning `''` instead of throwing.
- **AuthContext token refresh fix** — `onAuthStateChange` compares `prev?.id === incoming?.id` before updating user state. This prevents every Supabase token refresh (which fires ~hourly or on window focus) from creating a new `user` object reference and triggering all page data reloads.
- **PDF header height is computed dynamically** — `HEADER_H = 44 + max(leftColHeight, rightColHeight) + 29` based on logo presence and number of business detail lines. If content visually overlaps the header on edge cases, the fixed header's `backgroundColor: white` covers it.
- **Duplicate number prevention** — Both invoice and estimate `genNumber` functions use a `usedSet` to skip already-taken numbers. Both `handleSave` functions do a fresh Supabase query to check for duplicates before saving, showing an error if one is found.

---

## What Still Needs To Be Done

- **Recurring invoice scheduling for future invoices** — Currently only the first invoice is created. A Supabase cron job / edge function needs to query `recurring_invoices` where `is_active = true AND next_send_date <= today`, create the invoice + items, advance `next_send_date`, and trigger `RecurringNotifContext.refresh()`. The `send-payment-reminders` edge function is a template for this pattern.
- **Expenses reporting** — The Expenses page exists but there is no export or summary report.
- **Client portal / estimate approval** — Estimates can be sent by email but there is no web link for clients to approve/reject online.
- **Multi-currency support** — Currently ZAR only (R format).
- **Invoice PDF logo support for web URLs** — The logo needs to be a publicly accessible HTTPS URL to appear in emailed PDFs. If the user uploads via file picker (base64), it won't appear in emails.

---

## Key Rules for Claude

- Always use Supabase JS SDK for all data operations — never raw fetch/axios to Supabase REST
- Keep the Electron IPC structure intact — `window.electronAPI.sendEmail` and `window.db.*`
- ZAR currency format: `R 1 234,00` (space thousands, comma decimal)
- Do not modify CLAUDE.md unless explicitly asked
- Ask before restructuring folders or renaming files
- One prompt at a time; provide full copy-paste ready code blocks
- App name is **FundiBill** everywhere — never "Invoicy"
- `invoice_items` and `estimate_items` do NOT have a `user_id` column — never insert one
- `smtp_port` must be sent as `null` (not `""`) to avoid integer type errors
- `profiles.terms` is the DB column name for Terms & Conditions (not `terms_conditions`)
- When touching `addDays()` or date arithmetic, always guard against invalid dates with `isNaN(d.getTime())`
- `AppDataContext` provides `profile`, `clients`, `catalog`; call `refreshProfile/Clients/Catalog()` after any write that affects those collections
- Every page is read-only when `trialStatus.isReadOnly === true` — check `isReadOnly` before enabling write actions

---

## Current Task

<!-- Leave blank — filled in when starting a new session -->
