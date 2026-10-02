# P2 gate review · Fontes, personalização e conta

- **Reviewer:** fresh gate reviewer (read-only, `requesting-code-review/code-reviewer.md` method, `docs/AUTONOMY.md` §5)
- **Branch / HEAD:** `claude/keen-hypatia-8qn86r` @ `e2099c4`
- **Scope:** commits tagged `[P2-T1]`..`[P2-T12]` (e0e598b, 53f5d62, df62faf, a23351b, f27781d, 9f7cd0d, 0e21fee, d089b3c, 6e9e971, 9f83ed9, 81ad154, d76d95d, 2c0a87f), migrations 0012–0014, and the P2 screens and flows.
- **Authority used:** spec §5.2–5.4 and §7, plan P2, `docs/screens.md` P14–P23 and C01–C06, `docs/tracking-plan.md`, CLAUDE.md §5 and §8, DECISIONS A-052, A-055 and A-057.

## Verification run

| Check | Result |
|---|---|
| `pnpm vitest run src/lib/{anon,consent,events,ranking,auth,newsletter,alerts,sources} src/components/editorial` | 28 files, 354 tests, all pass |
| `pnpm typecheck` | clean |
| `pnpm lint` (eslint + prettier) | clean |
| E2E, a11y, integration | not re-run in this review (the local stack was not started). I relied on the numbers in `docs/reports/P2.md`. |

## Strengths

- **Consent defaults to deny, both sides.** `allowsSending` returns false for undecided or necessary-only consent (`src/lib/consent/index.ts:111`). The server also rejects an `anonId`, `userId` or personal prop sent without Personalização, and it validates props with strict per-event zod schemas (`src/lib/events/schema.ts:90-128`). Page paths have their query strings stripped, and the referrer is reduced to its origin.
- **The anonymous profile is disciplined.** `anonId` exists only with Personalização. Revoking consent removes the id, history, searches and interests while keeping follows and saved items (`src/lib/anon/store.ts:218-220`, `:427-435`). Every value read from IndexedDB is normalized, retention is enforced, and a memory fallback shows the degraded warning.
- **Personalization runs in the browser, and interests are limited to editorias** (with evidence, and weak until 3 distinct days), so nothing sensitive is inferred (`src/lib/anon/interests.ts`). The ranking tests cover the 25% cap, discovery, "gostar" and sensitive topics in justifications.
- **Aggregated content is not republished.** `toAggregatedView` accepts only http(s) URLs, the card never carries an image, and the summary is CityNews' own (`src/lib/db/queries/aggregated.ts:35-68`). Sitemap entries for sources are limited to `active`/`degraded`.
- **Login invites** use the fixed texts, always offer "Agora não", appear at most once per trigger every 7 days, and are hidden for signed-in readers (`src/components/editorial/LoginInvite.tsx`).
- **Account basics are careful:** recovery and magic-link replies are neutral; confirmation needs a button tap (so mail scanners can't consume it); failed-login keys are hashed; the migration payload is re-normalized on the server and written with the reader's own RLS session; staff accounts are never auto-deleted.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

**I1. Open redirect after login through control characters in `next`.**
- *Where:* `src/lib/auth/account.ts:100-106`, consumed by `src/components/editorial/MigrateLocal.tsx:95`, `:139`, `:195` (`router.replace(next)`).
- *What:* `safeNext` rejects `//` and `/\` but accepts `"/\t/evil.com"` (URL `?next=/%09/evil.com`). The WHATWG URL parser strips tab, CR and LF, so `new URL("/\t/evil.com", origin)` resolves to `https://evil.com/`; I confirmed this with Node. The value passes `safeNext` in `/entrar`, survives `afterLogin` because `URLSearchParams` encodes it, reaches `/entrar/migrar`, and `router.replace(next)` treats it as an external URL and navigates away.
- *Why it matters:* this is the classic post-login phishing vector. The reader has just typed a password on citynews and lands on a lookalike "session expired" page.
- *Fix:* reject any control or whitespace character (`/[\u0000-\u001f\u007f\s\\]/`), then resolve with `new URL(next, "https://x.invalid")` and require `origin === "https://x.invalid"`. Return `pathname + search + hash`. Add unit cases for `\t`, `\n`, `\r` and `%09`. `src/lib/auth/permissions.ts:137` has the same pattern for the Estúdio; fix it too.

**I2. Every staff member can read readers' migrated reading history and interests.**
- *Where:* `supabase/migrations/0013_reader_account.sql:8-11`; policies at `supabase/migrations/0002_rls.sql:352` (`profiles_read_staff`, gated only by `is_staff`) and `:355` (`profiles_admin`).
- *What:* `profiles.preferences` holds `history` (read refs, seconds, scroll, section, source), `interests` and `hidden`. The 0013 comment says "Só o próprio leitor lê e grava", but that is false. `profiles_read_staff` lets any role, including `leitura`, `analista` and `moderador`, select the whole row.
- *Why it matters:* individual reading history becomes visible to the newsroom. That is a privacy leak and breaks the spirit of CLAUDE.md §5.7 and the tracking plan, where individual data is used only for the reader's own recommendations.
- *Fix:* move reader preferences to their own table with a self-only policy, or revoke column-level `select (preferences)` from `authenticated` and expose it only through a self-scoped RPC. Add an RLS integration test in which a staff user (for example `analista`) cannot read another reader's `preferences`.

**I3. Migration sends the whole local profile to the server, whatever the reader ticked.**
- *Where:* `src/components/editorial/MigrateLocal.tsx:119` (`action(profile, choice)`) and `src/app/(public)/entrar/migrar/actions.ts:24-38`.
- *What:* the Server Action body always contains `anonId`, the full 30-day history, recent search texts, and the addresses of email alerts, even when "Histórico" is unchecked (it is unchecked by default per spec §5.4). The server discards what wasn't chosen, but the data has already crossed the wire and can land in request logs or traces.
- *Additional problem:* when history is migrated, `migrated_from_anon` stores the `anonId` in the account (`src/lib/db/account.ts:245`). That joins up to 90 days of pseudonymous `events` rows to an identified account. The C06 screen does not disclose this, and it contradicts A-055 ("id anônimo nunca vai ao servidor").
- *Fix:* build a minimal payload in the client from `choice`: source and other follows, saved items, collections and alerts only when "follows"/"saved" are checked; interests and hidden only when "interests" is checked; history (without `anonId`) only when "history" is checked; never send searches. Either drop `migrated_from_anon`, or state it in the "Histórico" checkbox copy and record it in DECISIONS.

**I4. A second confirmation email within 10 minutes is silently dropped, so that alert or newsletter list can never be confirmed.**
- *Where:* `src/lib/db/writes.ts:172-182` (dedupe on `to_email + kind`); callers `src/app/api/alertas/route.ts:121-129` and `src/lib/newsletter/subscribe.ts:83-103`.
- *What:* a reader who creates two email alerts within 10 minutes (say "bairro CPA" and "urgentes") gets `pending` for both. The second `alert_confirm` is never queued. The first link carries only `alert:<id1>` (`src/app/(public)/alertas/confirmar/page.tsx:28-31`), so alert 2 stays `active=false` forever. The same happens with newsletter lists A then B: list B stays unconfirmed.
- *Fix:* dedupe on the payload (a hash of subject and body, or the alert id), or merge pending ids for the same address into a single link. Add an integration test that creates two alerts and confirms both.

**I5. Account deletion and export leave out data keyed by the account's email.**
- *Where:* `supabase/migrations/0014_account_deletion.sql:92-98`; `src/lib/db/account.ts:274-304`.
- *What:* the purge removes follows, saved items, alerts owned by the uid, collections, profile and the auth user. It leaves `newsletter_subscriptions` for the account email (sign-up can subscribe it: `src/app/(public)/criar-conta/actions.ts:52-58`), `alerts` with `owner_ref = 'email:<account email>'`, and queued `reader_emails` for that address. The LGPD export omits the same data.
- *Fix:* in `purge_deleted_accounts`, read `auth.users.email` before deleting, then delete or anonymize the matching rows in those three tables. Include them in `exportAccount`. Extend `tests/integration/account.test.ts`.

**I6. Newsletter double opt-in and email-alert confirmation happen on a GET page load.**
- *Where:* `src/app/(public)/newsletter/preferencias/page.tsx:42-43` (`confirmar=1` confirms while rendering) and `src/app/(public)/alertas/confirmar/page.tsx:28-31`.
- *What:* link scanners and prefetchers in corporate mail and in Gmail and Outlook safe-links open these URLs and confirm the subscription without the person. That defeats double opt-in, which is the consent proof, and lets anyone subscribe a third party whose mail gateway follows links. A-057 already chose a button tap for account confirmation for exactly this reason; the reader flows should be consistent.
- *Fix:* render a "Confirmar inscrição" / "Confirmar alerta" form and perform the write in a Server Action.

**I7. The browser-alert poller sends a stable per-device timestamp with no consent check.**
- *Where:* `src/components/editorial/AlertWatcher.tsx:44-47`.
- *What:* `desde` is the millisecond-precision ISO creation time of the oldest local alert. It is unique per browser, constant across sessions, and sent every 15 minutes whatever `cn_consent` says, so it works as a quasi-identifier in access logs. Spec §5.3 says "sem Personalização … nada é enviado ao servidor com identificador". The server already clamps the window (`src/lib/db/queries/alerts.ts:21`), so the precise value isn't needed.
- *Fix:* send a coarse value such as the last check time rounded down to the hour, or omit it and let the server use its fixed window.

**I8. Outbound email carries client-controlled text.**
- *Where:* `src/lib/alerts/email.ts:32` and `:63`.
- *What:* the `label` in `/api/alertas` (120 characters of free text) goes verbatim into `ALERTS_TEXT.mailBody` and is queued to any address. Once B-005 enables sending, anyone can make CityNews mail arbitrary strangers something like "Seu alerta 'Pix recusado, regularize em http://…' foi criado". The 5/h per-IP limit only slows this down.
- *Fix:* ignore the client label and derive it on the server from `kind` and `target` (section name, neighborhood list, topic title), rejecting unknown targets.

### Minor (Nice to Have)

- **M1. The server doesn't enforce minimisation for metrics-only events.** `src/lib/events/schema.ts:112-123` still accepts any `session.id` (up to 64 chars) and a `referrer` when `personalization=false`. The client sends `"-"` and `null`, but the server should require them (`session.id === "-"`, `referrer === null`) so a modified client can't store a persistent id under metrics-only.
- **M2. The login lockout fails open.** In `src/app/(public)/entrar/actions.ts:30-35`, if `readLoginFailures` errors, no lock applies. Read-then-record also lets parallel attempts exceed 5. Without the salt in production, the key becomes `"sem-sal"`, which makes the lock per email for everyone, a DoS lever. Consider failing closed when the lock can't be read, and an atomic check-and-increment.
- **M3. No re-authentication for sensitive account actions.** Changing the password in /perfil needs no current password (`src/app/(public)/redefinir-senha/actions.ts:19-21`). Requesting deletion needs no password and sends no notification email (`src/app/(public)/perfil/actions.ts:115-127`). A hijacked session can take over or schedule deletion. Enable Supabase "secure password change" (nonce) or ask for the current password, and send a notice when deletion is scheduled.
- **M4. Sign-up reveals existing accounts.** It returns `exists` (`src/app/(public)/criar-conta/actions.ts:46-47`) while recovery and magic link are neutral. With confirmation on, Supabase already hides this; with it off, the site becomes an enumeration oracle.
- **M5. Retention of reader emails isn't scheduled.** `purge_reader_emails` (`supabase/migrations/0012_reader_email.sql:31-46`) is never scheduled (no pg_cron entry and no cron route). Queued messages, which contain signed links and third-party addresses, and unconfirmed `email:` alerts (`active=false`) are kept indefinitely.
- **M6. The Panorama "Mais recentes das suas fontes" list is too thin.** It filters only the 24 newest items overall (`src/app/(public)/panorama/page.tsx:29`, `PanoramaClient.tsx:86`), so a followed low-volume source rarely shows and the list is often empty. Fetch per-source top N, or a larger window, for the client filter.
- **M7. One failure blocks all account deletions.** `purge_deleted_accounts` has no per-account exception block (`supabase/migrations/0014_account_deletion.sql:85-102`), so a single failing account aborts the batch every day.
- **M8. The local profile download can be cancelled.** `URL.revokeObjectURL` is called right after `a.click()` (`src/components/editorial/LocalProfileCard.tsx:24-25`), which can cancel the download in Safari and Firefox. Defer it with `setTimeout`.
- **M9. Sign-up's rate limit shows the wrong message.** It returns `unavailable` instead of a rate-limited state (`src/app/(public)/criar-conta/actions.ts:33`), so the message is misleading.
- **M10. Migrated email alerts get duplicated and redirected.** `src/lib/anon/migrate.ts:192-194` and `src/lib/db/account.ts:179-190` copy a confirmed local email alert into an active account alert while the `email:<addr>` row stays. The reader would get both, and the account copy goes to the account email, which may differ from the address that was confirmed.
- **M11. Signed tokens aren't tied to a purpose.** The HMAC input is `newsletter:${payload}` for every purpose (`src/lib/newsletter/token.ts:21-22`), so an alert-confirmation token also opens that email's newsletter preferences. Impact is low because it proves the same mailbox, but add a purpose field (`p: "newsletter" | "alert"`) and check it.
- **M12. Account sync is write-only (known, A-057).** Favoritos and Fontes never read account data, so the invite's promise ("em qualquer dispositivo") isn't met after login on a second device. Meanwhile, migrated history sits on the server unused, and the only way to erase it is full account deletion. Give this an owning phase or task (and a `B-###` entry), and add a "Apagar histórico da conta" control or stop migrating history until it is used.
- **M13. The gate report is incomplete against AUTONOMY §5.** `docs/reports/P2.md` has no note on the design audit (`impeccable`, or the A-026 fallback as in P1.md), no degraded list for this gate, and no JS budget re-measure. P2 adds ConsentProvider, LoginInvite, FirstVisitInvite and AlertWatcher to every public page, while the home was already over budget at 191 kB against 170 kB (P1.md:90).

## Declined to judge

- **The server trusts the consent flags in the event envelope instead of cross-checking the `cn_consent` cookie.** The envelope is client-built by design (tracking-plan §1). M1 covers the minimisation gap.
- **The lockout is keyed by email plus IP hash, not email alone.** This was decided in A-057. Supabase Auth's own per-IP limits apply on top.
- **Ranking runs in two steps with the profile applied only in the browser.** A-055; it doesn't break a spec rule.
- **Interests use editorias such as "Política".** This is a topical section, not an inference about political orientation. Justifications never name sensitive topics (tests cover this).
- **Google login is off, Auth email templates are in English, and there is no real email sending.** These are known blockers B-006 and B-005.
- **The service worker caches saved article pages with same-origin credentials.** It is local to the device and holds no server-side personal data. I didn't judge offline staleness after sign-out.
- **The modal `<dialog>` for the login invite on desktop.** A-057 chose it, and it always has "Agora não" and Esc.
- **E2E, a11y and integration suites.** I didn't re-run them and took the P2.md numbers as reported.

## Assessment

**Ready to close phase?** No. Fixes are needed first.

**Reasoning:** the core consent, anonymous profile, ranking and aggregation work is solid and well tested. Before the gate closes, fix the post-login open redirect (I1), the staff-readable reading history (I2), the over-sharing migration payload and anon-to-account linking (I3), the dropped confirmation emails (I4), the incomplete account deletion (I5) and GET-based confirmations (I6). I7 and I8 are small and should go in the same pass. The minor items can go to the report as known limits.
