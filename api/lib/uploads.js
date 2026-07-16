'use strict';

// Disk-backed image uploads (e.g. form-test evidence screenshots). Files are
// written under public/ and served statically by express.static, mirroring the
// scan-screenshot pattern in browser-scanner.service.js. Random UUID filenames,
// an image-mime allowlist, and a size cap keep it safe.

var multer = require('multer');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

var FORM_EVIDENCE_DIR = path.resolve(__dirname, '../public/uploads/form-evidence');
fs.mkdirSync(FORM_EVIDENCE_DIR, { recursive: true });

var ALLOWED_IMAGE_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function imageFileFilter(req, file, cb) {
  if (ALLOWED_IMAGE_EXT[file.mimetype]) {
    cb(null, true);
    return;
  }
  var err = new Error('Only PNG, JPEG, WebP, or GIF images are allowed.');
  err.status = 400;
  err.code = 'INVALID_FILE_TYPE';
  cb(err);
}

var formEvidenceStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, FORM_EVIDENCE_DIR);
  },
  filename: function(req, file, cb) {
    cb(null, crypto.randomUUID() + (ALLOWED_IMAGE_EXT[file.mimetype] || ''));
  },
});

var uploadFormEvidence = multer({
  storage: formEvidenceStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

function formEvidenceUrl(filename) {
  return '/uploads/form-evidence/' + filename;
}

module.exports = {
  uploadFormEvidence: uploadFormEvidence,
  formEvidenceUrl: formEvidenceUrl,
  imageFileFilter: imageFileFilter,
  ALLOWED_IMAGE_EXT: ALLOWED_IMAGE_EXT,
};
