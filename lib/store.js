// Flat-file JSON storage for events and invites.
//
// Deliberately a thin CRUD layer with a stable shape (list/get/create/update)
// so a future move to SQLite (see requirements.md phase 3) only means
// rewriting this file — routes never touch the filesystem directly.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BACKGROUNDS = ['confetti', 'pastel-balloons', 'golden-elegance', 'tropical-fiesta', 'starry-night'];
const EVENT_TYPES = ['birthday'];
const RELATIONS = ['Daughter', 'Son', 'Me', 'Family Member'];

function makeId() {
  return crypto.randomBytes(9).toString('base64url');
}

function makeInviteToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function makeStore(dataDir) {
  const EVENTS_PATH = path.join(dataDir, 'events.json');
  const INVITES_PATH = path.join(dataDir, 'invites.json');

  function ensureFiles() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(EVENTS_PATH)) writeJson(EVENTS_PATH, []);
    if (!fs.existsSync(INVITES_PATH)) writeJson(INVITES_PATH, []);
  }

  function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  // Write via temp-file + rename so a crash mid-write can't leave a
  // truncated/corrupt JSON file behind.
  function writeJson(filePath, data) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath);
  }

  function readEvents() {
    ensureFiles();
    return readJson(EVENTS_PATH);
  }

  function writeEvents(events) {
    writeJson(EVENTS_PATH, events);
  }

  function readInvites() {
    ensureFiles();
    return readJson(INVITES_PATH);
  }

  function writeInvites(invites) {
    writeJson(INVITES_PATH, invites);
  }

  function listEvents() {
    return readEvents().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function getEvent(id) {
    return readEvents().find((e) => e.id === id) || null;
  }

  function createEvent(type) {
    const now = new Date().toISOString();
    const event = {
      id: makeId(),
      type: EVENT_TYPES.includes(type) ? type : 'birthday',
      status: 'draft',
      title: '',
      hostedBy: '',
      personName: '',
      personRelation: 'Daughter',
      photoPath: '',
      background: BACKGROUNDS[0],
      message: '',
      date: '',
      time: '',
      location: '',
      rsvpBy: '',
      guestRange: { min: 1, max: 10 },
      maxFamilies: 50,
      createdAt: now,
      updatedAt: now
    };
    const events = readEvents();
    events.push(event);
    writeEvents(events);
    return event;
  }

  function updateEvent(id, patch) {
    const events = readEvents();
    const idx = events.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    events[idx] = { ...events[idx], ...patch, id, updatedAt: new Date().toISOString() };
    writeEvents(events);
    return events[idx];
  }

  function deleteEvent(id) {
    const events = readEvents().filter((e) => e.id !== id);
    writeEvents(events);
    const invites = readInvites().filter((i) => i.eventId !== id);
    writeInvites(invites);
  }

  function listInvites(eventId) {
    return readInvites()
      .filter((i) => i.eventId === eventId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function getInviteByToken(token) {
    return readInvites().find((i) => i.token === token) || null;
  }

  function createInvite(eventId, familyLabel) {
    const invite = {
      id: makeId(),
      eventId,
      token: makeInviteToken(),
      familyLabel: (familyLabel || '').trim().slice(0, 120),
      rsvp: null,
      createdAt: new Date().toISOString()
    };
    const invites = readInvites();
    invites.push(invite);
    writeInvites(invites);
    return invite;
  }

  function deleteInvite(id) {
    const invites = readInvites().filter((i) => i.id !== id);
    writeInvites(invites);
  }

  // Create-or-update the single RSVP embedded on an invite.
  function upsertRsvp(token, rsvpData) {
    const invites = readInvites();
    const idx = invites.findIndex((i) => i.token === token);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    const existing = invites[idx].rsvp;
    invites[idx].rsvp = {
      ...rsvpData,
      submittedAt: existing ? existing.submittedAt : now,
      updatedAt: now
    };
    writeInvites(invites);
    return invites[idx];
  }

  return {
    ensureFiles,
    listEvents,
    getEvent,
    createEvent,
    updateEvent,
    deleteEvent,
    listInvites,
    getInviteByToken,
    createInvite,
    deleteInvite,
    upsertRsvp
  };
}

module.exports = { makeStore, BACKGROUNDS, EVENT_TYPES, RELATIONS };
