import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

type LimitResult = { success: boolean; reset: number };
let hourLimiter: Ratelimit | null | undefined;
let dayLimiter: Ratelimit | null | undefined;

function getLimiters(): [Ratelimit, Ratelimit] | null {
  if (hourLimiter !== undefined && dayLimiter !== undefined) {
    return hourLimiter && dayLimiter ? [hourLimiter, dayLimiter] : null;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    hourLimiter = null;
    dayLimiter = null;
    return null;
  }
  const redis = new Redis({ url, token });
  hourLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "1 h"), analytics: false, prefix: "dyna-serv:ai:hour" });
  dayLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, "1 d"), analytics: false, prefix: "dyna-serv:ai:day" });
  return [hourLimiter, dayLimiter];
}

/** Fail closed if the distributed limiter is missing or unavailable. */
export async function limitAssistantRequest(userId: string): Promise<LimitResult> {
  const limiters = getLimiters();
  if (!limiters) return { success: false, reset: 0 };
  try {
    const results = await Promise.all(limiters.map((limiter) => limiter.limit(userId)));
    const rejected = results.filter((result) => !result.success);
    return {
      success: rejected.length === 0,
      reset: rejected.length ? Math.max(...rejected.map((result) => result.reset)) : 0,
    };
  } catch {
    return { success: false, reset: 0 };
  }
}
