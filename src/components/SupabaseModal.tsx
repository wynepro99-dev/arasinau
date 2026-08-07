import React, { useState } from 'react';
import { Database, CheckCircle2, Copy, RefreshCw, X, Server, AlertCircle, ArrowUpRight, Key, Sparkles } from 'lucide-react';
import { getSupabaseConfig, setRuntimeSupabaseConfig, SUPABASE_SQL_SCHEMA, getSupabaseClient } from '../lib/supabase';
import { syncFromSupabase, seedSupabaseDatabase } from '../lib/storage';

interface SupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onDataRefreshed: () => void;
}

export const SupabaseModal: React.FC<SupabaseModalProps> = ({
  isOpen,
  onClose,
  onToast,
  onDataRefreshed
}) => {
  const currentConfig = getSupabaseConfig();
  const [url, setUrl] = useState(currentConfig.url);
  const [key, setKey] = useState(currentConfig.key);
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  if (!isOpen) return null;

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuntimeSupabaseConfig(url.trim(), key.trim());
    onToast('Kredensial Supabase berhasil disimpan secara konfigurasional.', 'info');
    
    if (url.trim() && key.trim()) {
      setIsSyncing(true);
      const res = await syncFromSupabase();
      setIsSyncing(false);
      if (res.success) {
        onToast(res.message, 'success');
        onDataRefreshed();
      } else {
        onToast(res.message, 'error');
      }
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    const res = await syncFromSupabase();
    setIsSyncing(false);
    setStatusMsg(res.message);
    if (res.success) {
      onToast(res.message, 'success');
      onDataRefreshed();
    } else {
      onToast(res.message, 'error');
    }
  };

  const handleSeedData = async () => {
    if (!getSupabaseClient()) {
      onToast('Harap simpan URL & Key Supabase terlebih dahulu.', 'error');
      return;
    }
    setIsSeeding(true);
    const res = await seedSupabaseDatabase();
    setIsSeeding(false);
    setStatusMsg(res.message);
    if (res.success) {
      onToast(res.message, 'success');
      onDataRefreshed();
    } else {
      onToast(res.message, 'error');
    }
  };

  const copySqlSchema = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopied(true);
    onToast('SQL Schema Supabase berhasil disalin ke clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const isConnected = !!getSupabaseClient();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden text-slate-900 my-8 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center space-x-2">
                <span>Pengaturan Database Supabase</span>
                {isConnected ? (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    TERHUBUNG
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    IN-MEMORY MODE
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Integrasi Database Cloud Supabase tanpa localStorage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* Status Message */}
          {statusMsg && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs font-semibold text-indigo-900 flex items-start space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>{statusMsg}</div>
            </div>
          )}

          {/* Form Credentials */}
          <form onSubmit={handleSaveConfig} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
            <div className="text-xs font-bold text-slate-800 flex items-center space-x-1.5 mb-1">
              <Key className="w-4 h-4 text-emerald-600" />
              <span>Konfigurasi Kredensial Proyek Supabase</span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Supabase Project URL</label>
              <input
                type="text"
                placeholder="https://your-project.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Supabase Anon Key</label>
              <input
                type="password"
                placeholder="eyJh..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Simpan Kredensial</span>
              </button>

              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sinkronkan Data</span>
              </button>

              <button
                type="button"
                onClick={handleSeedData}
                disabled={isSeeding}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Server className="w-3.5 h-3.5" />
                <span>Inject Data Master ke Supabase</span>
              </button>
            </div>
          </form>

          {/* SQL Schema Copy Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <Copy className="w-3.5 h-3.5 text-indigo-600" />
                <span>Skema SQL Tabel Supabase (Siap Dijalankan)</span>
              </label>
              <button
                onClick={copySqlSchema}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition-all flex items-center space-x-1"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin!' : 'Salin SQL Schema'}</span>
              </button>
            </div>

            <div className="relative">
              <pre className="p-3 bg-slate-900 text-emerald-400 rounded-2xl text-[10px] font-mono overflow-x-auto max-h-48 border border-slate-800">
                {SUPABASE_SQL_SCHEMA}
              </pre>
            </div>
            <p className="text-[11px] text-slate-500">
              Salin kode SQL di atas dan jalankan pada menu <strong className="text-slate-700">SQL Editor</strong> di dashboard Supabase Anda untuk membuat tabel <code className="bg-slate-100 px-1 rounded text-indigo-600">users</code>, <code className="bg-slate-100 px-1 rounded text-indigo-600">exam_packages</code>, <code className="bg-slate-100 px-1 rounded text-indigo-600">questions</code>, dan <code className="bg-slate-100 px-1 rounded text-indigo-600">exam_attempts</code>.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
