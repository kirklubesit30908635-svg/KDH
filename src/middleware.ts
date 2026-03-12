import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED = ['/command', '/integrity', '/billing-ops', '/advertising', '/receipts', '/users']
const FOUNDER_EMAIL = 'kirklubesit30908635@gmail.com'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!PROTECTED.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  const ssrClient = createServerClient(
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

  const { data: { user } } = await ssrClient.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user.email === FOUNDER_EMAIL) {
    return response
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: operator } = await adminClient
    .schema('core')
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