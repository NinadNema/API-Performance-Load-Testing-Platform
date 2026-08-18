const runLoadTest = require('./loadTestRunner');

async function main() {
  console.log('Starting load test...');
  const start = performance.now();

  const results = await runLoadTest({
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    method: 'GET',
    concurrency: 5,
    totalRequests: 20,
  });

  const totalTime = performance.now() - start;

  console.log(`Completed ${results.length} requests in ${Math.round(totalTime)}ms`);
  console.log('Sample results:', results.slice(0, 3));
  console.log('Success count:', results.filter(r => r.success).length);
  console.log('Failure count:', results.filter(r => !r.success).length);
}

main();