const ConcurrencyLimiter = require('./concurrencyLimiter');

// A fake "task" that takes 1 second, and logs when it starts/ends
function fakeTask(id) {
  return () => {
    console.log(`Task ${id} STARTED at ${new Date().toISOString().slice(11, 19)}`);
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Task ${id} FINISHED at ${new Date().toISOString().slice(11, 19)}`);
        resolve();
      }, 1000); // simulate 1 second of "work" (like a network request)
    });
  };
}

async function main() {
  const limiter = new ConcurrencyLimiter(2); // only 2 at a time

  const tasks = [1, 2, 3, 4, 5, 6].map((id) => limiter.run(fakeTask(id)));

  await Promise.all(tasks);
  console.log('All tasks done.');
}

main();