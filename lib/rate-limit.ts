/**
 * lib/rate-limit.ts
 * Lightweight in-memory rate limiter for security endpoints
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = identifier;
  
  let entry = store.get(key);
  
  // If no entry or expired, create new
  if (!entry || now > entry.resetAt) {
    entry = {
      count: 1,
      resetAt: now + config.windowMs
    };
    store.set(key, entry);
    
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: entry.resetAt
    };
  }
  
  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt
    };
  }
  
  // Increment and allow
  entry.count++;
  
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt
  };
}

export const RATE_LIMITS = {
  PASSWORD_CHANGE: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000 // 15 minutes
  },
  TWO_FA: {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000 // 15 minutes
  },
  PROFILE_UPDATE: {
    maxRequests: 20,
    windowMs: 15 * 60 * 1000 // 15 minutes
  }
};
