import { NextRequest, NextResponse } from 'next/server';

export const AGENT_HEADER = 'x-agent-key';

/**
 * Verifies the agent authentication key from the request headers.
 * comparing it against the server-side AGENT_SECRET_KEY environment variable.
 */
export function verifyAgentKey(request: NextRequest): boolean {
    const agentKey = request.headers.get(AGENT_HEADER);
    const serverKey = process.env.AGENT_SECRET_KEY;

    if (!serverKey) {
        // If server isn't configured, we log a critical error.
        // We deny the request to ensure security-by-default.
        console.error('[SECURITY] AGENT_SECRET_KEY is not set in environment variables. Denying access.');
        return false;
    }

    // Simple string comparison. 
    // In a high-security context, we would use crypto.timingSafeEqual, 
    // but for this token length, direct comparison is acceptable for this level.
    return agentKey === serverKey;
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
    // Note: Agents often don't send Origin headers.
    const isAllowed = !origin || allowedOrigins.includes(origin);

    return {
        'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : 'null',
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
