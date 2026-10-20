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

/**
 * Privileged endpoints remain protected in production when Upstash is
 * configured. Local development must still be usable without a cloud Redis
 * account; the endpoint's authentication, administrator checks, and 50 MB
 * upload limit remain active there.
 */
export async function limitPrivilegedRequest(identifier: string): Promise<LimitResult> {
  const activeLimiter = getLimiter();
  if (!activeLimiter) {
    if (process.env.NODE_ENV !== "production") {
      return { success: true, limit: 5, remaining: 5, reset: 0 };
    }
    return { success: false, limit: 0, remaining: 0, reset: 0 };
  }

  try {
    return await activeLimiter.limit(identifier);
  } catch (error) {
    console.error("[security] privileged rate limiter unavailable", error);
    if (process.env.NODE_ENV !== "production") {
      return { success: true, limit: 5, remaining: 5, reset: 0 };
    }
    return { success: false, limit: 0, remaining: 0, reset: 0 };
  }
}
