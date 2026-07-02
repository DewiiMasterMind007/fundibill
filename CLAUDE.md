# FundiBill — Project Briefing for Claude Code

**Current version:** 1.6.24 (read from `package.json`)  
**App name:** FundiBill (never "Invoicy")  
**Author:** FundiAI — info@fundiai.co.za

---

## 1. PROJECT OVERVIEW

FundiBill is a South African invoicing application for small businesses and freelancers. It ships as:

| Target | Artifact | URL |
|---|---|---|
| **PWA** | Vercel deployment | https://app.fundibill.online |
| **Desktop** | Windows `.exe` installer | Distributed via GitHub Releases |

Both targets share the same React/Vite codebase. The `ELECTRON=true` env variable at build time switches the Vite `base` from `/` to `./` for file-protocol loading.

**Business model:** Subscription billing via PayFast (monthly R29/mo or annual R299/yr). Legacy one-time lifetime licences (`FNDBY-*` key format) are still honoured. 7-day free trial on first login, read-only mode after expiry.

---

## 2. TECH STACK

| Layer | Technology |
|---|---|
| UI framework | React 18 + Vite 5 |
| Routing | react-router-dom 6 — HashRouter (required for Electron file:// and for PWA rewrite config) |
| Desktop shell | Electron 31 |
| Packaging | electron-builder 24 — NSIS `.exe`, x64, output: `FundiBill-Setup-{version}.exe` |
| Auto-update | electron-updater 6 via GitHub Releases (private repo, `GH_TOKEN` required at build time) |
| Backend / DB | Supabase JS SDK v2 — PostgreSQL, Auth, Edge Functions (Deno) |
| PDF | `@react-pdf/renderer` 4.5 — branded A4 documents; dynamically imported for chunk splitting |
| PDF polyfill | `buffer` npm package — polyfilled to `window.Buffer` in `src/main.jsx` before any import |
| Legacy PDF | `jsPDF` + `jspdf-autotable` — kept in `src/utils/pdf.js` as reference, unused in active flow |
| Charts | recharts 3 |
| Email — Electron | `nodemailer` 6 running in the Electron main process via IPC |
| Email — PWA | PHP SMTP relay at `https://api.fundibill.online/send-reminder.php` (POST, JSON) |
| WhatsApp | Web Share API (mobile PWA) / `wa.me` deep-link fallback (desktop / Electron) |
| Payments | PayFast — LIVE (not sandbox). PHP scripts at `api.fundibill.online` |
| PWA | vite-plugin-pwa 1.3 — `autoUpdate`, `skipWaiting: true`, `clientsClaim: true` |
| Versioning | `__APP_VERSION__` injected at build time from `package.json` via `vite.config.js` `define` |
| Version control | GitHub — `DewiiMasterMind007/fundibill` |

**Active branches:**
- `main` — production code, deployed to `app.fundibill.online` via Vercel
- `v2` — active development branch; Vercel preview URL. **Merge v2 → main to go live.**

---

## 3. DOMAINS & INFRASTRUCTURE

| Domain | Purpose | Hosting |
|---|---|---|
| `fundibill.online` | WordPress marketing/landing site | cPanel (IP: 169.239.218.68) |
| `app.fundibill.online` | PWA production app — CNAME → Vercel | Vercel |
| `api.fundibill.online` | PHP backend scripts | cPanel (IP: 169.239.218.68) |

**PHP scripts at `api.fundibill.online`:**
- `fundibill-buy.php` — generates PayFast payment form, accepts `plan`, `user_id`, `email`, `name` as URL params. Opened in browser via `window.db.openExternal()` (Electron) or `window.open()` (PWA).
- `payfast-webhook.php` — PayFast ITN webhook. On successful payment: sets `subscription_status = 'active'`, `subscription_plan`, `subscription_frequency`, `subscription_end_date`, and stores `payfast_token` (for later cancellation). Calculates end date from PayFast's `billing_date` field: `+1 month` for monthly, `+1 year` for annual.
- `send-reminder.php` — SMTP relay for PWA email sending. Accepts JSON POST, sends email via PHP mail/SMTP, returns `{ success, error }`.

**Supabase project ref:** `hczeuxhvnprhffsnktpf`  
**Auth emails:** Sent via Supabase custom SMTP from `noreply@fundibill.online`

---

## 4. SUPABASE SCHEMA

All tables have Row Level Security enabled. All PKs are UUIDs. Access policy: `auth.uid() = user_id`.

### `profiles` — One row per user, created automatically on first login

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | FK → auth.users (PK) |
| `name` | text | User's personal name |
| `business_name` | text | Shown on PDFs, emails, PayFast |
| `address` | text | Business address for PDFs |
| `email` | text | Business contact email |
| `phone` | text | Business phone |
| `vat_number` | text | VAT registration number |
| `logo_url` | text | HTTPS URL or base64 data URL for business logo |
| `primary_color` | text | Hex — drives PDF header, sidebar gradient accent, UI theming |
| `accent_color` | text | Hex — secondary colour |
| `text_color` | text | Hex |
| `invoice_prefix` | text | e.g. "INV-" |
| `estimate_prefix` | text | e.g. "QT-" (default; previously "EST-") |
| `starting_invoice_number` | integer | Next invoice sequence start |
| `starting_estimate_number` | integer | Next quote sequence start |
| `default_payment_terms` | text | Dropdown label (legacy) |
| `default_payment_method` | text | Pre-selected in Mark as Paid modal |
| `terms` | text | T&C printed on PDFs — **DB column is `terms`, form field is `terms_conditions`** |
| `banking_details` | text | JSON `{ bank_name, account_number, branch_code }` — older accounts may have free text |
| `payment_methods` | text | JSON array of method names |
| `expense_categories` | text | JSON array of category names |
| `email_provider` | text | `'smtp'` or `'gmail'` — Gmail is "coming soon" in the UI |
| `smtp_host` | text | SMTP server hostname |
| `smtp_port` | text | SMTP port string — **must be saved as `null` not `""` (integer column in DB)** |
| `smtp_user` | text | SMTP username / from address |
| `smtp_password` | text | SMTP password |
| `smtp_from_name` | text | Display name for outgoing emails |
| `whatsapp_default_message` | text | Template for invoice WhatsApp messages |
| `whatsapp_estimate_message` | text | Template for quote WhatsApp messages |
| `email_invoice_message` | text | Default body for invoice emails |
| `email_quote_message` | text | Default body for quote emails |
| `email_overdue_message` | text | Default body for overdue reminder emails |
| `payment_terms_days` | integer | Days added to issue_date for due_date (default 7) |
| `discounts_enabled` | boolean | Enables discount field on invoices and quotes |
| `discount_type` | text | `'percent'` or `'fixed'` |
| `trial_start` | timestamptz | Set on first login; drives 7-day trial countdown |
| `is_licensed` | boolean | **Legacy** — honoured only when no `subscription_status` exists (one-time licence holders) |
| `tutorial_completed` | boolean | Suppresses auto-start after first login |
| `subscription_status` | text | `'active'` \| `'cancelled'` \| `'expired'` — written by PayFast webhook |
| `subscription_plan` | text | `'monthly'` \| `'annual'` \| `'lifetime'` — written by PayFast webhook |
| `subscription_frequency` | text | PayFast billing frequency |
| `subscription_end_date` | timestamptz | When access lapses — written by PayFast webhook from `billing_date` |
| `subscription_cancelled_at` | timestamptz | Written by `cancel-subscription` edge function |
| `payfast_token` | text | PayFast subscription token — used by `cancel-subscription` edge function to call PayFast API |
| `reminders_enabled` | boolean | Used by `send-payment-reminders` edge function (legacy auto-reminder system) |
| `reminder_interval_days` | integer | Used by `send-payment-reminders` edge function (legacy) |
| `gmail_access_token` | text | Gmail OAuth access token — v2 Gmail OAuth feature |
| `gmail_refresh_token` | text | Gmail OAuth refresh token — v2 Gmail OAuth feature |
| `gmail_token_expiry` | timestamptz | Expiry of `gmail_access_token` — v2 Gmail OAuth feature |
| `gmail_connected_email` | text | Gmail address connected via OAuth — v2 Gmail OAuth feature |

### `clients` — Client address book

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `name` | text | Personal name (mirrors company_name in some places) |
| `company_name` | text | Primary display name |
| `email` | text | |
| `phone` | text | |
| `address` | text | |
| `website` | text | |

### `items` — Product/service catalog

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `name` | text | Item name (autocomplete source in invoice/quote forms) |
| `description` | text | Default description |
| `unit_price` | numeric | Default price |

### `invoices` — Invoice headers

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `invoice_number` | text | e.g. "INV-0001" — auto-generated, collision-checked before save |
| `client_id` | uuid | FK → clients |
| `issue_date` | date | |
| `due_date` | date | |
| `notes` | text | Printed after payment reference on PDF |
| `vat_enabled` | boolean | |
| `vat_rate` | numeric | Always 15 when enabled |
| `subtotal` | numeric | Ex-VAT (after discount) |
| `vat_amount` | numeric | |
| `total` | numeric | Inc-VAT (after discount) |
| `amount_paid` | numeric | For partial payments |
| `discount_value` | numeric | Discount amount or percentage |
| `discount_type` | text | `'percent'` or `'fixed'` |
| `status` | text | `draft` \| `sent` \| `paid` \| `overdue` |
| `from_recurring` | boolean | Set when auto-created by recurring invoice system |
| `notification_dismissed` | boolean | Controls amber recurring-invoice banner visibility |
| `sent_from_app` | boolean | Set true when emailed via Send by Email |
| `reminder_opted_in` | boolean | Legacy — used by `send-payment-reminders` edge function |
| `reminder_sent_at` | timestamptz | Legacy — updated by edge function |
| `created_at` | timestamptz | |

### `invoice_items` — Invoice line items

> ⚠️ **No `user_id` column.** RLS access is via the parent `invoices` row. Never insert `user_id` here.

| Column | Type |
|---|---|
| `id` | uuid |
| `invoice_id` | uuid (FK → invoices) |
| `item_name` | text |
| `description` | text |
| `quantity` | numeric |
| `unit_price` | numeric |
| `line_total` | numeric (quantity × unit_price) |

### `estimates` — Quote/estimate headers

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `estimate_number` | text | e.g. "QT-0001" |
| `client_id` | uuid | FK → clients |
| `issue_date` | date | |
| `expiry_date` | date | |
| `notes` | text | |
| `vat_enabled` | boolean | |
| `vat_rate` | numeric | |
| `subtotal` | numeric | |
| `vat_amount` | numeric | |
| `total` | numeric | |
| `discount_value` | numeric | |
| `discount_type` | text | `'percent'` or `'fixed'` |
| `status` | text | `draft` \| `sent` \| `approved` \| `rejected` \| `converted` |
| `converted_invoice_id` | uuid | FK → invoices — set when quote is converted to invoice |
| `created_at` | timestamptz | |

### `estimate_items` — Quote line items

> ⚠️ **No `user_id` column.** Same pattern as `invoice_items`. Never insert `user_id` here.

Identical columns to `invoice_items` but with `estimate_id` instead of `invoice_id`.

### `expenses` — Business expense records

| Column | Type |
|---|---|
| `id` | uuid |
| `user_id` | uuid |
| `date` | date |
| `description` | text |
| `amount` | numeric |
| `category` | text |
| `notes` | text |
| `created_at` | timestamptz |

### `recurring_invoices` — Recurring invoice schedules

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | |
| `client_id` | uuid | |
| `interval` | text | `daily` \| `weekly` \| `monthly` \| `yearly` |
| `next_send_date` | date | Advanced after each invoice creation |
| `last_sent_date` | date | Date of most recent created invoice |
| `is_active` | boolean | Paused / resumed by user |
| `items` | jsonb | Array of line items |
| `vat_enabled` | boolean | |
| `notes` | text | |
| `email_subject` | text | |
| `email_message` | text | |
| `created_at` | timestamptz | |

### `licenses` — Legacy one-time licence key records

| Column | Type |
|---|---|
| `id` | uuid |
| `key` | text (`FNDBY-XXXX-XXXX-XXXX`) |
| `is_active` | boolean |
| `user_id` | uuid |
| `activated_at` | timestamptz |

---

## 5. PROJECT STRUCTURE

```
/
├── electron/
│   ├── main.js           — BrowserWindow, IPC handlers (pdf:save, pdf:getLogoBase64,
│   │                        email:send, send-email, shell:openExternal), electron-updater
│   ├── preload.js        — contextBridge exposing window.electronAPI + window.db
│   ├── license.js        — FNDBY key algorithm (FNV-1a checksum, validate/generate)
│   └── database.js       — Legacy SQLite (unused; kept for reference)
│
├── src/
│   ├── main.jsx          — React entry point; Buffer polyfill; controllerchange listener;
│   │                        vite:preloadError handler; mounts <AuthProvider><App/>
│   ├── index.css         — Minimal global reset
│   ├── App.jsx           — Auth gate, context providers, Tutorial, mobile/desktop layouts,
│   │                        RecurringBanners, CSS custom properties injection
│   │
│   ├── context/
│   │   ├── AuthContext.jsx         — Supabase auth; password-recovery interception;
│   │   │                             token-refresh dedup (stable user ref);
│   │   │                             currentProfile (subscription columns);
│   │   │                             isSubscriptionActive() helper
│   │   ├── AppDataContext.jsx      — Global cache: profile, clients, catalog;
│   │   │                             loaded once on login; refresh*() helpers
│   │   ├── TrialContext.jsx        — Trial/subscription status; isReadOnly flag;
│   │   │                             auto-corrects stale 'active' when end_date passed
│   │   └── RecurringNotifContext.jsx — Amber banner notifications for auto-created
│   │                                   recurring invoices
│   │
│   ├── pages/
│   │   ├── Auth.jsx        — Login / Register / Forgot Password / Set New Password
│   │   │                     (password recovery form shown when recoveryMode = true)
│   │   ├── Dashboard.jsx   — Stat cards, monthly revenue/expense chart, period filters,
│   │   │                     payments-by-method breakdown, expenses-by-category,
│   │   │                     personalised two-line daily greeting
│   │   ├── Invoices.jsx    — Full invoice CRUD, recurring invoices tab, mark as paid
│   │   │                     with payment confirmation email option, manual reminder bell,
│   │   │                     WhatsApp share, overdue auto-detection, quickCreate state
│   │   ├── Estimates.jsx   — Quote CRUD, convert to invoice (populates converted_invoice_id),
│   │   │                     view converted invoice number, WhatsApp share, quickCreate state
│   │   ├── Clients.jsx     — Client management, per-client invoice/quote history panel,
│   │   │                     quickCreate state
│   │   ├── Items.jsx       — Product/service catalog CRUD
│   │   ├── Expenses.jsx    — Expense tracking with categories, quickCreate state
│   │   └── Settings.jsx    — Business profile, logo upload, colour theme, invoice/quote
│   │                         prefixes, banking details, SMTP config, Gmail toggle (coming soon),
│   │                         Notifications & Messages templates, Document Settings,
│   │                         subscription management, unsaved-changes detection
│   │
│   ├── components/
│   │   ├── Sidebar.jsx          — Liquid-glass gradient sidebar (desktop), dynamic version
│   │   ├── BottomNav.jsx        — Mobile bottom tab bar + slide-up More drawer,
│   │   │                           dynamic version, Tutorial link
│   │   ├── MobileHeader.jsx     — Sticky mobile header; page title or FundiBill wordmark;
│   │   │                           business logo (falls back to initial avatar);
│   │   │                           "+ Create" quick-create button → slide-up bottom sheet
│   │   ├── TrialBanner.jsx      — Trial/subscription expiry banner; plan selector trigger;
│   │   │                           PayFast URL builder; 10-second polling for payment confirm
│   │   ├── PlanSelectModal.jsx  — Plan picker (Monthly R29/mo, Annual R299/yr)
│   │   ├── LicenseModal.jsx     — Legacy FNDBY key entry (for lifetime licence holders)
│   │   ├── HelpButton.jsx       — "?" popover with page-specific help bullets
│   │   ├── SendEmailModal.jsx   — Compose and send invoice/quote emails via SMTP or PWA relay
│   │   ├── Tutorial.jsx         — 12-step click-through tutorial with spotlight overlay
│   │   ├── UpdateNotification.jsx — Electron auto-update banner (update-available / ready)
│   │   ├── WhatsAppButton.jsx   — WhatsApp share button (icon-only or full)
│   │   └── PasswordInput.jsx    — Password field with show/hide toggle
│   │
│   ├── pdf/
│   │   ├── PdfDocument.jsx     — @react-pdf/renderer branded A4 document; dynamic header
│   │   │                          height; fixed header+footer every page; PAID watermark;
│   │   │                          discount row in totals
│   │   └── PdfPreviewModal.jsx — In-app PDF preview; Save to disk; Send Email trigger
│   │
│   ├── lib/
│   │   ├── supabase.js         — Supabase client (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
│   │   ├── auth.js             — Thin wrappers: signIn, signUp, signOut, getSession,
│   │   │                          onAuthStateChange
│   │   ├── sendEmail.js        — Unified email sender: routes to window.electronAPI.sendEmail
│   │   │                          (Electron) or fetch to send-reminder.php (PWA)
│   │   ├── emailTemplates.js   — generateInvoiceEmail, generateEstimateEmail,
│   │   │                          generateReminderEmail, generatePaymentConfirmationEmail,
│   │   │                          generateTestEmail, PLAIN_TEXT_FOOTER
│   │   ├── pdfBuffer.js        — buildPdfBuffer(data, settings, docType) — dynamically
│   │   │                          imports PdfDocument, returns ArrayBuffer
│   │   └── whatsapp.js         — formatPhoneForWhatsApp, buildInvoiceWhatsAppMessage,
│   │                              buildEstimateWhatsAppMessage, sendPdfViaWhatsApp
│   │
│   ├── hooks/
│   │   └── useIsMobile.js      — Returns true when viewport ≤ 768px
│   │
│   └── utils/
│       └── pdf.js              — Legacy jsPDF builder (unused in active flow, kept for reference)
│
├── supabase/
│   └── functions/
│       ├── cancel-subscription/index.ts  — Deno edge function; called from Settings page;
│       │                                    calls PayFast API to cancel subscription token,
│       │                                    then sets subscription_status = 'cancelled' in DB
│       └── send-payment-reminders/       — Deno edge function (deployed, scheduled daily
│                                           at 07:00 UTC via pg_cron + pg_net); auto-sends
│                                           reminder emails for opted-in overdue invoices.
│                                           Currently superseded by manual bell flow but
│                                           still deployed.
│
├── assets/icon.ico             — App icon for Electron installer / taskbar
├── public/
│   ├── FundiBill long.png      — Wide wordmark (sidebar + login)
│   ├── icon-192.png            — PWA icon
│   ├── icon-512.png            — PWA icon
│   ├── trust-strip.png         — PayFast trust badge (shown in PlanSelectModal)
│   └── whatsapp icon.png       — WhatsApp button icon
│
├── key-generator.html          — Internal browser tool for generating FNDBY licence keys
│                                  (not deployed; uses same FNV-1a algo as electron/license.js)
├── vercel.json                 — SPA rewrite rule + CSP headers; outputDirectory: dist/renderer
├── electron-builder.yml        — Windows NSIS installer config; GitHub Releases publish
├── vite.config.js              — base: './' (Electron) or '/' (PWA); PWA plugin; Buffer alias;
│                                  __APP_VERSION__ define; outDir: dist/renderer
└── package.json                — Scripts: dev, build, build:electron, build:win, dist,
                                  release:patch, release:minor, release:major
```

---

## 6. FULL FEATURE LIST

### Authentication
- Email/password sign-up with Supabase confirmation email
- Sign-in / sign-out
- Registration shows 5-second countdown success screen before returning to login
- **Password reset flow:** When user clicks reset link, Supabase fires `PASSWORD_RECOVERY` event. `AuthContext` intercepts before auto-login, sets `recoveryMode = true` (+ ref for stale-closure safety). Auth.jsx shows "Set New Password" form. On submit, calls `supabase.auth.updateUser({ password })`, then signs out. `clearRecoveryMode()` returns to login.

### Dashboard
- 6 stat cards: Total Invoiced, Invoices Issued, Collected, Overdue Count, Outstanding Amount, Pending Quotes
- Period filter pills: Last 7 Days / 30 Days / 3 Months / This Year / Custom Range
- Monthly revenue vs. expenses bar chart with 5 period options
- Payments by method breakdown (horizontal bar chart)
- Expenses by category breakdown
- Recent invoices table with status badges
- Personalised two-line daily greeting: bold title line + subtitle (different for each day of the week)

### Invoices
- Create, edit, delete
- Auto-number: max existing number + 1, skips already-used numbers, duplicate check before save
- VAT toggle (15%), VAT-inclusive pricing model: `grossTotal = Σ(qty × price)`, `subtotal = grossTotal / 1.15`
- Discount: optional % or fixed-R discount on gross total (enabled via Document Settings)
- Status: draft → sent → paid / overdue. Overdue auto-detected on load if `due_date < today && status !== 'paid'`
- **Status revert on save:** If status is 'overdue' but due_date is now ≥ today, reverts to 'sent' on save
- PDF preview and download
- Send by Email: advances status from draft → sent, sets `sent_from_app = true`
- Mark as Paid: opens modal with payment method selector and optional payment confirmation email
- Undo mark-as-paid: reverts to previous status
- Manual payment reminder: amber bell 🔔 on overdue non-paid invoices; opens ReminderModal with pre-filled email
- WhatsApp share: Web Share API (mobile) or `wa.me` deep-link (desktop)
- Add new client inline (without leaving the form)
- Item autocomplete from catalog
- Recurring invoices: schedule (daily/weekly/monthly/yearly), immediate first invoice creation, `next_send_date` advancement, pause/resume, edit, amber notification banner on auto-creation
- **Quick-create:** Navigating with `location.state.quickCreate = true` auto-opens new invoice form

### Quotes (Estimates)
- Same CRUD and numbering as Invoices (prefix: QT- by default)
- Convert to Invoice: creates invoice, sets `estimates.converted_invoice_id`
- View converted invoice number (fetched via `converted_invoice_id`) as a clickable link
- Send by Email, WhatsApp share
- Undo approve/reject
- **Quick-create:** Same `quickCreate` state pattern

### Clients
- Add, edit, delete
- Per-client history panel: all invoices and quotes for that client
- Inline add-client in invoice/quote form
- **Quick-create:** `quickCreate` state auto-opens the add-client panel

### Items (Catalog)
- Add, edit, delete products/services
- Items auto-saved when first used in invoice/quote
- Available immediately for autocomplete in same session via `refreshCatalog()`

### Expenses
- Add, edit, delete expenses with date, description, amount, category, notes
- Categories configurable in Settings
- **Quick-create:** `quickCreate` state auto-opens the add-expense panel

### PDF Generation
- Branded A4 documents via `@react-pdf/renderer` (dynamically imported)
- Fixed header + footer on every page
- "Continues on page N" for multi-page
- "Page X / Y" numbering
- PAID watermark on paid invoices
- Dynamic header height based on logo presence and business detail lines
- Discount row in totals section
- Notes section
- Logo: only HTTPS URLs render in PDFs (base64/local paths blocked by email clients)

### Email Sending
- **Electron:** `nodemailer` in main process via IPC channels:
  - `email:send` (`window.db.email.send`) — test emails from Settings
  - `send-email` (`window.electronAPI.sendEmail`) — all other emails (invoices, quotes, reminders, payment confirmation)
- **PWA:** `sendEmail.js` POSTs JSON to `https://api.fundibill.online/send-reminder.php`
- Email types: Invoice, Quote, Manual Reminder, Payment Confirmation, Test
- All use branded HTML via `emailTemplates.js` (`baseTemplate` outer chrome)
- SMTP: `port === 465` → `secure: true`; otherwise STARTTLS. `tls.rejectUnauthorized: false`
- `smtp_port` **must be `null`, not `""`** (integer DB column)

### WhatsApp Sharing
- Template variables: `{clientName}`, `{invoiceNumber}` / `{estimateNumber}`, `{amount}`, `{dueDate}` / `{expiryDate}`, `{businessName}`
- Templates configurable in Settings → Notifications & Messages
- Mobile PWA: Web Share API attaches PDF as file
- Desktop / Electron: downloads PDF, opens WhatsApp Web `wa.me` link

### PayFast Subscription Billing
- Plan picker: Monthly (R29/mo) or Annual (R299/yr)
- `buildPayFastURL()` in `TrialBanner.jsx` opens `api.fundibill.online/fundibill-buy.php?plan=...&user_id=...&email=...&name=...`
- Banner polls `profiles.subscription_status` every 10 seconds for up to 10 minutes after Buy click
- On confirm: `refreshSubscription()` → TrialContext re-computes → reloads app
- Subscription cancellation: Settings page calls `supabase.functions.invoke('cancel-subscription')` → edge function calls PayFast API + updates DB

### Trial / Subscription System
- 7-day free trial from `profiles.trial_start` (set on first login)
- `TrialContext` computes: `subscriptionActive`, `isReadOnly`, `daysRemaining`, `trialExpired`, `subscriptionExpired`
- `isReadOnly = true` when trial expired AND no active subscription
- Access logic in `AuthContext.isSubscriptionActive()`:
  1. `subscription_plan === 'lifetime'` → always active
  2. `subscription_status` in `['active', 'cancelled']` + `subscription_end_date > now` → active
  3. `is_licensed === true` && no `subscription_status` → active (legacy one-time licences)

### Legacy Licence Keys (FNDBY)
- Format: `FNDBY-SEG1-SEG2-SEG3` — 5-char prefix + 3 × 4-char base-36 segments
- SEG3 = `toSeg(fnv1a32("FNDBY" + SEG1 + SEG2))` — checksum
- `LicenseModal.jsx` handles key entry (still shown for licence-only users if `is_licensed` is their access path)
- `key-generator.html` — internal tool for generating keys (not deployed)

### Settings
- **Business Profile:** name, business name, address, email, phone, VAT number
- **Branding:** logo upload, primary/accent/text colours, invoice/quote prefixes, starting numbers
- **Banking Details:** bank name, account number, branch code (stored as JSON in `banking_details`)
- **Payment Terms:** days until due date; payment methods list
- **Terms & Conditions:** printed on PDFs (`profiles.terms` column, mapped from `terms_conditions` form key)
- **Notifications & Messages:** WhatsApp templates (Invoice, Quote, Overdue) + Email default messages
- **Document Settings:** discounts toggle (% or R), expense categories
- **Email Settings:** Gmail tab (Connect/Disconnect OAuth flow — see Section 7) / Custom SMTP tab. Gmail→SMTP revert restores saved SMTP values via `savedSmtp` ref.
- **Subscription:** current plan display, cancel subscription button
- Unsaved-changes detection: warns on browser close and intercepts in-app navigation

### Tutorial / Onboarding
- 12-step spotlight tutorial with spotlight overlay
- Auto-starts 2 seconds after first login (`tutorial_completed = false`)
- Restartable from sidebar (desktop) / More drawer (mobile)
- Navigates to the correct page for each step
- Per-step mobile/desktop description variants

### Help Buttons
- "?" popover on every page with page-specific bullet points
- HelpButton component, instances in each page

### Dynamic Theming
- `primaryColor` and `accentColor` from `AppDataContext` (from `profiles`)
- Injected as CSS custom properties `--primary` and `--accent` via `<style>` in `App.jsx`
- Sidebar gradient: `#0891b2 → #0d9488 → #16a34a` (fixed); active nav pill uses `primaryColor`
- Mobile header: same gradient

### Mobile Responsive Layout
- `useIsMobile()` hook: breakpoint ≤ 768px
- Mobile: `MobileHeader` (sticky top) + scrollable `<main>` + `BottomNav` (fixed bottom)
- Desktop: `Sidebar` (240px fixed left) + scrollable `<main>`
- Mobile header right side: business logo (or initial avatar) + "+ Create" quick-create button
- "+ Create" opens bottom sheet with Invoice, Quote, Client, Expense options → navigates with `state: { quickCreate: true }` → target page auto-opens creation form
- Dashboard shows personalised greeting on mobile (above filter pills)

### Electron Auto-Update
- `electron-updater` via GitHub Releases (private repo)
- `autoUpdater.autoDownload = true`, `autoUpdater.autoInstallOnAppQuit = true`
- IPC: `update-available` → `UpdateNotification` shows download banner; `update-downloaded` → "Restart Now" button
- `window.electronAPI.installUpdate()` calls `autoUpdater.quitAndInstall()`

### PWA Auto-Update
- `registerType: 'autoUpdate'`, `skipWaiting: true`, `clientsClaim: true` in workbox config
- `controllerchange` listener in `main.jsx` reloads the page when new SW takes control
- `vite:preloadError` handler reloads once if a chunk 404s after a new deploy

### App Versioning
- `__APP_VERSION__` build-time constant injected from `package.json` via `vite.config.js` `define`
- Displayed in Sidebar footer (desktop) and BottomNav More drawer (mobile)
- Release scripts: `npm run release:patch/minor/major` — bumps version, tags, pushes to `main` with follow-tags

---

## 7. EMAIL PROVIDER SYSTEM

### Current State
- `profiles.email_provider` column: `'smtp'` (active) or `'gmail'` (OAuth UI built, actual Gmail-API sending not yet wired — see below)
- Settings → Email Settings → Gmail tab now shows a real **Connect Gmail** / **Connected: {email}** flow (see UI flow below) instead of the old "coming soon" notice and read-only SMTP/App-Password fields — that legacy UI has been removed from `Settings.jsx`
- The SMTP fields (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `smtp_from_name`) are only shown/editable under the **Custom SMTP** tab now

### Gmail OAuth — In progress (v2 branch)

**Google Cloud Console project:** FundiBill  
**OAuth Client ID:** `475513706412-9lhbtur6spj97n9lrt5mejhae421fsc9.apps.googleusercontent.com`  
**Client Secret:** Stored in Vercel environment variable `GMAIL_CLIENT_SECRET` — **never in code**  
**Scope:** `https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email` — the `userinfo.email` scope is required because `gmail.send` alone does not grant access to the profile/userinfo endpoint used to fetch the connected address  
**App status:** Testing mode — max 100 users, manual whitelist via Google Cloud Console

**Architecture chosen:** Vercel Serverless API Routes (files in `/api/` directory)
- `/api/gmail-auth.js` — **built.** Accepts `?user_id=`, builds the Google OAuth consent URL (client_id, redirect_uri, scope, access_type=offline, prompt=consent, state=user_id), 302-redirects the browser to it.
- `/api/gmail-callback.js` — **built.** Google redirects here with `?code=&state=`. Exchanges the code for tokens at `https://oauth2.googleapis.com/token`, fetches the connected address from `https://www.googleapis.com/oauth2/v2/userinfo` (`response.email`), writes `gmail_access_token`, `gmail_refresh_token`, `gmail_token_expiry`, `gmail_connected_email`, and `email_provider = 'gmail'` onto the `profiles` row (via `SUPABASE_SERVICE_ROLE_KEY`, bypassing RLS), then 302-redirects to `{VITE_APP_URL}/#/settings?gmail=connected` (or `...?gmail=error` on failure). **Note:** the redirect must include the `#/` HashRouter prefix — a plain `/settings?...` path is invisible to react-router under `HashRouter` and the SPA falls back to its default route instead of landing on Settings. OAuth scope is `gmail.send` + `userinfo.email` (see below).
- `/api/send-gmail.js` — **not yet built.** Will send email via Gmail API using stored tokens; handles token refresh.

**Token storage:** Per user in Supabase `profiles` table — columns added (see Section 4):
- `gmail_access_token` (text)
- `gmail_refresh_token` (text)
- `gmail_token_expiry` (timestamptz)
- `gmail_connected_email` (text)

**New env vars required by the API routes (not yet set anywhere — see Section 11):**
- `GMAIL_CLIENT_ID`
- `GMAIL_REDIRECT_URI` (should point at `/api/gmail-callback`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_APP_URL`

**UI flow — built in `src/pages/Settings.jsx` (Email Settings → Gmail tab):**
1. **Not connected (State A):** "Connect Gmail" button + helper text "Send invoices and estimates directly from your Gmail address". Click → `supabase.auth.getUser()` → `window.location.href = '/api/gmail-auth?user_id=<id>'` (full-page redirect, leaves the app)
2. Google's consent screen → redirects to `/api/gmail-callback?code=...&state=<id>` → tokens exchanged and stored → redirects back to `/#/settings?gmail=connected` (or `?gmail=error`)
3. On mount, Settings reads `?gmail=` from the URL (`useLocation().search`, works under HashRouter): on `connected` it re-fetches `email_provider`/`gmail_connected_email`, updates local state + calls `refreshProfile()` (`AppDataContext`) so other pages see the change, shows a success toast, and strips the query param via `window.history.replaceState`; on `error` it shows an error toast and strips the param the same way
4. **Connected (State B):** green dot + "Connected: {gmail_connected_email}", with a "Disconnect" text link below. The provider toggle buttons at the top of the tab reflect `form.email_provider === 'gmail'` automatically
5. **Disconnect:** `window.confirm(...)` → nulls `gmail_access_token`/`gmail_refresh_token`/`gmail_token_expiry`/`gmail_connected_email` and sets `email_provider = 'smtp'` directly via Supabase (not gated behind the page's Save button) → `refreshProfile()` → success toast "Gmail disconnected"
6. Subsequent sends should route through `/api/send-gmail.js` instead of SMTP — **not yet built** (Phase 4)

**Email-send guard — built in `src/lib/sendEmail.js` (`checkGmailProviderReady`):**
- Exported helper checks: if `emailProvider === 'gmail'` and (`gmailAccessToken` is missing OR `gmailTokenExpiry` is missing/invalid/in the past) → blocks the send and returns `{ ok: false, error: 'Your Gmail connection has expired. Please reconnect Gmail in Settings.' }`
- `sendEmail()` runs this check first and returns `{ success: false, error }` without attempting Electron IPC or the `send-reminder.php` relay — it does **not** silently fall back to SMTP
- Wired into every send path that has a `profiles` row in scope: `SendEmailModal.jsx`, and in `Invoices.jsx` the reminder modal (`ReminderModal`) and both mark-as-paid payment-confirmation flows (detail view + list view) — each now passes `emailProvider`/`gmailAccessToken`/`gmailTokenExpiry` from `settings` (the `AppDataContext` profile) into the `sendEmail()` payload
- Real Gmail-API sending via `/api/send-gmail.js` is still **not implemented** — a valid, non-expired Gmail connection currently still falls through to the old SMTP/relay code path with empty SMTP credentials until Phase 4 wires up the actual Gmail send

---

## 8. SUPABASE EDGE FUNCTIONS

### `cancel-subscription`
- **Location:** `supabase/functions/cancel-subscription/index.ts`
- **Called by:** Settings page → `supabase.functions.invoke('cancel-subscription', { body: {} })`
- **What it does:**
  1. Authenticates the calling user via Bearer token
  2. Fetches `payfast_token` from `profiles`
  3. Calls `PUT https://api.payfast.co.za/subscriptions/{token}/cancel` with HMAC signature
  4. Updates `profiles` to `subscription_status = 'cancelled'`, sets `subscription_cancelled_at`
- **Known issue:** PayFast API call may return success but dashboard still shows Active subscription. DB is updated correctly. Manual cancellation in PayFast merchant dashboard used as stopgap.

### `send-payment-reminders`
- **Location:** `supabase/functions/send-payment-reminders/index.ts`
- **Status:** Deployed and scheduled daily at 07:00 UTC (09:00 SAST) via pg_cron + pg_net
- **What it does:** Auto-sends reminder emails for `reminder_opted_in = true` overdue invoices using user's SMTP settings. Respects `reminder_interval_days` since last send.
- **Current relevance:** Superseded in the main UI by the manual bell 🔔 flow. Still deployed and running. Can be re-enabled or removed.

---

## 9. KNOWN ISSUES

1. **PayFast subscription cancellation API:** The `cancel-subscription` edge function updates the DB correctly but PayFast's own dashboard may still show the subscription as Active. Workaround: manual cancellation in PayFast merchant account.

2. **Recurring invoice future scheduling:** Only the FIRST invoice is created by the frontend save flow. Subsequent invoices for ongoing schedules (monthly/weekly/etc.) require a Supabase cron job or edge function. The `send-payment-reminders` function is a template for this pattern — not yet implemented.

3. **Gmail OAuth:** Connect/Disconnect UI, callback handling, and DB schema are built on `v2` (see Section 7). Actual Gmail-API sending (`/api/send-gmail.js`) is not yet implemented — a connected, non-expired Gmail account still falls through to the old SMTP/relay path with empty credentials until that's wired up.

4. **Blank name fields in PayFast emails:** `fundibill-buy.php` sends `name_first` / `name_last` to PayFast but they appear blank in confirmation emails. Under investigation.

5. **Logo in emails:** base64 data-URL logos are stripped by Gmail, Outlook, and most clients for security. Only HTTPS logo URLs appear in emails. Users who upload via file picker get base64 which won't show in emailed PDFs — only in the in-app preview.

6. **`send-payment-reminders` edge function:** Deployed and scheduled but not used by active UI flow. It could send unexpected reminder emails if a user had `reminder_opted_in = true` on old invoices. Review before leaving deployed indefinitely.

7. **Discount columns — pending DB migration:** The following SQL must be run in Supabase before discount features are fully functional on new/migrated databases:
   ```sql
   ALTER TABLE profiles  ADD COLUMN IF NOT EXISTS discounts_enabled boolean DEFAULT false;
   ALTER TABLE profiles  ADD COLUMN IF NOT EXISTS discount_type      text    DEFAULT 'percent';
   ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS discount_value     numeric DEFAULT 0;
   ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS discount_type      text;
   ALTER TABLE estimates ADD COLUMN IF NOT EXISTS discount_value     numeric DEFAULT 0;
   ALTER TABLE estimates ADD COLUMN IF NOT EXISTS discount_type      text;
   ```

---

## 10. CODING RULES & PATTERNS

### Data Access
- **Always use Supabase JS SDK** for all data operations — never raw `fetch` to Supabase REST endpoints
- RLS is on for all tables — all queries are scoped to `auth.uid()` automatically
- `AppDataContext` provides `profile`, `clients`, `catalog`; call `refreshProfile/Clients/Catalog()` after any write that affects those collections
- Every page is read-only when `trialStatus?.isReadOnly === true` — check before enabling write actions

### Critical Schema Rules
- `invoice_items` and `estimate_items` do **NOT** have a `user_id` column — never insert one
- `smtp_port` must be sent as `null` (not `""`) to Supabase — the DB column is integer
- `profiles.terms` is the DB column name for Terms & Conditions (form field is `terms_conditions`)
- `banking_details` is stored as a JSON string `{ bank_name, account_number, branch_code }` — parse/stringify correctly

### Currency & Formatting
- ZAR format throughout: `R 1 234,00` (space thousands separator, comma decimal)

### Email
- HTTPS logo URLs only in email HTML — filter out `data:` and local paths before generating templates
- Use `PLAIN_TEXT_FOOTER` from `emailTemplates.js` as plain-text fallback footer

### Date Arithmetic
- Always guard against invalid dates with `isNaN(d.getTime())` when using `addDays()` or `calcNextSendDate()`
- Date inputs may arrive as empty strings — handle gracefully

### Routing & State
- HashRouter is required — all routes use `#/path` format
- Quick-create navigation: `navigate('/invoices', { state: { quickCreate: true } })`. Clear state with `window.history.replaceState({}, '')` after handling
- `location.state?.openId` is used by RecurringBanners to open a specific invoice

### Auth
- `AuthContext` compares user IDs (`prev?.id === incoming?.id`) before updating state — prevents Supabase token refresh events from triggering page data reloads
- `recoveryModeRef` mirrors `recoveryMode` state to avoid stale closure in `onAuthStateChange` callback
- Never clear the URL hash before Supabase's `detectSessionInUrl` has read it (causes "Auth session missing!" on password reset)

### PDF
- `@react-pdf/renderer` is dynamically imported in `pdfBuffer.js` to keep initial bundle small
- `window.Buffer` polyfill must be set in `main.jsx` before any other import

### Deployment
- Build for PWA: `npm run build` → deploys to Vercel via GitHub push to `main`
- Build for Electron: `npm run build:win` → `FundiBill-Setup-{version}.exe` in `/dist/`
- `ELECTRON=true` env var switches Vite `base` to `./` for file-protocol compatibility
- `release:patch/minor/major` scripts bump version, tag, and push `main` with follow-tags (triggers Electron auto-update via GitHub Releases)
- **New features on `v2` branch → Vercel preview test → merge to `main`**
- Do not modify `CLAUDE.md` unless explicitly asked

### Code Style
- All UI styles are inline React style objects (no CSS modules, no Tailwind)
- No comments unless the WHY is non-obvious
- One prompt at a time — full file replacements, not partial snippets
- App name is **FundiBill** everywhere — never "Invoicy"

---

## 11. ENVIRONMENT VARIABLES

### `.env` (local, Vite renderer — prefixed `VITE_`)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key for client-side SDK |
| `VITE_PAYFAST_MERCHANT_ID` | PayFast merchant ID (referenced in PHP, not actively used client-side) |
| `VITE_PAYFAST_MERCHANT_KEY` | PayFast merchant key (same) |
| `GH_TOKEN` | GitHub token for electron-builder to publish to GitHub Releases |

### Vercel Environment Variables (set in Vercel dashboard)

| Variable | Purpose | Required on v2 preview? |
|---|---|---|
| `VITE_SUPABASE_URL` | Same as .env | ✅ Yes |
| `VITE_SUPABASE_ANON_KEY` | Same as .env | ✅ Yes |
| `VITE_PAYFAST_MERCHANT_ID` | Same as .env | ✅ Yes |
| `VITE_PAYFAST_MERCHANT_KEY` | Same as .env | ✅ Yes |
| `GMAIL_CLIENT_SECRET` | Google OAuth client secret (v2 Gmail OAuth feature) | ✅ Yes |
| `GMAIL_CLIENT_ID` | Google OAuth client ID — used server-side by `/api/gmail-auth.js` and `/api/gmail-callback.js` | ✅ Yes |
| `GMAIL_REDIRECT_URI` | OAuth redirect URI, must point at `/api/gmail-callback` and be registered in Google Cloud Console | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS so `/api/gmail-callback.js` can write tokens to `profiles` server-side | ✅ Yes |
| `VITE_APP_URL` | Base app URL — used by `/api/gmail-callback.js` to build the post-auth redirect | ✅ Yes |

### Supabase Edge Functions (Deno.env — set in Supabase dashboard)

| Variable | Used by |
|---|---|
| `SUPABASE_URL` | All edge functions |
| `SUPABASE_SERVICE_ROLE_KEY` | All edge functions (bypasses RLS) |
| `PAYFAST_MERCHANT_ID` | `cancel-subscription` |
| `PAYFAST_PASSPHRASE` | `cancel-subscription` (HMAC signature) |
| `PAYFAST_SANDBOX` | `cancel-subscription` (`'true'` to use sandbox mode) |

---

## 12. IPC BRIDGE REFERENCE (Electron)

### `window.electronAPI` (primary)

| Method | IPC channel | Purpose |
|---|---|---|
| `sendEmail(payload)` | `send-email` | Send email with optional PDF attachment |
| `onUpdateAvailable(cb)` | `update-available` event | Called when new version detected |
| `onUpdateDownloaded(cb)` | `update-downloaded` event | Called when update ready to install |
| `installUpdate()` | `install-update` | Quits app and installs downloaded update |

### `window.db` (legacy)

| Method | IPC channel | Purpose |
|---|---|---|
| `pdf.save(buffer, filename)` | `pdf:save` | Save PDF to disk via native dialog |
| `pdf.getLogoBase64(filePath)` | `pdf:getLogoBase64` | Read local logo file as base64 data URL |
| `email.send(payload)` | `email:send` | Test email from Settings page |
| `openExternal(url)` | `shell:openExternal` | Open URL in system browser (used for PayFast) |
