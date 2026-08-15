# Solution Approach

## Problem

Send secure, private invitation links to family for recurring events
(birthdays, poojas, functions) and collect RSVPs — without a database,
guest accounts, or a SaaS form tool — while supporting more than one
invite "batch" per occasion (e.g. school friends vs. family friends for
the same birthday).

## Design principles

1. **Per-family secure links, not a shared public URL.** Each family gets
   its own unguessable invite link (`crypto.randomBytes(18)`, ~144 bits).
   No guest login is needed — possession of the link *is* the
   authorization — and the token doubles as the RSVP's identity: revisit
   the same link and you see (and can edit) your own response, from any
   device, with no cookie or account required to make that work.
2. **Events, not one global config.** Early versions of this app had a
   single "active event" overwritten every year. That breaks as soon as
   you need two concurrent invite forms for one occasion (school friends
   vs. family friends), so the data model is a list of events, each with
   its own invite links and RSVPs. History is kept rather than wiped.
3. **No database.** Two flat JSON files (`data/events.json`,
   `data/invites.json`) are the entire persistence layer, restructured
   from the original single-config design but still just files — a
   family RSVP page gets tens of responses a year, not thousands.
   SQLite is an intentional phase-3 item once the JSON layer's shape
   (in `lib/store.js`) is proven; nothing above that layer needs to
   change when it happens.
4. **Real photo upload, but no new infrastructure.** Uploaded photos are
   stored under `DATA_DIR/uploads/<eventId>/`, the same directory the
   JSON files already live in — so the one Railway Volume the app
   already needs covers photos too, with server-generated filenames
   (never the client's) to avoid path traversal or overwrite.
5. **Curated backgrounds, not an external API.** A handful of built-in
   CSS designs (gradients/patterns, no images) per event, so styling a
   page has no runtime dependency and no API key to manage.
6. **Password, not accounts — but isolated.** A single shared
   `ADMIN_PASSWORD` gates `/admin`. Auth logic lives entirely in
   `lib/auth.js` behind a small interface (`verifyAdminCredentials`,
   `requireAdmin`), so if this ever needs real per-user accounts, that's
   a contained change to one file, not a rewrite of every route.
7. **Server-rendered, no build step.** EJS templates + a couple of CSS
   files. No bundler, no client framework. The handful of client-side
   behaviors (copy-to-clipboard, background/type toggles) live in small
   external `/public/js/*.js` files rather than inline `<script>` tags,
   which also lets the CSP forbid inline scripts outright.

## Architecture

```
Browser ──GET/POST──▶ Express (server.js)
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                 ▼
     routes/public.js   routes/admin.js    lib/{auth,csrf,upload}.js
      (guest RSVP,        (dashboard,        (cross-cutting: session
       no login)          event editor,       auth, CSRF, file upload)
                           invite links)
             │                │
             └───────┬────────┘
                      ▼
              lib/store.js  ──▶  data/events.json
                              ──▶  data/invites.json  (RSVP embedded, upserted)
                              ──▶  data/uploads/<eventId>/*
```

- **`lib/store.js`** — the only code that touches the JSON files. Every
  route goes through `listEvents`/`getEvent`/`createInvite`/`upsertRsvp`
  etc. Writes go through temp-file + rename so a crash mid-write can't
  corrupt a file. This boundary is what makes a future SQLite migration
  a one-file change.
- **`lib/auth.js`** — admin session auth, isolated per principle #6.
- **`lib/csrf.js`** — signed double-submit-cookie CSRF protection
  (`csrf-csrf`), applied to every state-changing route — admin *and* the
  anonymous public RSVP form. Since guests never have a session, the
  binding token here is a constant identifier rather than a per-user
  session id; the protection still comes from the signed, same-origin
  cookie an attacker's page can't read or set.
- **`lib/upload.js`** — multer config: mime/extension allowlist
  (jpeg/png/webp), 5MB cap, random server-generated filenames.
- **`routes/public.js`** — `GET/POST /i/:token` (the guest RSVP flow) and
  a `GET /` stub. No admin concepts leak in here at all.
- **`routes/admin.js`** — dashboard, event CRUD, invite-link
  generation/revocation, CSV export. Everything here sits behind
  `requireAdmin`.
- **Views** are split by concern: `event-birthday.ejs` (guest-facing,
  reused for both first-visit and edit-mode via the invite's embedded
  RSVP), `admin-dashboard.ejs` (event-type cards + event list),
  `admin-event-edit.ejs` (config form + invite-link panel), and a shared
  `partials/rsvp-form.ejs` that renders identically whether it's a fresh
  RSVP or an edit — the only difference is whether `invite.rsvp` exists.

## Guest lifecycle

1. Admin generates an invite link for a family from the event editor.
2. That link is shared (text, WhatsApp, email) with that family only.
3. First visit: `GET /i/:token` renders a blank RSVP form.
4. Submit: `POST /i/:token/rsvp` validates (name, attending, guest count
   within the event's configured range) and **upserts** — not
   appends — the RSVP onto that invite.
5. Any later visit to the same link shows the existing RSVP, pre-filled,
   with an "Update RSVP" button instead of "Send RSVP" — editing calls
   the same upsert, so there's never a duplicate row for one family.

## Deliberate non-goals (for now)

- **No database** — deferred until the JSON layer's shape is proven;
  `lib/store.js` is the seam where that change happens later.
- **No multi-admin / per-user accounts** — one shared password is enough
  for a single household; `lib/auth.js` is where that would extend.
- **No other event types wired up yet** — Anniversary / Pooja /
  Graduation Party / Weekend Party appear as disabled dashboard cards;
  the general-event view already in the repo (`event-general.ejs`) is a
  starting point for phase 2.
- **No guest accounts or magic-link email delivery** — links are shared
  manually by the host, which matches how family invites actually get
  sent (forwarded texts, WhatsApp, email) without adding an email
  service dependency.

See [requirements.md](requirements.md) for the concrete data model,
route table, and security checklist this implementation follows.
