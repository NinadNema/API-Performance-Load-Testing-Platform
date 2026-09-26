const axios = require('axios');

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  
  // Normalize array syntax like body[0].id or [0] to dot syntax
  const normalizedPath = String(path)
    .replace(/\[(\w+)\]/g, '.$1')
    .replace(/^\./, '');
  
  const keys = normalizedPath.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current == null) return undefined;
    
    if (typeof current === 'object') {
      if (key in current) {
        current = current[key];
      } else {
        // Case-insensitive fallback (especially useful for headers)
        const lowerKey = key.toLowerCase();
        const foundKey = Object.keys(current).find((k) => k.toLowerCase() === lowerKey);
        if (foundKey) {
          current = current[foundKey];
        } else {
          return undefined;
        }
      }
    } else {
      return undefined;
    }
  }
  return current;
}

function substituteInValue(val, context) {
  if (typeof val === 'string') {
    // If the entire string is just '{{varName}}', retain the exact type (e.g., number, boolean, object)
    const fullMatch = val.match(/^\{\{(\w+)\}\}$/);
    if (fullMatch && fullMatch[1] in context) {
      return context[fullMatch[1]];
    }
    // Otherwise, perform string interpolation
    return val.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const v = context[key];
      if (v === undefined || v === null) return '';
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(val)) {
    return val.map((item) => substituteInValue(item, context));
  }
  if (val !== null && typeof val === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = substituteInValue(v, context);
    }
    return result;
  }
  return val;
}

function substituteVariables(template, context) {
  return substituteInValue(template, context);
}

async function runWorkflow(steps) {
  const context = {};
  const stepResults = [];

  for (const step of steps) {
    const resolvedRequest = substituteVariables(step.request || {}, context);
    const start = performance.now();

    try {
      const response = await axios({
        method: resolvedRequest.method || 'GET',
        url: resolvedRequest.url,
        headers: resolvedRequest.headers || {},
        data: resolvedRequest.body || resolvedRequest.data,
        timeout: resolvedRequest.timeout || 10000,
        validateStatus: () => true,
      });
      const durationMs = performance.now() - start;

      if (step.extract) {
        for (const [varName, path] of Object.entries(step.extract)) {
          context[varName] = getByPath(
            { body: response.data, headers: response.headers, status: response.status },
            path
          );
        }
      }

      stepResults.push({
        name: step.name,
        status: response.status,
        durationMs: Math.round(durationMs),
        success: response.status < 400,
      });
    } catch (err) {
      const durationMs = performance.now() - start;
      stepResults.push({
        name: step.name,
        status: null,
        durationMs: Math.round(durationMs),
        success: false,
        error: err.message,
      });
      break;
    }
  }

  return { steps: stepResults, context };
}

module.exports = { runWorkflow, getByPath, substituteVariables };