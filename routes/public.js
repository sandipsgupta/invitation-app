const express = require('express');

// Messaging apps (WhatsApp, iMessage/Applebot, Slack, etc.) fetch a shared
// URL server-side to build a link-preview card *before* a human ever opens
// it — sometimes more than once per share. If the public join route minted
// a real invite on every plain GET, each share would silently burn 1-2
// phantom family slots. Matched requests get a static, side-effect-free
// preview page instead.
const LINK_PREVIEW_BOT_PATTERN = /bot|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|skypeuripreview|linkedinbot|pinterest|embedly|iframely|outbrain|redditbot|vkshare|w3c_validator/i;

function makePublicRouter({ store, csrf, rsvpLimiter, isProduction }) {
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

  // Public "join" link for an event, shareable one-to-many (e.g. a group
  // chat) without the collision problem of literally sharing one invite:
  // each visitor is recognized by a cookie and gets their own invite minted
  // on first visit, so concurrent RSVPs never overwrite each other. Still
  // counts against maxFamilies like any other invite.
  router.get('/e/:eventId', rsvpLimiter, (req, res) => {
    const event = store.getEvent(req.params.eventId);
    if (!event || event.status !== 'live') return res.status(404).render('invite-invalid');

    const userAgent = req.headers['user-agent'] || '';
    if (LINK_PREVIEW_BOT_PATTERN.test(userAgent)) {
      return res.render('link-preview', { event });
    }

    const cookieName = `invite_${event.id}`;
    const existingToken = req.cookies[cookieName];
    let invite = existingToken ? store.getInviteByToken(existingToken) : null;
    if (invite && invite.eventId !== event.id) invite = null;

    if (!invite) {
      if (store.listInvites(event.id).length >= event.maxFamilies) {
        return res.status(400).render('error', {
          message: "This event has reached its guest limit. Please contact your host directly."
        });
      }
      invite = store.createInvite(event.id, '');
      res.cookie(cookieName, invite.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 180 * 24 * 60 * 60 * 1000
      });
    }

    res.redirect(`/i/${invite.token}`);
  });

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
