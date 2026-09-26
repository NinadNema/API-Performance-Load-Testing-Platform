const db = require('./db');

const LOWER_IS_BETTER = ['avg_ms', 'min_ms', 'max_ms', 'p50', 'p95', 'p99'];
const HIGHER_IS_BETTER = ['success_rate', 'throughput_rps'];

function compareRun(runIdA, runIdB) {
  const runA = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(runIdA);
  const runB = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(runIdB);

  if (!runA || !runB) {
    throw new Error('One or both test runs not found.');
  }

  const allMetrics = [...LOWER_IS_BETTER, ...HIGHER_IS_BETTER];
  const comparison = {};

  for (const metric of allMetrics) {
    const valueA = runA[metric] ?? 0;
    const valueB = runB[metric] ?? 0;
    const diff = valueB - valueA;
    const percentChange = valueA !== 0 ? (diff / valueA) * 100 : (valueB !== 0 ? 100 : 0);

    let verdict;

    if (Math.abs(percentChange) < 3) {
      verdict = 'unchanged';
    } else if (LOWER_IS_BETTER.includes(metric)) {
      verdict = diff < 0 ? 'improved' : 'degraded';
    } else {
      verdict = diff > 0 ? 'improved' : 'degraded';
    }

    comparison[metric] = {
      before: valueA,
      after: valueB,
      diff: Math.round(diff * 100) / 100,
      percentChange: Math.round(percentChange * 100) / 100,
      verdict,
    };
  }

  return { runA, runB, comparison };
}

module.exports = compareRun;