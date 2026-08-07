import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'info' | 'error';
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  return (
    <div className="fixed bottom-5 right-5 z-50 animate-bounce-short">
      <div className={`flex items-center space-x-3 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold backdrop-blur-md ${
        type === 'success'
          ? 'bg-slate-900/95 text-emerald-300 border-emerald-500/50 shadow-emerald-500/10'
          : type === 'error'
          ? 'bg-slate-900/95 text-rose-300 border-rose-500/50 shadow-rose-500/10'
          : 'bg-slate-900/95 text-blue-300 border-blue-500/50 shadow-blue-500/10'
      }`}>
        {type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
        {type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
        {type === 'info' && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
        <span>{message}</span>
        <button onClick={onClose} className="p-1 hover:text-white rounded">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
