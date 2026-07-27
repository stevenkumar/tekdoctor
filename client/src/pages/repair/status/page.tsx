
'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Package, CheckCircle2, Clock, Wrench, Cpu, History, User, ExternalLink, CreditCard, Hash, Settings, FileImage, Image } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { repairApi } from '@/services/api';
import type { ServiceRequest } from '@/services/api';
import { appConfig } from '@/config/appConfig';
import ImagePreviewModal from '@/components/ImagePreviewModal';

const getFileUrl = (path: string | null) => {
  if (!path) return null;
  const base = (appConfig.apiUrl || window.location.origin).replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return `${base}/${cleanPath}`;
};

export default function ServiceTracker() {
  const { user, token, isAuthenticated } = useAuth();
  const [ticketId, setTicketId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [trackingData, setTrackingData] = useState<any>(null);
  const [history, setHistory] = useState<ServiceRequest[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Preview States
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [previewAlt, setPreviewAlt] = useState('');

  const handleImagePreview = (src: string, alt: string) => {
    setPreviewSrc(src);
    setPreviewAlt(alt);
    setPreviewOpen(true);
  };

  // Cancel Feature State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancelRequest = async () => {
    if (!token || !trackingData) return;
    setIsCancelling(true);
    try {
      const res = await repairApi.cancelRequest(token, trackingData.id, cancelReason);
      if (res.ok) {
        setTrackingData({ ...trackingData, status: 'cancelled' });
        setShowCancelModal(false);
        setCancelReason('');
        // Refresh history to reflect cancellation natively
        repairApi.getMyHistory(token).then((res) => {
          if (res.ok && res.data) setHistory(res.data.data.data);
        });
      } else {
        alert(res.error || 'Failed to cancel the repair request.');
      }
    } catch (err) {
      alert('Network error while cancelling.');
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && token) {
      repairApi.getMyHistory(token).then((res) => {
        if (res.ok && res.data) {
          setHistory(res.data.data.data);
        }
      });
    }
  }, [isAuthenticated, token]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId) return;
    setIsSearching(true);
    setShowStatus(false);
    setSearchError('');
    setTrackingData(null);

    try {
      const res = await repairApi.trackRequest(ticketId);
      if (res.ok && res.data) {
        setTrackingData(res.data.data);
        setShowStatus(true);
      } else {
        setSearchError(res.error || 'Request not found.');
      }
    } catch (err) {
      setSearchError('Network error while requesting status.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <section className="w-full bg-black py-16 px-6 border-t border-zinc-900">
      <div className="max-w-4xl mx-auto">

        {/* Tracker Input Card */}
        <div className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-3xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Search size={120} />
          </div>

          <div className="relative z-10 text-center mb-10">
            {isAuthenticated && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-2 mb-6"
              >
                <div className="px-2 py-0.5 rounded border border-neon-cyan/30 bg-neon-cyan/5">
                  <span className="text-[9px] font-mono text-neon-cyan uppercase tracking-widest">Authorized_Link</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Welcome, {user?.name}</span>
              </motion.div>
            )}
            <h2 className="text-3xl font-black uppercase tracking-tighter text-white mb-2">
              Track Your <span className="text-neon-cyan">Repair</span>
            </h2>
            <p className="text-zinc-500 text-sm font-mono uppercase tracking-widest">
              Enter your ticket id provided at the counter
            </p>
          </div>

          <form onSubmit={handleSearch} className="relative z-10 max-w-md mx-auto flex gap-3">
            <div className="flex-grow relative">
              <input
                type="text"
                placeholder="Ex: TD-00x"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                className="w-full bg-black border border-zinc-700 rounded-xl px-5 py-4 text-white focus:outline-none focus:border-neon-cyan transition-all font-mono uppercase tracking-widest"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="bg-neon-cyan hover:bg-white text-black px-6 py-4 rounded-xl font-black uppercase tracking-tighter transition-all disabled:opacity-50"
            >
              {isSearching ? 'Analyzing...' : 'Check Status'}
            </button>
          </form>

          {/* History Button (if logged in and has history) */}
          {isAuthenticated && history.length > 0 && (
            <div className="flex justify-center mt-6 relative z-10">
              <button
                onClick={() => setShowHistoryModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700/50 hover:border-neon-cyan/50 hover:bg-zinc-800 rounded-lg text-xs font-mono text-neon-cyan uppercase tracking-widest transition-all cursor-pointer"
              >
                <History size={14} /> My Repair History
              </button>
            </div>
          )}

          {searchError && (
            <div className="text-center mt-6 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-mono rounded-xl max-w-md mx-auto">
              {searchError}
            </div>
          )}

          <AnimatePresence>
            {showStatus && trackingData && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-12 pt-10 border-t border-zinc-800/50"
              >
                {/* User & Device Metadata Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                  <div className="bg-black/40 border border-zinc-800/50 p-5 rounded-2xl flex items-center gap-4 group hover:border-neon-cyan/30 transition-all">
                    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-neon-cyan group-hover:scale-110 transition-transform">
                      <Cpu size={18} />
                    </div>
                    <div>
                      <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Device_Category</p>
                      <p className="text-sm font-bold text-zinc-200">{trackingData.deviceCategory}</p>
                    </div>
                  </div>
                  <div className="bg-black/40 border border-zinc-800/50 p-5 rounded-2xl flex items-center gap-4 group hover:border-neon-cyan/30 transition-all">
                    <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-neon-cyan group-hover:scale-110 transition-transform">
                      <Clock size={18} className="animate-pulse" />
                    </div>
                    <div>
                      <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Asset_Ident</p>
                      <p className="text-sm font-bold text-neon-cyan">{trackingData.brand} {trackingData.modelNumber}</p>
                    </div>
                  </div>
                  {trackingData.serialNumber && (
                    <div className="bg-black/40 border border-zinc-800/50 p-5 rounded-2xl flex items-center gap-4 group hover:border-neon-cyan/30 transition-all">
                      <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-neon-cyan group-hover:scale-110 transition-transform">
                        <Hash size={18} />
                      </div>
                      <div>
                        <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Serial_Number</p>
                        <p className="text-sm font-bold text-zinc-200">{trackingData.serialNumber}</p>
                      </div>
                    </div>
                  )}
                  {trackingData.deviceConfiguration && (
                    <div className="bg-black/40 border border-zinc-800/50 p-5 rounded-2xl flex items-center gap-4 group hover:border-neon-cyan/30 transition-all md:col-span-2 lg:col-span-1">
                      <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-neon-cyan group-hover:scale-110 transition-transform">
                        <Settings size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Configuration</p>
                        <p className="text-sm font-bold text-zinc-200 truncate" title={trackingData.deviceConfiguration}>{trackingData.deviceConfiguration}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center mb-12">
                  {/* Step 1: Received */}
                  <div className={`space-y-3 ${['pending', 'in_progress', 'completed', 'cancelled'].includes(trackingData.status) ? 'opacity-100' : 'opacity-30'}`}>
                    <div className="w-12 h-12 bg-neon-cyan rounded-full flex items-center justify-center mx-auto text-black" style={{ boxShadow: '0 0 20px rgba(var(--neon-cyan-rgb), 0.3)' }}>
                      <CheckCircle2 size={24} />
                    </div>
                    <p className="text-xs font-bold text-white uppercase tracking-widest">Received</p>
                    <p className="text-[10px] text-zinc-500 font-mono italic">{new Date(trackingData.createdAt).toLocaleDateString()}</p>
                  </div>

                  {/* Step 2: Diagnostic/In-Progress */}
                  <div className={`space-y-3 ${['in_progress', 'completed'].includes(trackingData.status) ? 'opacity-100' : 'opacity-30 grayscale'}`}>
                    <div className={`w-12 h-12 border-2 ${trackingData.status === 'in_progress' ? 'border-neon-cyan bg-neon-cyan/5 animate-pulse text-neon-cyan' : trackingData.status === 'completed' ? 'border-neon-cyan bg-neon-cyan text-black' : 'border-zinc-700 text-zinc-700'} rounded-full flex items-center justify-center mx-auto`} style={trackingData.status === 'completed' ? { boxShadow: '0 0 20px rgba(var(--neon-cyan-rgb), 0.3)' } : undefined}>
                      <Wrench size={24} />
                    </div>
                    <p className={`text-xs font-bold uppercase tracking-widest ${['in_progress', 'completed'].includes(trackingData.status) ? 'text-neon-cyan' : 'text-zinc-600'}`}>In Progress</p>
                    <p className="text-[10px] text-zinc-500 font-mono italic">{trackingData.status === 'completed' ? 'Diagnostics Completed' : trackingData.status === 'in_progress' ? 'Engineer Assigned' : 'Awaiting Assignment'}</p>
                  </div>

                  {/* Step 3: Ready for Pickup */}
                  <div className={`space-y-3 ${trackingData.status === 'completed' ? 'opacity-100' : 'opacity-30'}`}>
                    <div className={`w-12 h-12 border-2 ${trackingData.status === 'completed' ? 'border-neon-cyan bg-neon-cyan text-black' : 'border-zinc-700 text-zinc-700'} rounded-full flex items-center justify-center mx-auto`} style={trackingData.status === 'completed' ? { boxShadow: '0 0 20px rgba(var(--neon-cyan-rgb), 0.3)' } : undefined}>
                      <Package size={24} />
                    </div>
                    <p className={`text-xs font-bold uppercase tracking-widest ${trackingData.status === 'completed' ? 'text-white' : 'text-zinc-600'}`}>Ready / Done</p>
                    <p className="text-[10px] text-zinc-500 font-mono italic">{trackingData.status === 'completed' ? new Date(trackingData.updatedAt).toLocaleDateString() : 'TBD'}</p>
                  </div>
                </div>

                {/* Technician Notes for Customer */}
                <div className="mt-10 space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <History size={14} className="text-zinc-600" />
                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Technician_Notes</span>
                  </div>

                  {trackingData.customerRepairDescription ? (
                    <div className="p-5 bg-neon-cyan/5 border border-neon-cyan/20 rounded-2xl">
                      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{trackingData.customerRepairDescription}</p>
                    </div>
                  ) : (
                    <div className="p-4 border border-zinc-800/50 rounded-2xl">
                      <p className="text-xs font-mono text-zinc-600 italic">No technician notes have been added yet. Check back after your device has been assessed.</p>
                    </div>
                  )}
                </div>

                {/* Customer Attachments Section */}
                {(trackingData.imagePath || trackingData.screenshotPath) && (
                  <div className="mt-10 space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Image size={14} className="text-zinc-650" />
                      <span className="text-[10px] font-mono text-zinc-650 uppercase tracking-widest">Customer_Attachments</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {trackingData.imagePath && (
                        <div className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400 font-semibold font-mono flex items-center gap-1.5">
                              <FileImage size={13} className="text-neon-cyan" /> DEVICE_PHOTO
                            </span>
                            <span className="text-[9px] font-mono text-zinc-600 uppercase">Click to preview</span>
                          </div>
                          <div className="h-32 w-full overflow-hidden bg-black rounded-lg border border-zinc-900/80 flex items-center justify-center cursor-pointer" onClick={() => handleImagePreview(getFileUrl(trackingData.imagePath)!, 'Device Photo')}>
                            <img
                              src={getFileUrl(trackingData.imagePath)!}
                              alt="Device"
                              className="max-h-full max-w-full object-contain transition-transform duration-300 hover:scale-105"
                            />
                          </div>
                        </div>
                      )}
                      {trackingData.screenshotPath && (
                        <div className="border border-zinc-900 bg-zinc-950/40 rounded-xl p-3 flex flex-col gap-2 group hover:border-zinc-800 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400 font-semibold font-mono flex items-center gap-1.5">
                              <FileImage size={13} className="text-neon-cyan" /> SCREENSHOT
                            </span>
                            <span className="text-[9px] font-mono text-zinc-600 uppercase">Click to preview</span>
                          </div>
                          <div className="h-32 w-full overflow-hidden bg-black rounded-lg border border-zinc-900/80 flex items-center justify-center cursor-pointer" onClick={() => handleImagePreview(getFileUrl(trackingData.screenshotPath)!, 'Screenshot')}>
                            <img
                              src={getFileUrl(trackingData.screenshotPath)!}
                              alt="Screenshot"
                              className="max-h-full max-w-full object-contain transition-transform duration-300 hover:scale-105"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}



                {/* Simulated Payment Section */}
                <div className="mt-8 bg-zinc-900/50 border border-green-500/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="text-green-400 font-bold font-mono uppercase tracking-widest text-sm mb-1 flex items-center gap-2">
                      <CreditCard size={16} /> Balance Due
                    </h4>
                    <p className="text-zinc-400 text-xs font-mono">Invoice #INV-2024-001</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="text-2xl font-black font-mono text-white">$150.00</span>
                    <Link to="/billing/pay/INV-2024-001"
                      className="bg-green-500 hover:bg-green-400 text-black px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors"
                    >
                      Pay Online
                    </Link>
                  </div>
                </div>

                <div className="mt-12 flex justify-center">
                  <button className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-neon-cyan transition-colors">
                    <ExternalLink size={12} />
                    Contact Assigned Engineer
                  </button>
                </div>
                {isAuthenticated && (trackingData.status === 'pending' || trackingData.status === 'submitted') && (
                  <div className="mt-4 flex justify-center border-t border-zinc-900/50 pt-4">
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-red-500/70 hover:text-red-400 transition-colors"
                    >
                      Cancel Repair Request
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* History Modal */}
        <AnimatePresence>
          {showHistoryModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl relative"
              >
                <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-black/40">
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
                    <History size={20} className="text-neon-cyan" /> Request History
                  </h3>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="p-2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4 scrollbar-thin">
                  {history.map((req) => (
                    <div key={req.id} className="bg-black/50 border border-zinc-800/80 rounded-2xl p-5 hover:border-neon-cyan/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-mono text-neon-cyan uppercase tracking-widest font-bold">{req.ticketNumber || `#${req.id}`}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest border ${req.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                            req.status === 'in_progress' ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30' :
                              req.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                                'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}>
                            {req.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-white mb-1">{req.brand} {req.modelNumber && `(${req.modelNumber})`}</p>
                        <p className="text-xs text-zinc-400 line-clamp-1">{req.problemDescription}</p>
                        {req.customerRepairDescription && (
                          <p className="text-xs text-neon-cyan/70 mt-1 line-clamp-1">📝 {req.customerRepairDescription}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] font-mono text-zinc-500 mb-2">{new Date(req.createdAt).toLocaleDateString()}</div>
                        <button
                          onClick={() => {
                            setTicketId(req.ticketNumber || req.id.toString());
                            setShowHistoryModal(false);
                            // auto search trigger
                            setTimeout(() => {
                              handleSearch({ preventDefault: () => { } } as any);
                            }, 100);
                          }}
                          className="text-[10px] font-mono uppercase tracking-widest text-neon-cyan hover:text-white transition-colors flex items-center justify-end gap-1 w-full cursor-pointer"
                        >
                          Track <ExternalLink size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>

      {/* Cancel Confirmation Modal */}
      <AnimatePresence>
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-red-500/30 rounded-3xl overflow-hidden shadow-2xl relative"
            >
              <div className="p-6 border-b border-zinc-900 flex justify-between items-center bg-black/40">
                <h3 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
                  <span className="text-red-500">Cancel Request</span>
                </h3>
                <button disabled={isCancelling} onClick={() => setShowCancelModal(false)} className="p-2 text-zinc-500 hover:text-white transition-colors cursor-pointer">
                  Close
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Are you sure you want to cancel this service request? This action cannot be undone, and you'll need to submit a new ticket if you change your mind.
                </p>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Reason for Cancellation (Optional)</label>
                  <textarea
                    rows={3}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="E.g., Secured alternative repair, device resolved itself, cost concerns."
                    className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500/50 resize-none"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    onClick={handleCancelRequest}
                    disabled={isCancelling}
                    className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/30 px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isCancelling ? 'Processing...' : 'Confirm Cancellation'}
                  </button>
                  <button
                    onClick={() => setShowCancelModal(false)}
                    disabled={isCancelling}
                    className="px-6 py-3 bg-zinc-900 hover:bg-zinc-800 rounded-xl text-sm font-bold uppercase tracking-widest text-zinc-300 transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Lightbox Preview Modal */}
      <ImagePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        src={previewSrc}
        alt={previewAlt}
      />
    </section>
  );
}