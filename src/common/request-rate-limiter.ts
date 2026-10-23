import { HttpException, Injectable } from "@nestjs/common";

const tooFast = () => new HttpException("Thao tác quá nhanh, thử lại sau một phút", 429);

/** In-memory per-key request budget (60 s window by default) shared by all controllers; one instance per process. */
@Injectable()
export class RequestRateLimiter {
  private buckets = new Map<string, { n: number; until: number }>();
  private bucket(key: string, windowMs: number) {
    const now = Date.now();
    if (this.buckets.size > 10000)
      for (const [k, v] of this.buckets)
        if (v.until < now) this.buckets.delete(k);
    let b = this.buckets.get(key);
    if (!b || b.until < now) {
      b = { n: 0, until: now + windowMs };
      this.buckets.set(key, b);
    }
    return b;
  }
  rate(key: string, max = 10, windowMs = 60000) {
    if (++this.bucket(key, windowMs).n > max) throw tooFast();
  }
  /** 429 while `key` has already spent `max` recorded hits in its window; does not count this call. */
  guard(key: string, max: number) {
    const b = this.buckets.get(key);
    if (b && b.until >= Date.now() && b.n >= max) throw tooFast();
  }
  /** Counts one hit (for example a failed attempt) against `key` without throwing. */
  record(key: string, windowMs: number) {
    this.bucket(key, windowMs).n++;
  }
}
