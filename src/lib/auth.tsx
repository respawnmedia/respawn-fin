import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { addAuditEntry } from '@/lib/storage';
import { supabase } from '@/lib/storage';

const SESSION_KEY = 'rf:session';
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

// Fallback local password (SHA-256 of Re@12345)
const DEFAULT_HASH = '3b963194a51214a2335e1babb536b388d3bedde68b5b896c247ffce4599ef6b1';

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface AuthContextType {
  isAuthenticated: boolean;
  currentUser: string | null;
  login: (emailOrPassword: string, password?: string) => Promise<boolean>;
  logout: () => void;
  confirmPassword: (password: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'true');
  const [currentUser, setCurrentUser] = useState<string | null>(() => sessionStorage.getItem('rf:user'));
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('rf:user');
    setIsAuthenticated(false);
    setCurrentUser(null);
    addAuditEntry({ user_id: currentUser || 'founder', action: 'LOGOUT', entity: 'session' });
  }, [currentUser]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (isAuthenticated) {
      inactivityTimer.current = setTimeout(logout, INACTIVITY_TIMEOUT);
    }
  }, [isAuthenticated, logout]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetInactivityTimer));
    resetInactivityTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [isAuthenticated, resetInactivityTimer]);

  // Check for existing Supabase session on mount
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        sessionStorage.setItem('rf:user', session.user.email || 'founder');
        setCurrentUser(session.user.email || 'founder');
        setIsAuthenticated(true);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        sessionStorage.setItem('rf:user', session.user.email || 'founder');
        setCurrentUser(session.user.email || 'founder');
        setIsAuthenticated(true);
      } else if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem('rf:user');
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (emailOrPassword: string, password?: string): Promise<boolean> => {
    // If Supabase is enabled and we have a second argument, try email/password login
    if (supabase && password !== undefined) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: emailOrPassword, password });
      if (!error && data.session) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        sessionStorage.setItem('rf:user', data.user?.email || 'founder');
        setCurrentUser(data.user?.email || 'founder');
        setIsAuthenticated(true);
        addAuditEntry({ user_id: data.user?.email || 'founder', action: 'LOGIN', entity: 'session' });
        return true;
      }
      // If Supabase fails, fall through to local password check
    }

    // Local password fallback (works without Supabase)
    const hash = await sha256(emailOrPassword);
    const expectedHash = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_PASSWORD_HASH || DEFAULT_HASH;
    if (hash === expectedHash) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      sessionStorage.setItem('rf:user', 'founder');
      setCurrentUser('founder');
      setIsAuthenticated(true);
      addAuditEntry({ user_id: 'founder', action: 'LOGIN', entity: 'session' });
      return true;
    }
    addAuditEntry({ user_id: 'unknown', action: 'LOGIN_FAILED', entity: 'session' });
    return false;
  }, []);

  const confirmPassword = useCallback(async (password: string): Promise<boolean> => {
    const hash = await sha256(password);
    const expectedHash = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_PASSWORD_HASH || DEFAULT_HASH;
    return hash === expectedHash;
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, currentUser, login, logout, confirmPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
