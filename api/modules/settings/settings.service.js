var db = require('../../db/pool');
var activity = require('../auth/activity.service');
var mail = require('../auth/mail.service');

function fail(status, code, message) {
  var err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

async function recordEmailTest(status) {
  await db.query(
    'UPDATE email_connectors SET last_test_status = :status, last_tested_at = UTC_TIMESTAMP() WHERE id = 1',
    { status: status }
  );
}

// Send a real test email to `to` and record the outcome. Surfaces the exact
// failure reason (e.g. blocked SMTP) rather than hanging or silently passing.
async function sendTestEmail(to, user, context) {
  var recipient = String(to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    fail(400, 'VALIDATION_ERROR', 'Enter a valid recipient email address.');
  }
  try {
    await mail.sendTestEmail(recipient);
  } catch (err) {
    await recordEmailTest('failed');
    await activity.logActivity({
      userId: user.id, eventType: 'settings.email_test_failed',
      ip: context.ip, userAgent: context.userAgent,
      metadata: { to: recipient, reason: (err && err.code) || 'SEND_FAILED' },
    });
    fail(err && err.status ? err.status : 502, (err && err.code) || 'EMAIL_TEST_FAILED',
      (err && err.message) || 'The test email could not be sent.');
  }
  await recordEmailTest('ready');
  await activity.logActivity({
    userId: user.id, eventType: 'settings.email_test_sent',
    ip: context.ip, userAgent: context.userAgent, metadata: { to: recipient },
  });
  return { delivered: true, to: recipient };
}

function mapWorkspace(row) {
  return {
    workspaceName: row.workspace_name,
    supportEmail: row.support_email,
    timezone: row.timezone,
    defaultSenderName: row.default_sender_name,
    updatedAt: row.updated_at,
  };
}

function mapConnector(row) {
  return {
    provider: row.provider,
    status: row.status,
    clientId: row.client_id || '',
    redirectUri: row.redirect_uri || '',
    connectedEmail: row.connected_email || null,
    lastTestStatus: row.last_test_status,
    lastTestedAt: row.last_tested_at,
    updatedAt: row.updated_at,
  };
}

function mapAiPrompt(row) {
  return {
    key: row.prompt_key,
    name: row.name,
    systemPrompt: row.system_prompt || '',
    userPromptTemplate: row.user_prompt_template || '',
    model: row.model || '',
    temperature: Number(row.temperature),
    maxTokens: Number(row.max_tokens),
    enabled: !!row.enabled,
    updatedAt: row.updated_at,
  };
}

async function getWorkspace() {
  var rows = await db.query('SELECT * FROM workspace_settings WHERE id = 1 LIMIT 1');
  return mapWorkspace(rows[0]);
}

async function updateWorkspace(input, user, context) {
  await db.query(
    `UPDATE workspace_settings
     SET workspace_name = :workspaceName,
         support_email = :supportEmail,
         timezone = :timezone,
         default_sender_name = :defaultSenderName
     WHERE id = 1`,
    {
      workspaceName: String(input.workspaceName || '').trim() || 'AHM Web Manager',
      supportEmail: String(input.supportEmail || '').trim() || 'support@localhost',
      timezone: String(input.timezone || '').trim() || 'Dubai',
      defaultSenderName: String(input.defaultSenderName || '').trim() || 'AHM Web Team',
    }
  );
  await activity.logActivity({
    userId: user.id,
    eventType: 'settings.workspace_updated',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {},
  });
  return getWorkspace();
}

async function getEmailConnector() {
  var rows = await db.query('SELECT * FROM email_connectors WHERE id = 1 LIMIT 1');
  return mapConnector(rows[0]);
}

async function updateEmailConnector(input, user, context) {
  await db.query(
    `UPDATE email_connectors
     SET client_id = :clientId,
         client_secret_encrypted = :clientSecret,
         redirect_uri = :redirectUri
     WHERE id = 1`,
    {
      clientId: String(input.clientId || '').trim() || null,
      clientSecret: input.clientSecret ? String(input.clientSecret) : null,
      redirectUri: String(input.redirectUri || '').trim() || null,
    }
  );
  await activity.logActivity({
    userId: user.id,
    eventType: 'settings.email_connector_updated',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { provider: 'google' },
  });
  return getEmailConnector();
}

async function connectGoogle(user, context) {
  await db.query("UPDATE email_connectors SET status = 'connected' WHERE id = 1");
  await activity.logActivity({
    userId: user.id,
    eventType: 'settings.email_connector_connected',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { provider: 'google' },
  });
  return getEmailConnector();
}

async function disconnectGoogle(user, context) {
  await db.query(
    `UPDATE email_connectors
     SET status = 'disconnected',
         connected_email = NULL,
         access_token_encrypted = NULL,
         refresh_token_encrypted = NULL,
         token_expires_at = NULL
     WHERE id = 1`
  );
  await activity.logActivity({
    userId: user.id,
    eventType: 'settings.email_connector_disconnected',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { provider: 'google' },
  });
  return getEmailConnector();
}

async function testEmailConnector(user, context) {
  var connector = await getEmailConnector();
  var status = connector.status === 'connected' ? 'ready' : 'failed';
  await db.query(
    `UPDATE email_connectors
     SET last_test_status = :status,
         last_tested_at = UTC_TIMESTAMP()
     WHERE id = 1`,
    { status: status }
  );
  await activity.logActivity({
    userId: user.id,
    eventType: 'settings.email_connector_tested',
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { status: status },
  });
  return getEmailConnector();
}

async function getAiPrompt(promptKey) {
  var rows = await db.query(
    'SELECT * FROM ai_prompt_settings WHERE prompt_key = :promptKey LIMIT 1',
    { promptKey: promptKey }
  );
  if (!rows[0]) {
    var err = new Error('AI prompt setting was not found.');
    err.status = 404;
    err.code = 'AI_PROMPT_NOT_FOUND';
    throw err;
  }
  return mapAiPrompt(rows[0]);
}

async function updateAiPrompt(promptKey, input, user, context) {
  var systemPrompt = String(input.systemPrompt || '').trim();
  var userPromptTemplate = String(input.userPromptTemplate || '').trim();
  var model = String(input.model || '').trim() || null;
  var temperature = Number(input.temperature);
  var maxTokens = Number(input.maxTokens);

  if (['task_organizer', 'website_technical_seo', 'website_design_content_qa'].includes(promptKey) && (!systemPrompt || !userPromptTemplate)) {
    var err = new Error('AI system and user prompts are required.');
    err.status = 400;
    err.code = 'AI_PROMPT_REQUIRED';
    throw err;
  }

  await db.query(
    `UPDATE ai_prompt_settings
     SET system_prompt = :systemPrompt,
         user_prompt_template = :userPromptTemplate,
         model = :model,
         temperature = :temperature,
         max_tokens = :maxTokens,
         enabled = :enabled
     WHERE prompt_key = :promptKey`,
    {
      promptKey: promptKey,
      systemPrompt: systemPrompt,
      userPromptTemplate: userPromptTemplate,
      model: model,
      temperature: Number.isFinite(temperature) ? temperature : 0.2,
      maxTokens: Number.isFinite(maxTokens) ? maxTokens : 1400,
      enabled: input.enabled === false ? 0 : 1,
    }
  );
  await activity.logActivity({
    userId: user.id,
    eventType: 'settings.ai_prompt_updated',
    action: 'settings.ai_prompt_updated',
    description: 'AI prompt updated',
    targetType: 'ai_prompt',
    targetId: promptKey,
    targetName: promptKey,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { promptKey: promptKey },
  });
  return getAiPrompt(promptKey);
}

module.exports = {
  getWorkspace: getWorkspace,
  updateWorkspace: updateWorkspace,
  getEmailConnector: getEmailConnector,
  updateEmailConnector: updateEmailConnector,
  connectGoogle: connectGoogle,
  disconnectGoogle: disconnectGoogle,
  testEmailConnector: testEmailConnector,
  sendTestEmail: sendTestEmail,
  getAiPrompt: getAiPrompt,
  updateAiPrompt: updateAiPrompt,
};
