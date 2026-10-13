import React, { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  inputLabel?: string;
  placeholder?: string;
  initialValue?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  title,
  message,
  inputLabel = 'Reason (optional):',
  placeholder = 'Enter reason here...',
  initialValue = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-600 text-black font-semibold shadow-lg shadow-amber-500/20';
      case 'primary':
      default:
        return 'bg-neon-cyan hover:bg-cyan-400 text-black font-semibold shadow-lg shadow-cyan-500/20';
    }
  };

  const getIconStyles = () => {
    switch (variant) {
      case 'danger':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'warning':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'primary':
      default:
        return 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${getIconStyles()}`}>
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-white font-bold font-outfit text-base">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-zinc-400 text-xs leading-relaxed whitespace-pre-line">{message}</p>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            {inputLabel && (
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">{inputLabel}</label>
            )}
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              disabled={isLoading}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/30 transition-all"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${getVariantStyles()}`}
            >
              {isLoading ? 'Processing...' : confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PromptModal;
