var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var CHECKLISTS = {
  technicalSeo: 'technical-seo.md',
  designContent: 'design-content-qa.md',
  forms: 'forms.md',
  wordpress: 'wordpress.md',
  security: 'security.md',
};

function read(name) {
  var fileName = CHECKLISTS[name];
  if (!fileName) return null;
  var content = fs.readFileSync(path.resolve(__dirname, '../../checklists', fileName), 'utf8');
  var versionMatch = content.match(/^Version:\s*(.+)$/m);
  return {
    key: name,
    version: versionMatch ? versionMatch[1].trim() : 'unversioned',
    hash: crypto.createHash('sha256').update(content).digest('hex'),
    content: content,
  };
}

function all(includeContent) {
  return Object.keys(CHECKLISTS).map(function(key) {
    var checklist = read(key);
    if (includeContent) return checklist;
    return {
      key: checklist.key,
      version: checklist.version,
      hash: checklist.hash,
    };
  });
}

function versions() {
  var output = {};
  all(false).forEach(function(item) {
    output[item.key] = { version: item.version, hash: item.hash };
  });
  return output;
}

module.exports = { read: read, all: all, versions: versions };
