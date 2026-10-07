/** Counts decode callbacks and turns them into a per-second rate, sampled on demand. */
export class RateCounter {
  private count = 0
  private lastCount = 0
  private lastAt: number

  constructor(now: number) {
    this.lastAt = now
  }

  tick(): void {
    this.count++
  }

  get total(): number {
    return this.count
  }

  sample(now: number): number {
    const elapsed = (now - this.lastAt) / 1000
    const rate = elapsed > 0 ? (this.count - this.lastCount) / elapsed : 0
    this.lastCount = this.count
    this.lastAt = now
    return Math.round(rate * 10) / 10
  }
}
