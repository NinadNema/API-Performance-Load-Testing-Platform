const axios = require('axios');

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function substituteVariables(template, context) {
  const str = JSON.stringify(template);
  const replaced = str.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? '');
  return JSON.parse(replaced);
}

async function runWorkflow(steps) {
  const context = {};
  const stepResults = [];

  for (const step of steps) {
    const resolvedRequest = substituteVariables(step.request, context);
    const start = performance.now();

    try {
      const response = await axios({
        ...resolvedRequest,
        timeout: 10000,
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

module.exports = { runWorkflow };