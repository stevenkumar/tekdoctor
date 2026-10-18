import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi, technicianApi } from '@/services/api';
import { UserCircle, Shield, Loader2, Save, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import PhoneInput from '@/components/PhoneInput';
import { parsePhoneNumber, validatePhoneNumber, DEFAULT_COUNTRY } from '@/utils/phoneUtils';
import { NAME_MAX_LENGTH, validateName, validateEmail, validatePassword, validatePasswordMatch, DUPLICATE_ERRORS } from '@/config/constants';

export default function AdminProfile() {
    const { user, token, fetchUser } = useAuth();

    const [profileForm, setProfileForm] = useState({ name: user?.name || '', email: user?.email || '', phone: (user as any)?.phone || '' });
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState('');
    const [profileErrors, setProfileErrors] = useState<{ name?: string; email?: string; phone?: string }>({});

    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordMsg, setPasswordMsg] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordErrors, setPasswordErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>({});

    useEffect(() => {
        if (user) {
            setProfileForm({
                name: user.name || '',
                email: user.email || '',
                phone: (user as any).phone || ''
            });
        }
    }, [user]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setProfileErrors({});
        setProfileMsg('');

        const errs: { name?: string; email?: string; phone?: string } = {};

        const nameVal = validateName(profileForm.name, 'Full name');
        if (!nameVal.isValid) {
            errs.name = nameVal.error || 'Please enter a valid full name.';
        }

        const emailVal = validateEmail(profileForm.email);
        if (!emailVal.isValid) {
            errs.email = emailVal.error || 'Please enter a valid email address.';
        }

        if (profileForm.phone) {
            const { country, nationalNumber } = parsePhoneNumber(profileForm.phone.trim(), DEFAULT_COUNTRY);
            const val = validatePhoneNumber(nationalNumber, country);
            if (!val.isValid) {
                errs.phone = val.error || 'Please enter a valid phone number.';
            }
        }

        if (Object.keys(errs).length > 0) {
            setProfileErrors(errs);
            return;
        }

        setProfileSaving(true);
        const res = user?.role === 'technician'
            ? await technicianApi.updateProfile(token, profileForm)
            : await adminApi.updateProfile(token, profileForm);
        if (res.ok) {
            setProfileMsg('Profile updated successfully.');
            if (user) {
                const updated = { ...user, name: profileForm.name, email: profileForm.email, phone: profileForm.phone };
                sessionStorage.setItem('user', JSON.stringify(updated));
            }
            fetchUser(token);
            setTimeout(() => setProfileMsg(''), 3000);
        } else {
            const errMsg = res.error || 'Failed to update profile.';
            if (errMsg.toLowerCase().includes('phone') || res.errors?.phone) {
                setProfileErrors(prev => ({ ...prev, phone: res.errors?.phone || DUPLICATE_ERRORS.PHONE }));
            } else if (errMsg.toLowerCase().includes('email') || res.errors?.email) {
                setProfileErrors(prev => ({ ...prev, email: res.errors?.email || DUPLICATE_ERRORS.EMAIL }));
            } else {
                setProfileMsg(errMsg);
            }
        }
        setProfileSaving(false);
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setPasswordMsg(''); setPasswordError('');
        setPasswordErrors({});

        const errs: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};

        if (!passwordForm.currentPassword) {
            errs.currentPassword = 'Current password is required.';
        }

        const passVal = validatePassword(passwordForm.newPassword);
        if (!passVal.isValid) {
            errs.newPassword = passVal.error || 'Password must be at least 8 characters long.';
        }

        const matchVal = validatePasswordMatch(passwordForm.newPassword, passwordForm.confirmPassword);
        if (!matchVal.isValid) {
            errs.confirmPassword = matchVal.error || 'New passwords do not match.';
        }

        if (Object.keys(errs).length > 0) {
            setPasswordErrors(errs);
            return;
        }

        setPasswordSaving(true);
        const res = user?.role === 'technician'
            ? await technicianApi.changePassword(token, {
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
            })
            : await adminApi.changePassword(token, {
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
            });
        if (res.ok) {
            setPasswordMsg('Password changed successfully.');
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => setPasswordMsg(''), 3000);
        } else {
            const errMsg = res.error || 'Failed to change password.';
            if (errMsg.toLowerCase().includes('current')) {
                setPasswordErrors(prev => ({ ...prev, currentPassword: errMsg }));
            } else {
                setPasswordError(errMsg);
            }
        }
        setPasswordSaving(false);
    };

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2">
                    <UserCircle size={24} className="text-neon-cyan" />My Profile
                </h1>
                <p className="text-xs text-zinc-500 mt-1">{user?.role === 'technician' ? 'Manage your technician account settings' : 'Manage your administrator account settings'}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Profile Info */}
                <div className="border border-zinc-900 bg-zinc-900/20 rounded-xl sm:rounded-2xl self-start relative z-20">
                    <div className="p-4 sm:p-5 border-b border-zinc-900 flex items-center gap-2 rounded-t-xl sm:rounded-t-2xl">
                        <UserCircle size={16} className="text-white" />
                        <span className="text-sm font-bold text-white uppercase tracking-wider font-outfit">Personal Info</span>
                    </div>
                    <div className="p-4 sm:p-5 space-y-4">
                        {profileMsg && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2"><CheckCircle2 size={14} />{profileMsg}</div>}
                        <form onSubmit={handleUpdateProfile} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={NAME_MAX_LENGTH}
                                    value={profileForm.name}
                                    onChange={e => {
                                        setProfileForm({ ...profileForm, name: e.target.value });
                                        if (profileErrors.name) setProfileErrors(p => ({ ...p, name: undefined }));
                                    }}
                                    className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none ${
                                        profileErrors.name ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-neon-cyan'
                                    }`}
                                />
                                {profileErrors.name && <p className="text-[11px] text-red-400 mt-1">{profileErrors.name}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    value={profileForm.email}
                                    onChange={e => {
                                        setProfileForm({ ...profileForm, email: e.target.value });
                                        if (profileErrors.email) setProfileErrors(p => ({ ...p, email: undefined }));
                                    }}
                                    className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none ${
                                        profileErrors.email ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-neon-cyan'
                                    }`}
                                />
                                {profileErrors.email && <p className="text-[11px] text-red-400 mt-1">{profileErrors.email}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <PhoneInput
                                    size="sm"
                                    label="Phone Number"
                                    value={profileForm.phone}
                                    onChange={val => {
                                        setProfileForm({ ...profileForm, phone: val });
                                        if (profileErrors.phone) setProfileErrors(p => ({ ...p, phone: undefined }));
                                    }}
                                    error={profileErrors.phone}
                                />
                            </div>
                            <button type="submit" disabled={profileSaving} className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                                {profileSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Update Profile
                            </button>
                        </form>
                    </div>
                </div>

                {/* Change Password */}
                <div className="border border-zinc-900 bg-zinc-900/20 rounded-xl sm:rounded-2xl self-start relative z-10">
                    <div className="p-4 sm:p-5 border-b border-zinc-900 flex items-center gap-2 rounded-t-xl sm:rounded-t-2xl">
                        <Shield size={16} className="text-neon-cyan" />
                        <span className="text-sm font-bold text-white uppercase tracking-wider font-outfit">Change Password</span>
                    </div>
                    <div className="p-4 sm:p-5 space-y-4">
                        {passwordError && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl">{passwordError}</div>}
                        {passwordMsg && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2"><CheckCircle2 size={14} />{passwordMsg}</div>}
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Current Password</label>
                                <div className="relative">
                                    <input
                                        type={showCurrentPassword ? 'text' : 'password'}
                                        required
                                        value={passwordForm.currentPassword}
                                        onChange={e => {
                                            setPasswordForm({ ...passwordForm, currentPassword: e.target.value });
                                            if (passwordErrors.currentPassword) setPasswordErrors(p => ({ ...p, currentPassword: undefined }));
                                        }}
                                        className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 pr-10 text-sm text-white focus:outline-none ${
                                            passwordErrors.currentPassword ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-neon-cyan'
                                        }`}
                                        placeholder="••••••••"
                                    />
                                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 rounded focus:outline-none focus:ring-1 focus:ring-neon-cyan/40" aria-label={showCurrentPassword ? 'Hide password' : 'Show password'} tabIndex={-1}>
                                        {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {passwordErrors.currentPassword && <p className="text-[11px] text-red-400 mt-1">{passwordErrors.currentPassword}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">New Password</label>
                                <div className="relative">
                                    <input
                                        type={showNewPassword ? 'text' : 'password'}
                                        required
                                        minLength={8}
                                        value={passwordForm.newPassword}
                                        onChange={e => {
                                            setPasswordForm({ ...passwordForm, newPassword: e.target.value });
                                            if (passwordErrors.newPassword) setPasswordErrors(p => ({ ...p, newPassword: undefined }));
                                        }}
                                        className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 pr-10 text-sm text-white focus:outline-none ${
                                            passwordErrors.newPassword ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-neon-cyan'
                                        }`}
                                        placeholder="••••••••"
                                    />
                                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 rounded focus:outline-none focus:ring-1 focus:ring-neon-cyan/40" aria-label={showNewPassword ? 'Hide password' : 'Show password'} tabIndex={-1}>
                                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {passwordErrors.newPassword && <p className="text-[11px] text-red-400 mt-1">{passwordErrors.newPassword}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Confirm New</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        required
                                        minLength={8}
                                        value={passwordForm.confirmPassword}
                                        onChange={e => {
                                            setPasswordForm({ ...passwordForm, confirmPassword: e.target.value });
                                            if (passwordErrors.confirmPassword) setPasswordErrors(p => ({ ...p, confirmPassword: undefined }));
                                        }}
                                        className={`w-full bg-zinc-950 border rounded-xl px-4 py-2.5 pr-10 text-sm text-white focus:outline-none ${
                                            passwordErrors.confirmPassword ? 'border-red-500 ring-1 ring-red-500/30' : 'border-zinc-800 focus:border-neon-cyan'
                                        }`}
                                        placeholder="••••••••"
                                    />
                                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 rounded focus:outline-none focus:ring-1 focus:ring-neon-cyan/40" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'} tabIndex={-1}>
                                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {passwordErrors.confirmPassword && <p className="text-[11px] text-red-400 mt-1">{passwordErrors.confirmPassword}</p>}
                            </div>
                            <button type="submit" disabled={passwordSaving} className="w-full py-2.5 bg-neon-cyan hover:bg-neon-cyan text-black font-extrabold rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                                {passwordSaving ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}Update Password
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
