/**
 * Concurrency-controlled processing queue.
 * Manages parallel file processing with Web Worker–like concurrency limits.
 */

const MAX_CONCURRENT = 4;

export function createQueueManager() {
  let running = 0;
  const pending = [];

  function enqueue(task) {
    return new Promise((resolve, reject) => {
      pending.push({ task, resolve, reject });
      flush();
    });
  }

  function flush() {
    while (running < MAX_CONCURRENT && pending.length > 0) {
      const { task, resolve, reject } = pending.shift();
      running++;
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          running--;
          flush();
        });
    }
  }

  function clear() {
    pending.length = 0;
  }

  return { enqueue, clear, get pending() { return pending.length; }, get running() { return running; } };
}
