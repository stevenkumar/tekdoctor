
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Loader2, AlertCircle, Eye, EyeOff, ShieldCheck, KeyRound, RefreshCw, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/context/AuthContext';
import { useSiteContext } from '@/context/SiteContext';
import { getMediaUrl } from '@/utils/media';
import { authApi } from '@/services/api';
import { ROUTES } from '@/config/routes';
import { VALIDATION, isValidEmail } from '@/config/constants';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import { getRecaptchaToken } from '@/utils/recaptcha';

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

export default function SignIn() {
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [touched, setTouched]   = useState({ email: false, password: false });
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [serverError, setServerError] = useState('');
  const [shake, setShake]             = useState(false);

  // OTP state for Admin 2FA
  const [pendingToken, setPendingToken] = useState('');
  const [maskedEmail, setMaskedEmail]   = useState('');
  const [otp, setOtp]                   = useState('');
  const [otpError, setOtpError]         = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending]   = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const { login } = useAuth();
  const { flattenedSettings } = useSiteContext();
  const appName = flattenedSettings.company_name || 'TekDoctor';

  // Resend cooldown timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (step === 'otp' && resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, resendCooldown]);

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

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setTouched({ email: true, password: true });
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { triggerShake(); return; }

    setIsLoading(true);
    try {
      const recaptchaToken = await getRecaptchaToken('login');
      const result = await authApi.signIn({
        email: formData.email.trim(),
        password: formData.password,
        role: 'customer',
        recaptchaToken,
      });

      if (!result.ok || !result.data?.data) {
        throw new Error(result.error || 'Authentication failed.');
      }

      // 🛡️ Check if Admin 2FA OTP is required
      if (result.data.data.requiresOtp) {
        setPendingToken(result.data.data.pendingToken || '');
        setMaskedEmail(result.data.data.maskedEmail || '');
        setStep('otp');
        setOtp('');
        setOtpError('');
        setResendCooldown(60);
        return;
      }

      // Normal session token login for Customer, Technician, Company
      const { id, name, email, role, token } = result.data.data;
      if (!token || !id || !name || !email || !role) {
        throw new Error('Authentication token or user information missing from server response.');
      }

      if (role === 'customer') {
        login(token, { id, name, email, role: role as UserRole }, false, ROUTES.HOME);
      } else {
        login(token, { id, name, email, role: role as UserRole });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setServerError(msg);
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    const cleanOtp = otp.trim();

    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setOtpError('Please enter a valid 6-digit verification code.');
      triggerShake();
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const result = await authApi.verifyLoginOtp(pendingToken, cleanOtp);

      if (!result.ok || !result.data?.data) {
        throw new Error(result.error || 'Invalid or expired verification code.');
      }

      const { id, name, email, role, token } = result.data.data;
      if (!token || !id || !name || !email || !role) {
        throw new Error('Authentication token or user information missing from server response.');
      }

      login(token, { id, name, email, role: role as UserRole });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid or expired verification code.';
      setOtpError(msg);
      triggerShake();
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setOtpError('');
    setResendMessage('');

    try {
      const result = await authApi.resendLoginOtp(pendingToken);
      if (!result.ok) {
        throw new Error(result.error || 'Failed to resend verification code.');
      }
      setResendCooldown(60);
      setResendMessage('A new verification code has been dispatched to your email.');
      setTimeout(() => setResendMessage(''), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code.';
      setOtpError(msg);
    } finally {
      setIsResending(false);
    }
  };

  const handleGoogleOtpRequired = (data: { pendingToken: string; maskedEmail: string }) => {
    setPendingToken(data.pendingToken);
    setMaskedEmail(data.maskedEmail);
    setStep('otp');
    setOtp('');
    setOtpError('');
    setServerError('');
    setResendCooldown(60);
  };

  const inputClass = (field: 'email' | 'password') =>
    `w-full bg-zinc-900/50 border rounded-xl py-4 pl-12 ${field === 'password' ? 'pr-12' : 'pr-4'} focus:outline-none transition-all font-mono text-sm ${
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
        <div className="text-center mb-8 flex flex-col items-center">
          <Link to={ROUTES.HOME} className="inline-block mb-3 hover:opacity-90 transition-opacity" title="Back to Home">
            {flattenedSettings.logo_url ? (
              <img
                src={getMediaUrl(flattenedSettings.logo_url)}
                alt={`${appName} Logo`}
                className="h-12 max-h-14 max-w-[220px] w-auto object-contain mx-auto"
              />
            ) : (
              <div className="flex items-center justify-center gap-2">
                <div className="w-10 h-10 bg-black border border-neon-cyan/50 rounded flex items-center justify-center shadow-[0_0_15px_rgba(var(--neon-cyan-rgb),0.2)]">
                  <span className="text-neon-cyan font-bold text-xl uppercase">{appName.charAt(0)}</span>
                </div>
                <span className="text-xl font-bold tracking-tight text-white">{appName}</span>
              </div>
            )}
          </Link>

          {step === 'credentials' ? (
            <>
              <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter mb-2">Welcome <span className="text-neon-cyan">Back</span></h1>
              <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">Verify credentials for portal access</p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan mb-3 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
                <ShieldCheck size={26} />
              </div>
              <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">Admin <span className="text-neon-cyan">Verification</span></h1>
              <p className="text-zinc-400 font-mono text-xs max-w-xs">
                Enter the 6-digit security code dispatched to <span className="text-neon-cyan font-semibold">{maskedEmail || 'registered email'}</span>
              </p>
            </>
          )}
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-8 backdrop-blur-md shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          {step === 'credentials' ? (
            <>
              <form onSubmit={handleCredentialsSubmit} className="space-y-5" noValidate>
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
                      type={showPassword ? 'text' : 'password'}
                      placeholder="PASSWORD"
                      autoComplete="current-password"
                      className={inputClass('password')}
                      value={formData.password}
                      onChange={(e) => handleChange('password', e.target.value)}
                      onBlur={() => handleBlur('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 rounded-md focus:outline-none focus:ring-1 focus:ring-neon-cyan/40"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 px-1">
                    <FieldError msg={touched.password ? fieldErrors.password : undefined} />
                    <Link
                      to={ROUTES.FORGOT_PASSWORD}
                      className="text-xs font-mono text-zinc-400 hover:text-neon-cyan transition-colors ml-auto underline-offset-4 hover:underline"
                    >
                      Forgot Password?
                    </Link>
                  </div>
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

              {/* Divider & Google Sign In */}
              {flattenedSettings.google_login_enabled !== 'false' && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-800" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-zinc-900/90 px-3 text-zinc-500 font-mono text-[11px] rounded">
                        Or continue with
                      </span>
                    </div>
                  </div>

                  <GoogleSignInButton
                    text="Continue with Google"
                    redirectPath={ROUTES.HOME}
                    onOtpRequired={handleGoogleOtpRequired}
                  />
                </>
              )}
            </>
          ) : (
            /* Admin OTP Verification Step */
            <form onSubmit={handleOtpVerify} className="space-y-6" noValidate>
              <div>
                <label htmlFor="admin-otp-input" className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2 text-center">
                  6-Digit Verification Code
                </label>
                <div className="relative group">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-neon-cyan transition-colors" size={18} />
                  <input
                    id="admin-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    placeholder="••••••"
                    className="w-full bg-zinc-900/50 border border-zinc-800 focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/20 rounded-xl py-4 pl-12 pr-4 font-mono text-center text-2xl tracking-[0.5em] font-bold text-white focus:outline-none transition-all placeholder:text-zinc-700"
                    value={otp}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtp(val);
                      if (otpError) setOtpError('');
                    }}
                  />
                </div>

                {otpError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 text-xs font-mono text-red-400 mt-2 px-1"
                  >
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{otpError}</span>
                  </motion.div>
                )}

                {resendMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 mt-2 px-1"
                  >
                    <CheckCircle2 size={14} className="shrink-0" />
                    <span>{resendMessage}</span>
                  </motion.div>
                )}
              </div>

              <button
                type="submit"
                disabled={isVerifyingOtp || otp.length !== 6}
                className="w-full bg-neon-cyan text-black py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-white transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-[0_0_20px_rgba(0,229,255,0.15)]"
              >
                {isVerifyingOtp ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>Verify & Enter Portal <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} /></>
                )}
              </button>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isResending}
                  className="text-zinc-400 hover:text-neon-cyan transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={13} className={isResending ? 'animate-spin text-neon-cyan' : ''} />
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend verification code'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('credentials');
                    setOtp('');
                    setOtpError('');
                    setServerError('');
                  }}
                  className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={13} /> Back to Sign In
                </button>
              </div>
            </form>
          )}
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
