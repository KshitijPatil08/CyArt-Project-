'use server'

import { createClient } from "@/lib/supabase/server"
import bcrypt from "bcrypt"
import crypto from "crypto"

export async function createDeviceAction(formData: any) {
    const supabase = await createClient()

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: "Unauthorized" }
    }

    try {
        const { device_name, device_type, owner, location, hostname, ip_address } = formData

        // 2. Create Device Record
        const { data: deviceData, error: deviceError } = await supabase
            .from("devices")
            .insert([{
                device_name,
                device_type,
                owner,
                location,
                hostname: hostname || device_name,
                ip_address,
                status: "offline",
                security_status: "unknown",
                created_at: new Date().toISOString(),
                last_seen: new Date().toISOString()
            }])
            .select()
            .single()

        if (deviceError) throw deviceError

        // 3. Generate and Hash Password
        const deviceId = deviceData.id
        const username = `device_${deviceData.device_name.toLowerCase().replace(/\s+/g, "_")}`
        const rawPassword = crypto.randomBytes(24).toString('base64url')
        const hashedPassword = await bcrypt.hash(rawPassword, 10)

        // 4. Store Credentials
        const { error: credError } = await supabase.from("device_credentials").insert([{
            device_id: deviceId,
            username,
            password: hashedPassword // Store hashed password
        }])

        if (credError) throw credError

        // IMPORTANT: Do NOT return raw plaintext passwords in API responses.
        // The system previously returned the raw password here for one-time display.
        // For security, return a redacted marker. If you need a one-time secret
        // display, implement a secure vault or ephemeral retrieval mechanism.
        return {
            success: true,
            data: {
                device: deviceData,
                credentials: {
                    username,
                    password: 'REDACTED'
                }
            }
        }

    } catch (error: any) {
        console.error("Device creation failed:", error)
        return { success: false, error: error.message }
    }
}
