export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface QueueJob<T> {
  id: string;
  status: JobStatus;
  promise: Promise<T>;
  cancel(): void;
}

/** Runs async jobs with a hard concurrency limit (default 1) and per-job cancellation. */
export class JobQueue<T> {
  private running = 0;
  private waiting: (() => void)[] = [];
  private counter = 0;
  constructor(private readonly maxConcurrent = 1) {}

  get pending(): number {
    return this.waiting.length;
  }

  enqueue(run: (signal: AbortSignal) => Promise<T>): QueueJob<T> {
    const ctl = new AbortController();
    const job: QueueJob<T> = {
      id: `job_${++this.counter}`,
      status: 'queued',
      cancel: () => ctl.abort(),
      promise: Promise.resolve(undefined as T),
    };
    job.promise = new Promise<T>((resolve, reject) => {
      const start = () => {
        if (ctl.signal.aborted) {
          job.status = 'cancelled';
          this.release();
          reject(new Error('Cancelled before start'));
          return;
        }
        job.status = 'running';
        this.running += 1;
        run(ctl.signal)
          .then(
            (v) => {
              job.status = 'done';
              resolve(v);
            },
            (e) => {
              job.status = ctl.signal.aborted ? 'cancelled' : 'failed';
              reject(e);
            },
          )
          .finally(() => {
            this.running -= 1;
            this.release();
          });
      };
      if (this.running < this.maxConcurrent) start();
      else this.waiting.push(start);
    });
    job.promise.catch(() => undefined);
    return job;
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next && this.running < this.maxConcurrent) next();
  }
}
