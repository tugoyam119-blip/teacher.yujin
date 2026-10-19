// Schedule from completion: a slow request must never create a request backlog.
export function startPolling(task, {delay = 3000, maxDelay = 30000, onError = () => {}, schedule = setTimeout, cancel = clearTimeout} = {}) {
  let stopped = false, running = false, timer, failures = 0, controller;
  async function refresh() {
    if (stopped || running) return;
    cancel(timer);
    running = true;
    controller = new AbortController();
    const timeout = schedule(() => controller.abort(), 20000);
    try {
      await task(controller.signal);
      failures = 0;
    } catch (error) {
      failures++;
      if (!stopped) onError(error);
    } finally {
      cancel(timeout);
      running = false;
      if (!stopped) timer = schedule(refresh, Math.min(maxDelay, delay * 2 ** Math.min(failures, 4)));
    }
  }
  refresh();
  return {refresh, stop() {stopped = true; cancel(timer); controller?.abort();}};
}
