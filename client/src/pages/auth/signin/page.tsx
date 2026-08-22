
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { AuthUser } from '@/context/AuthContext';
import { authApi } from '@/services/api';
import { ROUTES } from '@/config/routes';
import { VALIDATION, isValidEmail } from '@/config/constants';

// ── Validation helpers ──────────────────────────────────────────────────────

function validateSignIn(email: string, password: string) {
  const errors: { email?: string; password?: string } = {};
  if (!email.trim()) errors.email = 'Email is required.';
  else if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Password is required.';
  else if (password.length < VALIDATION.AUTH.PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${VALIDATION.AUTH.PASSWORD_MIN_LENGTH} characters.`;
  }
  return errors;
}

// ── Field error component ───────────────────────────────────────────────────
function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1.5 text-[10px] font-mono text-red-400 mt-1.5 px-1"
    >
      <AlertCircle size={10} /> {msg}
    </motion.p>
  );
}

// ── API response shape from POST /api/auth/signin ───────────────────────────
interface SignInResponse {
  success: boolean;
  message: string;
  data: AuthUser & { token: string };
}

export default function SignIn() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [touched, setTouched]   = useState({ email: false, password: false });
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [isLoading, setIsLoading]     = useState(false);
  const [serverError, setServerError] = useState('');
  const [shake, setShake]             = useState(false);
  const { login } = useAuth();

  const validate = (data = formData) => validateSignIn(data.email, data.password);

  const handleChange = (field: 'email' | 'password', value: string) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    if (touched[field]) setFieldErrors(validate(updated));
  };

  const handleBlur = (field: 'email' | 'password') => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setFieldErrors(validate());
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setTouched({ email: true, password: true });
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { triggerShake(); return; }

    setIsLoading(true);
    try {
      const result = await authApi.signIn({
        email: formData.email.trim(),
        password: formData.password,
        role: 'customer',
      });

      if (!result.ok || !result.data?.data) {
        throw new Error(result.error || 'Authentication failed.');
      }

      // ✅ Correctly read from result.data.data (the nested `data` object in the response)
      const { id, name, email, role, token } = result.data.data;
      login(token, { id, name, email, role });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setServerError(msg);
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (field: 'email' | 'password') =>
    `w-full bg-zinc-900/50 border rounded-xl py-4 pl-12 pr-4 focus:outline-none transition-all font-mono text-sm ${
      touched[field] && fieldErrors[field]
        ? 'border-red-500/70 focus:border-red-500 focus:ring-1 focus:ring-red-500/20'
        : 'border-zinc-800 focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/20'
    }`;

  return (
    <div className=" bg-black text-white flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-neon-cyan/10 rounded-full blur-[120px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] -translate-x-1/2 translate-y-1/2 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={shake ? { x: [0, -8, 8, -6, 6, -4, 4, 0] } : { opacity: 1, scale: 1 }}
        transition={shake ? { duration: 0.4 } : {}}
        className="max-w-md w-full relative z-10"
      >
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">Welcome <span className="text-neon-cyan">Back</span></h1>
          <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Verify credentials for portal access</p>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-8 backdrop-blur-md shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email */}
            <div>
              <div className="relative group">
                <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${touched.email && fieldErrors.email ? 'text-red-400' : 'text-zinc-500 group-focus-within:text-neon-cyan'}`} size={18} />
                <input
                  id="signin-email"
                  type="email"
                  placeholder="EMAIL"
                  autoComplete="email"
                  className={inputClass('email')}
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  onBlur={() => handleBlur('email')}
                />
              </div>
              <FieldError msg={touched.email ? fieldErrors.email : undefined} />
            </div>

            {/* Password */}
            <div>
              <div className="relative group">
                <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${touched.password && fieldErrors.password ? 'text-red-400' : 'text-zinc-500 group-focus-within:text-neon-cyan'}`} size={18} />
                <input
                  id="signin-password"
                  type="password"
                  placeholder="PASSWORD"
                  autoComplete="current-password"
                  className={inputClass('password')}
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  onBlur={() => handleBlur('password')}
                />
              </div>
              <FieldError msg={touched.password ? fieldErrors.password : undefined} />
            </div>

            {/* Server error */}
            {serverError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-[10px] font-mono uppercase tracking-widest"
              >
                <AlertCircle size={14} className="shrink-0" />
                {serverError}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-neon-cyan text-black py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-white transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>Log In <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} /></>
              )}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center">
          <p className="text-zinc-500 text-xs font-mono uppercase">
            New to Tek Doctor?{' '}
            <Link to={ROUTES.SIGN_UP} className="text-neon-cyan hover:underline decoration-neon-cyan/30 underline-offset-4">
              Create Account
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
