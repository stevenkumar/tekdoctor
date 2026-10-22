import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminApi, companyApi, repairApi } from '@/services/api';
import {
  X,
  Wrench,
  Laptop,
  Smartphone,
  Tablet,
  Server,
  Calendar,
  User,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Image as ImageIcon,
  ExternalLink
} from 'lucide-react';
import { getMediaUrl } from '@/utils/media';
import SideDrawer from './SideDrawer';

interface DeviceRepairHistoryModalProps {
  deviceId: number | string;
  onClose: () => void;
  onRaiseRepair?: (device: any) => void;
  asDrawer?: boolean;
  onSelectTicket?: (ticket: any) => void;
  technicians?: any[];
  onAssignTechnician?: (ticketId: number, technicianId: number) => Promise<boolean | void>;
}

export default function DeviceRepairHistoryModal({
  deviceId,
  onClose,
  onRaiseRepair,
  asDrawer = true,
  onSelectTicket,
  technicians = [],
  onAssignTechnician
}: DeviceRepairHistoryModalProps) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [assigningTicketId, setAssigningTicketId] = useState<number | null>(null);
  const [assignSuccessTicketId, setAssignSuccessTicketId] = useState<number | null>(null);

  const handleQuickAssignTechnician = async (ticketId: number, techId: number) => {
    if (!token || !techId) return;
    setAssigningTicketId(ticketId);
    try {
      const res = await repairApi.assignTechnician(token, ticketId, techId);
      if (res.ok) {
        const assignedTech = technicians?.find(t => Number(t.id) === Number(techId));
        const techName = assignedTech ? assignedTech.name : 'Assigned';
        setData((prev: any) => {
          if (!prev) return prev;
          const updatedRepairs = (prev.repairs || []).map((r: any) =>
            r.id === ticketId
              ? { ...r, assigned_technician_id: techId, technician_name: techName, status: r.status === 'pending' ? 'in_progress' : r.status }
              : r
          );
          let updatedActive = prev.summary?.activeRepair;
          if (updatedActive && updatedActive.id === ticketId) {
            updatedActive = { ...updatedActive, assigned_technician_id: techId, technician_name: techName, status: updatedActive.status === 'pending' ? 'in_progress' : updatedActive.status };
          }
          return {
            ...prev,
            repairs: updatedRepairs,
            history: updatedRepairs,
            summary: {
              ...prev.summary,
              activeRepair: updatedActive
            }
          };
        });
        setAssignSuccessTicketId(ticketId);
        setTimeout(() => setAssignSuccessTicketId(null), 3000);
        if (onAssignTechnician) {
          await onAssignTechnician(ticketId, techId);
        }
      } else {
        alert(res.error || 'Failed to assign technician');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to assign technician');
    } finally {
      setAssigningTicketId(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!token || !deviceId) return;
    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const res = user?.role === 'admin'
          ? await adminApi.getDeviceRepairHistory(token, deviceId)
          : await companyApi.getDeviceRepairHistory(token, deviceId);

        if (res.ok && res.data) {
          setData(res.data.data);
        } else {
          setError(res.error || 'Failed to load device repair history.');
        }
      } catch (err: any) {
        setError(err.message || 'Error loading device repair history.');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [token, deviceId, user?.role]);

  const getDeviceIcon = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('phone') || t.includes('mobile')) return <Smartphone className="w-5 h-5 text-cyan-400" />;
    if (t.includes('tablet') || t.includes('ipad')) return <Tablet className="w-5 h-5 text-purple-400" />;
    if (t.includes('server')) return <Server className="w-5 h-5 text-amber-400" />;
    return <Laptop className="w-5 h-5 text-blue-400" />;
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (['completed', 'repaired', 'delivered', 'closed'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" /> {status}
        </span>
      );
    }
    if (['in_progress', 'diagnosing', 'repairing', 'assigned'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          <Wrench className="w-3 h-3 animate-spin" /> {status.replace('_', ' ')}
        </span>
      );
    }
    if (['on_hold', 'waiting_parts', 'pending_approval'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3" /> {status.replace('_', ' ')}
        </span>
      );
    }
    if (['cancelled', 'rejected'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertCircle className="w-3 h-3" /> {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-300 border border-zinc-500/20">
        <Clock className="w-3 h-3" /> {status || 'Pending'}
      </span>
    );
  };

  const renderContentBody = () => (
    <div className="space-y-6">
      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-400">Loading device repair history...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-rose-300">Unable to load history</h3>
          <p className="text-xs text-rose-400/80 mt-1">{error}</p>
        </div>
      ) : data ? (
        <>
          {/* Device Overview Banner */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-zinc-800/80 border border-zinc-700/60">
                {getDeviceIcon(data.device?.device_category || data.device?.device_type)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-white">
                    {data.device?.brand} {data.device?.model_number || data.device?.model || 'Device'}
                  </h3>
                  {data.device?.asset_id && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                      ID: {data.device.asset_id}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800/60 text-zinc-400 capitalize">
                    {data.device?.device_category || data.device?.device_type || 'Hardware'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  S/N: {data.device?.serial_number || 'N/A'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-zinc-400">
              {data.device?.employee_name && (
                <div className="flex items-center gap-1.5 bg-zinc-800/40 px-3 py-1.5 rounded-lg border border-zinc-800">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{data.device.employee_name}</span>
                </div>
              )}
              {data.device?.branch_name && (
                <div className="flex items-center gap-1.5 bg-zinc-800/40 px-3 py-1.5 rounded-lg border border-zinc-800">
                  <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{data.device.branch_name}</span>
                </div>
              )}
              {onRaiseRepair && (
                (data.device?.is_active === false || data.device?.is_active === 0 || data.device?.status === 'decommissioned' || data.device?.status === 'inactive') ? (
                  <div
                    title="This device is inactive and cannot be used for a new repair request."
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 border border-zinc-700/60 text-zinc-400 rounded-lg font-medium text-xs cursor-not-allowed opacity-75 select-none"
                  >
                    <Wrench className="w-3.5 h-3.5 text-zinc-500" /> Device Deactivated
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      onClose();
                      onRaiseRepair(data.device);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-xs transition-colors cursor-pointer shadow-lg shadow-cyan-600/20"
                  >
                    <Wrench className="w-3.5 h-3.5" /> Raise New Repair
                  </button>
                )
              )}
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
              <p className="text-xs text-zinc-400">Total Repairs</p>
              <p className="text-xl font-bold text-white mt-1">
                {data.summary?.totalRepairs || 0}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
              <p className="text-xs text-zinc-400">Active / Open</p>
              <p className={`text-xl font-bold mt-1 ${data.summary?.activeRepairs > 0 ? 'text-amber-400' : 'text-zinc-300'}`}>
                {data.summary?.activeRepairs || 0}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
              <p className="text-xs text-zinc-400">Completed</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">
                {data.summary?.completedRepairs || 0}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
              <p className="text-xs text-zinc-400">Verified Spend</p>
              <p className="text-xl font-bold text-cyan-400 mt-1">
                ₹{(Number(data.summary?.totalAmountBilled) || 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Active / In-Progress Repair Banner if present */}
          {data.summary?.activeRepair && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  Currently Under Repair
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-amber-300/80">
                    Ticket: {data.summary.activeRepair.ticket_number || `#${data.summary.activeRepair.id}`}
                  </span>
                  {onSelectTicket && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectTicket(data.summary.activeRepair);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <ExternalLink size={12} />
                      <span>Inspect Active Ticket</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mt-2 text-zinc-300">
                <div>
                  <span className="text-zinc-500 block">Problem:</span>
                  <span className="font-medium text-white">{data.summary.activeRepair.problem_type || 'General Service'}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Status:</span>
                  <span className="font-medium text-amber-300 capitalize">{data.summary.activeRepair.status?.replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Assigned Technician:</span>
                  <span className="font-medium text-white">{data.summary.activeRepair.technician_name || 'Pending Assignment'}</span>
                </div>
              </div>
              {data.summary.activeRepair.problem_description && (
                <p className="text-xs text-zinc-400 mt-2 bg-black/30 p-2 rounded border border-amber-500/10">
                  {data.summary.activeRepair.problem_description}
                </p>
              )}
            </div>
          )}

          {/* Repairs Timeline */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-400" />
              Chronological Repair Log ({data.repairs?.length || 0})
            </h4>

            {(!data.repairs || data.repairs.length === 0) ? (
              <div className="py-8 text-center bg-zinc-900/20 border border-zinc-800/60 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">No repair tickets on record for this device.</p>
                <p className="text-xs text-zinc-500 mt-1">
                  This device has not had any service requests submitted yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.repairs.map((repair: any, idx: number) => {
                  const isCurrent = repair.isCurrentRepair;
                  const isUnassigned = (!repair.assigned_technician_id || Number(repair.assigned_technician_id) === 0);
                  const canAssign = isUnassigned && !['cancelled', 'delivered'].includes(repair.status) && user?.role === 'admin' && technicians && technicians.length > 0;

                  return (
                    <div
                      key={repair.id || idx}
                      className={`p-4 rounded-xl border transition-all ${
                        isCurrent
                          ? 'bg-zinc-900/80 border-cyan-500/30'
                          : 'bg-zinc-900/30 border-zinc-800/70 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 pb-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2 flex-wrap">
                          {onSelectTicket ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onSelectTicket(repair);
                              }}
                              className="text-sm font-bold font-mono text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                              title={`Inspect Ticket #${repair.ticket_number || repair.id}`}
                            >
                              <span>{repair.ticket_number || `#${repair.id}`}</span>
                              <ExternalLink size={12} className="opacity-70" />
                            </button>
                          ) : (
                            <span className="text-sm font-bold font-mono text-cyan-400">
                              {repair.ticket_number || `#${repair.id}`}
                            </span>
                          )}

                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
                              Current Active Ticket
                            </span>
                          )}
                          {getStatusBadge(repair.status)}
                          {repair.priority && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                              ['urgent', 'express', 'critical'].some(p => (repair.priority || '').toLowerCase().includes(p))
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                            }`}>
                              {repair.priority}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 flex-wrap ml-auto">
                          <div className="text-xs text-zinc-400 flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                              {new Date(repair.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {repair.estimated_completion_date && (
                              <span className="text-zinc-500">• Est. Done: {new Date(repair.estimated_completion_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                            )}
                          </div>
                          {onSelectTicket && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onSelectTicket(repair);
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-600/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:border-cyan-500/50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                              title={`Inspect Ticket #${repair.ticket_number || repair.id}`}
                            >
                              <ExternalLink size={12} />
                              <span>Inspect Ticket</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 my-2.5 text-xs">
                        <div>
                          <span className="text-zinc-500 block">Issue Category:</span>
                          <span className="font-medium text-white">{repair.problem_type || 'General Repair'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Technician:</span>
                          <span className={repair.technician_name ? 'text-zinc-300' : 'text-amber-400 font-semibold'}>
                            {repair.technician_name || 'Unassigned'}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Cost Billed:</span>
                          <span className="font-medium text-cyan-400">
                            {repair.cost_billed ? `₹${Number(repair.cost_billed).toLocaleString('en-IN')}` : '₹0'}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Downtime:</span>
                          <span className="text-zinc-300">
                            {repair.downtime_days ? `${repair.downtime_days} days` : 'N/A'}
                          </span>
                        </div>
                      </div>

                      {repair.problem_description && (
                        <p className="text-xs text-zinc-400 mt-2 bg-black/20 p-2.5 rounded-lg border border-zinc-800/80">
                          <span className="text-zinc-500 font-medium">Description:</span> {repair.problem_description}
                        </p>
                      )}

                      {repair.resolution_notes && (
                        <div className="mt-2 text-xs bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/20 text-emerald-300/90">
                          <span className="font-semibold text-emerald-400 block mb-0.5">Resolution Notes:</span>
                          {repair.resolution_notes}
                        </div>
                      )}

                      {/* Quick Technician Assignment for Unassigned Tickets */}
                      {canAssign && (
                        <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between flex-wrap gap-2 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                          <div className="flex items-center gap-2 text-xs text-amber-300">
                            <AlertCircle size={14} className="text-amber-400" />
                            <span className="font-semibold">Unassigned Ticket:</span>
                            <span className="text-zinc-400 text-[11px]">Assign a technician to start repair:</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {assignSuccessTicketId === repair.id ? (
                              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                                <CheckCircle2 size={13} /> Assigned!
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <select
                                  disabled={assigningTicketId === repair.id}
                                  onChange={(e) => {
                                    if (e.target.value) handleQuickAssignTechnician(repair.id, Number(e.target.value));
                                  }}
                                  defaultValue=""
                                  className="text-xs bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                                >
                                  <option value="" disabled>Select technician...</option>
                                  {technicians.map((tech: any) => (
                                    <option key={tech.id} value={tech.id}>
                                      {tech.name} {tech.email ? `(${tech.email})` : ''}
                                    </option>
                                  ))}
                                </select>
                                {assigningTicketId === repair.id && (
                                  <Loader2 size={13} className="text-cyan-400 animate-spin" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {repair.attachments && repair.attachments.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <ImageIcon className="w-3.5 h-3.5" /> Attachments:
                          </span>
                          {repair.attachments.map((att: string, aIdx: number) => (
                            <a
                              key={aIdx}
                              href={getMediaUrl(att)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 text-cyan-400 hover:bg-zinc-700 transition-colors inline-flex items-center gap-1 border border-zinc-700/80"
                            >
                              File {aIdx + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );

  if (asDrawer) {
    return (
      <SideDrawer
        isOpen={true}
        onClose={onClose}
        title="Device Repair History"
      >
        {renderContentBody()}
      </SideDrawer>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#09090b] border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Device Repair History
                {data?.device?.brand && (
                  <span className="text-sm font-normal text-zinc-400">
                    — {data.device.brand} {data.device.model_number || data.device.model}
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Complete lifecycle service records and maintenance history
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {renderContentBody()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-zinc-800/80 bg-zinc-900/40">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
