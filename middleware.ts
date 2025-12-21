import { updateSession } from "./lib/supabase/middleware"
import { type NextRequest, NextResponse } from "next/server"

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute
const ipRequests = new Map<string, { count: number; expires: number }>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes cleanup interval

export async function middleware(request: NextRequest) {
  // Simple Rate Limiting (In-Memory Fallback)
  // NOTE: This is effective for single-instance/dev but in serverless/production 
  // with multiple instances, this state is not shared. For strict production limits,
  // use Redis (e.g. Upstash) or Edge Config.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // SECURITY: Get real IP from x-forwarded-for (first entry) and sanitize
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : ((request as any).ip || '127.0.0.1');
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