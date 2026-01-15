import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const AGENT_HEADER = 'x-agent-key';

/**
 * Verifies the agent authentication key from the request headers.
 * comparing it against the server-side AGENT_SECRET_KEY environment variable.
 */

export function verifyAgentKey(request: NextRequest, isOptional = false): boolean {
    const agentKey = request.headers.get(AGENT_HEADER)?.trim();
    const serverKey = process.env.AGENT_SECRET_KEY?.trim();

    if (!serverKey) {
        console.error('[SECURITY] AGENT_SECRET_KEY is not set in environment variables. Denying access.');
        return false;
    }

    if (!agentKey) {
        if (isOptional) {
            console.log(`[SECURITY] Allowing unauthenticated access to ${request.nextUrl.pathname} (optional mode)`);
            return true;
        }
        console.warn(`[SECURITY] Agent key missing in request: ${request.nextUrl.pathname}`);
        return false;
    }

    // PROFESSIONAL SECURITY: Use timing-safe comparison to prevent side-channel attacks.
    // timingSafeEqual requires both buffers to be of the same length.
    const agentBytes = Buffer.from(agentKey);
    const serverBytes = Buffer.from(serverKey);

    if (agentBytes.length !== serverBytes.length) {
        // NON-LEAKING DIAGNOSTIC: Log lengths to help spot invisible character issues.
        console.warn(`[SECURITY] Key length mismatch from ${request.nextUrl.pathname}. Received: ${agentBytes.length}, Expected: ${serverBytes.length}`);
        return false;
    }

    const isValid = crypto.timingSafeEqual(agentBytes, serverBytes);

    if (!isValid) {
        console.warn(`[SECURITY] Invalid agent key from ${request.nextUrl.pathname} (Timing-Safe Check Failed)`);
    }

    return isValid;
}

/**
 * Generates standardized CORS headers for API responses.
 * Allows configured origins and handles non-browser (agent) requests.
 */
export function getCorsHeaders(request: NextRequest) {
    const origin = request.headers.get('origin') || '';

    const allowedOrigins = (
        process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [
            process.env.NEXT_PUBLIC_APP_URL || '',
            process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : ''
        ]
    ).filter(Boolean);

    // Allow requests with no origin (agents/curl) or if origin is in allowed list
    const isAllowed = origin && allowedOrigins.includes(origin);

    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0] || 'null',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-agent-key, x-device-id',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
    };
}

export function unauthorizedResponse() {
    return NextResponse.json(
        { error: "Unauthorized: Invalid or missing Agent Key" },
        { status: 401 }
    );
}

export function configErrorResponse() {
    return NextResponse.json(
        { error: "Server Configuration Error: security misconfiguration" },
        { status: 500 }
    );
}
