const express = require('express');

const EVENT_TYPE_CARDS = [
  { key: 'birthday', label: 'Birthday', emoji: '🎂', enabled: true },
  { key: 'anniversary', label: 'Anniversary', emoji: '💍', enabled: false },
  { key: 'pooja', label: 'Pooja / Function', emoji: '🪔', enabled: false },
  { key: 'graduation', label: 'Graduation Party', emoji: '🎓', enabled: false },
  { key: 'weekend-party', label: 'Weekend Party', emoji: '🎊', enabled: false }
];

function escapeCsv(value) {
  const str = String(value === undefined || value === null ? '' : value);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function inviteStats(invites) {
  const responded = invites.filter((i) => i.rsvp);
  const yesCount = responded.filter((i) => i.rsvp.attending === 'yes').length;
  const noCount = responded.filter((i) => i.rsvp.attending === 'no').length;
  const guestTotal = responded
    .filter((i) => i.rsvp.attending === 'yes')
    .reduce((sum, i) => sum + (i.rsvp.guests || 0), 0);
  return { yesCount, noCount, guestTotal };
}

function makeAdminRouter({ store, auth, upload, csrf, backgrounds, relations, loginLimiter }) {
  const router = express.Router();
  const { requireAdmin } = auth;
  const { csrfProtection } = csrf;

  router.get('/admin', (req, res) => {
    if (req.session && req.session.isAdmin) return res.redirect('/admin/dashboard');
    res.render('admin-login', { error: null, csrfToken: csrf.issueToken(req, res) });
  });

  router.post('/admin/login', loginLimiter, csrfProtection, (req, res) => {
    if (auth.verifyAdminCredentials(req.body.password)) {
      req.session.isAdmin = true;
      return res.redirect('/admin/dashboard');
    }
    res.status(401).render('admin-login', {
      error: 'Wrong password. Try again.',
      csrfToken: csrf.issueToken(req, res)
    });
  });

  router.get('/admin/logout', (req, res) => {
    req.session = null;
    res.redirect('/admin');
  });

  router.get('/admin/dashboard', requireAdmin, (req, res) => {
    const events = store.listEvents().map((event) => {
      const invites = store.listInvites(event.id);
      return { event, inviteCount: invites.length, ...inviteStats(invites) };
    });
    res.render('admin-dashboard', {
      eventTypeCards: EVENT_TYPE_CARDS,
      events,
      saved: req.query.saved === '1',
      csrfToken: csrf.issueToken(req, res)
    });
  });

  router.post('/admin/events', requireAdmin, csrfProtection, (req, res) => {
    const card = EVENT_TYPE_CARDS.find((c) => c.key === req.body.type);
    if (!card || !card.enabled) return res.redirect('/admin/dashboard');
    const event = store.createEvent(card.key);
    res.redirect(`/admin/events/${event.id}/edit`);
  });

  function renderEditPage(req, res, event, extra = {}, status = 200) {
    const invites = store.listInvites(event.id);
    res.status(status).render('admin-event-edit', {
      event,
      invites,
      backgrounds,
      relations,
      atCap: invites.length >= event.maxFamilies,
      baseUrl: `${req.protocol}://${req.get('host')}`,
      ...inviteStats(invites),
      saved: false,
      error: null,
      ...extra
    });
  }

  router.get('/admin/events/:id/edit', requireAdmin, (req, res) => {
    const event = store.getEvent(req.params.id);
    if (!event) return res.status(404).render('error', { message: 'Event not found.' });
    renderEditPage(req, res, event, { saved: req.query.saved === '1', csrfToken: csrf.issueToken(req, res) });
  });

  // Lets the host see exactly what a guest will see before any invite
  // link is generated/sent — no real invite/token involved, RSVP form
  // is inert.
  router.get('/admin/events/:id/preview', requireAdmin, (req, res) => {
    const event = store.getEvent(req.params.id);
    if (!event) return res.status(404).render('error', { message: 'Event not found.' });
    res.render('event-birthday', {
      event,
      invite: { token: null, rsvp: null },
      csrfToken: null,
      saved: false,
      error: null,
      formOverride: null,
      previewMode: true
    });
  });

  router.post('/admin/events/:id', requireAdmin, (req, res, next) => {
    // Wrapped manually so a bad/oversized upload re-renders the form with
    // an error instead of falling through to the generic error page.
    upload.single('photo')(req, res, (err) => {
      if (err) {
        const event = store.getEvent(req.params.id);
        if (!event) return res.status(404).render('error', { message: 'Event not found.' });
        return renderEditPage(req, res, event, { error: err.message, csrfToken: csrf.issueToken(req, res) }, 400);
      }
      next();
    });
  }, csrfProtection, (req, res) => {
    const current = store.getEvent(req.params.id);
    if (!current) return res.status(404).render('error', { message: 'Event not found.' });

    const min = Math.max(1, parseInt(req.body.guestMin, 10) || current.guestRange.min);
    const max = Math.max(min, parseInt(req.body.guestMax, 10) || current.guestRange.max);
    const maxFamilies = Math.min(500, Math.max(1, parseInt(req.body.maxFamilies, 10) || current.maxFamilies));

    const patch = {
      title: (req.body.title || '').trim().slice(0, 140),
      personName: (req.body.personName || '').trim().slice(0, 80),
      personRelation: relations.includes(req.body.personRelation) ? req.body.personRelation : current.personRelation,
      background: backgrounds.includes(req.body.background) ? req.body.background : current.background,
      message: (req.body.message || '').trim().slice(0, 1000),
      date: (req.body.date || '').trim().slice(0, 60),
      time: (req.body.time || '').trim().slice(0, 60),
      location: (req.body.location || '').trim().slice(0, 300),
      rsvpBy: (req.body.rsvpBy || '').trim().slice(0, 60),
      guestRange: { min, max },
      maxFamilies,
      status: req.body.status === 'live' ? 'live' : 'draft'
    };

    if (req.file) {
      patch.photoPath = `/uploads/${current.id}/${req.file.filename}`;
    }

    store.updateEvent(current.id, patch);
    res.redirect(`/admin/events/${current.id}/edit?saved=1`);
  });

  router.post('/admin/events/:id/delete', requireAdmin, csrfProtection, (req, res) => {
    store.deleteEvent(req.params.id); // also removes the event's uploaded photo
    res.redirect('/admin/dashboard?saved=1');
  });

  router.post('/admin/events/:id/invites', requireAdmin, csrfProtection, (req, res) => {
    const event = store.getEvent(req.params.id);
    if (!event) return res.status(404).render('error', { message: 'Event not found.' });
    const invites = store.listInvites(event.id);
    if (invites.length >= event.maxFamilies) {
      return renderEditPage(req, res, event, { error: `You've reached the limit of ${event.maxFamilies} families for this event.`, csrfToken: csrf.issueToken(req, res) }, 400);
    }
    store.createInvite(event.id, req.body.familyLabel);
    res.redirect(`/admin/events/${event.id}/edit?saved=1`);
  });

  router.post('/admin/events/:id/invites/:inviteId/delete', requireAdmin, csrfProtection, (req, res) => {
    const event = store.getEvent(req.params.id);
    if (!event) return res.status(404).render('error', { message: 'Event not found.' });
    store.deleteInvite(req.params.inviteId);
    res.redirect(`/admin/events/${event.id}/edit?saved=1`);
  });

  router.get('/admin/events/:id/export.csv', requireAdmin, (req, res) => {
    const event = store.getEvent(req.params.id);
    if (!event) return res.status(404).render('error', { message: 'Event not found.' });
    const invites = store.listInvites(event.id);
    const header = ['Family label', 'Name', 'Attending', 'Guests', 'Note', 'Submitted At', 'Updated At'];
    const rows = invites.map((i) => [
      i.familyLabel,
      i.rsvp ? i.rsvp.name : '',
      i.rsvp ? i.rsvp.attending : '',
      i.rsvp ? i.rsvp.guests : '',
      i.rsvp ? i.rsvp.note : '',
      i.rsvp ? i.rsvp.submittedAt : '',
      i.rsvp ? i.rsvp.updatedAt : ''
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="rsvps-${event.id}.csv"`);
    res.send(csv);
  });

  return router;
}

module.exports = { makeAdminRouter, EVENT_TYPE_CARDS };
