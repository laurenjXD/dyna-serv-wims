import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

let limiter: Ratelimit | null | undefined;

function getLimiter(): Ratelimit | null {
  if (limiter !== undefined) return limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    limiter = null;
    return limiter;
  }

  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    analytics: false,
    prefix: "dyna-serv:privileged",
  });
  return limiter;
}

/** Privileged endpoints fail closed when distributed rate limiting is unavailable. */
export async function limitPrivilegedRequest(identifier: string): Promise<LimitResult> {
  const activeLimiter = getLimiter();
  if (!activeLimiter) return { success: false, limit: 0, remaining: 0, reset: 0 };

  try {
    return await activeLimiter.limit(identifier);
  } catch (error) {
    console.error("[security] privileged rate limiter unavailable", error);
    return { success: false, limit: 0, remaining: 0, reset: 0 };
  }
}
