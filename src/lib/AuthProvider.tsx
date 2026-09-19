/**
 * AuthProvider — wraps Supabase auth (cloud) with a local demo fallback.
 * Never crashes when Supabase is absent; it surfaces a config message instead.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AuthContext,
  makeDemoUser,
  mapSupabaseUser,
  readDemoUser,
  signOutCloud,
  signInWithEmail,
  signInWithGoogle,
  verifyEmailOtp,
  writeDemoUser,
  type AuthState,
  type AuthUser,
} from './auth';
import { isSupabaseConfigured, supabase, supabaseConfigMessage } from './supabase';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /* ---- restore session on boot ---- */
  useEffect(() => {
    let active = true;

    async function boot() {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase.auth.getSession();
          if (!active) return;
          if (data.session?.user) {
            setUser(mapSupabaseUser(data.session.user));
          } else {
            setUser(readDemoUser());
          }
        } catch {
          if (active) setUser(readDemoUser());
        }
      } else {
        setUser(readDemoUser());
      }
      if (active) setLoading(false);
    }

    void boot();

    const sub =
      supabase?.auth.onAuthStateChange((_event: string, session: Session | null) => {
        if (!active) return;
        if (session?.user) {
          const mapped = mapSupabaseUser(session.user);
          setUser(mapped);
          writeDemoUser(null);
        } else if (isSupabaseConfigured) {
          // Signed out of cloud — fall back to any local demo session.
          setUser(readDemoUser());
        }
      }) ?? null;

    return () => {
      active = false;
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogleAction = useCallback(async () => signInWithGoogle(), []);
  const signInWithEmailAction = useCallback(
    async (email: string) => signInWithEmail(email),
    [],
  );
  const verifyEmailOtpAction = useCallback(
    async (email: string, token: string) => verifyEmailOtp(email, token),
    [],
  );

  const signInAsDemo = useCallback((email?: string) => {
    const demo = makeDemoUser(email);
    writeDemoUser(demo);
    setUser(demo);
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (isSupabaseConfigured) await signOutCloud();
    } finally {
      writeDemoUser(null);
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(async (patch: { display_name?: string }) => {
    if (!patch.display_name) return;
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.updateUser({ data: { full_name: patch.display_name } });
    }
    setUser((u) => {
      if (!u) return u;
      const next = { ...u, displayName: patch.display_name as string };
      if (u.isDemo) writeDemoUser(next);
      return next;
    });
  }, []);

  const value: AuthState = useMemo(
    () => ({
      user,
      loading,
      cloudAuth: isSupabaseConfigured,
      configMessage: supabaseConfigMessage,
      signInWithGoogle: signInWithGoogleAction,
      signInWithEmail: signInWithEmailAction,
      verifyEmailOtp: verifyEmailOtpAction,
      signInAsDemo,
      signOut,
      updateProfile,
    }),
    [
      user,
      loading,
      signInWithGoogleAction,
      signInWithEmailAction,
      verifyEmailOtpAction,
      signInAsDemo,
      signOut,
      updateProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
