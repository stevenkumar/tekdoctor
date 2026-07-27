import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Users, Mail, Phone, Plus, Edit2, Trash2, X, PlusCircle, Building, Briefcase } from 'lucide-react';

interface Branch {
    id: number;
    name: string;
}

interface Employee {
    id: number;
    name: string;
    email: string;
    phone: string;
    department: string;
    designation: string;
    branch_id: number;
    branch_name: string;
}

export default function CompanyEmployees() {
    const { token } = useAuth();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Form states
    const [isOpen, setIsOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [department, setDepartment] = useState('');
    const [designation, setDesignation] = useState('');
    const [branchId, setBranchId] = useState<string>('');

    const fetchData = async () => {
        try {
            const [empRes, branchRes] = await Promise.all([
                fetch('http://localhost:5000/api/company/employees', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('http://localhost:5000/api/company/branches', { headers: { Authorization: `Bearer ${token}` } })
            ]);

            const empJson = await empRes.json();
            const branchJson = await branchRes.json();

            if (empJson.success) setEmployees(empJson.data);
            if (branchJson.success) setBranches(branchJson.data);
        } catch {
            setError('Failed to fetch employees or branches data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [token]);

    const handleOpenCreateModel = () => {
        setName('');
        setEmail('');
        setPhone('');
        setDepartment('');
        setDesignation('');
        setBranchId('');
        setEditingId(null);
        setIsOpen(true);
    };

    const handleOpenEditModel = (emp: Employee) => {
        setName(emp.name);
        setEmail(emp.email);
        setPhone(emp.phone || '');
        setDepartment(emp.department || '');
        setDesignation(emp.designation || '');
        setBranchId(emp.branch_id ? String(emp.branch_id) : '');
        setEditingId(emp.id);
        setIsOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!name || !email) {
            setError('Employee name and email are required.');
            return;
        }

        try {
            const url = editingId
                ? `http://localhost:5000/api/company/employees/${editingId}`
                : 'http://localhost:5000/api/company/employees';
            const method = editingId ? 'PUT' : 'POST';

            const payload = {
                name,
                email,
                phone,
                department,
                designation,
                branchId: branchId ? parseInt(branchId, 10) : null
            };

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const json = await res.json();

            if (json.success) {
                setSuccess(editingId ? 'Employee profile updated!' : 'Employee added to database!');
                setIsOpen(false);
                fetchData();
            } else {
                setError(json.message);
            }
        } catch {
            setError('Failed to save employee profile.');
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Remove this employee from roster?')) return;
        setError('');
        setSuccess('');

        try {
            const res = await fetch(`http://localhost:5000/api/company/employees/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                setSuccess('Employee removed.');
                fetchData();
            } else {
                setError(json.message);
            }
        } catch {
            setError('Failed to delete employee profile.');
        }
    };

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Employee Directory</h1>
                    <p className="text-zinc-500 text-sm mt-1">Manage personnel profiles, office departments, and device mapping assignments.</p>
                </div>
                <button
                    onClick={handleOpenCreateModel}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer shadow-lg"
                >
                    <Plus size={16} />
                    <span>Add Employee</span>
                </button>
            </div>

            {success && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm font-medium animate-fadeIn">
                    {success}
                </div>
            )}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm font-medium animate-fadeIn">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center min-h-[300px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
                </div>
            ) : employees.length === 0 ? (
                <div className="bg-[#0c0c0c] border border-zinc-900 border-dashed rounded-2xl py-20 text-center flex flex-col items-center justify-center space-y-4">
                    <Users size={40} className="text-zinc-700" />
                    <div className="space-y-1">
                        <h3 className="text-zinc-300 font-bold text-base">No Employees Registered</h3>
                        <p className="text-zinc-650 text-xs max-w-sm">Register your branch employees so you can map corporate hardware keys and trace tickets.</p>
                    </div>
                    <button
                        onClick={handleOpenCreateModel}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer mt-2"
                    >
                        <PlusCircle size={14} /> Add Profile
                    </button>
                </div>
            ) : (
                <div className="bg-[#0c0c0c] border border-zinc-900/60 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-zinc-900 text-xs text-zinc-500 uppercase tracking-widest font-mono select-none">
                                    <th className="py-4 px-6">Employee Info</th>
                                    <th className="py-4 px-4 font-mono">Department</th>
                                    <th className="py-4 px-4">Designation</th>
                                    <th className="py-4 px-4">Office Branch</th>
                                    <th className="py-4 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900/40 text-sm text-zinc-300">
                                {employees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-zinc-900/10 transition-colors">
                                        <td className="py-4 px-6">
                                            <div className="font-bold text-white text-base leading-tight">{emp.name}</div>
                                            <div className="flex items-center gap-4 text-xs text-zinc-500 mt-1.5 font-medium">
                                                <span className="flex items-center gap-1"><Mail size={12} /> {emp.email}</span>
                                                {emp.phone && <span className="flex items-center gap-1"><Phone size={12} /> {emp.phone}</span>}
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            {emp.department ? (
                                                <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded text-xs select-none">
                                                    {emp.department}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-650 italic">None</span>
                                            )}
                                        </td>
                                        <td className="py-4 px-4 text-zinc-400 font-medium">
                                            {emp.designation || <span className="text-zinc-650 italic">-</span>}
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="flex items-center gap-1.5 text-zinc-400 text-xs font-semibold">
                                                <Building size={12} className="text-indigo-400" />
                                                {emp.branch_name || 'Main Office'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => handleOpenEditModel(emp)}
                                                    className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                                    title="Edit Profile"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(emp.id)}
                                                    className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                                                    title="Delete Employee"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Editor Modal */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn bg-blur-sm">
                    <div className="bg-[#0a0a0a] border border-zinc-900/80 rounded-2xl w-full max-w-lg overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-zinc-900/80 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-white">
                                {editingId ? 'Edit Employee details' : 'Register New Employee'}
                            </h2>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Full Name *</label>
                                    <input
                                        type="text"
                                        placeholder="John Doe"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Email Address *</label>
                                    <input
                                        type="email"
                                        placeholder="john.doe@company.com"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Phone Number</label>
                                    <input
                                        type="text"
                                        placeholder="Contact line"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Location / Branch</label>
                                    <select
                                        value={branchId}
                                        onChange={e => setBranchId(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2 text-sm text-white focus:outline-none transition-colors"
                                    >
                                        <option value="">Main Hub / Default</option>
                                        {branches.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Department</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Engineering, Sales"
                                        value={department}
                                        onChange={e => setDepartment(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-mono uppercase text-zinc-550 tracking-wider font-semibold">Designation</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Lead Engineer, Account Exec"
                                        value={designation}
                                        onChange={e => setDesignation(e.target.value)}
                                        className="w-full bg-[#050505] border border-zinc-900 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-zinc-900/60 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                                >
                                    {editingId ? 'Save Changes' : 'Create Profile'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
