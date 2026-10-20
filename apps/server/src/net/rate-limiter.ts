/** Token bucket limiting how many events one socket may send. */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private violations = 0;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  tryTake(): boolean {
    const current = this.now();
    const elapsed = (current - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = current;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    this.violations++;
    return false;
  }

  /** Repeated abuse: the socket should be disconnected. */
  get isAbusive(): boolean {
    return this.violations > 200;
  }
}
