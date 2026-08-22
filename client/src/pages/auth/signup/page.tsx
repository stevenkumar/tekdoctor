
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { AuthUser } from '@/context/AuthContext';
import { authApi } from '@/services/api';
import { ROUTES } from '@/config/routes';
import { VALIDATION, isValidEmail, isStrongPassword } from '@/config/constants';

// ── Validation helpers ──────────────────────────────────────────────────────

function validateSignUp(data: { name: string; email: string; password: string; confirmPassword: string }) {
  const errors: { name?: string; email?: string; password?: string; confirmPassword?: string } = {};
  if (!data.name.trim()) errors.name = 'Full name is required.';
  else if (data.name.trim().length < VALIDATION.AUTH.NAME_MIN_LENGTH) {
    errors.name = `Name must be at least ${VALIDATION.AUTH.NAME_MIN_LENGTH} characters.`;
  }
  else if (data.name.trim().length > VALIDATION.AUTH.NAME_MAX_LENGTH) {
    errors.name = `Name must be under ${VALIDATION.AUTH.NAME_MAX_LENGTH} characters.`;
  }
  else if (!/^[a-zA-Z\s'-]+$/.test(data.name.trim())) errors.name = 'Name can only contain letters, spaces, hyphens and apostrophes.';

  if (!data.email.trim()) errors.email = 'Email address is required.';
  else if (!isValidEmail(data.email)) errors.email = 'Enter a valid email address (e.g. you@example.com).';

  if (!data.password) errors.password = 'Password is required.';
  else if (data.password.length < VALIDATION.AUTH.PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${VALIDATION.AUTH.PASSWORD_MIN_LENGTH} characters.`;
  }
  else if (!isStrongPassword(data.password)) errors.password = 'Add at least one uppercase letter and one number.';

  if (!data.confirmPassword) errors.confirmPassword = 'Please confirm your password.';
  else if (data.password && data.confirmPassword !== data.password) errors.confirmPassword = 'Passwords do not match.';

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

// ── Password strength indicator ─────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { label: `${VALIDATION.AUTH.PASSWORD_MIN_LENGTH}+ chars`,  ok: password.length >= VALIDATION.AUTH.PASSWORD_MIN_LENGTH },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Number',    ok: /[0-9]/.test(password) },
    { label: 'Symbol',    ok: /[^a-zA-Z0-9]/.test(password) },
  ];
  const score  = checks.filter(c => c.ok).length;
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-neon-cyan'];
  return (
    <div className="mt-2 px-1">
      <div className="flex gap-1 mb-1.5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${i < score ? colors[score - 1] : 'bg-zinc-800'}`} />
        ))}
      </div>
      <div className="flex gap-3">
        {checks.map(c => (
          <span key={c.label} className={`text-[8px] font-mono flex items-center gap-0.5 transition-colors ${c.ok ? 'text-neon-cyan' : 'text-zinc-700'}`}>
            <CheckCircle2 size={8} /> {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

type Fields = 'name' | 'email' | 'password' | 'confirmPassword';

// ── API response shape from POST /api/auth/signup ───────────────────────────
interface SignUpResponse {
  success: boolean;
  message: string;
  data: AuthUser & { token: string };
}

export default function SignUp() {
  const [formData, setFormData]       = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [touched, setTouched]         = useState<Record<Fields, boolean>>({ name: false, email: false, password: false, confirmPassword: false });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Fields, string>>>({});
  const [isLoading, setIsLoading]     = useState(false);
  const [serverError, setServerError] = useState('');
  const [shake, setShake]             = useState(false);
  const { login } = useAuth();

  const validate = (data = formData) => validateSignUp(data);

  const handleChange = (field: Fields, value: string) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    if (touched[field]) setFieldErrors(validate(updated));
    if (field === 'password' && touched.confirmPassword) setFieldErrors(validate(updated));
  };

  const handleBlur = (field: Fields) => {
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
    setTouched({ name: true, email: true, password: true, confirmPassword: true });
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { triggerShake(); return; }

    setIsLoading(true);
    try {
      const result = await authApi.signUp({
        name:     formData.name.trim(),
        email:    formData.email.trim(),
        password: formData.password,
        role:     'customer',
      });

      if (!result.ok || !result.data?.data) {
        throw new Error(result.error || 'Failed to create account.');
      }

      // ✅ Correctly read from result.data.data (the nested `data` object in the response)
      const { id, name, email, role, token } = result.data.data;
      login(token, { id, name, email, role });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create account.';
      setServerError(msg);
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (field: Fields) =>
    `w-full bg-zinc-900/50 border rounded-xl py-4 pl-12 pr-4 focus:outline-none transition-all font-mono text-sm ${
      touched[field] && fieldErrors[field]
        ? 'border-red-500/70 focus:border-red-500 focus:ring-1 focus:ring-red-500/20'
        : 'border-zinc-800 focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/20'
    }`;

  return (
    <div className=" bg-black text-white flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-neon-cyan/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] translate-x-1/2 translate-y-1/2 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={shake ? { x: [0, -8, 8, -6, 6, -4, 4, 0] } : { opacity: 1, y: 0 }}
        transition={shake ? { duration: 0.4 } : {}}
        className="max-w-md w-full relative z-10"
      >
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">Join <span className="text-neon-cyan">Tek Doctor</span></h1>
          <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Register your profile for specialized access</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Name */}
          <div>
            <div className="relative group">
              <User className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${touched.name && fieldErrors.name ? 'text-red-400' : 'text-zinc-500 group-focus-within:text-neon-cyan'}`} size={18} />
              <input
                id="signup-name"
                type="text"
                placeholder="FULL NAME"
                autoComplete="name"
                className={inputClass('name')}
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                onBlur={() => handleBlur('name')}
              />
            </div>
            <FieldError msg={touched.name ? fieldErrors.name : undefined} />
          </div>

          {/* Email */}
          <div>
            <div className="relative group">
              <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${touched.email && fieldErrors.email ? 'text-red-400' : 'text-zinc-500 group-focus-within:text-neon-cyan'}`} size={18} />
              <input
                id="signup-email"
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
                id="signup-password"
                type="password"
                placeholder="SECURE_PASSWORD"
                autoComplete="new-password"
                className={inputClass('password')}
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
                onBlur={() => handleBlur('password')}
              />
            </div>
            <PasswordStrength password={formData.password} />
            <FieldError msg={touched.password ? fieldErrors.password : undefined} />
          </div>

          {/* Confirm Password */}
          <div>
            <div className="relative group">
              <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${touched.confirmPassword && fieldErrors.confirmPassword ? 'text-red-400' : 'text-zinc-500 group-focus-within:text-neon-cyan'}`} size={18} />
              <input
                id="signup-confirm-password"
                type="password"
                placeholder="CONFIRM_PASSWORD"
                autoComplete="new-password"
                className={inputClass('confirmPassword')}
                value={formData.confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
                onBlur={() => handleBlur('confirmPassword')}
              />
            </div>
            <FieldError msg={touched.confirmPassword ? fieldErrors.confirmPassword : undefined} />
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
            className="w-full bg-white text-black py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-neon-cyan transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>Create Account <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} /></>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-zinc-500 text-xs font-mono uppercase">
            Already have an account?{' '}
            <Link to={ROUTES.SIGN_IN} className="text-neon-cyan hover:underline decoration-neon-cyan/30 underline-offset-4">
              Log In
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
