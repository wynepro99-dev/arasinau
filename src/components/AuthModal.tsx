import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { User, UserRole } from '../types';
import { getUsers, registerUser, getUserUsername } from '../lib/storage';
import { getSupabaseClient } from '../lib/supabase';
import { LOGO_URL } from './Navbar';
import { X, Lock, Mail, User as UserIcon, ArrowRight, CheckCircle2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onLoginSuccess: (user: User) => void;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  isInlineScreen?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  onToast,
  isInlineScreen = false
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [logoError, setLogoError] = useState(false);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('karyawan');
  const [regDepartment, setRegDepartment] = useState('IT & Technology');
  const [regCompany, setRegCompany] = useState<'BANK' | 'SEC'>('BANK');

  if (!isOpen && !isInlineScreen) return null;

  const allUsers = getUsers();

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = loginEmail.trim().toLowerCase();
    if (!query) {
      onToast('Silakan ketik username atau email Anda.', 'error');
      return;
    }
    if (!loginPassword.trim()) {
      onToast('Silakan ketik kata sandi akun Anda.', 'error');
      return;
    }
    const currentUsers = getUsers();
    const found = currentUsers.find(u => {
      const generatedUsername = getUserUsername(u);
      const isAll = u.company === 'ALL';
      const alternateUsername = isAll ? `${generatedUsername.split('.')[0]}.sec` : '';
      return u.email.toLowerCase() === query || 
             generatedUsername === query ||
             (isAll && alternateUsername === query) ||
             u.name.toLowerCase() === query;
    });

    if (found) {
      let latestUser = null;
      let dbErrorMsg = '';

      try {
        const client = getSupabaseClient();
        if (!client) {
          onToast('Gagal terhubung ke database. Konfigurasi belum tersedia.', 'error');
          return;
        }

        let dbUser = null;

        // 1. Try query by email first (unique constraint)
        const { data: byEmail, error: emailErr } = await client
          .from('users')
          .select('*')
          .eq('email', found.email)
          .maybeSingle();

        if (emailErr) {
          dbErrorMsg = emailErr.message;
        } else if (byEmail) {
          dbUser = byEmail;
        } else {
          // 2. Fallback query by id
          const { data: byId, error: idErr } = await client
            .from('users')
            .select('*')
            .eq('id', found.id)
            .maybeSingle();
            
          if (idErr) {
            dbErrorMsg = idErr.message;
          } else if (byId) {
            dbUser = byId;
          }
        }

        if (dbUser) {
          latestUser = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            password: dbUser.password || '123456',
            role: dbUser.role,
            department: dbUser.department,
            avatar: dbUser.avatar,
            company: dbUser.company || 'BANK'
          };
        }
      } catch (e: any) {
        dbErrorMsg = e.message || 'Koneksi terputus atau gagal melakukan fetch';
        console.warn('Direct database validation failed:', e);
      }

      if (!latestUser) {
        onToast(`Login gagal. Tidak dapat memvalidasi data ke server. (Error: ${dbErrorMsg || 'User tidak ditemukan di DB'})`, 'error');
        return;
      }

      const userPassword = latestUser.password || '123456';
      if (loginPassword.trim() !== userPassword) {
        onToast(`Kata sandi salah. Silakan periksa kembali kata sandi akun ${latestUser.name}.`, 'error');
        return;
      }

      // Update local memory user password with the verified password
      const idx = currentUsers.findIndex(u => u.id === latestUser.id);
      if (idx !== -1) {
        currentUsers[idx] = latestUser;
      }

      onLoginSuccess(latestUser);
      onToast(`Selamat datang di Ara Sinau, ${latestUser.name}!`, 'success');
      if (onClose) onClose();
    } else {
      onToast('Personel tidak ditemukan. Silakan pilih dari dropdown atau ketik email/nama.', 'error');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim()) {
      onToast('Semua kolom wajib diisi.', 'error');
      return;
    }

    try {
      const created = await registerUser({
        name: regName.trim(),
        email: regEmail.trim(),
        role: regRole,
        department: regDepartment,
        company: regCompany
      });
      onLoginSuccess(created);
      onToast(`Akun berhasil dibuat!`, 'success');
      if (onClose) onClose();
    } catch (err: any) {
      onToast(err.message || 'Gagal mendaftar', 'error');
    }
  };

  const content = (
    <div className="w-full max-w-md mx-auto bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden text-slate-900 dark:text-zinc-150 animate-scale-in">
      
      {/* Brand Top Header */}
      <div className="p-4 sm:p-6 pb-4 sm:pb-5 text-center bg-gradient-to-b from-indigo-50/70 to-white dark:from-zinc-800/40 dark:to-zinc-900 border-b border-slate-100 dark:border-zinc-800 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 sm:w-5 h-4 sm:h-5" />
          </button>
        )}

        <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 p-1 mx-auto mb-2 sm:mb-3 shadow-lg shadow-indigo-600/20 flex items-center justify-center">
          {!logoError ? (
            <img 
              src={LOGO_URL} 
              alt="Ara Sinau Logo" 
              onError={() => setLogoError(true)}
              className="w-full h-full object-contain rounded-xl bg-white dark:bg-zinc-800 p-1"
            />
          ) : (
            <span className="text-white font-black text-lg sm:text-xl">ARA</span>
          )}
        </div>

        <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Ara Sinau</h2>
        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 mt-1">Sistem Portal Ujian & Evaluasi</p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex border-b border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <button
          onClick={() => setMode('login')}
          className={`flex-1 py-3 text-xs font-bold text-center transition-all border-b-2 ${
            mode === 'login'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20'
              : 'border-transparent text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300'
          }`}
        >
          Masuk Email
        </button>
        <button
          onClick={() => setMode('register')}
          className={`flex-1 py-3 text-xs font-bold text-center transition-all border-b-2 ${
            mode === 'register'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/20'
              : 'border-transparent text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300'
          }`}
        >
          Daftar Akun
        </button>
      </div>

      {/* Forms Section */}
      <div className="p-6">
        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">Username atau Email</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Format: nama.ara atau nama.sec (contoh: putri.sec atau taka.ara)"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900 transition-all font-medium"
                  required
                />
              </div>
              <p className="text-[10px] text-slate-400 dark:text-zinc-550 mt-1">
                Gunakan format <strong className="text-indigo-600 dark:text-indigo-400 font-bold">[nama].ara</strong> (BANK) atau <strong className="text-purple-600 dark:text-purple-400 font-bold">[nama].sec</strong> (SEC) untuk masuk.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">Kata Sandi</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900 transition-all font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center space-x-2 active:scale-98"
            >
              <span>Masuk Sistem</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">Nama Lengkap</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Nama Lengkap Karyawan"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-all font-medium"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">Email Perusahaan</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="email"
                  placeholder="karyawan@perusahaan.id"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-all font-medium"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">Akses Sistem</label>
                <select
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value as UserRole)}
                  className="w-full py-2.5 px-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="karyawan" className="dark:bg-zinc-900">Peserta / Pengerja Ujian</option>
                  <option value="admin" className="dark:bg-zinc-900">Pembuat Soal / Evaluator</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">Departemen</label>
                <select
                  value={regDepartment}
                  onChange={(e) => setRegDepartment(e.target.value)}
                  className="w-full py-2.5 px-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="IT & Technology" className="dark:bg-zinc-900">IT & Tech</option>
                  <option value="Human Resources" className="dark:bg-zinc-900">HRD</option>
                  <option value="Operations & Logistics" className="dark:bg-zinc-900">Operations</option>
                  <option value="Marketing & Sales" className="dark:bg-zinc-900">Marketing</option>
                  <option value="Finance & Accounting" className="dark:bg-zinc-900">Finance</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">Perusahaan / Scope</label>
              <select
                value={regCompany}
                onChange={(e) => setRegCompany(e.target.value as 'BANK' | 'SEC')}
                className="w-full py-2.5 px-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="BANK" className="dark:bg-zinc-900">BANK</option>
                <option value="SEC" className="dark:bg-zinc-900">SEC</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center space-x-2 mt-2 active:scale-98"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Daftar Akun Baru</span>
            </button>
          </form>
        )}
      </div>

    </div>
  );

  if (isInlineScreen) {
    return (
      <div className="py-8 px-4 flex items-center justify-center min-h-[75vh]">
        {content}
      </div>
    );
  }

  const modalOverlay = (
    <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6 animate-fade-in">
        {content}
      </div>
    </div>
  );

  return createPortal(modalOverlay, document.body);
};
