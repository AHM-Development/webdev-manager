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

// --- Task attachments (images + documents) --------------------------------
// Validated by file EXTENSION (from the original name) rather than the
// browser-supplied mimetype, which is unreliable for documents (a .csv often
// arrives as application/vnd.ms-excel). Stored under a UUID basename so the
// original name never touches the filesystem path.
var TASK_FILES_DIR = path.resolve(__dirname, '../public/uploads/task-files');
fs.mkdirSync(TASK_FILES_DIR, { recursive: true });

var ALLOWED_TASK_EXT = [
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.csv', '.txt', '.ppt', '.pptx', '.zip',
];

function taskFileExt(originalName) {
  var ext = path.extname(String(originalName || '')).toLowerCase();
  return ALLOWED_TASK_EXT.indexOf(ext) === -1 ? null : ext;
}

function taskFileFilter(req, file, cb) {
  if (taskFileExt(file.originalname)) {
    cb(null, true);
    return;
  }
  var err = new Error('Unsupported file type. Allowed: images, PDF, Word, Excel, CSV, text, PowerPoint, ZIP.');
  err.status = 400;
  err.code = 'INVALID_FILE_TYPE';
  cb(err);
}

var taskFileStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, TASK_FILES_DIR);
  },
  filename: function(req, file, cb) {
    cb(null, crypto.randomUUID() + (taskFileExt(file.originalname) || ''));
  },
});

var uploadTaskFile = multer({
  storage: taskFileStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: taskFileFilter,
});

function taskFileUrl(filename) {
  return '/uploads/task-files/' + filename;
}

module.exports = {
  uploadFormEvidence: uploadFormEvidence,
  formEvidenceUrl: formEvidenceUrl,
  imageFileFilter: imageFileFilter,
  ALLOWED_IMAGE_EXT: ALLOWED_IMAGE_EXT,
  uploadTaskFile: uploadTaskFile,
  taskFileUrl: taskFileUrl,
  ALLOWED_TASK_EXT: ALLOWED_TASK_EXT,
};
