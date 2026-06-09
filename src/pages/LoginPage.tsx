import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';

export function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await login(password);
    setLoading(false);
    if (!ok) {
      setError('Incorrect password. Try again.');
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
            <span className="font-['Barlow_Condensed'] text-2xl font-bold text-white tracking-wide uppercase">
              Respawn Finance
            </span>
          </div>
          <p className="text-[#666] text-sm pl-11">Internal financial tracker — Founders only</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#666] uppercase tracking-wide">
              Password
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter founder password"
                className="w-full pl-10 pr-10 py-3 bg-[#111] border border-[#333] text-white text-sm
                  placeholder:text-[#555] focus:outline-none focus:border-[#16C4BA]
                  focus:ring-1 focus:ring-[#16C4BA]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#999]"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <span className="text-xs text-[#DC2626]">{error}</span>}
          </div>

          <Button type="submit" variant="primary" className="w-full justify-center py-3" loading={loading}>
            Enter
          </Button>
        </form>

        <p className="mt-8 text-xs text-[#333] text-center">
          Session expires after 15 minutes of inactivity
        </p>
      </div>
    </div>
  );
}
