import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import { UserCircle, Shield, Loader2, Save, CheckCircle2 } from 'lucide-react';

export default function AdminProfile() {
    const { user, token, fetchUser } = useAuth();

    const [profileForm, setProfileForm] = useState({ name: user?.name || '', email: user?.email || '', phone: '' });
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState('');

    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordMsg, setPasswordMsg] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setProfileSaving(true); setProfileMsg('');
        const res = await adminApi.updateProfile(token, profileForm);
        if (res.ok) {
            setProfileMsg('Profile updated successfully.');
            if (user) {
                const updated = { ...user, name: profileForm.name, email: profileForm.email };
                sessionStorage.setItem('user', JSON.stringify(updated));
            }
            fetchUser(token);
            setTimeout(() => setProfileMsg(''), 3000);
        } else {
            setProfileMsg('Failed to update profile.');
        }
        setProfileSaving(false);
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setPasswordMsg(''); setPasswordError('');
        if (passwordForm.newPassword.length < 8) {
            setPasswordError('Password must be at least 8 characters long.');
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('New passwords do not match.');
            return;
        }
        setPasswordSaving(true);
        const res = await adminApi.changePassword(token, {
            currentPassword: passwordForm.currentPassword,
            newPassword: passwordForm.newPassword
        });
        if (res.ok) {
            setPasswordMsg('Password changed successfully.');
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => setPasswordMsg(''), 3000);
        } else {
            setPasswordError(res.error || 'Failed to change password.');
        }
        setPasswordSaving(false);
    };

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2">
                    <UserCircle size={24} className="text-neon-cyan" />My Profile
                </h1>
                <p className="text-xs text-zinc-500 mt-1">Manage your administrator account settings</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Profile Info */}
                <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden self-start">
                    <div className="p-5 border-b border-zinc-900 flex items-center gap-2">
                        <UserCircle size={16} className="text-white" />
                        <span className="text-sm font-bold text-white uppercase tracking-wider font-outfit">Personal Info</span>
                    </div>
                    <div className="p-5 space-y-4">
                        {profileMsg && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2"><CheckCircle2 size={14} />{profileMsg}</div>}
                        <form onSubmit={handleUpdateProfile} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Full Name</label>
                                <input type="text" required value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Email Address</label>
                                <input type="email" required value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" />
                            </div>
                            <button type="submit" disabled={profileSaving} className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                                {profileSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Update Profile
                            </button>
                        </form>
                    </div>
                </div>

                {/* Change Password */}
                <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden self-start">
                    <div className="p-5 border-b border-zinc-900 flex items-center gap-2">
                        <Shield size={16} className="text-neon-cyan" />
                        <span className="text-sm font-bold text-white uppercase tracking-wider font-outfit">Change Password</span>
                    </div>
                    <div className="p-5 space-y-4">
                        {passwordError && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl">{passwordError}</div>}
                        {passwordMsg && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2"><CheckCircle2 size={14} />{passwordMsg}</div>}
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Current Password</label>
                                <input type="password" required value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" placeholder="••••••••" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">New Password</label>
                                <input type="password" required minLength={8} value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" placeholder="••••••••" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Confirm New</label>
                                <input type="password" required minLength={8} value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan" placeholder="••••••••" />
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
