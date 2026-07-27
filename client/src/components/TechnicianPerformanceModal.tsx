import React, { useEffect, useState } from 'react';
import { adminApi, technicianApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { Loader2, X, User, Mail, Phone, Clock, Activity, CheckCircle2, AlertCircle, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/config/routes';

interface TechnicianPerformanceModalProps {
    technicianId: number;
    onClose: () => void;
}

export default function TechnicianPerformanceModal({ technicianId, onClose }: TechnicianPerformanceModalProps) {
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!token) return;
        const fetchData = async () => {
            setLoading(true);
            const res = await technicianApi.getWorkload(token, technicianId);
            if (res.ok && res.data) {
                setData(res.data.data);
            } else {
                setError(res.error || 'Failed to load technician performance data.');
            }
            setLoading(false);
        };
        fetchData();
    }, [token, technicianId]);

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl p-12 text-center shadow-2xl">
                    <Loader2 className="w-8 h-8 text-neon-cyan animate-spin mx-auto mb-4" />
                    <p className="text-zinc-400 font-mono text-sm tracking-wider uppercase">Loading Profile...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-[#0c0c0c] border border-red-500/20 rounded-2xl p-8 max-w-md w-full relative shadow-2xl">
                    <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors cursor-pointer"><X size={20} /></button>
                    <AlertCircle className="w-8 h-8 text-red-500 mb-4" />
                    <h3 className="text-white font-bold font-outfit mb-2">Error Loading Data</h3>
                    <p className="text-zinc-400 text-sm">{error || 'Unknown error occurred.'}</p>
                </div>
            </div>
        );
    }

    const { technician, counts, tickets } = data;

    const getStatusText = (status: string) => {
        switch (status) {
            case 'pending': return 'Pending';
            case 'in_progress': return 'In Progress';
            case 'completed': return 'Completed';
            case 'cancelled': return 'Cancelled';
            default: return status;
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            case 'in_progress': return 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/20';
            case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'cancelled': return 'bg-red-500/10 text-red-400 border-red-500/20';
            default: return 'bg-zinc-800 text-zinc-400 border-zinc-700';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl w-full max-w-4xl shadow-2xl relative my-8 h-max max-h-none lg:max-h-[85vh] flex flex-col">
                <div className="sticky top-0 bg-[#0c0c0c] border-b border-zinc-900/60 p-6 flex items-start justify-between z-10 rounded-t-2xl">
                    <div className="flex gap-4 items-center">
                        <div className="w-14 h-14 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-center">
                            <User className="text-neon-cyan w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="text-2xl font-extrabold text-white font-outfit">{technician.name}</h2>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${technician.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                    {technician.is_active ? 'ACTIVE' : 'INACTIVE'}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-mono text-zinc-500 uppercase tracking-wide">
                                <span>ID: <span className="text-neon-cyan font-bold">{technician.technician_id || `TD-TECH-???`}</span></span>
                                <span className="flex items-center gap-1"><Mail size={12} /> {technician.email}</span>
                                {technician.phone && <span className="flex items-center gap-1"><Phone size={12} /> {technician.phone}</span>}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-zinc-900/50 hover:bg-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-colors cursor-pointer"><X size={20} /></button>
                </div>

                <div className="p-6 overflow-y-auto scrollbar-thin space-y-6">
                    {/* Stats Overview */}
                    <div>
                        <h3 className="text-[10px] font-bold font-mono uppercase text-zinc-500 tracking-wider mb-3 flex items-center gap-2">
                            <Activity size={14} className="text-white" /> Performance Overview
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 cursor-default hover:bg-zinc-900/50 transition-colors">
                                <div className="text-[10px] font-mono uppercase text-zinc-500 mb-1">Total Assigned</div>
                                <div className="text-3xl font-extrabold text-white">{counts.total || 0}</div>
                            </div>
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 cursor-default hover:bg-emerald-500/10 transition-colors">
                                <div className="text-[10px] font-mono uppercase text-emerald-500/50 mb-1">Completed</div>
                                <div className="text-3xl font-extrabold text-emerald-400">{counts.completed || 0}</div>
                            </div>
                            <div className="bg-neon-cyan/5 border border-neon-cyan/20 rounded-xl p-4 cursor-default hover:bg-neon-cyan/10 transition-colors">
                                <div className="text-[10px] font-mono uppercase text-neon-cyan/50 mb-1">In Progress</div>
                                <div className="text-3xl font-extrabold text-neon-cyan">{counts.in_progress || 0}</div>
                            </div>
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 cursor-default hover:bg-amber-500/10 transition-colors">
                                <div className="text-[10px] font-mono uppercase text-amber-500/50 mb-1">Pending</div>
                                <div className="text-3xl font-extrabold text-amber-500">{counts.pending || 0}</div>
                            </div>
                        </div>
                    </div>

                    {/* Assigned Tickets */}
                    <div>
                        <h3 className="text-[10px] font-bold font-mono uppercase text-zinc-500 tracking-wider mb-3 flex items-center gap-2">
                            <Wrench size={14} className="text-white" /> Recent Engagements
                        </h3>
                        <div className="bg-zinc-900/20 border border-zinc-800 rounded-xl overflow-hidden">
                            {tickets && tickets.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-zinc-950/50">
                                            <tr className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                                                <th className="py-3 px-4 font-semibold border-b border-zinc-800">Job Ticket</th>
                                                <th className="py-3 px-4 font-semibold border-b border-zinc-800">Customer</th>
                                                <th className="py-3 px-4 font-semibold border-b border-zinc-800">Device</th>
                                                <th className="py-3 px-4 font-semibold border-b border-zinc-800 text-center">Status</th>
                                                <th className="py-3 px-4 font-semibold border-b border-zinc-800 text-center">Priority</th>
                                                <th className="py-3 px-4 font-semibold border-b border-zinc-800 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/50 text-sm">
                                            {tickets.map((t: any) => (
                                                <tr key={t.id} className="hover:bg-zinc-900/30 transition-colors">
                                                    <td className="py-3 px-4 font-mono font-bold text-neon-cyan">
                                                        TD-{t.id}
                                                    </td>
                                                    <td className="py-3 px-4 text-white font-medium">
                                                        {t.customerName}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="text-zinc-300">{t.brand}</div>
                                                        <div className="font-mono text-[9px] text-zinc-500">{t.deviceCategory}</div>
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[8px] font-mono font-bold border uppercase tracking-wider ${getStatusStyle(t.status)}`}>
                                                            {getStatusText(t.status)}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider ${t.priority === 'Urgent' || t.priority === 'High' ? 'text-red-400 bg-red-400/10' : 'text-zinc-400 bg-zinc-800'}`}>
                                                            {t.priority || 'Standard'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-right">
                                                        <Link to={`${ROUTES.ADMIN_TICKETS}?id=${t.id}`} className="text-[10px] font-mono text-neon-cyan hover:text-white underline cursor-pointer" onClick={onClose}>
                                                            VIEW &rarr;
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-8 text-center text-sm font-mono text-zinc-500">
                                    No repair tickets assigned currently.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
