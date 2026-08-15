# Requirements — Family RSVP v2

Status: **MVP (Birthday) in progress.** This file is the source of truth
for scope. Update it as scope changes — don't let it drift from the code.

## Goals (MVP — ship today)

1. Admin dashboard ("landing page") to create a new event by type.
2. Each event gets its own secure, per-family invite links — no login
   required for guests.
3. A guest who revisits their invite link sees their existing RSVP,
   editable (not a duplicate submission).
4. Per-event caps: max 50 invite links (families), configurable guest
   count range per RSVP (default 1–10).
5. Real photo upload for the birthday page (not just a pasted URL).
6. A small set of curated, built-in background designs to choose from
   per event (no external API/key).
7. CSRF protection on every state-changing request (admin and public).
8. Rate limiting on login and RSVP submission.
9. Hardened admin auth (timing-safe comparison, secure cookie flags),
   structured so it can be swapped for real per-user accounts later
   without touching route logic.
10. Support **more than one concurrent event** — e.g. the same birthday
    sent as two separate invite forms (school friends vs. family
    friends) is two event records, each with its own links and caps.

## Non-goals for MVP (explicitly deferred)

- Other event types (Anniversary, Pooja, Graduation Party, Weekend Party
  Host) — dashboard shows them as disabled "Coming soon" cards. **Phase 2.**
- A database. **Decided, not just deferred:** flat JSON files on a Railway
  Volume stay permanently, not just for MVP. A database (SQLite included —
  it's still a single file, needing the same Volume) adds nothing at this
  data scale (low hundreds of records/year) and a hosted DB service would
  actively cost more, since it runs as an always-on billed service instead
  of a few KB on an already-included Volume. Revisit only if there's a
  concrete scale or concurrency problem the file storage is actually
  hitting — not preemptively.
- Multi-admin / per-user accounts. One shared admin password, but the
  auth code is isolated in `lib/auth.js` so this is a contained change
  later, not a rewrite. **Phase 3.**
- Deleting/archiving events from the UI beyond what's needed to keep the
  dashboard usable (may add if time allows).

## Data model

`data/events.json`:
```js
{
  id, type: 'birthday',
  status: 'draft' | 'live',
  title, hostedBy, personName, personRelation,
  photoPath,            // '/uploads/<eventId>/<file>' from real upload, or ''
  background,           // key into curated design set
  message, date, time, location, rsvpBy,
  guestRange: { min, max },   // default { min: 1, max: 10 }
  maxFamilies,                // default 50
  createdAt, updatedAt
}
```

`data/invites.json` — one row per family; RSVP is embedded and **upserted**,
not appended, since each invite has exactly one current RSVP:
```js
{
  id, eventId, token,     // crypto.randomBytes(18).toString('base64url')
  familyLabel,            // admin-only note
  rsvp: null | { name, attending, guests, note, submittedAt, updatedAt },
  createdAt
}
```

> Assumption flagged for review: "4–10 people per family" from the
> original request is implemented as the *default* `guestRange`, not a
> hard floor — a solo guest shouldn't be rejected. Admin can change it
> per event.

## Routes

**Public**
- `GET /` — stub/health check (no more single global event).
- `GET /i/:token` — renders the invite; pre-filled + "update your RSVP"
  banner if `invite.rsvp` already exists. Invalid token → generic error
  page, no information leak about which tokens are valid.
- `POST /i/:token/rsvp` — CSRF-checked, rate-limited, guest count
  validated against the event's `guestRange`, upserts `invite.rsvp`.

**Admin** (session-cookie auth via `lib/auth.js`)
- `GET /admin/dashboard` — event-type cards (Birthday enabled; others
  "Coming soon") + list of existing events with quick stats.
- `POST /admin/events` — create a draft event of a given type.
- `GET/POST /admin/events/:id` — edit event config, upload photo, pick
  background, set guest range / max families, publish (live/draft).
- `POST /admin/events/:id/invites` — generate one invite link, blocked
  past `maxFamilies`.
- `POST /admin/events/:id/invites/:inviteId/delete` — revoke a link.
- `GET /admin/events/:id/export.csv` — CSV of that event's RSVPs.

## Security checklist

- [x] CSRF protection (`csrf-csrf`, signed double-submit cookie) on all
      state-changing POSTs, admin and public.
- [x] Rate limiting (`express-rate-limit`) on `/admin/login` and
      `/i/:token/rsvp`.
- [x] Timing-safe password comparison for admin login.
- [x] Session cookie: `httpOnly`, `sameSite: 'lax'`, `secure` in
      production.
- [x] Upload validation: mime/extension allowlist (jpeg/png/webp), size
      cap, server-generated filenames (no path traversal from user
      input).
- [x] `helmet` security headers.
- [x] EJS auto-escaping preserved everywhere user content is rendered
      (no `<%- %>` on untrusted input).
- [x] Input length limits on all free-text fields.
- [x] Invite tokens are cryptographically random and unguessable;
      invalid-token responses don't distinguish "wrong token" from
      "no such event."

## Roadmap

**Phase 2** — Other event types (Anniversary, Pooja, Graduation Party,
Weekend Party Host): each is mostly the same event/invite machinery with
a different form + theme; the general-event view already in the repo is
a starting point.

**Phase 3** — Real per-user admin accounts (extending `lib/auth.js`) if
the app is opened up to other households. Storage is *not* on this
roadmap — see the database note above.
