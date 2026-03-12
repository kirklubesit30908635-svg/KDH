import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED = ['/command', '/integrity', '/billing-ops', '/advertising', '/receipts', '/users']
const FOUNDER_EMAIL = 'kirklubesit30908635@gmail.com'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only run on protected routes
  if (!PROTECTED.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in → login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Founder bypass
  if (user.email === FOUNDER_EMAIL) {
    return response
  }

  // Check subscription status
  const { data: operator } = await supabase
    .from('operators')
    .select('subscription_status')
    .eq('auth_uid', user.id)
    .single()

  if (operator?.subscription_status !== 'active') {
    return NextResponse.redirect(new URL('/subscribe', request.url))
  }

  return response
}

export const config = {
  matcher: ['/command/:path*', '/integrity/:path*', '/billing-ops/:path*', '/advertising/:path*', '/receipts/:path*', '/users/:path*'],
}