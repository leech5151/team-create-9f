import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface AdminAuth {
  /** True once a session exists. Readers never sign in and stay false. */
  isAdmin: boolean;
  email: string | null;
  /** False until the stored session has been checked, to avoid a UI flash. */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

/** Turns Supabase's English auth errors into something a Korean UI can show. */
function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (m.includes('email not confirmed')) {
    return '이메일 확인이 완료되지 않은 계정입니다. Supabase에서 Confirm email을 꺼주세요.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return '네트워크에 연결할 수 없습니다.';
  }
  return message;
}

export function useAdminAuth(): AdminAuth {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** Resolves to null on success, or a message to show the operator. */
  const signIn = useCallback(async (address: string, password: string) => {
    if (!supabase) return 'Supabase가 설정되지 않았습니다.';
    const { error } = await supabase.auth.signInWithPassword({ email: address, password });
    return error ? translate(error.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  return { isAdmin: email !== null, email, ready, signIn, signOut };
}
