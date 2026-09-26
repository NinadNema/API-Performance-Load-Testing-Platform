class ConcurrencyLimiter {
  constructor(maxConcurrent) {
    this.maxConcurrent = Math.max(1, Number(maxConcurrent) || 1);
    this.active = 0;
    this.queue = [];
  }

  run(taskFn) {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (this.active >= this.maxConcurrent) {
          this.queue.push(attempt);
          return;
        }

        this.active++;

        Promise.resolve()
          .then(() => taskFn())
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            if (this.queue.length > 0) {
              const next = this.queue.shift();
              next();
            }
          });
      };

      attempt();
    });
  }
}

module.exports = ConcurrencyLimiter;
