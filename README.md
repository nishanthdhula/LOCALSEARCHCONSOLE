# Orbit RCS Operations Portal

A greenfield admin/reseller portal foundation for managing accounts, campaign drafts, templates, API credentials, and user activity. It uses an original interface and does not copy the referenced sign-in page or use its assets.

## Run locally

Requirements: Node.js 20.6 or newer.

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Open `http://127.0.0.1:3000`. On a fresh local development database, the initial account is:

- Email: `admin@rcs.local`
- Password: `ChangeMe!ChangeMe!`

Change the development credentials before sharing the app. In production, set `NODE_ENV=production`, `APP_SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`; the server refuses to start without them. The initial administrator is created only when the database has no admin account. Account passwords are stored as bcrypt hashes.

## Included workflows

- Session login/logout with role-based access for admins, resellers, users, and permission-scoped employees.
- Self-service password changes; changing a password invalidates the account's other active sessions.
- Admin account management and platform pricing; resellers can create/manage customer accounts, configure one bot/brand per account, review campaigns, and set customer-specific rates. Admins may explicitly enable sub-reseller creation. Users can view their account profile but cannot create or manage accounts.
- Internal bot IDs and keys are managed by administrators and active employees, never by resellers or users. Bot keys are encrypted at rest and are never returned to the browser; authorized staff can replace a key without revealing the saved value.
- Support tickets can be created by users and resellers, reviewed by admins, and handled by employees with support access.
- Account billing profiles support prepaid or postpaid mode and a configurable credit limit. Resellers can transfer available wallet credits to managed customers; admins can adjust wallets. These are operational ledger/configuration features, not payment processing, invoice settlement, or cumulative postpaid usage tracking.
- Admins and resellers can configure minimum and maximum recharge amounts for accounts in their hierarchy. These settings are informational policy only; they do not initiate a payment or change a wallet balance.
- Users can view their account and bot/brand details but cannot edit or delete them; they can manage their templates, campaigns, and API keys. Campaign drafts support a 3-step wizard, editing, duplication, CSV audience import/validation, consent checks, scheduling records, status filters, search, message previews on reports/run requests, and CSV export. Recipient data is encrypted at rest. Resellers can prepare and review drafts but cannot run or schedule campaigns.
- Templates can be submitted for portal-admin approval, and admins/resellers can submit bot/brand configurations; campaigns require approved bot and template configurations before scheduling.
- Global Jio/Vi per-message rates and account overrides are stored in paise (INR). Admins set platform defaults; resellers can set rates for accounts in their hierarchy. Rates are informational and do not yet create invoices or calculate carrier charges.
- Audit events for sign-ins, failed sign-ins, account and status changes, campaign/template creation, API-key operations, and rejected message requests.
- The admin activity view and CSV export include request IP, approximate IP-derived location, user agent, event time, actor, and resource. Only admins can access IP, location, or user-agent data; other roles receive activity without those fields. Geolocation is an offline, approximate lookup and may be unavailable for private or unmapped addresses.
- White-label branding supports per-account product names, logos, colors, support email, login slugs, and custom domains. Users inherit the nearest configured account brand; admins/resellers manage branding, and employees can be granted a dedicated customer-branding permission by an admin.
- SQLite persistence for operational data and sessions under `data/` by default.
- `/api/openapi.json` and a portal page with API key management and message request examples.

## Internal bot credentials

Set `BOT_CREDENTIALS_KEY` in the server environment before saving bot keys or Jio credentials. It must be a stable, randomly generated 32-byte value encoded as 64 hexadecimal characters; `.env.example` includes a Node.js command to generate one. Keep it separate from source control and preserve it with the database backups. Losing or rotating this key makes existing encrypted credentials unreadable. Stored bot keys are never exposed to users or used for provider authentication.

Set a separate stable, randomly generated 32-byte `CAMPAIGN_RECIPIENTS_KEY` before importing campaign recipient CSV files. Generate it with the command in `.env.example`. Recipient lists are compressed and encrypted with AES-256-GCM in the SQLite database and are never returned by campaign list or report APIs. Losing or rotating this key makes saved campaign recipient data unreadable. CSV imports accept phone-number columns and optional personalization columns; scheduling requires a `consent` (or `opt_in`/`opted_in`) column with an explicit positive value for every row. Campaign upload and schedule/run attempts are recorded in the activity log with the acting user, timestamp, request IP, and relevant campaign metadata; the original upload file itself is not retained.

## Carrier integration status

The admin Provider setup page supports an explicit Jio text-message connector. Save the authorized assistant ID and secret, test OAuth, then enable sending; credentials are encrypted at rest and never returned to the browser. Saving changed credentials disables sending and requires a fresh test. The test only requests an OAuth token and does not send a message. Set and preserve `BOT_CREDENTIALS_KEY` before configuration. OAuth sends the client secret in the query string as required by the supplied guide, so reverse-proxy/access logs must redact query parameters.

All roles can view provider readiness on their Overview dashboard and open the read-only Provider setup page. Only admins can view or change Jio configuration or enable/disable delivery.

The Overview dashboard includes daily and month-selectable RCS message metrics. Admins see system-wide API message events, resellers see their account and descendants, and users see only their own account. Submitted counts mean Jio accepted an asynchronous request; pending counts include submissions without a final status and sends with an unknown outcome. Sent and delivered remain unavailable until Jio callbacks are implemented, and SMS is not configured. Analytics dates are UTC.

`POST /v1/messages` can submit text through Jio only when the connector is enabled and the API-key owner's Jio bot is approved. A successful response means accepted/submitted, not delivered. Jio callbacks are not implemented, so ambiguous timeouts must be checked with the provider before retrying. Campaign scheduling stores a future queue time but does not dispatch messages; campaign execution, rich messages, delivery callbacks, and Vi sending remain unavailable. Campaign run requests return HTTP 503 with `provider_not_configured`, leave the campaign unchanged, and record an audit event. Reseller campaign run requests return HTTP 403. Campaign reports do not claim submitted, sent, or delivered totals without provider callbacks. No real credentials or provider message should be sent until the account has authorized and configured them.

The connector uses official Jio production and pre-production hosts from the supplied integration guide. Before production use, obtain Jio partner approval and verify sender/template registration, recipient consent, callback verification requirements, throughput limits, error codes, and retry guidance with Jio. Do not put credentials in the browser or commit them to source control.

## Deployment and privacy

- `database/mysql-schema.sql` is a schema-only MySQL 8.0.13+/compatible MariaDB script for import into a database created in cPanel. It does not contain local SQLite data or seed credentials. The application currently uses SQLite; importing this file alone does not connect the application to MySQL.
- Terminate HTTPS at a trusted reverse proxy and set `NODE_ENV=production`.
- Generate a unique, stable `APP_SESSION_SECRET`. Production trusts one hosting proxy by default so secure cookies work behind GoDaddy cPanel's HTTPS proxy; set `TRUST_PROXY` to the actual trusted proxy hop count if your host uses a different topology. The app must remain behind the trusted proxy and should not be directly exposed.
- A production Docker deployment is provided with `Dockerfile` and `docker-compose.yml`. Copy `.env.example` to `.env`, replace all credentials and generate stable `APP_SESSION_SECRET`, `BOT_CREDENTIALS_KEY`, and `CAMPAIGN_RECIPIENTS_KEY` values before starting with `docker compose up -d --build`. The compose service binds inside the container on `0.0.0.0:3000` and stores SQLite data in the persistent `portal-data` volume. Restrict the published port to a trusted reverse proxy/firewall; do not expose the app directly to the internet.
- The server applies schema migrations at startup. `/healthz` checks the SQLite database. Keep one app replica only: SQLite and the local session store are not configured for multi-replica deployment.
- Back up the SQLite database and encryption keys together, and test restore procedures before production use. When moving an existing database, stop writes to the source before taking a consistent SQLite backup, restore it into the persistent `DATA_DIR`, and then start the app so startup migrations can run. Do not copy only the main database file while the source is running in WAL mode; use SQLite's online backup API/tool.
- For a customer custom domain, point DNS to the portal and configure a valid TLS certificate at the trusted reverse proxy. The application maps configured domains to tenant branding; it does not provision certificates or manage DNS.
- Back up and protect the SQLite database and session store.
- Audit logs retain IP addresses, approximate location results, and browser/client strings. Restrict access to admins, provide appropriate notice, and define retention/deletion rules before production deployment.
- Configure monitoring, backups, email/password recovery, admin MFA, and a production database/secret manager before handling real customer traffic.

This is a working starter platform, not a carrier-certified production integration. Carrier delivery, billing/settlement, message receipts, unsubscribe/consent enforcement, and production compliance depend on provider contracts and requirements that were not supplied.
