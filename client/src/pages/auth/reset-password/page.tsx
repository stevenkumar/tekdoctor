import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, ArrowRight, Loader2, AlertCircle, CheckCircle2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useSiteContext } from '@/context/SiteContext';
import { getMediaUrl } from '@/utils/media';
import { authApi } from '@/services/api';
import { ROUTES } from '@/config/routes';
import { VALIDATION, isStrongPassword } from '@/config/constants';

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { label: `${VALIDATION.AUTH.PASSWORD_MIN_LENGTH}+ chars`, ok: password.length >= VALIDATION.AUTH.PASSWORD_MIN_LENGTH },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /[0-9]/.test(password) },
    { label: 'Symbol', ok: /[^a-zA-Z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-neon-cyan'];
  return (
    <div className="mt-2 px-1">
      <div className="flex gap-1 mb-1.5">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${i < score ? colors[score - 1] : 'bg-zinc-800'}`}
          />
        ))}
      </div>
      <div className="flex gap-3">
        {checks.map(c => (
          <span
            key={c.label}
            className={`text-[8px] font-mono flex items-center gap-0.5 transition-colors ${
              c.ok ? 'text-neon-cyan' : 'text-zinc-700'
            }`}
          >
            <CheckCircle2 size={8} /> {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || searchParams.get('resetToken') || '';
  const emailParam = searchParams.get('email') || '';
  const isSetupMode = searchParams.get('mode') === 'setup';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState({ password: false, confirmPassword: false });
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const { flattenedSettings } = useSiteContext();
  const appName = flattenedSettings.company_name || 'TekDoctor';

  const validate = () => {
    const errors: { password?: string; confirmPassword?: string } = {};

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < VALIDATION.AUTH.PASSWORD_MIN_LENGTH) {
      errors.password = `Password must be at least ${VALIDATION.AUTH.PASSWORD_MIN_LENGTH} characters.`;
    } else if (!isStrongPassword(password)) {
      errors.password = 'Add at least one uppercase letter and one number.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your new password.';
    } else if (password && confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    return errors;
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setTouched({ password: true, confirmPassword: true });

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      triggerShake();
      return;
    }

    if (!token) {
      setServerError('Missing reset token. Please request a new link.');
      triggerShake();
      return;
    }

    setIsLoading(true);
    try {
      const result = await authApi.resetPassword(token, password);

      if (!result.ok) {
        const errorData = result.data as any;
        const specificError =
          errorData?.errors?.newPassword ||
          errorData?.errors?.password ||
          errorData?.errors?.token ||
          errorData?.message ||
          result.error ||
          'Failed to reset password.';
        throw new Error(specificError);
      }

      setIsSuccess(true);
      toast.success('Password updated successfully!');

// Auto redirect after 3 seconds
      setTimeout(() => {
        navigate(ROUTES.SIGN_IN);
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password.';
      setServerError(msg);
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (field: 'password' | 'confirmPassword') =>
    `w-full bg-zinc-900/50 border rounded-xl py-4 pl-12 pr-12 focus:outline-none transition-all font-mono text-sm ${
      touched[field] && fieldErrors[field]
        ? 'border-red-500/70 focus:border-red-500 focus:ring-1 focus:ring-red-500/20'
        : 'border-zinc-800/40 focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/20'
    }`;

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
            {isSetupMode ? (
              <>Set Your <span className="text-neon-cyan">Password</span></>
            ) : (
              <>New <span className="text-neon-cyan">Password</span></>
            )}
          </h1>
          <p className="text-zinc-500 font-mono text-[10px] sm:text-xs uppercase tracking-widest px-2">
            {isSetupMode
              ? (emailParam ? `Welcome to TekDoctor • ${emailParam}` : 'Create a secure password for your account')
              : (emailParam ? `Account: ${emailParam}` : 'Create a secure new password')}
          </p>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/50/50 rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          {!token ? (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400">
                <AlertCircle size={32} />
              </div>
              <div>
                <h2 className="text-lg font-bold uppercase tracking-wider mb-2">
                  {isSetupMode ? 'Invalid or Expired Link' : 'Invalid or Missing Token'}
                </h2>
                <p className="text-zinc-400 text-xs font-mono leading-relaxed">
                  {isSetupMode
                    ? 'The setup link appears to be invalid or expired (valid for 24 hours). You can sign in using your account or request a new password link.'
                    : 'The password reset link appears to be invalid or incomplete. Reset links expire after 1 hour or after being used.'}
                </p>
              </div>
              <Link
                to={ROUTES.FORGOT_PASSWORD}
                className="w-full bg-neon-cyan text-black py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-white transition-all flex items-center justify-center gap-2 group cursor-pointer inline-block"
              >
                Request New Link <ArrowRight className="group-hover:translate-x-1 transition-transform inline" size={18} />
              </Link>
            </div>
          ) : isSuccess ? (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 bg-neon-cyan/10 border border-neon-cyan/30 rounded-2xl flex items-center justify-center mx-auto text-neon-cyan shadow-[0_0_30px_rgba(0,229,255,0.2)]">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h2 className="text-lg font-bold uppercase tracking-wider mb-2">
                  {isSetupMode ? 'Account Password Activated' : 'Password Reset Complete'}
                </h2>
                <p className="text-zinc-400 text-xs font-mono leading-relaxed">
                  {isSetupMode
                    ? 'Your password has been successfully established. You can now log into TekDoctor from any device.'
                    : 'Your password has been successfully updated. You will be redirected to the sign-in screen shortly.'}
                </p>
              </div>
              <Link
                to={ROUTES.SIGN_IN}
                className="w-full bg-neon-cyan text-black py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-white transition-all flex items-center justify-center gap-2 group cursor-pointer inline-block"
              >
                Proceed to Log In <ArrowRight className="group-hover:translate-x-1 transition-transform inline" size={18} />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
              {/* New Password */}
              <div>
                <div className="relative group">
                  <Lock
                    className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${
                      touched.password && fieldErrors.password ? 'text-red-400' : 'text-zinc-500 group-focus-within:text-neon-cyan'
                    }`}
                    size={18}
                  />
                  <input
                    id="reset-new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="NEW PASSWORD"
                    autoComplete="new-password"
                    className={inputClass('password')}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (touched.password) setFieldErrors(validate());
                    }}
                    onBlur={() => {
                      setTouched(prev => ({ ...prev, password: true }));
                      setFieldErrors(validate());
                    }}
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
                <PasswordStrength password={password} />
                {touched.password && fieldErrors.password && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 text-[10px] font-mono text-red-400 mt-1.5 px-1"
                  >
                    <AlertCircle size={10} /> {fieldErrors.password}
                  </motion.p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <div className="relative group">
                  <Lock
                    className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${
                      touched.confirmPassword && fieldErrors.confirmPassword ? 'text-red-400' : 'text-zinc-500 group-focus-within:text-neon-cyan'
                    }`}
                    size={18}
                  />
                  <input
                    id="reset-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="CONFIRM NEW PASSWORD"
                    autoComplete="new-password"
                    className={inputClass('confirmPassword')}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (touched.confirmPassword) setFieldErrors(validate());
                    }}
                    onBlur={() => {
                      setTouched(prev => ({ ...prev, confirmPassword: true }));
                      setFieldErrors(validate());
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 rounded-md focus:outline-none focus:ring-1 focus:ring-neon-cyan/40"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {touched.confirmPassword && fieldErrors.confirmPassword && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 text-[10px] font-mono text-red-400 mt-1.5 px-1"
                  >
                    <AlertCircle size={10} /> {fieldErrors.confirmPassword}
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
                  <>{isSetupMode ? 'Set Password' : 'Update Password'} <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} /></>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link
            to={ROUTES.SIGN_IN}
            className="text-zinc-500 hover:text-neon-cyan text-xs font-mono uppercase tracking-wider transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
