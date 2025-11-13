import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    const deviceId = searchParams.get("device_id")
    const logType = searchParams.get("log_type")
    const severity = searchParams.get("severity")
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const limit = Number.parseInt(searchParams.get("limit") || "100")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    let query = supabase.from("logs").select("*", { count: "exact" })

    if (deviceId) {
      query = query.eq("device_id", deviceId)
    }

    if (logType) {
      query = query.eq("log_type", logType)
    }

    if (severity) {
      query = query.eq("severity", severity)
    }

    if (startDate) {
      query = query.gte("timestamp", new Date(startDate).toISOString())
    }

    if (endDate) {
      query = query.lte("timestamp", new Date(endDate).toISOString())
    }

    const { data, error, count } = await query
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("[v0] Log search error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      {
        success: true,
        data,
        total: count,
        limit,
        offset,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
