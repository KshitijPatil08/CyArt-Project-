import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const LOCKOUT_DURATION_MINUTES = 15
const MAX_FAILED_ATTEMPTS = 3

export async function POST(request: Request) {
    try {
        const { email, success } = await request.json()

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 })
        }

        const supabase = await createClient()

        // Get current login attempt record
        const { data: attemptRecord, error: fetchError } = await supabase
            .from("login_attempts")
            .select("*")
            .eq("email", email)
            .single()

        const now = new Date()

        // If this is a successful login, reset the attempt counter
        if (success) {
            if (attemptRecord) {
                await supabase
                    .from("login_attempts")
                    .update({
                        attempt_count: 0,
                        locked_until: null,
                        last_attempt_at: now.toISOString(),
                    })
                    .eq("email", email)
            }
            return NextResponse.json({ locked: false, message: "Login successful" })
        }

        // Handle failed login attempt
        if (attemptRecord) {
            // Check if account is currently locked
            if (attemptRecord.locked_until) {
                const lockedUntil = new Date(attemptRecord.locked_until)
                if (now < lockedUntil) {
                    const minutesRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000)
                    return NextResponse.json(
                        {
                            locked: true,
                            locked_until: attemptRecord.locked_until,
                            minutes_remaining: minutesRemaining,
                            message: `Account is locked. Please try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? "s" : ""}.`,
                        },
                        { status: 423 }
                    )
                }
            }

            // Increment attempt counter
            const newAttemptCount = attemptRecord.attempt_count + 1
            const lockAccount = newAttemptCount >= MAX_FAILED_ATTEMPTS

            const updateData: {
                attempt_count: number
                last_attempt_at: string
                locked_until?: string | null
            } = {
                attempt_count: newAttemptCount,
                last_attempt_at: now.toISOString(),
            }

            if (lockAccount) {
                const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60000)
                updateData.locked_until = lockedUntil.toISOString()
            }

            await supabase.from("login_attempts").update(updateData).eq("email", email)

            if (lockAccount) {
                return NextResponse.json(
                    {
                        locked: true,
                        locked_until: updateData.locked_until,
                        minutes_remaining: LOCKOUT_DURATION_MINUTES,
                        message: `Too many failed login attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`,
                    },
                    { status: 423 }
                )
            }

            return NextResponse.json({
                locked: false,
                attempts_remaining: MAX_FAILED_ATTEMPTS - newAttemptCount,
                message: `Invalid credentials. ${MAX_FAILED_ATTEMPTS - newAttemptCount} attempt${MAX_FAILED_ATTEMPTS - newAttemptCount !== 1 ? "s" : ""} remaining.`,
            })
        } else {
            // First failed attempt - create new record
            await supabase.from("login_attempts").insert({
                email,
                attempt_count: 1,
                last_attempt_at: now.toISOString(),
            })

            return NextResponse.json({
                locked: false,
                attempts_remaining: MAX_FAILED_ATTEMPTS - 1,
                message: `Invalid credentials. ${MAX_FAILED_ATTEMPTS - 1} attempts remaining.`,
            })
        }
    } catch (error) {
        console.error("Error checking lockout status:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
