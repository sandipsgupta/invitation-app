const express = require('express');

function makePublicRouter({ store, csrf, rsvpLimiter }) {
  const router = express.Router();
  const { csrfProtection } = csrf;

  router.get('/', (req, res) => {
    res.render('not-configured');
  });

  function loadLiveInvite(token) {
    const invite = store.getInviteByToken(token);
    if (!invite) return null;
    const event = store.getEvent(invite.eventId);
    if (!event || event.status !== 'live') return null;
    return { invite, event };
  }

  router.get('/i/:token', (req, res) => {
    const found = loadLiveInvite(req.params.token);
    if (!found) return res.status(404).render('invite-invalid');
    res.render('event-birthday', {
      event: found.event,
      invite: found.invite,
      csrfToken: csrf.issueToken(req, res),
      saved: req.query.saved === '1',
      error: null,
      formOverride: null
    });
  });

  router.post('/i/:token/rsvp', rsvpLimiter, csrfProtection, (req, res) => {
    const found = loadLiveInvite(req.params.token);
    if (!found) return res.status(404).render('invite-invalid');
    const { event, invite } = found;

    const { name, attending, note } = req.body;
    const guests = parseInt(req.body.guests, 10);
    const { min, max } = event.guestRange;

    let error = null;
    if (!name || !attending) {
      error = 'Please share your name and let us know if you can make it.';
    } else if (Number.isNaN(guests) || guests < min || guests > max) {
      error = `Number of guests must be between ${min} and ${max}.`;
    }

    if (error) {
      return res.status(400).render('event-birthday', {
        event,
        invite,
        csrfToken: csrf.issueToken(req, res),
        saved: false,
        error,
        formOverride: { name, attending, guests: req.body.guests, note }
      });
    }

    store.upsertRsvp(req.params.token, {
      name: name.trim().slice(0, 120),
      attending: attending === 'yes' ? 'yes' : 'no',
      guests,
      note: (note || '').trim().slice(0, 500)
    });

    res.redirect(`/i/${req.params.token}?saved=1`);
  });

  return router;
}

module.exports = { makePublicRouter };
