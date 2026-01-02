import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {


  const supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

<<<<<<< HEAD
  // Optimization: Skip getUser() for API routes in middleware to reduce latency
  // API routes perform their own auth checking.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return supabaseResponse
  }

=======
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

<<<<<<< HEAD
    if (!user && !request.nextUrl.pathname.startsWith("/auth")) {
=======
    if (!user && !request.nextUrl.pathname.startsWith("/auth") && !request.nextUrl.pathname.startsWith("/api")) {
>>>>>>> 478bdfe45f70ad6bff9edf5accff51b1e5aafa2c
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      return NextResponse.redirect(url)
    }
  } catch (error) {
    console.error("[v0] Auth error in proxy:", error)
  }

  return supabaseResponse
}