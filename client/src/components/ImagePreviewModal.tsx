import React from 'react';
import { X, ExternalLink, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImagePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    src: string;
    alt?: string;
}

export default function ImagePreviewModal({ isOpen, onClose, src, alt = 'Image Preview' }: ImagePreviewModalProps) {
    if (!isOpen) return null;

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = src;
        link.download = alt.toLowerCase().replace(/[^a-z0-9]/g, '_');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 cursor-zoom-out"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: 'spring', duration: 0.4 }}
                    className="relative max-w-4xl max-h-[85vh] w-full bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col z-10"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-900 bg-black/40">
                        <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{alt}</span>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleDownload}
                                className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                title="Download Image"
                            >
                                <Download size={16} />
                            </button>
                            <a
                                href={src}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                                title="Open in New Tab"
                            >
                                <ExternalLink size={16} />
                            </a>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                                title="Close"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    {/* Image Container */}
                    <div className="flex-1 flex items-center justify-center p-6 bg-black/60 overflow-hidden">
                        <img
                            src={src}
                            alt={alt}
                            className="max-w-full max-h-[70vh] object-contain rounded-lg border border-zinc-900 shadow-lg"
                        />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
