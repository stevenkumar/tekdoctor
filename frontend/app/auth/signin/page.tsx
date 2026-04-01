'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('http://127.0.0.1:5000/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');

      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800 backdrop-blur-xl"
      >
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white">Welcome <span className="text-neon-cyan">Back</span></h2>
          <p className="text-zinc-500 mt-2 text-sm">Please enter your details to sign in</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Email Address</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/50 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-neon-cyan transition-colors"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider">Password</label>
              <a href="#" className="text-[10px] text-neon-cyan uppercase tracking-tighter hover:underline">Forgot password?</a>
            </div>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/50 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-neon-cyan transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-neon-cyan text-black font-bold py-3 rounded-lg hover:bg-white transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-8">
          Don't have an account? {' '}
          <Link href="/auth/signup" className="text-neon-cyan hover:underline font-medium">Create one</Link>
        </p>
      </motion.div>
    </div>
  );
}
