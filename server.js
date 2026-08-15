require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');

const { makeStore, BACKGROUNDS, RELATIONS } = require('./lib/store');
const { makeAuth } = require('./lib/auth');
const { makeUpload, uploadsRootFor } = require('./lib/upload');
const { makeCsrf } = require('./lib/csrf');
const { makePublicRouter } = require('./routes/public');
const { makeAdminRouter } = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-please-change';
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1); // Railway sits behind a proxy — needed for correct IPs (rate limiting) and secure cookies.
  if (ADMIN_PASSWORD === 'changeme' || SESSION_SECRET === 'dev-secret-please-change') {
    console.error('Refusing to start in production with default ADMIN_PASSWORD/SESSION_SECRET. Set real values.');
    process.exit(1);
  }
}

const store = makeStore(DATA_DIR);
const auth = makeAuth({ adminPassword: ADMIN_PASSWORD });
const upload = makeUpload(DATA_DIR);
const csrf = makeCsrf({ secret: SESSION_SECRET, isProduction });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please wait a few minutes and try again.'
});

const rsvpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many RSVP submissions from this connection. Please try again later.'
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Inline style attributes are used throughout the hand-written admin
        // views; tolerating that is a low-risk tradeoff against a strict CSP.
        // Inline <script> is NOT allowed — all JS lives in /public/js/*.js.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    }
  })
);

app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());
app.use(
  cookieSession({
    name: 'session',
    secret: SESSION_SECRET,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: isProduction,
    httpOnly: true
  })
);

app.use('/uploads', express.static(uploadsRootFor(DATA_DIR)));
app.use(express.static(path.join(__dirname, 'public')));

app.use(makePublicRouter({ store, csrf, rsvpLimiter }));
app.use(
  makeAdminRouter({
    store,
    auth,
    upload,
    csrf,
    backgrounds: BACKGROUNDS,
    relations: RELATIONS,
    loginLimiter
  })
);

app.use((req, res) => {
  res.status(404).render('error', { message: "That page doesn't exist." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err === csrf.invalidCsrfTokenError || err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('error', {
      message: "Your form session expired. Please go back, refresh the page, and try again."
    });
  }
  console.error(err);
  res.status(500).render('error', { message: 'Something went wrong. Please try again.' });
});

// Auto-delete an event (and its invites/RSVPs/photo) 7 days after its
// date has passed — runs in-process, no separate cron service needed.
function runPurge() {
  try {
    const purgedIds = store.purgeExpiredEvents();
    if (purgedIds.length) {
      console.log(`Purged ${purgedIds.length} event(s) past their retention window: ${purgedIds.join(', ')}`);
    }
  } catch (err) {
    console.error('Purge check failed:', err);
  }
}

store.ensureFiles();
runPurge();
setInterval(runPurge, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Family RSVP app running on port ${PORT}`);
});
