const ConcurrencyLimiter = require('./concurrencyLimiter');

function fakeTask(id) {
  return () => {
    console.log(`Task ${id} STARTED at ${new Date().toISOString().slice(11, 19)}`);
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Task ${id} FINISHED at ${new Date().toISOString().slice(11, 19)}`);
        resolve();
      }, 1000);
    });
  };
}

async function main() {
  const limiter = new ConcurrencyLimiter(2);

  const tasks = [1, 2, 3, 4, 5, 6].map((id) => limiter.run(fakeTask(id)));

  await Promise.all(tasks);
  console.log('All tasks done.');
}

main();