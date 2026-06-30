var env = require('../../config/env');

function aiError(message, code, status) {
  var err = new Error(message);
  err.code = code || 'AI_ERROR';
  err.status = status || 502;
  return err;
}

function providerError(response, raw, model, structured) {
  var payload;
  try { payload = JSON.parse(raw); } catch (err) { payload = null; }
  var provider = payload && payload.error;
  if (response.status === 404 && provider && provider.type === 'not_found_error') {
    return aiError(
      'Claude model "' + model + '" is unavailable. Update the Claude Model field in Settings.',
      'AI_MODEL_NOT_FOUND',
      400
    );
  }
  return aiError(
    (structured ? 'Claude structured request failed.' : 'Claude request failed.') +
      (provider && provider.message ? ' ' + provider.message : ''),
    'AI_PROVIDER_ERROR',
    response.status >= 400 && response.status < 500 ? 400 : 502
  );
}

function extractJson(text) {
  var trimmed = String(text || '').trim();
  if (!trimmed) throw aiError('Claude returned an empty response.', 'AI_EMPTY_RESPONSE');

  try {
    return JSON.parse(trimmed);
  } catch (err) {
    var match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw aiError('Claude did not return valid JSON.', 'AI_INVALID_JSON');
    try {
      return JSON.parse(match[0]);
    } catch (jsonErr) {
      throw aiError('Claude did not return parseable JSON.', 'AI_INVALID_JSON');
    }
  }
}

function textFromClaudeContent(content) {
  return (content || [])
    .filter(function(block) {
      return block && block.type === 'text';
    })
    .map(function(block) {
      return block.text || '';
    })
    .join('\n')
    .trim();
}

async function generateJson(input) {
  if (!env.ai.anthropicApiKey) {
    throw aiError('Anthropic API key is not configured.', 'AI_KEY_MISSING', 500);
  }

  var controller = new AbortController();
  var timer = setTimeout(function() {
    controller.abort();
  }, env.ai.requestTimeoutMs);

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ai.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.model || env.ai.anthropicModel,
        max_tokens: input.maxTokens || 1400,
        temperature: input.temperature == null ? 0.2 : input.temperature,
        system: input.system,
        messages: [
          {
            role: 'user',
            content: input.prompt,
          },
        ],
      }),
    });

    var raw = await response.text();
    if (!response.ok) throw providerError(response, raw, input.model || env.ai.anthropicModel, false);

    var payload = JSON.parse(raw);
    return extractJson(textFromClaudeContent(payload.content));
  } catch (err) {
    if (err.name === 'AbortError') {
      throw aiError('Claude request timed out.', 'AI_TIMEOUT', 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function generateStructured(input) {
  if (!env.ai.anthropicApiKey) {
    throw aiError('Anthropic API key is not configured.', 'AI_KEY_MISSING', 500);
  }
  var content = [{ type: 'text', text: input.prompt }];
  (input.images || []).forEach(function(image) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mediaType || 'image/png',
        data: image.data,
      },
    });
  });
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, env.ai.requestTimeoutMs * 2);
  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ai.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.model || env.ai.anthropicModel,
        max_tokens: input.maxTokens || 3000,
        temperature: input.temperature == null ? 0.1 : input.temperature,
        system: input.system,
        messages: [{ role: 'user', content: content }],
        output_config: {
          format: { type: 'json_schema', schema: input.schema },
        },
      }),
    });
    var raw = await response.text();
    if (!response.ok) throw providerError(response, raw, input.model || env.ai.anthropicModel, true);
    var payload = JSON.parse(raw);
    return extractJson(textFromClaudeContent(payload.content));
  } catch (err) {
    if (err.name === 'AbortError') throw aiError('Claude request timed out.', 'AI_TIMEOUT', 504);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  generateJson: generateJson,
  generateStructured: generateStructured,
};
