/* Shared MCP stdio JSON-RPC core.
 *
 * Extracted from the founder server so every Mathify MCP uses one framing,
 * one fail-closed auth gate and one redaction-safe audit path. No tool here
 * knows about payments, planners or the database; those stay in the servers.
 */

const PROTOCOL_VERSION = '2025-06-18';

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, result: result };
}

function rpcError(id, code, message, data) {
  const error = { code: code, message: message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: error };
}

function toolError(code, message) {
  const error = new Error(message);
  error.toolError = true;
  error.code = code;
  return error;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createServer(options) {
  const settings = options || {};
  const token = settings.token !== undefined ? String(settings.token || '').trim() : '';
  const authorized = settings.authorized === undefined ? Boolean(token) : Boolean(settings.authorized);
  const tools = (settings.tools || []).map(clone);
  const toolNames = tools.map(function (tool) { return tool.name; });
  const handlers = settings.handlers || {};
  const authCode = settings.authCode || 'MCP_TOKEN_REQUIRED';
  const authMessage = settings.authMessage || 'An MCP authorization token is required.';

  function authError() {
    const error = new Error(authMessage);
    error.rpcCode = -32001;
    error.rpcData = { code: authCode };
    error.code = authCode;
    return error;
  }

  function requireToken() {
    if (!authorized) throw authError();
  }

  async function callTool(name, args) {
    requireToken();
    if (typeof name !== 'string' || toolNames.indexOf(name) === -1) {
      throw toolError('UNKNOWN_TOOL', 'Unknown tool: ' + String(name || ''));
    }
    const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    const result = await handlers[name](input);
    if (typeof settings.onCall === 'function') {
      try {
        settings.onCall({ tool: name, args: input, result: result, profile: settings.profile || null });
      } catch (error) {
        process.stderr.write('[mcp] audit failed: ' + String(error && error.message || error) + '\n');
      }
    }
    return result;
  }

  async function handleMessage(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) ||
        message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return rpcError(null, -32600, 'Invalid Request');
    }
    const id = Object.prototype.hasOwnProperty.call(message, 'id') ? message.id : null;

    try {
      if (message.method === 'initialize') {
        return rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: settings.name || 'mathify-mcp',
            version: settings.version || '0.1.0'
          },
          instructions: settings.instructions || 'Read and proposal tools only. No tool executes a payment or publishes a planner.'
        });
      }

      if (message.method === 'tools/list') {
        requireToken();
        return rpcResult(id, { tools: clone(tools) });
      }

      if (message.method === 'tools/call') {
        requireToken();
        const params = message.params && typeof message.params === 'object' && !Array.isArray(message.params)
          ? message.params : {};
        if (typeof params.name !== 'string') {
          return rpcError(id, -32602, 'Invalid params', { code: 'INVALID_TOOL_NAME' });
        }
        const args = params.arguments !== undefined ? params.arguments : params.args;
        const payload = await callTool(params.name, args);
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
          structuredContent: payload,
          isError: false
        });
      }

      return rpcError(id, -32601, 'Method not found', { method: message.method });
    } catch (error) {
      if (error && error.rpcCode) {
        return rpcError(id, error.rpcCode, error.message, error.rpcData);
      }
      if (error && error.toolError) {
        return rpcError(id, -32602, error.message, { code: error.code });
      }
      return rpcError(id, -32603, 'Internal error', { code: error && error.code || 'INTERNAL_ERROR' });
    }
  }

  return {
    tools: clone(tools),
    callTool: callTool,
    handleMessage: handleMessage,
    isAuthorized: function () { return authorized; },
    profile: settings.profile || null
  };
}

function writeLine(value) {
  process.stdout.write(JSON.stringify(value) + '\n');
}

function digest(value) {
  return require('crypto').createHash('sha256').update(JSON.stringify(value || null)).digest('hex');
}

/* Tokens are read from the environment once at startup. The first configured
 * profile wins; no token means no stdio server at all. */
function start(name, tokens, factory) {
  const chosen = (tokens || []).find(function (entry) {
    return Boolean(String(process.env[entry.env] || '').trim());
  });
  if (!chosen) {
    process.stderr.write(
      name + ': one of ' + (tokens || []).map(function (entry) { return entry.env; }).join(', ') +
      ' is required; stdio startup refused.\n'
    );
    process.exitCode = 1;
    return null;
  }
  const token = String(process.env[chosen.env]).trim();
  const server = factory({ token: token, profile: chosen.profile, authorized: true });
  let buffer = '';
  let tail = Promise.resolve();

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      tail = tail.then(function () {
        let message;
        try {
          message = JSON.parse(line);
        } catch (error) {
          writeLine(rpcError(null, -32700, 'Parse error'));
          return;
        }
        const work = Array.isArray(message)
          ? Promise.all(message.map(function (item) { return server.handleMessage(item); }))
          : server.handleMessage(message);
        return Promise.resolve(work).then(writeLine, function (error) {
          writeLine(rpcError(null, -32603, 'Internal error', {
            code: error && error.code || 'INTERNAL_ERROR'
          }));
        });
      });
    }
  });

  process.stdin.on('end', function () {
    tail.then(function () { /* buffered requests answered */ });
  });

  return server;
}

module.exports = {
  PROTOCOL_VERSION: PROTOCOL_VERSION,
  rpcResult: rpcResult,
  rpcError: rpcError,
  toolError: toolError,
  clone: clone,
  digest: digest,
  createServer: createServer,
  start: start
};
