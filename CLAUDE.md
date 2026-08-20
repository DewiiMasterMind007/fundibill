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
- `main` — production code, deployed to `app.fundibill.online` via Vercel. Currently at `1.8.7`.
- No active development branch right now. `v2`/`v3`/`v4` were previous rounds of pre-`main` feature branches — `v4` (Google Sign-In, multiple banking accounts) merged into `main` and is now closed. **The next big feature that needs testing outside of `main` gets a new `v5` branch** (not a reused/reopened `v4`) — same pattern: branch off `main`, build and test there, merge back to `main` (and bump the version) when it's ready to go live.

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
| `banking_details` | text | JSON `{ bank_name, account_number, branch_code }` — older accounts may have free text. **Legacy single-account storage** — superseded by the `banking_details` table (Section 6 "Multiple Banking Accounts") but kept as-is and still saved from Settings; used only as the fallback source for PDFs/documents with no `banking_details_snapshot` |
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
| `welcome_email_sent` | boolean | Dedup guard — set `true` by the `send-welcome-email` edge function after the one-time welcome email is sent; prevents re-sending on subsequent `auth.users` updates |

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
| `amount_paid` | numeric | Kept in sync with `SUM(payments.amount)` for this invoice by `src/utils/payments.js` — see Section 6 "Partial Payments" |
| `discount_value` | numeric | Discount amount or percentage |
| `discount_type` | text | `'percent'` or `'fixed'` |
| `status` | text | `draft` \| `sent` \| `partial` \| `paid` \| `overdue` — `'partial'` added by the partial-payments feature, see Section 6 |
| `from_recurring` | boolean | Set when auto-created by recurring invoice system |
| `notification_dismissed` | boolean | Controls amber recurring-invoice banner visibility |
| `sent_from_app` | boolean | Set true when emailed via Send by Email |
| `reminder_opted_in` | boolean | Legacy — used by `send-payment-reminders` edge function |
| `reminder_sent_at` | timestamptz | Legacy — updated by edge function |
| `banking_details_snapshot` | jsonb | Copy of the selected `banking_details` row at save time — see Section 6 "Multiple Banking Accounts". `NULL` on invoices created before this feature |
| `auto_sent` | boolean | `true` once the auto-send flow (Section 6 "Auto-Send Recurring Invoices") has successfully emailed this invoice to the client. Default `false` |
| `auto_sent_at` | timestamptz | When `auto_sent` was set `true` |
| `auto_send_error` | text | Set when auto-send was attempted but failed (or was skipped, e.g. no client email) — surfaced nowhere in the UI yet beyond this column; check it directly in Supabase to diagnose a failed auto-send |
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
| `banking_details_snapshot` | jsonb | Copy of the selected `banking_details` row at save time — see Section 6 "Multiple Banking Accounts". `NULL` on estimates created before this feature |
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
| `auto_send` | boolean | When `true`, `process-recurring-invoices` emails each newly-created invoice to the client automatically — see Section 6 "Auto-Send Recurring Invoices". Default `false` |
| `auto_send_cc_user` | boolean | When `true` (and `auto_send` is `true`), the FundiBill user also gets a confirmation email each time an invoice is auto-sent. Default `true` |
| `banking_detail_id` | uuid | FK → `banking_details(id)`, `ON DELETE SET NULL`. Which banking account this template's invoices (first one and every cron-created one) snapshot into `invoices.banking_details_snapshot`. `NULL` → falls back to whichever `banking_details` row is currently the user's default |
| `created_at` | timestamptz | |

### `licenses` — Legacy one-time licence key records

| Column | Type |
|---|---|
| `id` | uuid |
| `key` | text (`FNDBY-XXXX-XXXX-XXXX`) |
| `is_active` | boolean |
| `user_id` | uuid |
| `activated_at` | timestamptz |

### `payments` — Individual payments recorded against an invoice

Introduced by the **Partial Payments** feature (`v3`, see Section 6). Migration: `supabase/migrations/add_payments_table.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `invoice_id` | uuid | FK → `invoices(id)`, `ON DELETE CASCADE` |
| `user_id` | uuid | FK → `auth.users(id)`, `ON DELETE CASCADE` |
| `amount` | numeric | Payment amount |
| `payment_date` | date | |
| `payment_method` | text | Free text — `'Cash'`, `'EFT'`, `'Credit Card'`, `'Debit Card'`, `'Cheque'`, `'Other'` in the UI, but not DB-constrained |
| `note` | text | Optional |
| `created_at` | timestamptz | |

RLS: `"Users can manage their own payments" FOR ALL USING (auth.uid() = user_id)`. Indexed on `invoice_id` and `user_id`.

> ⚠️ **Legacy `amount_paid` values have no `payments` rows.** Invoices migrated from Zoho (or any invoice with `amount_paid > 0` recorded before this feature shipped) have that balance reflected only in `invoices.amount_paid` — there is no corresponding row in `payments` and none was backfilled. This is intentional (explicitly requested — no backfill was performed). Practical effect: such an invoice's PDF/detail-view Payment History section will be empty (guarded by `payments.length > 0`) even though `amount_paid` is nonzero, and its status may show `'partial'` with a correct balance-due figure but no itemized history to back it. Recording a new payment on that invoice going forward works normally — it's summed on top of whatever `amount_paid` already held before being recalculated from `payments` alone, so **the first new payment recorded on such an invoice will overwrite `amount_paid` to just that new payment's amount**, effectively dropping the un-backfilled legacy portion. If this matters for a specific invoice, manually insert a `payments` row matching the legacy `amount_paid` first.

### `banking_details` — A user's saved banking accounts

Introduced by the **Multiple Banking Accounts** feature (`v4`, see Section 6). Migration: `supabase/migrations/add_banking_details_table.sql`. Independent of (and does not replace) `profiles.banking_details` — see that column's note in the `profiles` table above; the old single-account JSON column is kept as the fallback source for documents saved before this feature existed.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `user_id` | uuid | FK → `auth.users(id)`, `ON DELETE CASCADE` |
| `account_name` | text | Label shown in the selector, e.g. "FNB Business Account" |
| `bank_name` | text | |
| `account_number` | text | |
| `branch_code` | text | Optional |
| `account_type` | text | `'Cheque'` \| `'Savings'` \| `'Transmission'` \| `'Credit'` — free text, not DB-constrained |
| `is_default` | boolean | Exactly one row per user should be `true` at a time — enforced in application code (`src/utils/bankingDetails.js`), not a DB constraint |
| `sort_order` | integer | Manual ordering; unused by the UI so far beyond the default `0` — reserved for a future drag-to-reorder |
| `created_at` | timestamptz | |

RLS: `"Users can manage their own banking details" FOR ALL USING (auth.uid() = user_id)`. Indexed on `user_id`.

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
│   │   ├── Invoices.jsx    — Full invoice CRUD, recurring invoices tab, Record Payment
│   │   │                     (partial payments, primary) + legacy Mark as Paid (secondary,
│   │   │                     see "Partial Payments" in Section 6), payment confirmation
│   │   │                     email option, manual reminder bell, WhatsApp share, overdue
│   │   │                     auto-detection, quickCreate state
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
│   │   ├── PasswordInput.jsx    — Password field with show/hide toggle
│   │   ├── RecordPaymentModal.jsx — Partial-payments modal: record a payment, live payment
│   │   │                             history with delete, auto-closes on full payment
│   │   ├── GoogleAuthButton.jsx — "Continue with Google" / "Sign up with Google" button;
│   │   │                           calls supabase.auth.signInWithOAuth({ provider: 'google' }).
│   │   │                           Supabase Auth Google provider — separate from the Gmail
│   │   │                           OAuth send feature (Section 7)
│   │   ├── AuthCallback.jsx     — Handles the #/auth/callback redirect after Google sign-in;
│   │   │                           waits for the session, creates the profiles row for new
│   │   │                           Google users, then redirects to #/dashboard
│   │   ├── BankingDetailsSelector.jsx — Used in the invoice/estimate creation forms; a
│   │   │                                 read-only line with 0-1 saved accounts, a real
│   │   │                                 <select> once there are 2+. See Section 6.
│   │   └── BankingDetailModal.jsx     — Add/Edit modal for a single banking account, used
│   │                                     by Settings.jsx's Banking Details section.
│   │
│   ├── pdf/
│   │   ├── PdfDocument.jsx     — @react-pdf/renderer branded A4 document; dynamic header
│   │   │                          height; fixed header+footer every page; PAID watermark;
│   │   │                          discount row in totals; Payment History section
│   │   │                          (only when data.payments is non-empty)
│   │   └── PdfPreviewModal.jsx — In-app PDF preview; Save to disk; Send Email trigger
│   │
│   ├── lib/
│   │   ├── supabase.js         — Supabase client (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
│   │   ├── auth.js             — Thin wrappers: signIn, signUp, signOut, getSession,
│   │   │                          onAuthStateChange
│   │   ├── sendEmail.js        — Electron-IPC/PHP-relay email sender for the SMTP provider
│   │   │                          only (window.electronAPI.sendEmail in Electron, fetch to
│   │   │                          send-reminder.php in the PWA). Called internally by
│   │   │                          src/utils/sendEmail.js's provider router — not called
│   │   │                          directly by components anymore. checkGmailProviderReady()
│   │   │                          still defined/used internally as a no-op safety net.
│   │   ├── emailTemplates.js   — generateInvoiceEmail, generateEstimateEmail,
│   │   │                          generateReminderEmail, generatePaymentConfirmationEmail,
│   │   │                          generateTestEmail, generateWelcomeEmail, PLAIN_TEXT_FOOTER,
│   │   │                          fillMessageTemplate (fills {clientName}/{invoiceNumber}/etc.
│   │   │                          placeholders in the profiles.email_invoice_message/
│   │   │                          email_quote_message/email_overdue_message templates).
│   │   │                          generateWelcomeEmail() is self-contained (no baseTemplate())
│   │   │                          and is mirrored by hand in
│   │   │                          supabase/functions/send-welcome-email/index.ts since Deno
│   │   │                          can't import the Vite app's source tree.
│   │   ├── pdfBuffer.js        — buildPdfBuffer(data, settings, docType) — dynamically
│   │   │                          imports PdfDocument, returns ArrayBuffer
│   │   └── whatsapp.js         — formatPhoneForWhatsApp, buildInvoiceWhatsAppMessage,
│   │                              buildEstimateWhatsAppMessage, sendPdfViaWhatsApp
│   │
│   ├── hooks/
│   │   └── useIsMobile.js      — Returns true when viewport ≤ 768px
│   │
│   └── utils/
│       ├── sendEmail.js        — Shared provider-routing sendEmail() used by every send flow
│       │                          in the app (invoices, estimates, reminders, payment
│       │                          confirmations, Settings test email). Routes to
│       │                          /api/send-gmail when email_provider === 'gmail', otherwise
│       │                          delegates to src/lib/sendEmail.js unchanged. See Section 7.
│       ├── pdf.js              — Legacy jsPDF builder (unused in active flow, kept for reference)
│       ├── payments.js         — recordPayment, deletePayment, getPayments, getBalanceDue —
│       │                          partial-payments data layer, keeps invoices.amount_paid/
│       │                          status in sync with the payments table. See Section 6.
│       └── bankingDetails.js   — getBankingDetails, addBankingDetail, updateBankingDetail,
│                                   deleteBankingDetail, setDefaultBankingDetail,
│                                   createBankingSnapshot — multiple-banking-accounts data
│                                   layer. See Section 6 "Multiple Banking Accounts".
│
├── api/                        — Vercel Serverless Functions (Gmail OAuth — see Section 7)
│   ├── gmail-auth.js            — Starts the OAuth flow, redirects to Google's consent screen
│   ├── gmail-callback.js        — Exchanges the auth code for tokens, stores them on profiles
│   ├── send-gmail.js            — Sends an email via the Gmail API using stored OAuth tokens,
│   │                                refreshing the access token first if it's expired/near-expiry
│   ├── generate-invoice-pdf.js  — Server-side invoice PDF generation (no browser needed);
│   │                                reuses src/pdf/PdfDocument.jsx via @react-pdf/renderer's
│   │                                Node toBuffer() API. Called by process-recurring-invoices'
│   │                                auto-send flow — see Section 6 "Auto-Send Recurring Invoices".
│   │                                Imports api/_lib/PdfDocument.mjs (generated, gitignored —
│   │                                NOT the .jsx source directly). See scripts/build-api-pdf.mjs.
│   └── _lib/PdfDocument.mjs     — Generated by scripts/build-api-pdf.mjs at build time (the
│                                    "vercel-build" package.json script), never committed. Vercel's
│                                    Node function builder only transpiles the entry file of each
│                                    function — it does NOT run a JSX transform on files that entry
│                                    file merely imports, so a raw .jsx file reaching the deployed
│                                    function fails at runtime no matter how it's imported (static
│                                    → "Cannot use import statement outside a module"; dynamic →
│                                    "Unknown file extension .jsx"). This pre-compiled plain-JS
│                                    .mjs copy (JSX already lowered to React.createElement calls)
│                                    is what generate-invoice-pdf.js actually imports.
│
├── supabase/
│   ├── functions/
│   │   ├── cancel-subscription/index.ts  — Deno edge function; called from Settings page;
│   │   │                                    calls PayFast API to cancel subscription token,
│   │   │                                    then sets subscription_status = 'cancelled' in DB
│   │   ├── send-payment-reminders/       — Deno edge function (deployed, scheduled daily
│   │   │                                    at 07:00 UTC via pg_cron + pg_net); auto-sends
│   │   │                                    reminder emails for opted-in overdue invoices.
│   │   │                                    Currently superseded by manual bell flow but
│   │   │                                    still deployed.
│   │   ├── send-welcome-email/index.ts   — Deno edge function; triggered by a Database
│   │   │                                    Webhook on auth.users (UPDATE, email_confirmed_at
│   │   │                                    null → timestamp); sends the one-time welcome
│   │   │                                    email via send-reminder.php, dedup-guarded by
│   │   │                                    profiles.welcome_email_sent
│   │   └── process-recurring-invoices/index.ts — Deno edge function (cron); creates the next
│   │                                    invoice for every due recurring_invoices template and,
│   │                                    when auto_send is on, emails it to the client. See
│   │                                    Section 6 "Auto-Send Recurring Invoices" and Section 8.
│   └── migrations/
│       ├── add_gmail_oauth_columns.sql   — gmail_access_token/refresh_token/token_expiry/
│       │                                    connected_email columns on profiles
│       ├── add_welcome_email_column.sql  — welcome_email_sent column on profiles
│       ├── add_payments_table.sql        — payments table + RLS policy; conditionally widens
│       │                                    any existing invoices.status CHECK constraint to
│       │                                    allow 'partial'. Must be run manually — see
│       │                                    Section 6 "Partial Payments" and Known Issue #10.
│       ├── add_banking_details_table.sql — banking_details table + RLS policy; adds
│       │                                    banking_details_snapshot to invoices/estimates;
│       │                                    migrates existing profiles.banking_details. Must be
│       │                                    run manually — see Section 6 "Multiple Banking
│       │                                    Accounts" and Known Issue #11.
│       ├── add_recurring_auto_send.sql   — auto_send/auto_send_cc_user columns on
│       │                                    recurring_invoices; auto_sent/auto_sent_at/
│       │                                    auto_send_error columns on invoices. Must be run
│       │                                    manually — see Section 6 "Auto-Send Recurring
│       │                                    Invoices" and Known Issue #12.
│       └── add_recurring_banking_detail.sql — banking_detail_id column (FK →
│                                            banking_details) on recurring_invoices. Must be
│                                            run manually — see Section 6 "Auto-Send Recurring
│                                            Invoices" and Known Issue #12.
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
                                  release:patch, release:minor, release:major, build:api-pdf
                                  (compiles PdfDocument.jsx → api/_lib/PdfDocument.mjs),
                                  vercel-build (what Vercel actually runs — build:api-pdf
                                  then vite build; takes precedence over "build")
```

---

## 6. FULL FEATURE LIST

### Authentication
- Email/password sign-up with Supabase confirmation email
- Sign-in / sign-out
- Registration shows 5-second countdown success screen before returning to login
- **Password reset flow:** When user clicks reset link, Supabase fires `PASSWORD_RECOVERY` event. `AuthContext` intercepts before auto-login, sets `recoveryMode = true` (+ ref for stale-closure safety). Auth.jsx shows "Set New Password" form. On submit, calls `supabase.auth.updateUser({ password })`, then signs out. `clearRecoveryMode()` returns to login.
- **Google Sign In / Sign Up:** via Supabase Auth's built-in Google provider (`supabase.auth.signInWithOAuth({ provider: 'google' })`) — see Section 7A. Fully separate system from the Gmail OAuth *send* feature in Section 7 (different Google Cloud OAuth client, different scopes, different purpose).

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
- Status: draft → sent → partial → paid / overdue. Overdue auto-detected on load if `due_date < today && status !== 'paid'`
- **Status revert on save:** If status is 'overdue' but due_date is now ≥ today, reverts to 'sent' on save
- PDF preview and download
- Send by Email: advances status from draft → sent, sets `sent_from_app = true`
- Mark as Paid: opens modal with payment method selector and optional payment confirmation email — the original one-shot flow, see "Partial Payments" below for how it coexists with Record Payment
- Undo mark-as-paid: reverts to previous status
- Manual payment reminder: amber bell 🔔 on overdue non-paid invoices (includes `'partial'`); opens ReminderModal with pre-filled email — message includes outstanding balance wording when the invoice is partially paid
- WhatsApp share: Web Share API (mobile) or `wa.me` deep-link (desktop)
- Add new client inline (without leaving the form)
- Item autocomplete from catalog
- Recurring invoices: schedule (daily/weekly/monthly/yearly), immediate first invoice creation, `next_send_date` advancement, pause/resume, edit, amber notification banner on auto-creation. Subsequent invoices (beyond the first) are created by the `process-recurring-invoices` cron edge function — see "Auto-Send Recurring Invoices" below. Optional auto-send-by-email per template — same section.
- **Quick-create:** Navigating with `location.state.quickCreate = true` auto-opens new invoice form

### Partial Payments (`v3`)

Lets a user record one or more partial payments against an invoice instead of only the original one-shot "Mark as Paid". Built on a new `payments` table (Section 4) — migration in `supabase/migrations/add_payments_table.sql`, which must be run manually in the Supabase SQL Editor (see the file for the exact SQL and its self-inspecting CHECK-constraint step).

**Data layer — `src/utils/payments.js`:**
- `recordPayment(supabase, { invoiceId, userId, amount, paymentDate, paymentMethod, note })` — inserts a `payments` row, then recalculates and returns the updated invoice.
- `deletePayment(supabase, { paymentId, invoiceId, userId })` — deletes a `payments` row, then recalculates and returns the updated invoice.
- `getPayments(supabase, invoiceId)` — all payments for an invoice, oldest first.
- `getBalanceDue(invoice)` — `max(0, invoice.total - invoice.amount_paid)`, pure/no DB call.
- Internally, both `recordPayment`/`deletePayment` call a shared `recalculateInvoiceFromPayments()` which **sums `payments.amount` for the invoice from scratch** (not incremented) and writes `invoices.amount_paid`/`status` (and `payment_date` when fully paid, set to the latest payment's date): `'paid'` if `amountPaid >= total` and `total > 0`, `'partial'` if `amountPaid > 0`, else `'sent'`. This means deleting the only payment on an invoice correctly reverts its status to `'sent'`, and deleting one of several payments correctly drops it back to `'partial'` with the recalculated balance.
- ⚠️ Because the recalc is a from-scratch sum of `payments` rows only, invoices with a pre-existing `amount_paid` from before this feature (no `payments` row backing it) will have that legacy amount **overwritten** the first time a new payment is recorded against them — see the `payments` table note in Section 4.

**UI — `src/components/RecordPaymentModal.jsx`:** shows invoice number + live balance due, a form (Amount / Payment Date / Payment Method / Note) to record a new payment, and a live payment history list (with per-row delete + confirm). Stays open after a partial payment so the user can record another; **auto-closes itself** (after calling `onPaymentRecorded`) once a payment brings the invoice to `status === 'paid'`.

**Two parallel "paid" flows — both intentionally kept working:**
- **Record Payment** (new, primary): desktop primary button + mobile bottom-bar button, shown when `!isReadOnly && !isNew && ['sent','overdue','partial'].includes(status) && balanceDue > 0`. Opens `RecordPaymentModal`. On full payment, triggers confetti + the existing `MarkAsPaidEmailModal` "thank you" email flow (email-only, no DB write — the DB was already updated by `payments.js`).
- **Mark as Paid** (original, still fully functional): demoted to a secondary/outlined desktop button only (removed from the mobile bottom bar, replaced there by Record Payment). Condition unchanged except it **deliberately excludes `'partial'`** — once any payment has been recorded, the invoice is always `'partial'` or `'paid'`, and letting the one-shot Mark-as-Paid flow fire on top of an existing payments ledger would silently invalidate the ledger. It remains reachable for `'sent'`/`'overdue'` invoices that have no payments recorded yet, exactly as before this feature shipped.
- Both flows are wired independently in both `InvoiceForm` (detail view) and the mobile list's three-dot menu in the top-level `Invoices()` component (the codebase already had duplicated mark-as-paid logic across those two places before this feature).

**List views:** `STATUS_TABS` now includes `'partial'` between `sent` and `paid` (real stored status value, filtered with the existing `inv.status === tab` logic — no special-casing needed, unlike the computed "Expired" quotes tab). Amber `STATUS_META.partial` badge. The Total column shows a two-line `{balanceDue} due` (amber) / `of {total}` (grey) for partial invoices, both desktop `ListView` and `MobileInvoiceCard`.

**Detail view:** a "Payment History" card (Date / Method / Note / Amount rows + Total Paid / Balance Due summary) renders between the line-items/totals card and the Notes card, but only `{invoicePayments.length > 0 && (...)}` — empty for invoices with no recorded payments.

**PDF (`src/pdf/PdfDocument.jsx`):** a "Payment History" section (same Date/Method/Note/Amount table + Total Paid/Balance Due summary) is inserted after the main totals block and before the fixed footer, guarded by `Array.isArray(data.payments) && data.payments.length > 0` — renders nothing when there are no payments. Shows green **"PAID IN FULL"** in place of the Balance Due row when the recalculated balance is 0. Every PDF-building call site in `Invoices.jsx` (5 total: mark-as-paid thank-you email, WhatsApp share, the shared preview/send-email IIFE, `ReminderModal`, and the list-view mark-as-paid thank-you email) was updated to include a `payments` key in its `pdfData` object — no changes were needed to `pdfBuffer.js`/`PdfPreviewModal.jsx` themselves, since they pass `data` straight through.

### Auto-Send Recurring Invoices (`v5`)

Two things shipped together here, because the second depended on building the first:

**1. The missing recurring-invoice cron job.** Before this, `process-recurring-invoices` did not exist at all — Known Issue #2 documented that only the *first* invoice for a recurring schedule was ever created (by `RecurringForm`'s save flow in `src/pages/Invoices.jsx`). `supabase/functions/process-recurring-invoices/index.ts` is that missing cron job: on each run it finds every `recurring_invoices` row with `is_active = true` and `next_send_date <= today`, and for each one creates the next invoice (same fields/numbering logic as `RecurringForm`'s first-invoice code — draft status, `from_recurring = true`, `notification_dismissed = false`, `due_date = issue_date + 30 days` fixed, matching the existing first-invoice behavior exactly), then advances `next_send_date`/`last_sent_date` on the template. Must be scheduled via `pg_cron` + `pg_net` — see the SQL in the function's own header comment (same pattern as `send-payment-reminders`).

**2. Auto-send.** If `recurring_invoices.auto_send = true` on the template, the cron job also emails the newly-created invoice to the client immediately after creating it:
1. Skip (leave the invoice as a draft, in-app notification only) if `auto_send` is `false` — this is the pre-existing behavior, unchanged.
2. If the linked client has no email, set `invoices.auto_send_error = 'Client has no email address'` and skip the send (invoice itself is still created either way).
3. Generate the PDF via `POST /api/generate-invoice-pdf` (see below). On failure, set `auto_sent = false` and `auto_send_error`, skip the send.
4. Build the email from the user's `profiles.email_invoice_message` template (placeholders `{clientName}`/`{invoiceNumber}`/`{businessName}`/`{amount}`/`{dueDate}`, same syntax as `fillMessageTemplate()` in `src/lib/emailTemplates.js`) or a hardcoded default if that's empty, wrapped in a hand-mirrored copy of `generateInvoiceEmail()`'s branded HTML (Deno can't import the Vite source tree — same reason `send-payment-reminders`/`send-welcome-email` hand-mirror their templates; keep in sync by hand if the email design changes).
5. Send via the user's configured provider:
   - **Gmail** (`email_provider === 'gmail'`) → calls the existing `POST /api/send-gmail` Vercel function rather than reimplementing Gmail OAuth token refresh + RFC 2822/MIME attachment building a second time in Deno — that logic already exists, is already tested, and stays in one place. `/api/send-gmail.js` was not modified.
   - **SMTP** (anything else) → sends directly via `denomailer`'s `SMTPClient`, same library `send-payment-reminders/index.ts` already uses, with the PDF attached as a base64 `attachments` entry. Not routed through the `send-reminder.php` PHP relay (unlike the client-side PWA send path) — no browser involved here, so there's no reason to hop through PHP.
6. On success: `invoices.auto_sent = true`, `auto_sent_at = now()`, `sent_from_app = true`, `status = 'sent'`. If `auto_send_cc_user` is also on, sends a second, short confirmation email to the *FundiBill user's own* `profiles.email` — this one always goes out from FundiBill's own system mailbox (`noreply@fundibill.online`, via `send-reminder.php` using the `WELCOME_EMAIL_SMTP_*` secrets already set up for `send-welcome-email`), not the user's own Gmail/SMTP, since it's a FundiBill notification rather than something the client should ever see.
7. On failure: `auto_sent = false`, `auto_send_error` set to the failure reason, full error logged server-side. The in-app notification banner is unaffected either way — see below.

**In-app notification banner (`src/context/RecurringNotifContext.jsx`):** previously queried `status = 'draft'` only, since a recurring-created invoice only ever left `'draft'` once a human sent it (at which point the banner had done its job). Auto-send changes that — a successfully auto-sent invoice jumps straight to `'sent'` the moment it's created, so the query now matches `status IN ('draft', 'sent')` instead, and the banner still appears (click-through still opens the invoice) regardless of whether `auto_send` was on. This is a small, deliberate behavior change: a manually-created-then-manually-sent recurring invoice will now also keep showing its banner a little longer than before (until dismissed), not just auto-sent ones — there was no clean way to special-case "only when auto-sent" without adding another column to check, and the banner is purely informational once dismissible either way.

**`/api/generate-invoice-pdf.js`** — the auto-send flow's only way to get a PDF, since the Edge Function has no browser to run the normal client-side `buildPdfBuffer()`/`@react-pdf/renderer` flow in. Rather than standing up a second, hand-written HTML/CSS invoice template rendered by headless Chromium (`puppeteer-core` + `@sparticuz/chromium`) — a large new dependency and a second template to keep visually in sync with `src/pdf/PdfDocument.jsx` by hand forever — this endpoint reuses the *exact same* `PdfDocument.jsx` component server-side, via `@react-pdf/renderer`'s Node-side `pdf(element).toBuffer()` API (a readable stream, collected into a `Buffer`). Output is pixel-identical to any other invoice PDF in the app, and there's still only one invoice template in the codebase. Fetches the invoice (`select('*')`), its `invoice_items`, the owning `profiles` row, and the linked `clients` row using `SUPABASE_SERVICE_ROLE_KEY`; verifies `user_id` matches `invoice.user_id` before generating (403 if not); returns `{ success, pdf_base64, filename }`. No new npm packages were needed — `@react-pdf/renderer` was already a dependency. `vercel.json` sets `maxDuration: 30` for this one function (PDF render + a possible remote logo fetch can take a few seconds; note this is capped by whatever the Vercel plan actually allows — e.g. 10s on Hobby regardless of this config).

**UI — `src/pages/Invoices.jsx` `RecurringForm`:** a **Banking Details** selector (`src/components/BankingDetailsSelector.jsx`, the same one used on the invoice/estimate forms) plus two checkboxes under the interval/next-send-date fields — "Automatically send invoice by email" (`auto_send`, default off) and, shown only when that's on, "Send me a confirmation email when sent" (`auto_send_cc_user`, default on). Saving with `auto_send` on and no client email doesn't block the save — it shows a warning toast ("Auto-send requires the client to have an email address...") and saves anyway, exactly as specified; the *real* enforcement happens server-side in the cron job (step 2 above), which is what actually matters since the client's email can change or be added later.

**Banking details on recurring-created invoices:** the recurring template picks a banking account (`recurring_invoices.banking_detail_id`) once, and *every* invoice that template creates — the first one (`RecurringForm`'s own insert) and every subsequent cron-created one (`process-recurring-invoices`) — snapshots that same account into `invoices.banking_details_snapshot`, same shape `createBankingSnapshot()` produces client-side (hand-mirrored in the Edge Function, same reason the email HTML is). `NULL`/unset `banking_detail_id` (including a template created before this field existed, or one whose picked account was since deleted — the FK is `ON DELETE SET NULL`) falls back to whichever `banking_details` row is the user's current default at invoice-creation time, in both places. This closes a real gap found in testing: before this, cron-created invoices had no snapshot at all and fell back to the legacy `profiles.banking_details` field, which is empty for any user who's only ever used the newer multiple-accounts feature — auto-sent PDFs showed no banking details whatsoever.

**Indicators:**
- `RecurringList` (both the desktop table and mobile card view): a small green "✉ Auto-send on" badge next to the client name/status when `recurring_invoices.auto_send` is `true`. Nothing shown when it's `false` (unchanged from before).
- The invoices list (`ListView` and `MobileInvoiceCard` in `src/pages/Invoices.jsx`): a small "Auto" badge next to the status badge when `invoices.auto_sent` is `true`, tooltip "Automatically sent by recurring invoice". Not added to the invoice detail view (`InvoiceForm`) — only the list views, per spec.

### Multiple Banking Accounts (`v4`)

Lets a user save more than one banking account in Settings and choose which one is used on a given invoice or quote, instead of the single bank/account/branch fields previously stored on `profiles`. Built on a new `banking_details` table (Section 4) — migration in `supabase/migrations/add_banking_details_table.sql`, which must be run manually in the Supabase SQL Editor (creates the table, adds `banking_details_snapshot` JSONB to `invoices` and `estimates`, and one-time-migrates any existing `profiles.banking_details` into the new table as each user's default account).

**Data layer — `src/utils/bankingDetails.js`:**
- `getBankingDetails(supabase, userId)` — all accounts for a user, ordered `is_default DESC, sort_order ASC, created_at ASC`.
- `addBankingDetail(supabase, userId, { account_name, bank_name, account_number, branch_code, account_type })` — inserts a row; `is_default` is set `true` automatically only when it's the user's first saved account (checked via a `count`-only query before insert), `false` otherwise.
- `updateBankingDetail(supabase, id, userId, updates)` / `deleteBankingDetail(supabase, id, userId)` — straightforward update/delete, both scoped by `id` **and** `user_id`. Deleting the current default automatically promotes the next-oldest remaining account (by `created_at`) to `is_default = true`, so a user is never left with zero default accounts as long as at least one remains.
- `setDefaultBankingDetail(supabase, id, userId)` — clears `is_default` on every row for the user, then sets it on the one specified (two separate `UPDATE`s, not a DB constraint — see the `banking_details` table note in Section 4).
- `createBankingSnapshot(bankingDetail)` — pure function, pulls `{ account_name, bank_name, account_number, branch_code, account_type }` off a `banking_details` row into a plain object for storing as JSONB.

**Settings — `src/pages/Settings.jsx` Banking Details section:** replaced the old single bank/account/branch input trio with a list of cards (one per saved account: name, `bank | account | branch | type` line, green "Default" badge, Set as Default / Edit / Delete buttons) plus an "+ Add Banking Account" button opening `src/components/BankingDetailModal.jsx`. **Delete is hidden whenever only one account remains** (`bankingList.length > 1` guard) so a user can never delete their last banking account from the UI; the delete confirmation itself is a small inline overlay in `Settings.jsx` (not a separate component) reading "Delete this banking account? Invoices already sent will not be affected." The old `profiles.banking_details` JSON column, its load/save code, and `parseBankingDetails()` in `Settings.jsx` were **left untouched** — they keep working exactly as before, just with no UI to edit them any more, because that column is still the fallback source for documents with no `banking_details_snapshot` (see PDF note below).

**Invoice/estimate forms (`src/pages/Invoices.jsx` `InvoiceForm`, `src/pages/Estimates.jsx` `EstimateForm`):** both load the user's `banking_details` list on mount and render `src/components/BankingDetailsSelector.jsx` in a "Banking Details" card (placed just before the Notes card). That component collapses to a read-only `Bank: … | Acc: …` line with a "Manage banking details" link to Settings when there are 0 or 1 saved accounts, and becomes a real `<select>` (options as `"{account_name} — {bank_name}"`) once there are 2+. On edit, the initially-selected account is matched from the invoice/estimate's existing `banking_details_snapshot` by `account_number` + `bank_name` where possible (falls back to the user's current default). **Every save** (new or edit, regardless of how many accounts exist) computes `createBankingSnapshot()` of whichever account is currently selected and writes it into the `banking_details_snapshot` payload field — so even single-account users get a snapshot going forward, insulating already-issued documents from later edits to that banking account.

**PDF (`src/pdf/PdfDocument.jsx`):** `formatBankingDetails()` now takes the invoice/estimate's `banking_details_snapshot` first; if present (an already-parsed JSONB object), it's used directly. If absent (`NULL` — documents created before this feature), it falls back to parsing `settings.banking_details` (the profile's legacy JSON string) exactly as before. Output format changed slightly to match the new field set: `Account Name: …` (only if different from the business name) `/ Bank: … / Account: … / Branch: … / Type: …` (only if `account_type` is set) — previously read "Account Number:"/"Branch Code:" instead of "Account:"/"Branch:", and had no Account Name/Type lines at all. Live pdfData construction in `InvoiceForm`/`EstimateForm` (`Invoices.jsx`/`Estimates.jsx`) explicitly sets `banking_details_snapshot: createBankingSnapshot(bankingList.find(...))` on every preview/send — it can't rely on the `...invoice`/`...estimate` spread alone, since that prop only refreshes via an async round-trip after save and is stale at the moment Preview opens (same reason every other live-edited field in those blocks, e.g. `notes`, is set explicitly rather than left to the spread). The already-persisted-record call sites (`ReminderModal`, the list-view mark-as-paid flows) are unaffected — they have no live selector and correctly keep using the spread.

**No detail-view display existed to update.** The original spec assumed an invoice/estimate detail-view banking section analogous to the PDF's, but no such UI exists anywhere in `Invoices.jsx`/`Estimates.jsx` today — banking details have only ever been shown on the PDF and edited in Settings. Nothing was added here to avoid inventing an unrequested UI surface; the PDF preview remains the only place a user sees the rendered banking details before sending.

> ⚠️ **Pre-feature invoices/estimates have `banking_details_snapshot = NULL`.** These fall back to the user's *current* profile banking details (`profiles.banking_details`) for PDF display, per the fallback above — not a backfill. If a user has since changed their profile banking details, an old invoice's PDF will show the *new* details, same as it always has (this is the pre-existing, unchanged behavior for any invoice issued before this feature; the feature only stops that from happening going forward).

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
- All send flows call the shared `src/utils/sendEmail.js` router, which checks `profile.email_provider`:
  - **`'gmail'`** → `POST /api/send-gmail` (Gmail API, server-side token refresh) — see Section 7
  - **`'smtp'`** (default) → unchanged `src/lib/sendEmail.js`:
    - **Electron:** `nodemailer` in main process via IPC channels:
      - `email:send` (`window.db.email.send`) — legacy, no longer called by any component
      - `send-email` (`window.electronAPI.sendEmail`) — all SMTP emails (invoices, quotes, reminders, payment confirmation, test)
    - **PWA:** POSTs JSON to `https://api.fundibill.online/send-reminder.php`
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
- `profiles.email_provider` column: `'smtp'` or `'gmail'` — both fully wired end-to-end, including actual sending
- Settings → Email Settings → Gmail tab shows a real **Connect Gmail** / **Connected: {email}** flow (see UI flow below); legacy "coming soon" + read-only SMTP/App-Password UI has been removed from `Settings.jsx`
- The SMTP fields (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `smtp_from_name`) are only shown/editable under the **Custom SMTP** tab
- Every send flow in the app (invoice, estimate, payment reminder, payment confirmation, Settings test email) routes through the shared `src/utils/sendEmail.js` provider router — see "Email sending — provider routing" below

### Gmail OAuth — built, complete end-to-end

**Google Cloud Console project:** FundiBill  
**OAuth Client ID:** `475513706412-9lhbtur6spj97n9lrt5mejhae421fsc9.apps.googleusercontent.com`  
**Client Secret:** Stored in Vercel environment variable `GMAIL_CLIENT_SECRET` — **never in code**  
**Scope:** `https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email` — the `userinfo.email` scope is required because `gmail.send` alone does not grant access to the profile/userinfo endpoint used to fetch the connected address  
**App status:** Testing mode — max 100 users, manual whitelist via Google Cloud Console. Google app verification (demo video, privacy policy review, domain verification) is required before public rollout beyond the 100-user cap — see Known Issues.

**End-to-end flow:**
1. Settings → Email Settings → Gmail tab, not connected → **Connect Gmail** button (official Google "Sign in with Google" asset, `public/Google Signin Button.png`)
2. Click → `supabase.auth.getUser()` → full-page redirect to `/api/gmail-auth?user_id=<id>` → 302 to Google's OAuth consent screen
3. User grants access → Google redirects to `/api/gmail-callback?code=...&state=<id>`
4. Callback exchanges the code for tokens, fetches the connected address, writes `gmail_access_token`/`gmail_refresh_token`/`gmail_token_expiry`/`gmail_connected_email`/`email_provider='gmail'` onto `profiles`, then 302-redirects to `{VITE_APP_URL}/#/settings?gmail=connected` (or `?gmail=error`)
5. Settings reads `?gmail=` from the URL on mount, re-fetches the profile, updates local state + `refreshProfile()` (`AppDataContext`), shows a toast, strips the query param via `window.history.replaceState`
6. Every subsequent send (invoice, estimate, reminder, payment confirmation, test email) routes through `src/utils/sendEmail.js` → `POST /api/send-gmail`, which sends via the Gmail API using the stored tokens, refreshing server-side when needed
7. Disconnect: revokes the token with Google, then clears the 4 token columns + resets `email_provider` in Supabase

**API routes** (all in `/api/`, Vercel Serverless Functions):
- `/api/gmail-auth.js` — accepts `?user_id=`, builds the Google OAuth consent URL (`client_id`, `redirect_uri`, scope, `access_type=offline`, `prompt=consent`, `state=user_id`), 302-redirects the browser to it.
- `/api/gmail-callback.js` — Google redirects here with `?code=&state=`. Exchanges the code for tokens at `https://oauth2.googleapis.com/token`, fetches the connected address from `https://www.googleapis.com/oauth2/v2/userinfo` (`response.email`), writes the 4 token columns + `email_provider='gmail'` onto `profiles` (via `SUPABASE_SERVICE_ROLE_KEY`, bypassing RLS), then 302-redirects to `{VITE_APP_URL}/#/settings?gmail=connected` (or `...?gmail=error`). **Note:** the redirect must include the `#/` HashRouter prefix — a plain `/settings?...` path is invisible to react-router under `HashRouter` and the SPA falls back to its default route instead of landing on Settings.
- `/api/send-gmail.js` — POST endpoint. Accepts `{ user_id, to, subject, html, pdf_base64, pdf_filename, from_name }`.
  - **Token refresh:** fetches the user's tokens via `SUPABASE_SERVICE_ROLE_KEY`; if the access token is expired or within 5 minutes of expiring, refreshes it via `POST https://oauth2.googleapis.com/token` (`grant_type=refresh_token`, using `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`) and persists the new `gmail_access_token`/`gmail_token_expiry` back onto `profiles` before sending. If the refresh_token itself has been revoked/expired (e.g. the user removed FundiBill from their Google account permissions manually), returns `401 { error: "Gmail token expired. Please reconnect Gmail in Settings." }`. Also returns `401 { error: "Gmail not connected" }` if no tokens exist at all.
  - **Message construction:** builds a raw RFC 2822 message (multipart/mixed with a base64 PDF part when `pdf_base64` is present, otherwise a plain `text/html` message), base64url-encodes it, and POSTs to `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`. Returns `{ success: true, messageId }` on success, `500 { error: "Failed to send email", details }` on any other failure.
  - **Subject encoding (RFC 2047):** the `Subject:` header is passed through `encodeEmailSubject()` before being written into the raw message. A raw UTF-8 subject in a MIME header corrupts non-ASCII characters (em dashes, smart quotes, accented characters) in most clients. Pure-ASCII subjects are used as-is; anything else is wrapped in encoded-word syntax: `` =?UTF-8?B?${base64(subject)}?= ``. This is the single choke point for every Gmail send (invoice, estimate, reminder, payment confirmation, test email all funnel through this one endpoint via `src/utils/sendEmail.js`), so the fix covers all of them automatically — no per-caller changes needed.

No other API routes were added for this feature — `gmail-auth.js`, `gmail-callback.js`, and `send-gmail.js` are the complete set.

**Token storage:** Per user in Supabase `profiles` table — columns added (see Section 4):
- `gmail_access_token` (text)
- `gmail_refresh_token` (text)
- `gmail_token_expiry` (timestamptz)
- `gmail_connected_email` (text)

**Env vars required by the API routes (see Section 11):**
- `GMAIL_CLIENT_ID`
- `GMAIL_REDIRECT_URI` (points at `/api/gmail-callback`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_APP_URL`

**UI — built in `src/pages/Settings.jsx` (Email Settings → Gmail tab):**
1. **Not connected (State A):** the official Google "Sign in with Google" pill button (`public/Google Signin Button.png`, rendered edge-to-edge inside an unstyled `<button>` per Google branding requirements) + helper text "Send invoices and estimates directly from your Gmail address". The provider toggle above it uses the official multicolor "G" logo (`public/G Logo.png`), also per Google branding requirements — no custom-drawn Google icons remain anywhere in the app.
2. **Connected (State B):** green dot + "Connected: {gmail_connected_email}", a "Disconnect" text link, a **From Name** field (bound to `form.business_name` — the same `profiles.business_name` column used everywhere else in the app, not a separate Gmail-only field), and a **Send Test Email** button (same styling/behavior as the Custom SMTP tab's — sends to `gmail_connected_email`, blocked with "Gmail not connected. Please reconnect Gmail in Settings." if `profile.gmail_access_token` is missing, success toast reads "Test email sent! Check your inbox."). The provider toggle buttons reflect `form.email_provider === 'gmail'` automatically.
3. **Disconnect (`handleDisconnectGmail`):** `window.confirm(...)` →
   1. **Revokes the token with Google first**, while the value is still in hand: `fetch('https://oauth2.googleapis.com/revoke?token=' + profile.gmail_access_token)`, so the app disappears from the user's Google account permissions list too. Best-effort only, wrapped in try/catch — a failed/blocked revoke (e.g. CORS, network) is logged to console and never surfaced to the user or allowed to block the rest of disconnect.
   2. Then nulls `gmail_access_token`/`gmail_refresh_token`/`gmail_token_expiry`/`gmail_connected_email` and sets `email_provider='smtp'` directly via Supabase (not gated behind the page's Save button) → `refreshProfile()` → success toast "Gmail disconnected".
4. **Provider indicator in send modals:** `SendEmailModal.jsx` shows a small grey line below the "To" field — "Sending via Gmail ({gmail_connected_email})" or "Sending via Custom SMTP" — read from the `settings`/`profile` prop already passed in; omitted entirely if no provider is set. Display-only, no effect on the send logic itself.

### Email sending — provider routing (`src/utils/sendEmail.js`)

A single shared router, **not** to be confused with `src/lib/sendEmail.js` (the older Electron-IPC/PHP-relay implementation, which is still used internally — see below):

```js
sendEmail({ supabase, userId, profile, to, subject, html, pdfBase64, pdfFilename })
```

- **`profile.email_provider === 'gmail'`** → throws immediately if `profile.gmail_access_token` is missing ("Gmail not connected. Please connect Gmail in Settings."); otherwise POSTs to `/api/send-gmail` with `{ user_id, to, subject, html, pdf_base64, pdf_filename, from_name: profile.business_name || 'FundiBill' }`. A merely-expired (not missing) token is **not** blocked client-side — `/api/send-gmail.js` refreshes it server-side.
  - **401 handling:** a `401` response from `/api/send-gmail` (dead Gmail connection — never connected, or refresh token revoked/expired server-side) is caught specifically and re-thrown with a single, actionable message: `"Gmail connection lost. Please reconnect Gmail in Settings → Email Settings → Google / Gmail."` This replaces whatever generic error the API returned, so every caller's existing `catch (e) { setError(e.message) }`/toast pattern surfaces the specific message automatically — no per-caller changes needed. Since the function throws (rather than returning a success value), no caller ever marks the invoice/estimate as sent when this happens.
  - Any other non-2xx response throws the API's own error message (or a generic fallback).
  - Returns `{ success: true, messageId }` on success.
- **`profile.email_provider === 'smtp'` (or anything else)** → delegates to the **existing, unmodified** `sendEmail()` in `src/lib/sendEmail.js`, which still does the Electron-IPC-or-PHP-relay routing exactly as before (`window.electronAPI.sendEmail` in the desktop app, `POST https://api.fundibill.online/send-reminder.php` in the PWA). SMTP credentials are pulled from the passed `profile` object (`smtp_host`/`smtp_port`/`smtp_user`/`smtp_password`/`smtp_from_name`). Throws on `{ success: false }`.
- `pdfBase64` (string) is converted back to an `ArrayBuffer` before being handed to the legacy SMTP path, since that path (and the Electron `send-email` IPC handler in `electron/main.js`) expects a raw buffer, not base64. Also exports `arrayBufferToBase64()` for callers building the PDF as an `ArrayBuffer` via `buildPdfBuffer()`.
- **Known limitation:** the shared signature only carries one `html` field (no separate plain-text body). For the SMTP/PHP-relay path this means the plain-text fallback (`text_body`) is now the raw HTML string rather than a dedicated plain-text message — a minor regression from the pre-Gmail-integration behavior, which built a separate plain-text string with `PLAIN_TEXT_FOOTER`.

**Wired into every send flow** (all pass `supabase`, `userId` from `supabase.auth.getUser()`, and the relevant `profile`/`settings` object):
- `SendEmailModal.jsx` — invoice + estimate send (shared modal, both doc types); also shows the provider indicator described above
- `Invoices.jsx` `ReminderModal` — overdue payment reminder
- `Invoices.jsx` `handleConfirmMarkPaidWithEmail` (detail view) and `handleConfirmMarkPaidWithEmailFromList` (list view) — payment confirmation email, both non-fatal/best-effort like before
- `Settings.jsx` `sendTestEmail` — test email, no PDF attachment; recipient is `gmail_connected_email` when the Gmail tab is active, otherwise `smtp_user`

`src/lib/sendEmail.js`'s `checkGmailProviderReady()` guard is still defined and still runs inside its own `sendEmail()`, but is no longer called directly by any component — the new router passes `emailProvider: 'smtp'` explicitly on the delegated path, so the guard is a no-op safety net there.

---

## 7A. GOOGLE SIGN IN / SIGN UP (Supabase Auth)

**Completely separate from the Gmail OAuth send feature in Section 7.** That feature uses its own Google Cloud OAuth client (`GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`, scope `gmail.send`) called from `/api/gmail-*.js` and writes to the `gmail_*` columns on `profiles`. This feature authenticates the user into the app itself via Supabase's built-in Google provider — no code in this repo ever sees a Google client secret for it; that credential lives only in the Supabase dashboard (Authentication → Providers → Google).

**Flow:**
1. User clicks **Continue with Google** (sign in) or **Sign up with Google** (sign up) on `Auth.jsx` — both render `GoogleAuthButton.jsx` with `mode="signin"`/`"signup"` above a divider over the email/password form.
2. `GoogleAuthButton` calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/#/auth/callback' } })`, which redirects the browser to Google's consent screen.
3. Google → Supabase's own auth callback → redirects back to `{origin}/?code=...#/auth/callback`. supabase-js's `detectSessionInUrl` exchanges the code for a session asynchronously on load.
4. `App.jsx` intercepts `window.location.hash.startsWith('#/auth/callback')` **before** the normal `authLoading`/`user` gate and renders `AuthCallback.jsx` as a standalone full-screen spinner — this has to happen outside `HashRouter`, since the router only mounts once a user is authenticated (`AuthenticatedApp`), so `/auth/callback` is not a react-router `<Route>`.
5. `AuthCallback.jsx` subscribes to `supabase.auth.onAuthStateChange` (not an immediate `getSession()` call — that can race ahead of the async code exchange and return a stale null session, the same class of bug documented in Section 10 "Auth loading/restoration pattern"). A 5-second fallback timeout calls `getSession()` directly in case the event already fired before the listener attached.
6. Once a session with a user arrives: checks `profiles` for an existing row by `id`. If none exists (first-time Google user), upserts `{ id, email, business_name: user_metadata.full_name || user_metadata.name || '', tutorial_completed: false }` — deliberately **not** setting `logo_url` from `user_metadata.avatar_url` (that's a personal photo, not a business logo). No DB trigger currently creates this row automatically — see below.
7. Redirects to `#/dashboard` (`window.location.hash = '#/dashboard'`). From there the existing first-run tutorial logic in `App.jsx`'s `AuthenticatedApp` (`checkFirstRun`, keyed off `profiles.tutorial_completed`) auto-starts the tutorial for the new user exactly as it already does for email/password sign-ups — no changes were needed there.
8. On failure (no session materializes) `AuthCallback.jsx` redirects to `#/login?error=auth_failed`; `Auth.jsx` reads that on mount, switches to login mode, shows "Google sign in failed. Please try again or use email and password." via the existing `error` state/display, and strips the query param with `history.replaceState`.

**No `auth.users` trigger exists in this project** (confirmed — same finding as Section 9 Known Issue #9 for `send-welcome-email`; there is no SQL file creating one). `AuthCallback.jsx` therefore creates the `profiles` row itself on first Google login. Optionally run this in the Supabase SQL Editor so future signups (Google or otherwise) always get a row immediately rather than relying on client-side creation:

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at)
  VALUES (NEW.id, NEW.email, NOW())
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

If this trigger is added, `AuthCallback.jsx`'s own upsert becomes a harmless no-op fallback (it already checks for an existing row first) — no code changes required either way.

**Required Supabase dashboard setup (not code):** enable the Google provider under Authentication → Providers, with its own Google Cloud OAuth client ID/secret (do not reuse the Gmail-send client), and register Supabase's project auth callback URL (`https://hczeuxhvnprhffsnktpf.supabase.co/auth/v1/callback`) as an authorized redirect URI in that Google Cloud project.

**Known limitation:** the OAuth redirect flow needs a real `http(s)` origin, so this works for the PWA (`app.fundibill.online`) but not the Electron desktop shell (`file://`) — no Electron-specific deep-link handling was built for this pass; the Google buttons still render in Electron but a click will attempt to redirect the app's `BrowserWindow` and fail to return correctly. If desktop Google sign-in is wanted later, it needs a custom protocol handler in `electron/main.js`.

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

### `send-welcome-email`
- **Location:** `supabase/functions/send-welcome-email/index.ts`
- **Triggered by:** a Postgres trigger on `auth.users` (`UPDATE`), created via SQL Editor — **not** a dashboard Database Webhook. Confirmed in this project that neither the Database → Webhooks screen nor the Triggers UI's table picker (which only lists `public.*` tables) can target `auth.users`, so the trigger + `pg_net.http_post()` call must be created directly via SQL (see Known Issues). The trigger fires on every `auth.users` UPDATE; the function itself filters so it only proceeds on the transition `email_confirmed_at: null → timestamp` (i.e. the user has just confirmed their email for the first time). There is no existing `notify-new-signup` function or webhook-secret-verification convention in this repo to follow; this function uses the same service-role-`Supabase` client pattern as `send-payment-reminders`, and relies on the Edge Functions gateway's default JWT verification (the SQL trigger sends the service role key as a Bearer token in its `pg_net.http_post()` headers — do **not** deploy with `--no-verify-jwt`).
- **What it does:**
  1. Reads `record`/`old_record` from the webhook payload; no-ops (returns `200 { skipped: true }`) unless `record.email_confirmed_at` is set and `old_record.email_confirmed_at` was null
  2. Dedup guard: looks up `profiles.welcome_email_sent` for the user — no-ops if already `true`
  3. Builds the welcome email HTML inline (mirrors `generateWelcomeEmail()` in `src/lib/emailTemplates.js` — Edge Functions run on Deno and can't import the Vite app's source tree, so the HTML is duplicated; keep both in sync by hand if the design changes)
  4. `POST`s to `https://api.fundibill.online/send-reminder.php` with `to_email`/`subject`/`html_body`/`from_name` (field names matched to the existing contract used by `src/lib/sendEmail.js` — see Known Issues about the unverified `from_email` field and the relay's usual SMTP-credential requirement)
  5. On success, sets `profiles.welcome_email_sent = true`
- **Env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (same as `send-payment-reminders`), plus `WELCOME_EMAIL_SMTP_HOST`/`WELCOME_EMAIL_SMTP_PORT`/`WELCOME_EMAIL_SMTP_USER`/`WELCOME_EMAIL_SMTP_PASSWORD` — set via `supabase secrets set` (never committed). `send-reminder.php` rejects requests with `"Missing required fields"` unless SMTP credentials are included, same as every other caller in this codebase; since this is a system email with no per-user profile to pull SMTP settings from, it uses its own `info@fundibill.online` mailbox (`mail.fundibill.online:465`) instead.

### `process-recurring-invoices`
- **Location:** `supabase/functions/process-recurring-invoices/index.ts`
- **Triggered by:** cron (`pg_cron` + `pg_net`) — not deployed with a schedule by default; see the SQL in the function's own header comment (same `cron.schedule(...)` / `net.http_post(...)` pattern as `send-payment-reminders`). Recommended: once daily.
- **What it does:** creates the next invoice for every due `recurring_invoices` template, then — if `auto_send` is on for that template — emails it to the client with a PDF attached. Full behavior described in Section 6 "Auto-Send Recurring Invoices"; this was previously a missing piece (see Known Issue #2, now resolved by this function).
- **Env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (same as every other function here); `VITE_APP_URL` (new — used to call `/api/generate-invoice-pdf` and `/api/send-gmail` on Vercel); `WELCOME_EMAIL_SMTP_HOST`/`_PORT`/`_USER`/`_PASSWORD` (reused from `send-welcome-email`, for the CC-user confirmation email only). Does **not** need `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` — Gmail sending is delegated to the existing `/api/send-gmail` Vercel function, which already has those.

---

## 9. KNOWN ISSUES

1. **PayFast subscription cancellation API:** The `cancel-subscription` edge function updates the DB correctly but PayFast's own dashboard may still show the subscription as Active. Workaround: manual cancellation in PayFast merchant account.

2. **Recurring invoice future scheduling — resolved (`v5`):** Only the FIRST invoice used to be created, by the frontend save flow — subsequent invoices for ongoing schedules had no mechanism creating them. `supabase/functions/process-recurring-invoices/index.ts` (Section 6 "Auto-Send Recurring Invoices", Section 8) is now that mechanism, but **it must be deployed and scheduled via `pg_cron` before recurring invoices resume beyond their first send** — see the function's own header comment for the exact schedule SQL. Until that's done, this reverts to the old behavior (first invoice only).

3. **Gmail OAuth:** app is in Testing mode (100 user cap). Google verification submission required before public rollout. Needs: demo video, privacy policy review, domain verification.

4. **Blank name fields in PayFast emails:** `fundibill-buy.php` sends `name_first` / `name_last` to PayFast but they appear blank in confirmation emails. Under investigation.

5. **Logo in emails — resolved:** base64 data-URL logos are stripped by Gmail, Outlook, and most clients for security, so only HTTPS logo URLs appear in emails. `Settings.jsx`'s logo upload now uploads to the Supabase Storage `logos` bucket (public, path `{user_id}/logo.{ext}`, `upsert: true`) and stores the resulting public URL (with a `?t=` cache-busting suffix) in `profiles.logo_url` — no more base64. Requires the `logos` bucket + RLS policies to exist in Supabase (see the SQL in the commit that introduced this, or re-run: create a public bucket named `logos`, `select` policy open to everyone, `insert`/`update`/`delete` policies scoped to `auth.uid()::text = (storage.foldername(name))[1]`). Accounts that uploaded a logo before this fix still have a base64 `logo_url` until they re-upload.

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

8. **`send-welcome-email` relay payload — resolved:** confirmed via `select * from net._http_response` that `send-reminder.php` returns `{"error":"Missing required fields"}` when `smtp_host`/`smtp_port`/`smtp_user`/`smtp_password` are omitted — there is no fallback system sender. The function now sends FundiBill's own `info@fundibill.online` mailbox credentials (`mail.fundibill.online:465`) read from the `WELCOME_EMAIL_SMTP_*` Supabase secrets (see Section 8). The unused `from_email` field was dropped — `send-reminder.php` doesn't read it, same as every other caller. A failed send still surfaces as a `500` from the edge function and is not retried automatically.

9. **`auth.users` Database Webhooks — no dashboard UI in this project:** confirmed neither the Database → Webhooks screen nor the Database → Triggers "Create a new trigger" table picker expose the `auth` schema (Triggers only lists `public.*` tables) — there is no dashboard path to attach a webhook/trigger to `auth.users` in this project. The `send-welcome-email` trigger **must** be created via the SQL Editor using the `pg_net`-based function/trigger shown in the `send-welcome-email` setup instructions — this is the only working method, not a fallback.

10. **Partial payments — `payments` table migration required, and legacy `amount_paid` was not backfilled:** `supabase/migrations/add_payments_table.sql` must be run manually in the Supabase SQL Editor before the Partial Payments feature (Section 6) works — it creates the `payments` table + RLS policy and conditionally widens any existing `invoices.status` CHECK constraint to allow `'partial'` (the migration is self-inspecting; if no CHECK constraint exists on `status` it safely no-ops, since the column is already unconstrained text). By explicit decision, **no backfill was performed** for invoices with a pre-existing nonzero `amount_paid` (e.g. Zoho-migrated data) — those invoices have no corresponding `payments` rows. Their Payment History section (both detail view and PDF) will be empty despite `amount_paid > 0`, and recording a new payment against one of them will recalculate `amount_paid` from `payments` alone, overwriting the un-backfilled legacy figure. See the `payments` table note in Section 4 for the full explanation and the manual-backfill workaround if a specific invoice needs it.

11. **Multiple banking accounts — `banking_details` table migration required; pre-feature invoices/estimates have `banking_details_snapshot = NULL`:** `supabase/migrations/add_banking_details_table.sql` must be run manually in the Supabase SQL Editor before the Multiple Banking Accounts feature (Section 6) works — it creates the `banking_details` table + RLS policy, adds `banking_details_snapshot` JSONB to `invoices`/`estimates`, and migrates each user's existing `profiles.banking_details` into a single default `banking_details` row (skipped for users whose `profiles.banking_details` is free text rather than JSON, or already empty). Invoices and estimates created before this feature has no `banking_details_snapshot` — `src/pdf/PdfDocument.jsx` and every `pdfData` call site fall back to the user's *current* `profiles.banking_details` for those, exactly as PDF generation already worked before this feature existed. No backfill was performed or needed here (unlike the `payments`/`amount_paid` case above) — the fallback is the intended, permanent behavior for old documents, not a stopgap.

12. **Auto-send recurring invoices — migrations, deploy, and cron schedule all required:** manual steps before this feature (Section 6 "Auto-Send Recurring Invoices") does anything: (a) run `supabase/migrations/add_recurring_auto_send.sql` **and** `add_recurring_banking_detail.sql` in the SQL Editor; (b) deploy `process-recurring-invoices` (`supabase functions deploy process-recurring-invoices --no-verify-jwt`) — **and redeploy it after every code change**, since (unlike the Vercel side) nothing auto-deploys this function from a git push; (c) schedule it via `pg_cron`/`pg_net` using the SQL in that function's own header comment. None of these happen automatically. Also note this same function is what makes recurring invoices continue *at all* past their first send (see Known Issue #2) — deploying it is not optional if recurring invoices are meant to keep recurring, independent of whether auto-send is used.
    - **Testing note (from actually building this):** `denomailer` (Deno's SMTP client) failed against a real SMTP host with a confusing "Bad resource ID" / unhandled "invalid cmd" error pair (a TLS/STARTTLS negotiation mismatch, compounded by a since-removed `Promise.race` "timeout" that abandoned the still-running send instead of cancelling it). `sendViaSmtp()` now routes through the `send-reminder.php` relay instead — the same one the PWA already uses successfully for these exact credentials — rather than talking SMTP directly from Deno. If touching that function again, don't reintroduce a direct `denomailer` send without solid evidence it's needed.

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
- `payments` also does **NOT** have RLS scoped through a parent table — it has its own `user_id` column and RLS policy (unlike `invoice_items`/`estimate_items`); always insert `user_id` when writing to it
- `banking_details` follows the same pattern as `payments` — its own `user_id` column and RLS policy; always insert `user_id` when writing to it. Never write `invoices.banking_details_snapshot`/`estimates.banking_details_snapshot` directly except via `createBankingSnapshot()` in `src/utils/bankingDetails.js`, so the stored shape always matches what `PdfDocument.jsx` expects
- Never write directly to `invoices.amount_paid`/`status` for a payment change — always go through `src/utils/payments.js`'s `recordPayment()`/`deletePayment()` so the two stay in sync with the `payments` table

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
- **Auth loading/restoration pattern:** `AuthContext` does **not** call `supabase.auth.getSession()` on mount. On a hard full-page reload (e.g. the OAuth-style redirect back from `/api/gmail-callback.js`), `getSession()` can resolve with a stale `session: null` before the Supabase client finishes restoring the real session from `localStorage`, which would flip `loading` to `false` with no user and briefly bounce an already-logged-in user to the login screen. Instead, `loading` (exposed as `authLoading` in `App.jsx`) starts `true` and is only set `false` inside the `onAuthStateChange` callback — whose first invocation (`event: 'INITIAL_SESSION'`) fires only once Supabase has actually finished restoring the session, so it's the single source of truth. `App.jsx`'s top-level guard renders nothing while `authLoading` is true, `<Auth/>` only once `authLoading` is false and `user` is null — never based on a mid-restoration snapshot.

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
| `WELCOME_EMAIL_SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` | `send-welcome-email`, `process-recurring-invoices` (CC-user email only) |
| `VITE_APP_URL` | `process-recurring-invoices` — base URL for `/api/generate-invoice-pdf` and `/api/send-gmail` on Vercel. **Check whether this secret already exists in Supabase** (it's a *Vercel* env var already — see the table above — but Supabase Edge Function secrets are a separate store; it likely needs adding there too) |

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
