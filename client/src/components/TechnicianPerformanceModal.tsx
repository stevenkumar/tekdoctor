import React, { useEffect, useState } from 'react';
import { technicianApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { Loader2, User, Mail, Phone, Activity, AlertCircle, Wrench, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import SideDrawer from '@/components/SideDrawer';

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

    const technician = data?.technician;
    const counts = data?.counts || {};
    const tickets = data?.tickets || [];

    return (
        <SideDrawer
            isOpen={true}
            onClose={onClose}
            title={technician ? `Technician Profile — ${technician.name}` : 'Technician Performance'}
            size="xl"
            badge={technician ? (
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${technician.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                    {technician.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
            ) : undefined}
        >
            {loading ? (
                <div className="py-20 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 text-neon-cyan animate-spin mb-4" />
                    <p className="text-zinc-400 font-mono text-sm tracking-wider uppercase">Loading Profile & Workload...</p>
                </div>
            ) : error || !data ? (
                <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
                    <h3 className="text-white font-bold font-outfit">Error Loading Data</h3>
                    <p className="text-zinc-400 text-sm">{error || 'Unknown error occurred.'}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Header Info */}
                    <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-center shrink-0">
                            <User className="text-neon-cyan w-6 h-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-white truncate">{technician.name}</h3>
                                <span className="text-[10px] font-mono text-neon-cyan bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
                                    {technician.technician_id || 'TD-TECH'}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-zinc-400 font-mono">
                                <span className="flex items-center gap-1.5"><Mail size={12} className="text-neon-cyan" /> {technician.email}</span>
                                {technician.phone && <span className="flex items-center gap-1.5"><Phone size={12} className="text-neon-cyan" /> {technician.phone}</span>}
                            </div>
                        </div>
                    </div>

                    {/* Stats Overview */}
                    <div>
                        <h4 className="text-[10px] font-bold font-mono uppercase text-zinc-500 tracking-wider mb-3 flex items-center gap-2">
                            <Activity size={13} className="text-neon-cyan" /> Performance & Workload Metrics
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-3">
                                <div className="text-[10px] font-mono uppercase text-zinc-500 mb-1">Total Assigned</div>
                                <div className="text-2xl font-extrabold text-white">{counts.total || 0}</div>
                            </div>
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                                <div className="text-[10px] font-mono uppercase text-emerald-400/80 mb-1">Completed</div>
                                <div className="text-2xl font-extrabold text-emerald-400">{counts.completed || 0}</div>
                            </div>
                            <div className="bg-neon-cyan/5 border border-neon-cyan/20 rounded-xl p-3">
                                <div className="text-[10px] font-mono uppercase text-neon-cyan/80 mb-1">In Progress</div>
                                <div className="text-2xl font-extrabold text-neon-cyan">{counts.in_progress || 0}</div>
                            </div>
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                                <div className="text-[10px] font-mono uppercase text-amber-400/80 mb-1">Pending</div>
                                <div className="text-2xl font-extrabold text-amber-500">{counts.pending || 0}</div>
                            </div>
                        </div>
                    </div>

                    {/* Assigned Tickets */}
                    <div>
                        <h4 className="text-[10px] font-bold font-mono uppercase text-zinc-500 tracking-wider mb-3 flex items-center gap-2">
                            <Wrench size={13} className="text-neon-cyan" /> Recent Engagements & Active Tickets
                        </h4>
                        <div className="bg-zinc-900/20 border border-zinc-800 rounded-xl overflow-hidden">
                            {tickets && tickets.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-zinc-950/50">
                                            <tr className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                                                <th className="py-2.5 px-3 font-semibold border-b border-zinc-800">Job Ticket</th>
                                                <th className="py-2.5 px-3 font-semibold border-b border-zinc-800">Customer</th>
                                                <th className="py-2.5 px-3 font-semibold border-b border-zinc-800">Device</th>
                                                <th className="py-2.5 px-3 font-semibold border-b border-zinc-800 text-center">Status</th>
                                                <th className="py-2.5 px-3 font-semibold border-b border-zinc-800 text-center">Priority</th>
                                                <th className="py-2.5 px-3 font-semibold border-b border-zinc-800 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/50 text-xs">
                                            {tickets.map((t: any) => (
                                                <tr key={t.id} className="hover:bg-zinc-900/30 transition-colors">
                                                    <td className="py-2.5 px-3 font-mono font-bold text-neon-cyan">
                                                        {t.ticketNumber || t.ticket_number || `#${t.id}`}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-white font-medium">
                                                        {t.customerName}
                                                    </td>
                                                    <td className="py-2.5 px-3">
                                                        <div className="text-zinc-300">{t.brand}</div>
                                                        <div className="font-mono text-[9px] text-zinc-500">{t.deviceCategory}</div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[8px] font-mono font-bold border uppercase tracking-wider ${getStatusStyle(t.status)}`}>
                                                            {getStatusText(t.status)}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center">
                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider ${t.priority === 'Urgent' || t.priority === 'High' ? 'text-red-400 bg-red-400/10' : 'text-zinc-400 bg-zinc-800'}`}>
                                                            {t.priority || 'Standard'}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right">
                                                        <Link to={`${ROUTES.ADMIN_TICKETS}?id=${t.id}`} className="text-[10px] font-mono text-neon-cyan hover:text-white underline cursor-pointer inline-flex items-center gap-1" onClick={onClose}>
                                                            VIEW <ExternalLink size={10} />
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-8 text-center text-xs font-mono text-zinc-500">
                                    No repair tickets assigned currently.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </SideDrawer>
    );
}
