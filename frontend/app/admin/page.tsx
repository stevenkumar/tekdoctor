'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Search, RotateCcw } from 'lucide-react'; // Import Search and RotateCcw icons

interface RepairRequest {
  id: string;
  userId: string;
  userName: string;
  deviceName: string;
  issueDescription: string;
  submittedAt: string;
  status: string;
  lastUpdatedAt: string;
}

type SortKey = 'submittedAt' | 'lastUpdatedAt' | 'status' | 'deviceName' | 'userName' | 'id';
type SortOrder = 'asc' | 'desc';

const AdminDashboard = () => {
  const [repairs, setRepairs] = useState<RepairRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<{ [key: string]: boolean }>({});
  const [newStatus, setNewStatus] = useState<{ [key: string]: string }>({});

  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>(''); // New state for search term
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; order: SortOrder } | null>(null);

  const possibleStatuses = ["All", "Received", "In Progress", "On Hold", "Awaiting Parts", "Ready for Pickup", "Completed", "Cancelled"];

  const fetchRepairs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/repairs');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: RepairRequest[] = await response.json();
      setRepairs(data);
      const initialEditingState: { [key: string]: boolean } = {};
      const initialNewStatus: { [key: string]: string } = {};
      data.forEach(repair => {
        initialEditingState[repair.id] = false;
        initialNewStatus[repair.id] = repair.status;
      });
      setEditingStatus(initialEditingState);
      setNewStatus(initialNewStatus);
    } catch (e) {
      console.error("Failed to fetch repairs:", e);
      setError('Could not load repair data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepairs();
  }, [fetchRepairs]);

  const handleStatusChange = (id: string, status: string) => {
    setNewStatus({ ...newStatus, [id]: status });
  };

  const toggleEditStatus = (id: string) => {
    setEditingStatus({ ...editingStatus, [id]: !editingStatus[id] });
  };

  const updateStatus = async (id: string) => {
    const statusToUpdate = newStatus[id];
    try {
      const response = await fetch(`/api/admin/repairs/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: statusToUpdate }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedRepair: RepairRequest = await response.json();

      setRepairs(prevRepairs =>
        prevRepairs.map(repair =>
          repair.id === id ? { ...updatedRepair, lastUpdatedAt: new Date().toISOString() } : repair
        )
      );
      toggleEditStatus(id);
      fetchRepairs(); // Re-fetch to ensure data is consistent and sorted/filtered if needed
    } catch (e) {
      console.error("Failed to update status:", e);
      setError('Could not update status. Please try again.');
    }
  };

  const requestSort = (key: SortKey) => {
    let order: SortOrder = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.order === 'asc') {
      order = 'desc';
    }
    setSortConfig({ key, order });
  };

  const sortedAndFilteredRepairs = useMemo(() => {
    let currentRepairs = [...repairs];

    // 1. Search
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      currentRepairs = currentRepairs.filter(
        repair =>
          repair.id.toLowerCase().includes(lowerCaseSearchTerm) ||
          repair.userName.toLowerCase().includes(lowerCaseSearchTerm) ||
          repair.deviceName.toLowerCase().includes(lowerCaseSearchTerm) ||
          repair.issueDescription.toLowerCase().includes(lowerCaseSearchTerm) ||
          repair.status.toLowerCase().includes(lowerCaseSearchTerm) // Also search in status
      );
    }

    // 2. Filter by Status
    if (filterStatus !== 'All') {
      currentRepairs = currentRepairs.filter(repair => repair.status === filterStatus);
    }

    // 3. Sort
    if (sortConfig !== null) {
      currentRepairs.sort((a, b) => {
        const aValue = (a as any)[sortConfig.key];
        const bValue = (b as any)[sortConfig.key];

        if (aValue < bValue) {
          return sortConfig.order === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.order === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return currentRepairs;
  }, [repairs, filterStatus, searchTerm, sortConfig]); // Add searchTerm to dependencies

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return 'text-green-400';
      case 'In Progress': return 'text-yellow-400';
      case 'Received': return 'text-blue-400';
      case 'Awaiting Parts': return 'text-orange-400';
      case 'On Hold': return 'text-purple-400';
      case 'Ready for Pickup': return 'text-cyan-400';
      case 'Cancelled': return 'text-red-500';
      default: return 'text-zinc-300';
    }
  };

  if (loading) {
    return <div className="container mx-auto p-6 text-center text-neon-cyan">Loading repair requests...</div>;
  }

  if (error) {
    return <div className="container mx-auto p-6 text-center text-red-500">{error}</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-4xl font-extrabold mb-8 neon-text text-center">Admin Dashboard</h1>

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 space-y-4 md:space-y-0 md:space-x-4">
        {/* Search Input */}
        <div className="relative w-full md:w-1/3">
          <input
            type="text"
            placeholder="Search repairs (ID, User, Device, Issue, Status)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-800 border border-neon-cyan/50 rounded-md py-2 pl-10 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-neon-cyan"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
        </div>

        {/* Status Filter */}
        <div className="w-full md:w-auto flex items-center space-x-2">
          <label htmlFor="statusFilter" className="text-zinc-300 text-sm whitespace-nowrap">Filter by Status:</label>
          <select
            id="statusFilter"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-zinc-800 border border-neon-cyan/50 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-neon-cyan"
          >
            {possibleStatuses.map(status => (
              <option key={status} value={status} className="bg-zinc-900 text-white">
                {status}
              </option>
            ))}
          </select>
        </div>

        {/* Refresh Button */}
        <button
          onClick={fetchRepairs}
          className="btn-neon text-sm py-2 px-4 flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} /> Refresh Data
        </button>
      </div>


      {sortedAndFilteredRepairs.length === 0 ? (
        <p className="text-center text-zinc-400">No repair requests found matching the current criteria.</p>
      ) : (
        <div className="overflow-x-auto bg-zinc-900/50 border border-neon-cyan/20 rounded-lg shadow-xl">
          <table className="min-w-full divide-y divide-neon-cyan/20">
            <thead className="bg-black/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  <button className="flex items-center gap-1 hover:text-white transition-colors" onClick={() => requestSort('id')}>
                    ID {sortConfig?.key === 'id' && (sortConfig.order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  <button className="flex items-center gap-1 hover:text-white transition-colors" onClick={() => requestSort('userName')}>
                    User {sortConfig?.key === 'userName' && (sortConfig.order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  <button className="flex items-center gap-1 hover:text-white transition-colors" onClick={() => requestSort('deviceName')}>
                    Device {sortConfig?.key === 'deviceName' && (sortConfig.order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Issue</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  <button className="flex items-center gap-1 hover:text-white transition-colors" onClick={() => requestSort('submittedAt')}>
                    Submitted {sortConfig?.key === 'submittedAt' && (sortConfig.order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  <button className="flex items-center gap-1 hover:text-white transition-colors" onClick={() => requestSort('status')}>
                    Status {sortConfig?.key === 'status' && (sortConfig.order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  <button className="flex items-center gap-1 hover:text-white transition-colors" onClick={() => requestSort('lastUpdatedAt')}>
                    Last Updated {sortConfig?.key === 'lastUpdatedAt' && (sortConfig.order === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </button>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-transparent divide-y divide-neon-cyan/20">
              {sortedAndFilteredRepairs.map((repair) => (
                <tr key={repair.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-neon-cyan">{repair.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">{repair.userName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{repair.deviceName}</td>
                  <td className="px-6 py-4 text-sm max-w-xs truncate">{repair.issueDescription}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-400">{new Date(repair.submittedAt).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {editingStatus[repair.id] ? (
                      <select
                        value={newStatus[repair.id]}
                        onChange={(e) => handleStatusChange(repair.id, e.target.value)}
                        className="bg-transparent border border-neon-cyan/50 rounded-md px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                      >
                        {possibleStatuses.slice(1).map(status => (
                          <option key={status} value={status} className="bg-black text-white">
                            {status}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-sm font-semibold ${
                        repair.status === 'Completed' ? 'text-green-400' :
                        repair.status === 'In Progress' ? 'text-yellow-400' :
                        repair.status === 'Received' ? 'text-blue-400' :
                        repair.status === 'Cancelled' ? 'text-red-500' : 'text-zinc-300'
                      }`}>
                        {repair.status}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-400">{new Date(repair.lastUpdatedAt).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    {editingStatus[repair.id] ? (
                      <>
                        <button
                          onClick={() => updateStatus(repair.id)}
                          className="text-green-400 hover:text-green-300 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { toggleEditStatus(repair.id); setNewStatus({ ...newStatus, [repair.id]: repair.status }); }}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => toggleEditStatus(repair.id)}
                        className="text-neon-cyan hover:text-white transition-colors"
                      >
                        Edit Status
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
