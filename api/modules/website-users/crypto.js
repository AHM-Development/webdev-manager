var crypto = require('crypto');
var env = require('../../config/env');

function key() {
  return crypto
    .createHash('sha256')
    .update(String(env.security.credentialEncryptionSecret))
    .digest();
}

function encrypt(value) {
  var iv = crypto.randomBytes(12);
  var cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  var encrypted = Buffer.concat([
    cipher.update(String(value || ''), 'utf8'),
    cipher.final(),
  ]);
  var tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

function decrypt(value) {
  var parts = String(value || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return '';
  var decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(parts[1], 'base64')
  );
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = {
  encrypt: encrypt,
  decrypt: decrypt,
};
