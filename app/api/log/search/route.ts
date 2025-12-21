import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const searchSchema = z.object({
  device_id: z.string().optional(),
  log_type: z.string().optional(),
  severity: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
})

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const searchObj = Object.fromEntries(searchParams.entries())

    const validationResult = searchSchema.safeParse(searchObj);
    if (!validationResult.success) {
      return NextResponse.json({ error: "Invalid search parameters", details: validationResult.error.format() }, { status: 400 })
    }

    const { device_id, log_type, severity, start_date, end_date, limit, offset } = validationResult.data

    let query = supabase.from("logs").select("*", { count: "exact" })

    if (device_id) {
      query = query.eq("device_id", device_id)
    }

    if (log_type) {
      query = query.eq("log_type", log_type)
    }

    if (severity) {
      query = query.eq("severity", severity)
    }

    if (start_date) {
      query = query.gte("timestamp", start_date)
    }

    if (end_date) {
      query = query.lte("timestamp", end_date)
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
