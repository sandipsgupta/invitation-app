// Admin authentication, isolated behind a small interface.
//
// Today this is a single shared password from an env var. If this app is
// ever opened up to more than one household, `verifyAdminCredentials`
// becomes a per-user lookup (e.g. against a users table) and everything
// else here — the session shape, `requireAdmin` — stays the same, so
// route files never need to change.

const crypto = require('crypto');

function timingSafeEqualStrings(a, b) {
  const aHash = crypto.createHash('sha256').update(String(a)).digest();
  const bHash = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

function makeAuth({ adminPassword }) {
  function verifyAdminCredentials(password) {
    if (typeof password !== 'string' || !password) return false;
    return timingSafeEqualStrings(password, adminPassword);
  }

  function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    return res.redirect('/admin');
  }

  return { verifyAdminCredentials, requireAdmin };
}

module.exports = { makeAuth };
