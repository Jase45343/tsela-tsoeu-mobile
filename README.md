# Bus Ledger

Record-keeping for school bus operators in Lesotho, built to **SRS v1.3, Phase 1**.
The app records payments received outside it (cash, M-Pesa, EcoCash, bank) and keeps the books.
**It never sends, holds or receives money** (SRS §3.4).

```
packages/core   Shared bookkeeping engine (TypeScript). Used by both the phone and the server.
apps/server     API: Fastify + PostgreSQL. Auth, sync, period generation, reports, export.
apps/mobile     Android app: Expo SDK 57 / React Native, encrypted offline database.
```

The phone and the server run the **same** allocation code, so a balance shown offline is
computed exactly the way the server will compute it. The server's result is authoritative (SRS §5.1).

## Status

| Part | State | Checked by |
|---|---|---|
| Core engine | Complete for Phase 1 | 28 unit tests |
| Server | Complete for Phase 1 | 14 integration tests on real Postgres (PGlite) |
| Android app | All Phase 1 screens written | TypeScript strict, Android bundle compiles (Hermes) |

**Not yet done:** the app has not been run on a device or emulator, and the phone-side sync
engine has no automated tests (it needs a native SQLite). Treat the first device run as the
real test of the app. Phase 2 (Sesotho voice) is not started.

## Run the server

With Docker:

```sh
docker compose up --build        # API on http://localhost:8080, migrations run on start
```

Without Docker (Node 22, a Postgres you control):

```sh
npm install
export DATABASE_URL=postgres://user:pass@localhost:5432/busledger
export JWT_SECRET=$(openssl rand -hex 32)
npm run dev -w @busledger/server
```

Tests (no database needed — they use an in-process Postgres):

```sh
npm test
```

## Run the Android app

The local database is encrypted with SQLCipher, which needs a native build, so **Expo Go will not work**.
Use a development build:

```sh
npm install
cd apps/mobile
# Point the app at your API (10.0.2.2 is the host machine from the Android emulator):
#   edit "extra.apiUrl" in app.json
npx expo run:android          # needs Android Studio / SDK; or use EAS Build: eas build -p android
```

PIN reset codes are printed in the server log in development (see "SMS" below).

## What is where (SRS mapping)

| Requirement | Where |
|---|---|
| FIFO allocation, credits, cancellations (FR-010, FR-015, FR-017, FR-039) | `packages/core/src/allocation.ts` |
| Periods, first-period override, catch-up generation (FR-005, FR-008, FR-038) | `packages/core/src/periods.ts` |
| Overdue + grace, account status (FR-018, FR-019) | `packages/core/src/accounts.ts` |
| Dashboard, daily/monthly reports, history (FR-020, FR-026–028) | `packages/core/src/reports.ts` |
| Acknowledgement + reminder text (FR-022, FR-025) | `packages/core/src/messages.ts` |
| CSV export (FR-029) | `packages/core/src/exports.ts` |
| Auth, PIN lockout, SMS reset (FR-001–003) | `apps/server/src/app.ts` |
| Sync protocol, idempotency, immutability, audit (FR-016, FR-032, NFR-005) | `apps/server/src/sync.ts` |
| Schema (§8) | `apps/server/migrations/001_init.sql` |
| Encrypted local DB (NFR-004) | `apps/mobile/src/db/database.ts` |
| Phone sync engine (FR-032, FR-033) | `apps/mobile/src/sync/engine.ts` |
| Idle PIN lock (FR-002) | `apps/mobile/src/ui/LockScreen.tsx`, `src/data/AppContext.tsx` |
| ≤ 4-tap recording with inline review (FR-014, NFR-001) | `apps/mobile/app/record.tsx` |

## Decisions made while building

- **Payments are immutable.** A wrong record is voided, or voided and replaced by a correction
  that links to it. The server rejects edits to an existing payment's fields.
- **PIN of 6–8 digits**, rejecting repeated or sequential numbers; 5 wrong PINs lock sign-in for 15 minutes.
- **Cold start asks for the PIN.** The idle lock defaults to 5 minutes and works offline (a salted,
  stretched verifier is kept in the Android Keystore; the PIN itself is never stored).
- **Credit adjustments sit in the timeline at the date they were made**, so a refund of credit is
  taken before any later month could absorb it. The server refuses an adjustment larger than the
  available credit.
- **Dashboard shows two "money in" figures:** *recorded for October* (after FIFO allocation) and
  *cash received in October* (whichever months it paid for). They differ when parents pay arrears or ahead.
- **Cancelled months** are counted separately in reports and excluded from paid/unpaid counts (open question 5).
- Grace period default is 7 days and due day default is the 1st; both are operator settings.

## Before production

1. **SMS provider.** `apps/server/src/main.ts` uses a console sender. Plug in a provider that
   delivers to Econet and Vodacom Lesotho numbers by implementing `SmsSender`.
2. **Backups (FR-036).** Use managed Postgres with point-in-time recovery retained for 30 days.
3. **Audit protection (NFR-005).** Run the API as a role without `UPDATE`/`DELETE` on `audit_log`;
   run the 90-day account purge as the owner role.
4. **HTTPS** in front of the API, and set `extra.apiUrl` in `apps/mobile/app.json` to it.
5. **`JWT_SECRET`**: at least 32 random characters, kept out of the repository.
6. **App icon and splash artwork** — none are included yet.

## Translations

All Sesotho text (`apps/mobile/src/lib/i18n.ts`, `packages/core/src/messages.ts`, month names in
`packages/core/src/dates.ts`) is a **first draft**. Have a native speaker review it before release.
