import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { api, ApiError } from '@/lib/api';
import { queryClient } from '@/lib/query';
import type { SignInInput, SignUpInput } from '@/lib/schemas';
import type { Tokens } from '@/lib/types';

type AuthContext = {
  user: User | null;
  ready: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<'signed-in' | 'confirm'>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
};
const Context = createContext<AuthContext | null>(null);

/** Hands tokens from the store API to supabase-js, which then stores and refreshes them. */
async function adopt(session: Tokens) {
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw new ApiError('Please sign in again.', 401, 'session_expired');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContext = {
    user,
    ready,
    async signIn(input) {
      const { session } = await api<{ session: Tokens }>('/api/auth/sign-in', {
        method: 'POST',
        body: { ...input, client: 'mobile' },
      });
      await adopt(session);
    },
    async signUp(input) {
      const result = await api<{ session?: Tokens; confirm?: boolean }>('/api/auth/sign-up', {
        method: 'POST',
        body: { ...input, client: 'mobile' },
      });
      if (!result.session) return 'confirm';
      await adopt(result.session);
      return 'signed-in';
    },
    async signOut() {
      await supabase.auth.signOut();
      queryClient.removeQueries({ queryKey: ['bag'] });
    },
    async forgotPassword(email) {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email, client: 'mobile' } });
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}
