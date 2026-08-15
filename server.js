const express = require('express');
const cookieSession = require('cookie-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const RSVPS_PATH = path.join(DATA_DIR, 'rsvps.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-please-change';

const THEMES = ['festive', 'birthday', 'elegant'];
const RELATIONS = ['Daughter', 'Son', 'Me', 'Family Member'];

// ---------- storage helpers ----------
function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig(), null, 2));
  }
  if (!fs.existsSync(RSVPS_PATH)) {
    fs.writeFileSync(RSVPS_PATH, JSON.stringify([], null, 2));
  }
}

function defaultConfig() {
  return {
    type: 'general', // 'general' | 'birthday'
    theme: 'festive', // 'festive' | 'birthday' | 'elegant'
    title: 'You\'re Invited',
    hostedBy: '',
    personName: '',
    personRelation: 'Daughter',
    photoUrl: '',
    message: '',
    date: '',
    time: '',
    location: '',
    rsvpBy: '',
    active: false
  };
}

function readConfig() {
  ensureDataFiles();
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function readRsvps() {
  ensureDataFiles();
  return JSON.parse(fs.readFileSync(RSVPS_PATH, 'utf8'));
}

function writeRsvps(list) {
  fs.writeFileSync(RSVPS_PATH, JSON.stringify(list, null, 2));
}

// ---------- app setup ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  cookieSession({
    name: 'session',
    secret: SESSION_SECRET,
    maxAge: 24 * 60 * 60 * 1000
  })
);

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin');
}

function escapeCsv(value) {
  const str = String(value === undefined || value === null ? '' : value);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

// ---------- public routes ----------
app.get('/', (req, res) => {
  const config = readConfig();
  if (!config.active) {
    return res.render('not-configured');
  }
  const view = config.type === 'birthday' ? 'event-birthday' : 'event-general';
  res.render(view, { config });
});

app.post('/rsvp', (req, res) => {
  const config = readConfig();
  const { name, attending, guests, note } = req.body;

  if (!name || !attending) {
    const view = config.type === 'birthday' ? 'event-birthday' : 'event-general';
    return res.status(400).render(view, {
      config,
      error: 'Please share your name and let us know if you can make it.'
    });
  }

  const rsvps = readRsvps();
  rsvps.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name.trim().slice(0, 120),
    attending: attending === 'yes' ? 'yes' : 'no',
    guests: Math.max(0, Math.min(20, parseInt(guests, 10) || 0)),
    note: (note || '').trim().slice(0, 500),
    submittedAt: new Date().toISOString()
  });
  writeRsvps(rsvps);

  res.render('thanks', { config, attending: attending === 'yes' });
});

// ---------- admin routes ----------
app.get('/admin', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin/dashboard');
  res.render('admin-login', { error: null });
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin/dashboard');
  }
  res.status(401).render('admin-login', { error: 'Wrong password. Try again.' });
});

app.get('/admin/logout', (req, res) => {
  req.session = null;
  res.redirect('/admin');
});

app.get('/admin/dashboard', requireAdmin, (req, res) => {
  const config = readConfig();
  const rsvps = readRsvps().slice().reverse();
  const yesCount = rsvps.filter((r) => r.attending === 'yes').length;
  const noCount = rsvps.filter((r) => r.attending === 'no').length;
  const guestTotal = rsvps
    .filter((r) => r.attending === 'yes')
    .reduce((sum, r) => sum + (r.guests || 0), 0);

  res.render('admin-dashboard', {
    config,
    rsvps,
    yesCount,
    noCount,
    guestTotal,
    themes: THEMES,
    relations: RELATIONS,
    saved: req.query.saved === '1'
  });
});

app.post('/admin/config', requireAdmin, (req, res) => {
  const current = readConfig();
  const type = req.body.type === 'birthday' ? 'birthday' : 'general';
  const theme = THEMES.includes(req.body.theme) ? req.body.theme : current.theme;

  const rawTitle = type === 'birthday' ? req.body.birthdayTitle : req.body.title;

  const updated = {
    ...current,
    type,
    theme,
    title: (rawTitle || '').trim().slice(0, 140),
    hostedBy: (req.body.hostedBy || '').trim().slice(0, 140),
    personName: (req.body.personName || '').trim().slice(0, 80),
    personRelation: RELATIONS.includes(req.body.personRelation)
      ? req.body.personRelation
      : current.personRelation,
    photoUrl: (req.body.photoUrl || '').trim().slice(0, 500),
    message: (req.body.message || '').trim().slice(0, 1000),
    date: (req.body.date || '').trim(),
    time: (req.body.time || '').trim().slice(0, 60),
    location: (req.body.location || '').trim().slice(0, 300),
    rsvpBy: (req.body.rsvpBy || '').trim(),
    active: req.body.active === 'on'
  };

  writeConfig(updated);
  res.redirect('/admin/dashboard?saved=1');
});

app.get('/admin/export.csv', requireAdmin, (req, res) => {
  const rsvps = readRsvps();
  const header = ['Name', 'Attending', 'Guests', 'Note', 'Submitted At'];
  const rows = rsvps.map((r) => [r.name, r.attending, r.guests, r.note, r.submittedAt]);
  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="rsvps-${Date.now()}.csv"`);
  res.send(csv);
});

app.post('/admin/reset-rsvps', requireAdmin, (req, res) => {
  writeRsvps([]);
  res.redirect('/admin/dashboard?saved=1');
});

app.post('/admin/new-event', requireAdmin, (req, res) => {
  // Keep theme/type as a starting point, clear the event-specific details.
  const current = readConfig();
  writeConfig({
    ...defaultConfig(),
    theme: current.theme,
    type: current.type
  });
  writeRsvps([]);
  res.redirect('/admin/dashboard?saved=1');
});

ensureDataFiles();
app.listen(PORT, () => {
  console.log(`Family RSVP app running on port ${PORT}`);
});
