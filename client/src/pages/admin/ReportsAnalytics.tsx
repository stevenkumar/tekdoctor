import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi } from '@/services/api';
import { BarChart3, Loader2, Download, Filter, FileText, Calendar as CalIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';

export default function ReportsAnalytics() {
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [reportType, setReportType] = useState<'monthly' | 'daily'>('monthly');
    const [data, setData] = useState<any>(null);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const fetchData = async () => {
        if (!token) return;
        setLoading(true);
        const res = await adminApi.getReports(token, reportType, startDate || undefined, endDate || undefined);
        if (res.ok && res.data) {
            setData((res.data as any).data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [token, reportType]);

    const handleExport = () => {
        // Simplified export for demo
        if (!data) return;
        const csvContent = "data:text/csv;charset=utf-8,"
            + "Date,Total,Completed,Cancelled,Revenue\n"
            + data.repairStats.map((row: any) => `${row.date || row.period},${row.total},${row.completed},${row.cancelled},${row.revenue || 0}`).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `repair_report_${reportType}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight flex items-center gap-2">
                        <BarChart3 size={24} className="text-neon-cyan" />Reports & Analytics
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">Generate and export platform metrics</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-xs text-zinc-300 px-2 py-1 focus:outline-none" />
                        <span className="text-zinc-600">-</span>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-xs text-zinc-300 px-2 py-1 focus:outline-none" />
                        <button onClick={fetchData} className="bg-neon-cyan text-black px-3 py-1 rounded-lg text-xs font-bold hover:bg-neon-cyan transition-colors">Apply</button>
                    </div>

                    <div className="bg-zinc-900/40 p-1 rounded-xl border border-zinc-900 flex text-xs font-semibold">
                        <button onClick={() => setReportType('daily')} className={`px-4 py-2 rounded-lg transition-all ${reportType === 'daily' ? 'bg-neon-cyan text-black' : 'text-zinc-400 hover:text-white'}`}>Daily</button>
                        <button onClick={() => setReportType('monthly')} className={`px-4 py-2 rounded-lg transition-all ${reportType === 'monthly' ? 'bg-neon-cyan text-black' : 'text-zinc-400 hover:text-white'}`}>Monthly</button>
                    </div>
                    <button onClick={handleExport} disabled={!data || data.length === 0} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:border-neon-cyan/30 transition-all cursor-pointer disabled:opacity-50">
                        <Download size={14} />Export CSV
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="w-8 h-8 text-neon-cyan animate-spin" /></div>
            ) : !data || !data.repairStats || data.repairStats.length === 0 ? (
                <div className="border border-zinc-900 bg-zinc-950/20 rounded-2xl p-16 text-center text-zinc-500 text-sm">No data available for this period.</div>
            ) : (
                <div className="space-y-6">
                    {/* Visual Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl p-5 w-full">
                            <h3 className="text-sm font-bold text-white uppercase font-outfit mb-4 flex items-center gap-2"><BarChart3 size={16} className="text-neon-cyan" /> Revenue Growth</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={data.repairStats}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                        <XAxis dataKey={reportType === 'daily' ? 'date' : 'month'} stroke="#71717a" fontSize={12} tickMargin={10} />
                                        <YAxis stroke="#71717a" fontSize={12} tickFormatter={(val) => `$${val}`} />
                                        <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} />
                                        <Line type="monotone" dataKey="revenue" stroke="#22d3ee" strokeWidth={3} dot={{ r: 4, fill: '#22d3ee' }} activeDot={{ r: 6 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl p-5 w-full">
                            <h3 className="text-sm font-bold text-white uppercase font-outfit mb-4 flex items-center gap-2"><FileText size={16} className="text-neon-cyan" /> Repair Status Volume</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.repairStats}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                        <XAxis dataKey={reportType === 'daily' ? 'date' : 'month'} stroke="#71717a" fontSize={12} tickMargin={10} />
                                        <YAxis stroke="#71717a" fontSize={12} />
                                        <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} cursor={{ fill: '#27272a', opacity: 0.4 }} />
                                        <Legend />
                                        <Bar dataKey="completed" name="Completed" fill="#34d399" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="cancelled" name="Cancelled" fill="#f87171" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    <div className="border border-zinc-900 bg-zinc-900/20 rounded-2xl overflow-hidden shadow-xl">
                        <div className="p-4 border-b border-zinc-900 bg-zinc-950/40 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-bold text-white"><FileText size={16} className="text-neon-cyan" />{reportType === 'daily' ? 'Daily' : 'Monthly'} Breakdown</div>
                            <Filter size={14} className="text-zinc-500" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-zinc-900 bg-zinc-950/40 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500">
                                        <th className="p-4">Period</th>
                                        <th className="p-4">Total Requests</th>
                                        <th className="p-4">Completed</th>
                                        <th className="p-4">Cancelled</th>
                                        <th className="p-4 text-emerald-400">Est. Revenue</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900/50">
                                    {data.repairStats.map((row: any, i: number) => (
                                        <tr key={i} className="hover:bg-zinc-900/30 transition-colors">
                                            <td className="p-4 text-xs font-mono text-white font-bold">{row.date || row.month}</td>
                                            <td className="p-4 text-sm text-zinc-300">{row.total}</td>
                                            <td className="p-4 text-sm text-emerald-400">{row.completed}</td>
                                            <td className="p-4 text-sm text-red-400">{row.cancelled}</td>
                                            <td className="p-4 text-sm text-zinc-300 font-mono">${row.revenue || 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
