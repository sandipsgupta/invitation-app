# Family RSVP

A tiny, reusable invitation + RSVP page for family events. Two page types, three background styles, one admin screen to reconfigure it every year.

- **General Event** — poojas, functions, parties. Title, host, date/time/location, message.
- **Birthday** — pick the person (Daughter / Son / Me / Family Member), optional photo, custom message.
- **Themes** — Festive (marigold/maroon), Birthday pastel, Elegant neutral.
- **Storage** — everything (event details + RSVP responses) lives in two small JSON files on disk. No database service, no third-party account. You export a CSV and reset before next year's event.

## 1. Run it locally first

```bash
npm install
cp .env.example .env
# edit .env and set ADMIN_PASSWORD to something only you know
npm start
```

Visit `http://localhost:3000/admin`, log in, fill in this year's event, check "Page is live," save. Then visit `http://localhost:3000/` to see the guest-facing page and try an RSVP.

## 2. Deploy to Railway (same $5 Hobby subscription you already have)

You can add this as a **new project** in your existing Railway account — the Hobby plan's $5 included usage is shared across every project on the account, not charged per project. A small app like this uses a sliver of that.

1. **Push this folder to a GitHub repo** (Railway deploys from GitHub, or via the Railway CLI — GitHub is easiest).
   ```bash
   git init
   git add .
   git commit -m "Family RSVP app"
   git branch -M main
   git remote add origin <your-new-repo-url>
   git push -u origin main
   ```
2. **In Railway:** New Project → Deploy from GitHub repo → pick this repo. Railway auto-detects Node.js and runs `npm install && npm start`.
3. **Set environment variables** (Railway dashboard → your service → Variables):
   - `ADMIN_PASSWORD` — your admin password
   - `SESSION_SECRET` — any long random string
   - `DATA_DIR` — `/data` (see next step)
4. **Add a Volume** so your config and RSVPs survive redeploys (Railway dashboard → your service → Volumes → New Volume). Mount it at `/data`. Without this, a redeploy wipes the JSON files since Railway's default filesystem is ephemeral.
5. **Generate a domain** (Settings → Networking → Generate Domain) to get your public URL — that's the link you share with guests, and also where `/admin` lives (e.g. `https://your-app.up.railway.app/admin`).

## 3. Each year

1. Go to `/admin`, log in.
2. Click **"Start next year's event"** — this clears last year's event details and responses (export a CSV first from the Responses section if you want to keep them).
3. Fill in the new event, save, share the link.

## Notes

- Photos: paste an image URL (e.g. a Google Photos/Drive share link set to "anyone with the link," or an Imgur link) rather than uploading a file — this keeps the app filesystem-free for photos too, so nothing depends on the ephemeral disk.
- The admin password is the only access control — anyone with the link can view the invite and RSVP, which is normal for this kind of page. Don't share the `/admin` URL or password.
