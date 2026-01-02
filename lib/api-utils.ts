import { NextRequest, NextResponse } from "next/server";

/**
 * Get the list of allowed origins from environment variables.
 */
const allowedOrigins = (
    process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [
        process.env.NEXT_PUBLIC_APP_URL || '',
        process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : ''
    ]
).filter(Boolean);

// Runtime validation to catch misconfiguration in production
if (allowedOrigins.length === 0 && process.env.NODE_ENV === 'production') {
    console.error("[SECURITY] CORS configuration error: No allowed origins defined. API will be inaccessible from browsers due to credential requirements.");
}

/**
 * Returns the CORS headers for a given request.
 * Validates the Origin header against the allowed origins list.
 */
export function getCorsHeaders(request: NextRequest, methods: string = 'GET, POST, PUT, DELETE, OPTIONS') {
    const origin = request.headers.get('origin');
    const isAllowed = origin ? allowedOrigins.includes(origin) : false;

    // SECURITY: If the origin is not allowed, do NOT return a wildcard (*).
    // Instead, return the primary allowed origin if available, or an empty string.
    const responseOrigin = isAllowed ? origin! : (allowedOrigins.length > 0 ? allowedOrigins[0] : '');

    return {
        'Access-Control-Allow-Origin': responseOrigin,
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-agent-key',
        'Access-Control-Allow-Credentials': 'true',
    };
}

/**
 * Verifies if the request contains a valid agent secret key.
 * Fails shut if the server secret is not configured.
 */
export function verifyAgentKey(request: NextRequest): boolean {
    const agentKey = request.headers.get('x-agent-key');
    const expectedKey = process.env.AGENT_SECRET_KEY;

    if (!expectedKey || expectedKey.trim() === '') {
        console.error("[SECURITY] AGENT_SECRET_KEY is not configured on the server. Rejecting all agent requests.");
        return false;
    }

    return agentKey === expectedKey;
}

/**
 * Returns a standardized unauthorized response with proper headers.
 */
export function unauthorizedResponse(headers: Record<string, string>, message: string = "Unauthorized: Invalid Agent Key") {
    return NextResponse.json(
        { error: message },
        { status: 401, headers }
    );
}
