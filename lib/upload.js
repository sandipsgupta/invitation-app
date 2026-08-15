// Photo upload for events, stored under DATA_DIR (the same volume the
// JSON data already relies on in production — no new infrastructure).

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ALLOWED_MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function uploadsRootFor(dataDir) {
  return path.join(dataDir, 'uploads');
}

function makeUpload(dataDir) {
  const uploadsRoot = uploadsRootFor(dataDir);

  const storage = multer.diskStorage({
    destination(req, file, cb) {
      const eventId = req.params.id;
      const dir = path.join(uploadsRoot, eventId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    // Random filename: never trust the client-supplied name (path traversal,
    // collisions), and it doubles as an unguessable URL.
    filename(req, file, cb) {
      const ext = ALLOWED_MIME_TO_EXT[file.mimetype] || '';
      cb(null, crypto.randomBytes(16).toString('hex') + ext);
    }
  });

  function fileFilter(req, file, cb) {
    if (ALLOWED_MIME_TO_EXT[file.mimetype]) return cb(null, true);
    cb(new Error('Only JPEG, PNG, or WEBP images are allowed.'));
  }

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_BYTES, files: 1 }
  });
}

module.exports = { makeUpload, uploadsRootFor, MAX_FILE_BYTES };
