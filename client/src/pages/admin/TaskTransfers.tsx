import React, { useState, useEffect, useCallback } from 'react';
import {
    ArrowRightLeft, Search, RefreshCw, Filter, Calendar,
    User, Wrench, CheckCircle2, Clock, XCircle, AlertCircle,
    ChevronRight, ChevronLeft, ArrowUpRight, Shield, Laptop,
    Smartphone, Tv, Headphones, Watch, Layers, Eye, X
} from 'lucide-react';
import { adminApi, technicianApi, repairApi } from '@/services/api';
import type { TaskTransfer, TechnicianUser, ServiceRequest } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-hot-toast';
import SideDrawer from '@/components/SideDrawer';
import { SkeletonTable } from '@/components/Skeleton';

export default function TaskTransfers() {
    const { token } = useAuth();

    // Data states
    const [transfers, setTransfers] = useState<TaskTransfer[]>([]);
    const [technicians, setTechnicians] = useState<TechnicianUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState({
        totalTransfers: 0,
        pendingTransfers: 0,
        acceptedTransfers: 0,
        rejectedTransfers: 0
    });

    // Pagination
    const [page, setPage] = useState(1);
    const [limit] = useState(15);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [selectedTechnician, setSelectedTechnician] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [showDateDropdown, setShowDateDropdown] = useState(false);
    const [activeDatePreset, setActiveDatePreset] = useState<string>('all');

    // Selected Ticket Modal for Quick Inspection
    const [inspectTicketId, setInspectTicketId] = useState<number | null>(null);
    const [inspectLoading, setInspectLoading] = useState(false);
    const [inspectedTicket, setInspectedTicket] = useState<ServiceRequest | null>(null);
    const [ticketTransfersChain, setTicketTransfersChain] = useState<TaskTransfer[]>([]);

    // Fetch Technicians list for filter dropdown
    useEffect(() => {
        if (!token) return;
        const loadTechs = async () => {
            try {
                const res = await technicianApi.getAll(token);
                if (res.data?.data) {
                    setTechnicians(res.data.data);
                }
            } catch (e) {
                console.error('Failed to load technicians for transfer filter', e);
            }
        };
        loadTechs();
    }, [token]);

    // Fetch Transfers Data
    const fetchTransfers = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const res = await adminApi.getAllTaskTransfers(token, {
                page,
                limit,
                search: searchQuery.trim(),
                status: selectedStatus,
                technicianId: selectedTechnician,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
            });

            if (res.data?.data) {
                const data = res.data.data;
                setTransfers(data.transfers || []);
                setTotalPages(data.pagination?.totalPages || 1);
                setTotalRecords(data.pagination?.totalRecords || 0);
                if (data.stats) {
                    setStats({
                        totalTransfers: data.stats.totalTransfers || 0,
                        pendingTransfers: data.stats.pendingTransfers || 0,
                        acceptedTransfers: data.stats.acceptedTransfers || 0,
                        rejectedTransfers: data.stats.rejectedTransfers || 0
                    });
                }
            } else if (res.error) {
                toast.error(res.error);
            }
        } catch (error) {
            console.error('Error fetching task transfers:', error);
            toast.error('Failed to load task transfer records.');
        } finally {
            setIsLoading(false);
        }
    }, [token, page, limit, searchQuery, selectedStatus, selectedTechnician, startDate, endDate]);

    useEffect(() => {
        fetchTransfers();
    }, [fetchTransfers]);

    // Quick Date Range Presets
    const applyDatePreset = (preset: string) => {
        setActiveDatePreset(preset);
        const today = new Date();
        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        if (preset === 'today') {
            const t = formatDate(today);
            setStartDate(t);
            setEndDate(t);
        } else if (preset === 'yesterday') {
            const y = new Date(today);
            y.setDate(y.getDate() - 1);
            const formatted = formatDate(y);
            setStartDate(formatted);
            setEndDate(formatted);
        } else if (preset === 'last7') {
            const d = new Date(today);
            d.setDate(d.getDate() - 6);
            setStartDate(formatDate(d));
            setEndDate(formatDate(today));
        } else if (preset === 'last30') {
            const d = new Date(today);
            d.setDate(d.getDate() - 29);
            setStartDate(formatDate(d));
            setEndDate(formatDate(today));
        } else if (preset === 'thisMonth') {
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            setStartDate(formatDate(firstDay));
            setEndDate(formatDate(today));
        } else {
            setStartDate('');
            setEndDate('');
        }
        setShowDateDropdown(false);
        setPage(1);
    };

    const clearFilters = () => {
        setSearchQuery('');
        setSelectedStatus('all');
        setSelectedTechnician('all');
        setStartDate('');
        setEndDate('');
        setActiveDatePreset('all');
        setPage(1);
    };

    const hasActiveFilters = searchQuery !== '' || selectedStatus !== 'all' || selectedTechnician !== 'all' || startDate !== '' || endDate !== '';

    // Quick Inspect Ticket
    const openInspectModal = async (ticketId: number) => {
        if (!token) return;
        setInspectTicketId(ticketId);
        setInspectLoading(true);
        try {
            const [ticketRes, chainRes] = await Promise.all([
                repairApi.getRequestById(token, ticketId),
                repairApi.getTicketTransfers(token, ticketId)
            ]);

            if (ticketRes.data?.data) {
                setInspectedTicket(ticketRes.data.data);
            }
            if (chainRes.data?.data) {
                setTicketTransfersChain(chainRes.data.data);
            }
        } catch (e) {
            console.error('Failed to load inspected ticket details', e);
            toast.error('Failed to load ticket details.');
        } finally {
            setInspectLoading(false);
        }
    };

    const closeInspectModal = () => {
        setInspectTicketId(null);
        setInspectedTicket(null);
        setTicketTransfersChain([]);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        <Clock size={11} className="animate-spin" /> PENDING
                    </span>
                );
            case 'accepted':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 size={11} /> ACCEPTED
                    </span>
                );
            case 'rejected':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        <XCircle size={11} /> REJECTED
                    </span>
                );
            case 'cancelled':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold font-mono bg-zinc-700/20 text-zinc-400 border border-zinc-700/30">
                        <AlertCircle size={11} /> CANCELLED
                    </span>
                );
            default:
                return <span className="text-xs font-mono uppercase text-zinc-400">{status}</span>;
        }
    };

    const getDeviceIcon = (category?: string) => {
        const cat = (category || '').toLowerCase();
        if (cat.includes('laptop') || cat.includes('computer') || cat.includes('mac')) return <Laptop size={13} className="text-cyan-400" />;
        if (cat.includes('phone') || cat.includes('mobile')) return <Smartphone size={13} className="text-emerald-400" />;
        if (cat.includes('tv') || cat.includes('display')) return <Tv size={13} className="text-purple-400" />;
        if (cat.includes('watch')) return <Watch size={13} className="text-amber-400" />;
        if (cat.includes('audio') || cat.includes('headphone')) return <Headphones size={13} className="text-pink-400" />;
        return <Wrench size={13} className="text-zinc-400" />;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-2 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan">
                            <ArrowRightLeft size={18} />
                        </div>
                        <h1 className="text-2xl font-bold text-white font-outfit tracking-tight">Task Transfer History</h1>
                    </div>
                    <p className="text-xs text-zinc-500 font-mono">
                        Audit and trace technician reassignments, task handoffs, and movement chains across the platform.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchTransfers}
                        disabled={isLoading}
                        className="px-3.5 py-2 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-mono text-zinc-300 hover:text-white flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                    >
                        <RefreshCw size={13} className={isLoading ? 'animate-spin text-neon-cyan' : ''} />
                        SYNC DATA
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                <div className="bg-[#0c0c0c] border border-zinc-900 rounded-2xl p-3.5 sm:p-4 relative overflow-hidden group hover:border-zinc-800 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Total Transfers</span>
                        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <ArrowRightLeft size={14} />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-white font-outfit">{stats.totalTransfers}</div>
                    <div className="text-[10px] text-zinc-600 font-mono mt-1">Platform task movements</div>
                </div>

                <div className="bg-[#0c0c0c] border border-zinc-900 rounded-2xl p-4 relative overflow-hidden group hover:border-amber-500/30 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-amber-500/90">Pending Action</span>
                        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock size={14} />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-amber-400 font-outfit">{stats.pendingTransfers}</div>
                    <div className="text-[10px] text-zinc-600 font-mono mt-1">Awaiting tech response</div>
                </div>

                <div className="bg-[#0c0c0c] border border-zinc-900 rounded-2xl p-4 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-500/90">Accepted</span>
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 size={14} />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 font-outfit">{stats.acceptedTransfers}</div>
                    <div className="text-[10px] text-zinc-600 font-mono mt-1">Successful handoffs</div>
                </div>

                <div className="bg-[#0c0c0c] border border-zinc-900 rounded-2xl p-4 relative overflow-hidden group hover:border-rose-500/30 transition-all">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-rose-500/90">Rejected</span>
                        <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <XCircle size={14} />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-rose-400 font-outfit">{stats.rejectedTransfers}</div>
                    <div className="text-[10px] text-zinc-600 font-mono mt-1">Declined transfers</div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-[#0a0a0a] border border-zinc-900 rounded-2xl p-4 space-y-4">
                <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3.5 top-3.5 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search by ticket #, customer, device, technician, reason..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan transition-all font-mono"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => { setSearchQuery(''); setPage(1); }}
                                className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Status Tabs */}
                    <div className="flex flex-wrap gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800/60">
                        {['all', 'pending', 'accepted', 'rejected', 'cancelled'].map((st) => (
                            <button
                                key={st}
                                onClick={() => { setSelectedStatus(st); setPage(1); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono tracking-wide transition-all capitalize cursor-pointer ${selectedStatus === st
                                    ? 'bg-neon-cyan text-black font-bold shadow-sm'
                                    : 'text-zinc-400 hover:text-white'
                                    }`}
                            >
                                {st}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Second Row: Technician Filter, Date Filter, and Clear */}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-900/80">
                    {/* Technician select */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
                            <User size={12} /> Tech:
                        </span>
                        <select
                            value={selectedTechnician}
                            onChange={(e) => { setSelectedTechnician(e.target.value); setPage(1); }}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-neon-cyan font-mono cursor-pointer"
                        >
                            <option value="all">All Technicians</option>
                            {technicians.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name} ({t.email})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Date filter dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowDateDropdown(!showDateDropdown)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${startDate || endDate
                                ? 'bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan'
                                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                                }`}
                        >
                            <Calendar size={12} />
                            {startDate && endDate
                                ? `${startDate} to ${endDate}`
                                : 'Date Range'}
                        </button>

                        {showDateDropdown && (
                            <div className="absolute left-0 mt-2 w-72 bg-zinc-950 border border-zinc-800 rounded-2xl p-4 shadow-2xl z-50 space-y-3">
                                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Quick Presets</div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[
                                        { id: 'today', label: 'Today' },
                                        { id: 'yesterday', label: 'Yesterday' },
                                        { id: 'last7', label: 'Last 7 Days' },
                                        { id: 'last30', label: 'Last 30 Days' },
                                        { id: 'thisMonth', label: 'This Month' },
                                        { id: 'all', label: 'All Time' }
                                    ].map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => applyDatePreset(preset.id)}
                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono text-left transition-all ${activeDatePreset === preset.id
                                                ? 'bg-neon-cyan text-black font-bold'
                                                : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-white'
                                                }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="border-t border-zinc-900 pt-3 space-y-2">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Custom Range</div>
                                    <div className="space-y-1.5">
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => { setStartDate(e.target.value); setActiveDatePreset('custom'); }}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                                        />
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => { setEndDate(e.target.value); setActiveDatePreset('custom'); }}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                                        />
                                    </div>
                                    <button
                                        onClick={() => { setShowDateDropdown(false); setPage(1); }}
                                        className="w-full mt-2 py-1.5 bg-neon-cyan text-black font-bold font-mono text-xs rounded-lg hover:bg-cyan-300 transition-colors"
                                    >
                                        Apply Range
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Reset Button */}
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="text-xs font-mono text-rose-400 hover:text-rose-300 px-2 py-1 transition-colors cursor-pointer ml-auto"
                        >
                            Reset Filters
                        </button>
                    )}
                </div>
            </div>

            {/* Main Table / Data View */}
            <div className="bg-[#0a0a0a] border border-zinc-900 rounded-2xl overflow-hidden shadow-xl">
                {isLoading ? (
                    <SkeletonTable rows={6} columns={6} hasHeaderFilter={false} />
                ) : transfers.length === 0 ? (
                    <div className="p-16 text-center">
                        <ArrowRightLeft className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                        <h3 className="text-sm font-bold text-white font-outfit">No Transfer Records Found</h3>
                        <p className="text-xs text-zinc-500 font-mono mt-1">
                            {hasActiveFilters ? 'No task transfers match the active filters.' : 'No task transfer history has been recorded yet.'}
                        </p>
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="mt-4 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-mono text-neon-cyan transition-colors"
                            >
                                Clear All Filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-xs">
                            <thead className="bg-zinc-950/80 border-b border-zinc-900 text-zinc-500 uppercase font-mono text-[10px] tracking-wider">
                                <tr>
                                    <th className="py-3.5 px-4">Ticket & Device</th>
                                    <th className="py-3.5 px-4">Transfer Details</th>
                                    <th className="py-3.5 px-4">Initiator & Reason</th>
                                    <th className="py-3.5 px-4">Timestamps</th>
                                    <th className="py-3.5 px-4">Transfer Status</th>
                                    <th className="py-3.5 px-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/60">
                                {transfers.map((item) => (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-zinc-900/30 transition-colors group"
                                    >
                                        {/* Ticket & Device */}
                                        <td className="py-3.5 px-4">
                                            <div className="flex items-start gap-2.5">
                                                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800/60 mt-0.5">
                                                    {getDeviceIcon(item.deviceCategory)}
                                                </div>
                                                <div>
                                                    <div className="font-mono font-bold text-neon-cyan flex items-center gap-1.5">
                                                        <span>{item.ticketNumber || `#${item.repairRequestId}`}</span>
                                                    </div>
                                                    <div className="text-white font-medium text-xs mt-0.5">
                                                        {item.customerName || 'Customer'}
                                                    </div>
                                                    <div className="text-[11px] text-zinc-500 font-mono">
                                                        {item.brand} {item.modelNumber ? `· ${item.modelNumber}` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Transfer Path: From -> To */}
                                        <td className="py-3.5 px-4">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 w-10">FROM:</span>
                                                    {item.fromTechnicianName ? (
                                                        <span className="text-zinc-300 font-medium font-mono text-xs flex items-center gap-1">
                                                            <User size={11} className="text-amber-400" />
                                                            {item.fromTechnicianName}
                                                        </span>
                                                    ) : (
                                                        <span className="text-zinc-600 font-mono text-xs italic">Unassigned</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono uppercase tracking-wider text-neon-cyan w-10">TO:</span>
                                                    <span className="text-emerald-400 font-semibold font-mono text-xs flex items-center gap-1">
                                                        <User size={11} className="text-emerald-400" />
                                                        {item.toTechnicianName}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Initiator & Reason */}
                                        <td className="py-3.5 px-4 max-w-xs">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono">
                                                    <span className="text-zinc-600">By:</span>
                                                    <span className="text-zinc-300 font-semibold">{item.initiatedByName || 'System'}</span>
                                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 uppercase font-mono">
                                                        {item.initiatedByRole || 'Tech'}
                                                    </span>
                                                </div>
                                                {item.reason && (
                                                    <div className="text-xs text-zinc-300 bg-zinc-950/60 border border-zinc-900 rounded-lg p-2 leading-relaxed">
                                                        "{item.reason}"
                                                    </div>
                                                )}
                                                {item.responseNotes && item.transferStatus === 'rejected' && (
                                                    <div className="text-xs text-rose-300 bg-rose-950/20 border border-rose-900/30 rounded-lg p-1.5 leading-relaxed font-mono">
                                                        Declined note: "{item.responseNotes}"
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Timestamps */}
                                        <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-400">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1 text-zinc-300">
                                                    <Clock size={11} className="text-zinc-500" />
                                                    <span>{new Date(item.transferredAt).toLocaleString()}</span>
                                                </div>
                                                {item.respondedAt && (
                                                    <div className="text-zinc-500 text-[10px]">
                                                        Responded: {new Date(item.respondedAt).toLocaleTimeString()}
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="py-3.5 px-4">
                                            <div className="space-y-1">
                                                {getStatusBadge(item.transferStatus)}
                                                {item.currentTicketStatus && (
                                                    <div className="text-[10px] text-zinc-500 font-mono">
                                                        Task: <span className="uppercase text-zinc-400 font-semibold">{item.currentTicketStatus}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Action */}
                                        <td className="py-3.5 px-4 text-right">
                                            <button
                                                onClick={() => openInspectModal(item.repairRequestId)}
                                                className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-lg text-xs font-mono text-zinc-300 hover:text-white inline-flex items-center gap-1 transition-all cursor-pointer"
                                                title="View Ticket Details and Transfer Chain"
                                            >
                                                <Eye size={12} /> Inspect
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Footer */}
                {!isLoading && transfers.length > 0 && (
                    <div className="p-4 border-t border-zinc-900 bg-zinc-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-zinc-500">
                        <div>
                            Showing <span className="text-white font-bold">{transfers.length}</span> of <span className="text-white font-bold">{totalRecords}</span> total transfer events
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="text-zinc-400">
                                Page <span className="text-white font-bold">{page}</span> of <span className="text-white font-bold">{totalPages}</span>
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Inspect Ticket Side Drawer */}
            <SideDrawer
                isOpen={Boolean(inspectTicketId)}
                onClose={closeInspectModal}
                title={inspectedTicket ? (inspectedTicket.ticketNumber || `Ticket #${inspectTicketId}`) : `Ticket #${inspectTicketId}`}
                size="lg"
                badge={<span className="text-[10px] font-mono text-neon-cyan uppercase tracking-wider">Transfer Audit Trail</span>}
            >
                {inspectLoading ? (
                    <div className="p-12 flex flex-col items-center justify-center">
                        <RefreshCw className="w-8 h-8 text-neon-cyan animate-spin mb-3" />
                        <p className="text-xs font-mono text-zinc-500">Loading transfer history chain...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {inspectedTicket && (
                            <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-2xl p-4 space-y-1">
                                <div className="text-sm font-bold text-white">{inspectedTicket.customerName}</div>
                                <div className="text-xs text-zinc-400 font-mono">
                                    {inspectedTicket.brand} {inspectedTicket.modelNumber || ''} · {inspectedTicket.deviceCategory}
                                </div>
                            </div>
                        )}

                        {/* Transfer Chain Timeline */}
                        <div className="space-y-4">
                            <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                                <Layers size={13} className="text-neon-cyan" />
                                Chronological Movement Chain ({ticketTransfersChain.length} events)
                            </h4>

                            {ticketTransfersChain.length === 0 ? (
                                <div className="p-6 border border-zinc-900 rounded-xl bg-zinc-950/50 text-center text-xs font-mono text-zinc-500">
                                    No transfers recorded for this specific ticket.
                                </div>
                            ) : (
                                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
                                    {ticketTransfersChain.map((t, idx) => (
                                        <div key={t.id} className="relative group">
                                            {/* Dot */}
                                            <div className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 bg-black ${t.transferStatus === 'accepted'
                                                ? 'border-emerald-400'
                                                : t.transferStatus === 'rejected'
                                                    ? 'border-rose-500'
                                                    : 'border-amber-400'
                                                }`} />

                                            <div className="bg-zinc-950/70 border border-zinc-800/60 rounded-xl p-4 space-y-3 hover:border-zinc-700 transition-colors">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold font-mono text-white">Event #{idx + 1}</span>
                                                        {getStatusBadge(t.transferStatus)}
                                                    </div>
                                                    <div className="text-[11px] font-mono text-zinc-500">
                                                        {new Date(t.transferredAt).toLocaleString()}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-zinc-900/40 rounded-lg p-3">
                                                    <div>
                                                        <div className="text-[10px] font-mono text-zinc-500 uppercase">Transferring Tech</div>
                                                        <div className="text-zinc-200 font-medium font-mono mt-0.5">
                                                            {t.fromTechnicianName || 'Initial Assignment'}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-mono text-zinc-500 uppercase">Receiving Tech</div>
                                                        <div className="text-emerald-400 font-semibold font-mono mt-0.5">
                                                            {t.toTechnicianName}
                                                        </div>
                                                    </div>
                                                </div>

                                                {t.reason && (
                                                    <div className="text-xs text-zinc-300 bg-black/40 rounded-lg p-2.5 border border-zinc-900 leading-relaxed">
                                                        <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">Transfer Reason:</span>
                                                        "{t.reason}"
                                                    </div>
                                                )}

                                                {t.responseNotes && (
                                                    <div className="text-xs text-rose-300 bg-rose-950/20 rounded-lg p-2.5 border border-rose-900/30 font-mono">
                                                        <span className="text-[10px] font-mono text-rose-400 uppercase block mb-1">Response Comment:</span>
                                                        "{t.responseNotes}"
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 border-t border-zinc-900/80 pt-2">
                                                    <div>Initiated by: {t.initiatedByName} ({t.initiatedByRole})</div>
                                                    {t.respondedAt && <div>Responded at: {new Date(t.respondedAt).toLocaleString()}</div>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </SideDrawer>
        </div>
    );
}
