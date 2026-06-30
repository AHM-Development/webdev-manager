var env = require('../../config/env');
var db = require('../../db/pool');
var activity = require('../auth/activity.service');
var claude = require('./claude.service');

var VALID_PRIORITIES = ['Low', 'Medium', 'High'];
var VALID_STATUSES = ['Backlog', 'To Do', 'In Progress', 'Review', 'Blocked', 'Done'];
var TASK_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    checklist: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          completed: { type: 'boolean' },
        },
        required: ['title', 'completed'],
      },
    },
    attachments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['link'] },
          url: { type: 'string' },
        },
        required: ['name', 'type', 'url'],
      },
    },
    priority: { type: 'string', enum: VALID_PRIORITIES },
    status: { type: 'string', enum: VALID_STATUSES },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    needsReview: { type: 'boolean' },
  },
  required: ['title', 'description', 'checklist', 'attachments', 'priority', 'status', 'confidence', 'needsReview'],
};

function requestError(message, code, status) {
  var err = new Error(message);
  err.code = code || 'REQUEST_ERROR';
  err.status = status || 400;
  return err;
}

function compactText(value, limit) {
  var text = String(value || '').replace(/\r/g, '').trim();
  if (!limit || text.length <= limit) return text;
  return text.slice(0, limit) + '\n...[truncated]';
}

async function getRequiredPrompt() {
  var rows = await db.query(
    "SELECT * FROM ai_prompt_settings WHERE prompt_key = 'task_organizer' AND enabled = 1 LIMIT 1"
  );
  var prompt = rows[0];
  if (
    !prompt ||
    !String(prompt.system_prompt || '').trim() ||
    !String(prompt.user_prompt_template || '').trim()
  ) {
    throw requestError(
      'Task organizer prompt is required. Configure it in Settings before using AI organization.',
      'TASK_ORGANIZER_PROMPT_REQUIRED',
      409
    );
  }
  return prompt;
}

function extractLinks(text) {
  var matches = String(text || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
  return Array.from(new Set(matches.map(function(url) {
    return url.replace(/[),.;!?]+$/, '');
  }).filter(Boolean)));
}

function linkContexts(urls) {
  return urls.map(function(url) {
    return { url: url, provider: 'link', title: url, extractedText: '' };
  });
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function renderTemplate(template, context) {
  return String(template || '')
    .replace(/\{\{\s*inputJson\s*\}\}/g, safeJson(context))
    .replace(/\{\{\s*sourceText\s*\}\}/g, context.sourceText || '')
    .replace(/\{\{\s*linksJson\s*\}\}/g, safeJson(context.links))
    .replace(/\{\{\s*filesJson\s*\}\}/g, safeJson(context.files))
    .replace(/\{\{\s*clientName\s*\}\}/g, context.clientName || '')
    .replace(/\{\{\s*projectJson\s*\}\}/g, safeJson(context.project));
}

function normalizeChecklist(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(function(item) {
      if (typeof item === 'string') return { title: item, completed: false };
      return {
        title: String((item && item.title) || '').trim(),
        completed: !!(item && item.completed),
      };
    })
    .filter(function(item) {
      return item.title;
    });
}

function normalizeAttachments(items, detectedLinks) {
  var fallback = detectedLinks.map(function(link) {
    return {
      name: link.title || link.url,
      type: 'link',
      url: link.url,
    };
  });

  var source = Array.isArray(items) && items.length ? items : fallback;
  var normalized = source
    .map(function(item) {
      var url = String((item && item.url) || '').trim();
      return {
        name: String((item && item.name) || url).trim(),
        type: 'link',
        url: url || null,
      };
    })
    .filter(function(item) {
      return item.name && item.url && /^https?:\/\//i.test(item.url);
    });
  detectedLinks.forEach(function(link) {
    if (!normalized.some(function(item) { return item.url === link.url; })) {
      normalized.push({ name: link.title || link.url, type: 'link', url: link.url });
    }
  });
  return normalized;
}

function normalizeDraft(raw, detectedLinks) {
  var priority = VALID_PRIORITIES.indexOf(raw.priority) !== -1 ? raw.priority : 'Medium';
  var status = VALID_STATUSES.indexOf(raw.status) !== -1 ? raw.status : 'Backlog';
  return {
    title: String(raw.title || '').trim() || 'Untitled task',
    description: String(raw.description || '').trim(),
    checklist: normalizeChecklist(raw.checklist),
    attachments: normalizeAttachments(raw.attachments, detectedLinks),
    priority: priority,
    status: status,
    confidence: raw.confidence || 'medium',
    needsReview: !!raw.needsReview,
  };
}

async function projectContext(projectId) {
  if (!projectId) return null;
  var rows = await db.query(
    `SELECT id, client_name, priority, status
     FROM projects
     WHERE id = :projectId AND deleted_at IS NULL
     LIMIT 1`,
    { projectId: projectId }
  );
  if (!rows[0]) return null;
  return {
    id: String(rows[0].id),
    clientName: rows[0].client_name,
    priority: rows[0].priority,
    status: rows[0].status,
  };
}

async function organizeTask(input, user, context) {
  var prompt = await getRequiredPrompt();
  var sourceText = compactText(input.sourceText || '', env.ai.maxInputChars);
  var detectedLinks = extractLinks(sourceText);
  var detectedLinkContexts = linkContexts(detectedLinks);
  var project = await projectContext(input.projectId);

  if (!sourceText) {
    throw requestError('Task details are required.', 'TASK_SOURCE_REQUIRED');
  }
  // A client is optional: issues are organized without one (they apply across
  // clients), while task creation passes a projectId for client context.
  if (input.projectId && !project) {
    throw requestError('Select a valid client before organizing the task.', 'TASK_PROJECT_REQUIRED');
  }

  var promptContext = {
    sourceText: sourceText,
    project: project,
    clientName: project ? project.clientName : '',
    links: detectedLinkContexts,
    files: [],
    outputContract: {
      title: 'string',
      description: 'string',
      checklist: [{ title: 'string', completed: false }],
      attachments: [{ name: 'string', type: 'link', url: 'absolute URL' }],
      priority: VALID_PRIORITIES,
      status: VALID_STATUSES,
      confidence: 'low|medium|high',
      needsReview: 'boolean',
    },
  };

  var clientContext = project
    ? '\n\nThis task is for the client "' + project.clientName + '". Use the client name as context when interpreting the request, but do not add it to the title unless it improves clarity.'
    : '\n\nThis issue is not tied to a single client; keep the title and description client-agnostic.';
  var renderedPrompt = renderTemplate(prompt.user_prompt_template, promptContext) +
    clientContext +
    ' Create exactly one task from the pasted text. Produce a concise actionable title, a complete description that preserves material requirements, and ordered implementation checklist items. Preserve every detected URL as a link attachment. URLs are references only: do not claim to have opened or inspected them. Do not invent requirements that are absent from the pasted text.';
  var rawDraft = await claude.generateStructured({
    system: prompt.system_prompt,
    prompt: renderedPrompt,
    schema: TASK_DRAFT_SCHEMA,
    // Task organizing is a low-latency JSON-extraction job: default to the
    // fastest model (Haiku 4.5) unless an admin overrides it in Settings.
    model: prompt.model || 'claude-haiku-4-5',
    temperature: Number(prompt.temperature),
    maxTokens: Number(prompt.max_tokens),
  });
  var draft = normalizeDraft(rawDraft || {}, detectedLinkContexts);

  await activity.logActivity({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    eventType: 'tasks.ai_organize',
    action: 'tasks.ai_organize',
    description: draft.title,
    targetType: 'task_draft',
    targetName: draft.title,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: {
      promptKey: 'task_organizer',
      links: detectedLinks.length,
      files: 0,
      projectId: project && project.id,
      clientName: project && project.clientName,
    },
  });

  return {
    draft: draft,
    context: {
      links: detectedLinkContexts,
      files: [],
    },
  };
}

module.exports = {
  organizeTask: organizeTask,
};
