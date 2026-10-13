import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, ArrowRight, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteContext } from '@/context/SiteContext';
import { getMediaUrl } from '@/utils/media';
import { authApi } from '@/services/api';
import { ROUTES } from '@/config/routes';
import { isValidEmail } from '@/config/constants';
import { getRecaptchaToken } from '@/utils/recaptcha';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [shake, setShake] = useState(false);
  const { flattenedSettings } = useSiteContext();
  const appName = flattenedSettings.company_name || 'TekDoctor';

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

      setIsSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to request password reset.';
      setServerError(msg);
      triggerShake();
    } finally {
      setIsLoading(false);
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
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter mb-2">
            Reset <span className="text-neon-cyan">Password</span>
          </h1>
          <p className="text-zinc-500 font-mono text-[10px] sm:text-xs uppercase tracking-widest px-2">
            {isSubmitted ? 'Instructions dispatched' : 'Recover your account access'}
          </p>
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
