# Family RSVP

A small self-hosted invite + RSVP system for family events. Create an event
from the admin dashboard, generate a private, unguessable invite link per
family, and share each link individually. Guests RSVP with no login;
revisiting their own link later shows their RSVP, editable.

- **Multiple events at once** — e.g. the same birthday sent as two separate
  invite forms (school friends vs. family friends) is just two events.
- **Per-family secure invite links** — no guest login, no shared public
  link. Each link is a long random token; only someone who has it can view
  or RSVP to that event. Capped at a configurable number of families per
  event (default 50), each RSVP capped at a configurable guest range
  (default 1–10).
- **Edit-in-place RSVPs** — a guest who reopens their link sees their
  existing response, pre-filled and editable, not a duplicate submission.
- **Photo upload + curated backgrounds** — upload a real photo (JPEG/PNG/
  WEBP, 5MB max) and pick from a handful of built-in background designs,
  no external services or API keys involved.
- **Storage** — event details and RSVPs live in JSON files on disk
  (`data/events.json`, `data/invites.json`), uploaded photos in
  `data/uploads/`. No database service, no third-party account.
- See [requirements.md](requirements.md) for the full data model, routes,
  and security checklist, and [SOLUTION.md](SOLUTION.md) for the original
  design rationale.

> Currently only the **Birthday** event type is enabled end-to-end.
> Anniversary / Pooja / Graduation Party / Weekend Party show as
> "Coming soon" on the dashboard — phase 2.

## 1. Run it locally first

```bash
npm install
cp .env.example .env
# edit .env and set ADMIN_PASSWORD to something only you know
npm start
```

1. Visit `http://localhost:3000/admin`, log in.
2. Click the **Birthday** card to create a new event.
3. Fill in the details, upload a photo, pick a background, set the guest
   range / family cap, check "Page is live," save.
4. In the **Invite links** panel, click **"+ Generate invite link"** once
   per family (optionally label it, e.g. "Verma family"). Copy each link.
5. Open a generated link in a private/incognito window to try the guest
   flow — submit an RSVP, then reopen the same link to see it pre-filled
   and editable.

## 2. Deploy to Railway (same $5 Hobby subscription you already have)

You can add this as a **new project** in your existing Railway account — the Hobby plan's $5 included usage is shared across every project on the account, not charged per project. A small app like this uses a sliver of that.

1. **Repo is already on GitHub**, with a `prod` branch cut for this — nothing to push from scratch, `prod` just needs to be brought up to date with `mvp1` before connecting Railway (ask for that merge when you're ready).
2. **In Railway:** New Project → Deploy from GitHub repo → pick this repo → select the **`prod`** branch specifically (not the default branch). Railway auto-detects Node.js and runs `npm install && npm start`.
3. **Set environment variables** (Railway dashboard → your service → Variables):
   - `ADMIN_PASSWORD` — your admin password (not the local default — the app refuses to boot in production with default credentials)
   - `SESSION_SECRET` — any long random string (same rule)
   - `DATA_DIR` — `/data` (see next step)
   - `NODE_ENV` — `production` (enables secure cookies, stricter defaults)
4. **Add a Volume** so your events, invites, and uploaded photos survive redeploys (Railway dashboard → your service → Volumes → New Volume). Mount it at `/data`. Without this, a redeploy wipes everything since Railway's default filesystem is ephemeral.
5. **Generate a domain** (Settings → Networking → Generate Domain) to get your public URL — invite links are built from this domain, and `/admin` lives here too (e.g. `https://your-app.up.railway.app/admin`).
6. **Do a throwaway test run before the real event.** Log into the live `/admin`, create a test event, generate one invite link, and open it on an actual phone to check the mobile experience over a real network (not just localhost). Once you're happy with it, go to that test event's page and click **"Delete event"** — this permanently removes it (config, photo, invites, RSVPs) — before creating the real event you'll actually send to guests. Don't skip the delete step; a leftover test event would otherwise just sit there until auto-purge catches it 7 days after whatever date you gave it.

## 3. Each year / each event

1. Go to `/admin`, log in.
2. Create a new event from the dashboard (or reuse an existing draft).
3. Fill it in, generate invite links, share them individually per family.
4. Export a CSV from the event's page any time; **Delete event** removes
   it and its invites/RSVPs entirely (irreversible).

## Notes

- Access control is per-invite-link for guests (no login, no shared
  public URL) and a single admin password for the host. Don't share the
  `/admin` URL or password — anyone with it can see and edit all events.
- Invite links themselves are the guest's access credential — treat them
  like you would a private calendar invite. Anyone with a specific link
  can view and RSVP for that family's slot.
