import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, ArrowRight, Loader2, AlertCircle, CheckCircle2, ArrowLeft, KeyRound, ShieldCheck, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useSiteContext } from '@/context/SiteContext';
import { getMediaUrl } from '@/utils/media';
import { authApi } from '@/services/api';
import { ROUTES } from '@/config/routes';
import { isValidEmail } from '@/config/constants';
import { getRecaptchaToken, preloadRecaptcha } from '@/utils/recaptcha';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [shake, setShake] = useState(false);

  // Admin OTP verification state
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const { flattenedSettings } = useSiteContext();
  const appName = flattenedSettings.company_name || 'TekDoctor';

  useEffect(() => {
    preloadRecaptcha();
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isOtpStep && resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOtpStep, resendCooldown]);

  const validate = (val: string) => {
    if (!val.trim()) return 'Email is required.';
    if (!isValidEmail(val)) return 'Enter a valid email address.';
    return '';
  };

  const handleChange = (val: string) => {
    setEmail(val);
    if (touched) setFieldError(validate(val));
  };

  const handleBlur = () => {
    setTouched(true);
    setFieldError(validate(email));
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setTouched(true);

    const error = validate(email);
    setFieldError(error);
    if (error) {
      triggerShake();
      return;
    }

    setIsLoading(true);
    try {
      const recaptchaToken = await getRecaptchaToken('forgot_password');
      const result = await authApi.forgotPassword(email.trim(), recaptchaToken);

      if (!result.ok) {
        throw new Error(result.error || 'Failed to request password reset.');
      }

      // Check if Admin requires OTP verification
      const responseData = result.data?.data || (result.data as any);
      if (responseData?.requiresOtp) {
        setTargetEmail(responseData.email || email.trim());
        setMaskedEmail(responseData.maskedEmail || '');
        setIsOtpStep(true);
        setOtp('');
        setOtpError('');
        setResendCooldown(60);
        return;
      }

      // Standard user flow (Customer, Technician, Company)
      setIsSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to request password reset.';
      setServerError(msg);
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
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
      const result = await authApi.verifyResetOtp(targetEmail, cleanOtp);

      if (!result.ok || !result.data?.data?.resetToken) {
        throw new Error(result.error || 'Invalid or expired verification code.');
      }

      const resetToken = result.data.data.resetToken;
      // Navigate directly to Reset Password page with verified token
      navigate(`${ROUTES.RESET_PASSWORD}?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(targetEmail)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed.';
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
      const recaptchaToken = await getRecaptchaToken('forgot_password');
      const result = await authApi.forgotPassword(targetEmail, recaptchaToken);

      if (!result.ok) {
        throw new Error(result.error || 'Failed to resend code.');
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

  return (
    <div className="bg-black text-white flex items-center justify-center p-4 sm:p-6 relative overflow-hidden min-h-[70vh]">
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-neon-cyan/10 rounded-full blur-[100px] sm:blur-[120px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-purple-500/10 rounded-full blur-[100px] sm:blur-[120px] -translate-x-1/2 translate-y-1/2 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={shake ? { x: [0, -8, 8, -6, 6, -4, 4, 0] } : { opacity: 1, scale: 1 }}
        transition={shake ? { duration: 0.4 } : {}}
        className="max-w-md w-full relative z-10"
      >
        <div className="text-center mb-8 sm:mb-10 flex flex-col items-center">
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
          {isOtpStep ? (
            <>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan mb-3 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
                <ShieldCheck size={26} />
              </div>
              <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">
                Admin <span className="text-neon-cyan">Verification</span>
              </h1>
              <p className="text-zinc-400 font-mono text-[10px] sm:text-xs max-w-xs">
                Enter the 6-digit security code sent to <span className="text-neon-cyan font-semibold">{maskedEmail || targetEmail}</span>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter mb-2">
                Reset <span className="text-neon-cyan">Password</span>
              </h1>
              <p className="text-zinc-500 font-mono text-[10px] sm:text-xs uppercase tracking-widest px-2">
                {isSubmitted ? 'Instructions dispatched' : 'Recover your account access'}
              </p>
            </>
          )}
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          {isSubmitted ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-5"
            >
              <div className="w-16 h-16 bg-neon-cyan/10 border border-neon-cyan/30 rounded-2xl flex items-center justify-center mx-auto text-neon-cyan shadow-[0_0_30px_rgba(0,229,255,0.2)]">
                <CheckCircle2 size={32} />
              </div>

              <div>
                <h2 className="text-lg font-bold uppercase tracking-wider mb-2">Check Your Inbox</h2>
                <p className="text-zinc-400 text-xs font-mono leading-relaxed">
                  If an active account exists for <span className="text-white font-semibold">{email}</span>, we have sent a secure password reset link. The link is valid for <strong className="text-neon-cyan">1 hour</strong>.
                </p>
                <p className="text-zinc-500 text-[11px] font-mono mt-2">
                  Be sure to check your spam or junk folder if the email doesn't arrive within a few minutes.
                </p>
              </div>

              <div className="pt-2 space-y-3">
                <Link
                  to={ROUTES.SIGN_IN}
                  className="w-full bg-neon-cyan text-black py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-white transition-all flex items-center justify-center gap-2 group cursor-pointer"
                >
                  Return to Log In <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
                </Link>

                <button
                  type="button"
                  onClick={() => { setIsSubmitted(false); setEmail(''); }}
                  className="text-zinc-500 hover:text-neon-cyan text-xs font-mono uppercase tracking-wider transition-colors block mx-auto pt-1 cursor-pointer"
                >
                  Didn't receive email? Try again
                </button>
              </div>
            </motion.div>
          ) : isOtpStep ? (
            <form onSubmit={handleVerifyOtp} className="space-y-6" noValidate>
              <div>
                <label htmlFor="admin-reset-otp-input" className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2 text-center">
                  6-Digit Verification Code
                </label>
                <div className="relative group">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-neon-cyan transition-colors" size={18} />
                  <input
                    id="admin-reset-otp-input"
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
                  <>Verify Code & Continue <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} /></>
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
                    setIsOtpStep(false);
                    setOtp('');
                    setOtpError('');
                    setServerError('');
                  }}
                  className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={13} /> Change Email
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
              <div>
                <p className="text-zinc-400 text-xs font-mono mb-4 leading-relaxed">
                  Enter your registered account email address. We will send you a secure link to create a new password.
                </p>

                <div className="relative group">
                  <Mail
                    className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${
                      touched && fieldError ? 'text-red-400' : 'text-zinc-500 group-focus-within:text-neon-cyan'
                    }`}
                    size={18}
                  />
                  <input
                    id="forgot-email"
                    type="email"
                    placeholder="ACCOUNT EMAIL"
                    autoComplete="email"
                    className={`w-full bg-zinc-900/50 border rounded-xl py-4 pl-12 pr-4 focus:outline-none transition-all font-mono text-sm ${
                      touched && fieldError
                        ? 'border-red-500/70 focus:border-red-500 focus:ring-1 focus:ring-red-500/20'
                        : 'border-zinc-800/40 focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/20'
                    }`}
                    value={email}
                    onChange={(e) => handleChange(e.target.value)}
                    onBlur={handleBlur}
                  />
                </div>

                {touched && fieldError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 text-[10px] font-mono text-red-400 mt-1.5 px-1"
                  >
                    <AlertCircle size={10} /> {fieldError}
                  </motion.p>
                )}
              </div>

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
                className="w-full bg-neon-cyan text-black py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-white transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm active:scale-[0.99]"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>Send Reset Link <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} /></>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link
            to={ROUTES.SIGN_IN}
            className="inline-flex items-center gap-2 text-zinc-500 hover:text-neon-cyan text-xs font-mono uppercase tracking-wider transition-colors"
          >
            <ArrowLeft size={14} /> Back to Sign In
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
