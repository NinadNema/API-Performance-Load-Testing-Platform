export function parseCurlCommand(curlStr) {
  if (!curlStr || typeof curlStr !== 'string') {
    throw new Error('Please provide a valid cURL command string.');
  }

  const clean = curlStr.trim().replace(/^curl\s+/i, '').replace(/\\\r?\n/g, ' ');

  let method = 'GET';
  let url = '';
  const headers = {};
  let body = '';

  const methodMatch = clean.match(/(?:-X|--request)\s+['"]?([A-Z]+)['"]?/i);
  if (methodMatch) {
    method = methodMatch[1].toUpperCase();
  }

  const headerRegex = /(?:-H|--header)\s+['"]([^'"]+)['"]/gi;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(clean)) !== null) {
    const rawHeader = headerMatch[1];
    const colonIdx = rawHeader.indexOf(':');
    if (colonIdx > 0) {
      const key = rawHeader.slice(0, colonIdx).trim();
      const val = rawHeader.slice(colonIdx + 1).trim();
      headers[key] = val;
    }
  }

  const dataRegex = /(?:-d|--data|--data-raw|--data-binary)\s+['"]([\s\S]*?)['"](?=\s+(?:-[a-zA-Z]|--[a-zA-Z]|$))/i;
  const dataMatch = clean.match(dataRegex);
  if (dataMatch) {
    body = dataMatch[1];
    if (method === 'GET') method = 'POST';
    try {
      const parsedJson = JSON.parse(body);
      body = JSON.stringify(parsedJson, null, 2);
    } catch {
      void 0;
    }
  }

  const urlExplicitMatch = clean.match(/--url\s+['"]?([^'"\s]+)['"]?/i);
  if (urlExplicitMatch) {
    url = urlExplicitMatch[1];
  } else {
    const tokens = clean.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    for (const token of tokens) {
      const unquoted = token.replace(/^['"]|['"]$/g, '');
      if (unquoted.startsWith('http://') || unquoted.startsWith('https://')) {
        url = unquoted;
        break;
      }
    }
  }

  if (!url) {
    const fallbackMatch = clean.match(/(https?:\/\/[^\s'"]+)/i);
    if (fallbackMatch) url = fallbackMatch[1];
  }

  return { method, url: url || 'https://api.example.com', headers, body };
}

export function parseSwaggerOpenApi(spec) {
  const parsed = typeof spec === 'string' ? JSON.parse(spec) : spec;
  if (!parsed || (!parsed.openapi && !parsed.swagger && !parsed.paths)) {
    throw new Error('Invalid Swagger / OpenAPI specification.');
  }

  let baseUrl = '';
  if (Array.isArray(parsed.servers) && parsed.servers.length > 0 && parsed.servers[0].url) {
    baseUrl = parsed.servers[0].url;
  } else if (parsed.host) {
    const scheme = parsed.schemes?.[0] || 'https';
    const basePath = parsed.basePath || '';
    baseUrl = `${scheme}://${parsed.host}${basePath}`;
  }

  const endpoints = [];
  const paths = parsed.paths || {};

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
    for (const m of httpMethods) {
      if (pathItem[m]) {
        const op = pathItem[m];
        const headers = {};
        let body = '';

        if (Array.isArray(op.parameters)) {
          for (const param of op.parameters) {
            if (param.in === 'header') {
              headers[param.name] = param.example || param.default || 'value';
            }
          }
        }

        if (op.requestBody?.content?.['application/json']?.example) {
          body = JSON.stringify(op.requestBody.content['application/json'].example, null, 2);
        } else if (op.requestBody?.content?.['application/json']?.schema) {
          body = JSON.stringify({ sample: 'value' }, null, 2);
        }

        const fullUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${pathKey.replace(/^\//, '')}` : `https://api.example.com${pathKey}`;

        endpoints.push({
          id: `${m.toUpperCase()}-${pathKey}`,
          name: op.summary || op.operationId || `${m.toUpperCase()} ${pathKey}`,
          method: m.toUpperCase(),
          url: fullUrl,
          headers,
          body,
          description: op.description || '',
        });
      }
    }
  }

  return endpoints;
}

export function parsePostmanCollection(collection) {
  const parsed = typeof collection === 'string' ? JSON.parse(collection) : collection;
  if (!parsed || !parsed.item) {
    throw new Error('Invalid Postman collection JSON format.');
  }

  const requests = [];

  function traverse(items) {
    for (const item of items) {
      if (item.request) {
        const req = item.request;
        const method = (req.method || 'GET').toUpperCase();
        let url = '';

        if (typeof req.url === 'string') {
          url = req.url;
        } else if (req.url && req.url.raw) {
          url = req.url.raw;
        }

        const headers = {};
        if (Array.isArray(req.header)) {
          for (const h of req.header) {
            if (!h.disabled && h.key) {
              headers[h.key] = h.value || '';
            }
          }
        }

        let body = '';
        if (req.body?.mode === 'raw' && req.body?.raw) {
          body = req.body.raw;
          try {
            const parsedJson = JSON.parse(body);
            body = JSON.stringify(parsedJson, null, 2);
          } catch {
            void 0;
          }
        }

        requests.push({
          id: item.id || `pm-${requests.length + 1}`,
          name: item.name || `${method} ${url}`,
          method,
          url: url || 'https://api.example.com',
          headers,
          body,
        });
      } else if (Array.isArray(item.item)) {
        traverse(item.item);
      }
    }
  }

  traverse(parsed.item);
  return requests;
}

export function autoDetectAndParse(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Input cannot be empty.');
  }

  const trimmed = input.trim();
  if (trimmed.startsWith('curl ') || trimmed.startsWith('curl\n') || trimmed.includes('-H ') || trimmed.includes('--header')) {
    const single = parseCurlCommand(trimmed);
    return { type: 'curl', items: [single] };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const obj = JSON.parse(trimmed);
    if (obj.info?.schema || (obj.info && obj.item)) {
      return { type: 'postman', items: parsePostmanCollection(obj) };
    }
    if (obj.openapi || obj.swagger || obj.paths) {
      return { type: 'openapi', items: parseSwaggerOpenApi(obj) };
    }
  }

  throw new Error('Could not auto-detect format. Please provide a valid cURL command or OpenAPI/Postman JSON.');
}
