import { updateSession } from "./lib/supabase/middleware"
import { type NextRequest, NextResponse } from "next/server"
import { Redis } from "@upstash/redis"

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '500', 10);

// Initialize Upstash client if configured (server-only)
let redis: Redis | null = null
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    // Lazy import for server environments
    redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  } catch (e) {
    console.error("Failed to initialize Upstash Redis client:", e)
    redis = null
  }
}

// In-memory fallback (single-instance/dev)
const ipRequests = new Map<string, { count: number; expires: number }>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes cleanup interval

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return await updateSession(request)
  }

  // SECURITY: Get real IP from x-forwarded-for (first entry) and sanitize
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : ((request as any).ip || '127.0.0.1');

  // If Redis is available, use it for distributed rate limiting
  if (redis) {
    try {
      const window = Math.floor(Date.now() / RATE_LIMIT_WINDOW)
      const key = `rl:${ip}:${window}`
      const count = await redis.incr(key)
      if (count === 1) {
        // Set TTL in seconds
        await redis.expire(key, Math.ceil(RATE_LIMIT_WINDOW / 1000))
      }
      if (count > MAX_REQUESTS) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 })
      }
    } catch (e) {
      // If Redis fails, fall back to in-memory limiter below
      console.error("Redis rate limit failed, falling back to in-memory limiter:", e)
    }
  }

  // In-memory fallback rate limiter (single-instance)
  const now = Date.now();

  // Clean up expired entries deterministic interval to prevent memory leak and performance spikes
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    lastCleanup = now;
    for (const [key, value] of ipRequests.entries()) {
      if (value.expires < now) ipRequests.delete(key);
    }
  }

  const data = ipRequests.get(ip) || { count: 0, expires: now + RATE_LIMIT_WINDOW };

  // Reset count if expired
  if (data.expires < now) {
    data.count = 1;
    data.expires = now + RATE_LIMIT_WINDOW;
  } else {
    data.count++;
  }

  ipRequests.set(ip, data);

  if (data.count > MAX_REQUESTS) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}