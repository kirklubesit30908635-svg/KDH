'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function TokenDebugPage() {
  const [sessionInfo, setSessionInfo] = useState<any>(null);

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    supabase.auth.getSession().then(({ data }) => {
      setSessionInfo({
        user_id: data.session?.user?.id,
        email: data.session?.user?.email,
        role: data.session?.user?.role,
        expires_at: data.session?.expires_at,
        has_access_token: !!data.session?.access_token
      });
    });
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Token Debug (DEV ONLY)</h1>

      {!sessionInfo && <p>Loading session…</p>}

      {sessionInfo && (
        <pre style={{ marginTop: 16 }}>
          {JSON.stringify(sessionInfo, null, 2)}
        </pre>
      )}
    </main>
  );
}
