import { HttpException, Injectable } from "@nestjs/common";

/** In-memory per-key request budget (60 s window) shared by all controllers; one instance per process. */
@Injectable()
export class RequestRateLimiter {
  private buckets = new Map<string, { n: number; until: number }>();
  rate(key: string, max = 10) {
    const now = Date.now();
    if (this.buckets.size > 10000)
      for (const [k, v] of this.buckets)
        if (v.until < now) this.buckets.delete(k);
    let b = this.buckets.get(key);
    if (!b || b.until < now) {
      b = { n: 0, until: now + 60000 };
      this.buckets.set(key, b);
    }
    if (++b.n > max)
      throw new HttpException("Thao tác quá nhanh, thử lại sau một phút", 429);
  }
}
