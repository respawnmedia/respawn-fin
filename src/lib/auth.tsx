import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { addAuditEntry } from '@/lib/storage';

const SESSION_KEY = 'respawn-finance:session';
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// Password is hashed with SHA-256. Default: Re@12345
// In production, set VITE_PASSWORD_HASH env var.
// SHA-256 of "Re@12345" = precomputed below
const DEFAULT_HASH = '3b963194a51214a2335e1babb536b388d3bedde68b5b896c247ffce4599ef6b1';

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface AuthContextType {
  isAuthenticated: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  confirmPassword: (password: string) => Promise<boolean>;
  resetInactivityTimer: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  });
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
    addAuditEntry({ user_id: 'founder', action: 'LOGOUT', entity: 'session' });
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (isAuthenticated) {
      inactivityTimer.current = setTimeout(() => {
        logout();
      }, INACTIVITY_TIMEOUT);
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

  const login = useCallback(async (password: string): Promise<boolean> => {
    const hash = await sha256(password);
    const expectedHash = (import.meta as any).env?.VITE_PASSWORD_HASH || DEFAULT_HASH;
    if (hash === expectedHash) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setIsAuthenticated(true);
      addAuditEntry({ user_id: 'founder', action: 'LOGIN', entity: 'session' });
      return true;
    }
    addAuditEntry({ user_id: 'unknown', action: 'LOGIN_FAILED', entity: 'session' });
    return false;
  }, []);

  const confirmPassword = useCallback(async (password: string): Promise<boolean> => {
    const hash = await sha256(password);
    const expectedHash = (import.meta as any).env?.VITE_PASSWORD_HASH || DEFAULT_HASH;
    return hash === expectedHash;
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, confirmPassword, resetInactivityTimer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
