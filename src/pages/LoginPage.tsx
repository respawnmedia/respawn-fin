import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/storage';
import { APP_VERSION } from '@/utils/version';

export function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<'password' | 'email'>(supabase ? 'email' : 'password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    let ok = false;
    if (mode === 'email') {
      ok = await login(email, password);
    } else {
      ok = await login(password);
    }
    setLoading(false);
    if (!ok) {
      setError(mode === 'email' ? 'Invalid email or password.' : 'Incorrect password.');
      setPassword('');
    }
  }

  return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-[#16C4BA] flex items-center justify-center">
              <span className="font-['Barlow_Condensed'] font-bold text-[#070707] text-sm">RF</span>
            </div>
            <span className="font-['Barlow_Condensed'] text-2xl font-bold text-white tracking-wide uppercase">Respawn Finance</span>
          </div>
          <p className="text-[#555] text-xs pl-11">Internal tracker · Founders only · v{APP_VERSION}</p>
        </div>

        {/* Mode toggle — only show if Supabase is connected */}
        {supabase && (
          <div className="flex mb-5 border border-[#333]">
            <button onClick={() => setMode('email')}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${mode === 'email' ? 'bg-[#16C4BA] text-[#070707]' : 'text-[#666] hover:text-[#999]'}`}>
              Email Login
            </button>
            <button onClick={() => setMode('password')}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${mode === 'password' ? 'bg-[#16C4BA] text-[#070707]' : 'text-[#666] hover:text-[#999]'}`}>
              Master Password
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'email' ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#666] uppercase tracking-wide">Email</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]"><Mail className="w-4 h-4" /></div>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@respawnmedia.in" autoFocus
                    className="w-full pl-10 pr-4 py-3 bg-[#111] border border-[#333] text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-[#16C4BA]" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#666] uppercase tracking-wide">Password</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]"><Lock className="w-4 h-4" /></div>
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 bg-[#111] border border-[#333] text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-[#16C4BA]" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555]">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#666] uppercase tracking-wide">Founder Password</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]"><Lock className="w-4 h-4" /></div>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" autoFocus
                  className="w-full pl-10 pr-10 py-3 bg-[#111] border border-[#333] text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-[#16C4BA]" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555]">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-[#DC2626]">{error}</p>}
          <Button type="submit" variant="primary" className="w-full justify-center py-3" loading={loading}>Sign In</Button>
        </form>

        {mode === 'email' && supabase && (
          <p className="mt-4 text-xs text-[#444] text-center">
            First time? A founder needs to create your account in Supabase → Authentication → Users
          </p>
        )}
        <p className="mt-3 text-xs text-[#333] text-center">Session expires after 15 min of inactivity</p>
      </div>
    </div>
  );
}
