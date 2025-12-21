import { updateSession } from "./lib/supabase/middleware"
import { type NextRequest, NextResponse } from "next/server"

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute
const ipRequests = new Map<string, { count: number; expires: number }>();

export async function middleware(request: NextRequest) {
  // Simple Rate Limiting (In-Memory Fallback)
  // NOTE: This is effective for single-instance/dev but in serverless/production 
  // with multiple instances, this state is not shared. For strict production limits,
  // use Redis (e.g. Upstash) or Edge Config.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const now = Date.now();

    // Clean up expired
    if (ipRequests.has(ip) && ipRequests.get(ip)!.expires < now) {
      ipRequests.delete(ip);
    }

    const data = ipRequests.get(ip) || { count: 0, expires: now + RATE_LIMIT_WINDOW };
    data.count++;

    if (data.count > MAX_REQUESTS) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Refresh expiration if needed, or just update count
    if (!ipRequests.has(ip)) {
      ipRequests.set(ip, data);
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