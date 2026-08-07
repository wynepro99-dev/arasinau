import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { getUsers, registerUser } from '../lib/storage';
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

  if (!isOpen && !isInlineScreen) return null;

  const allUsers = getUsers();

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = loginEmail.trim().toLowerCase();
    if (!query) {
      onToast('Silakan pilih dari daftar atau ketik email / nama personel.', 'error');
      return;
    }
    if (!loginPassword.trim()) {
      onToast('Silakan ketik kata sandi akun Anda.', 'error');
      return;
    }
    const currentUsers = getUsers();
    const found = currentUsers.find(u => 
      u.email.toLowerCase() === query || 
      u.name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query)
    );
    if (found) {
      const userPassword = found.password || '123456';
      if (loginPassword.trim() !== userPassword) {
        onToast(`Kata sandi salah. Silakan periksa kembali kata sandi akun ${found.name}.`, 'error');
        return;
      }
      onLoginSuccess(found);
      onToast(`Selamat datang di Ara Sinau, ${found.name}!`, 'success');
      if (onClose) onClose();
    } else {
      onToast('Personel tidak ditemukan. Silakan pilih dari dropdown atau ketik email/nama.', 'error');
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim()) {
      onToast('Semua kolom wajib diisi.', 'error');
      return;
    }

    try {
      const created = registerUser({
        name: regName.trim(),
        email: regEmail.trim(),
        role: regRole,
        department: regDepartment
      });
      onLoginSuccess(created);
      onToast(`Akun berhasil dibuat!`, 'success');
      if (onClose) onClose();
    } catch (err: any) {
      onToast(err.message || 'Gagal mendaftar', 'error');
    }
  };

  const handleQuickDemo = (user: User) => {
    onLoginSuccess(user);
    onToast(`Masuk sebagai: ${user.name}`, 'success');
    if (onClose) onClose();
  };

  const content = (
    <div className="w-full max-w-md mx-auto bg-white border border-slate-200/80 rounded-3xl shadow-2xl overflow-hidden text-slate-900 animate-scale-in">
      
      {/* Brand Top Header */}
      <div className="p-6 pb-5 text-center bg-gradient-to-b from-indigo-50/70 to-white border-b border-slate-100 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 p-1 mx-auto mb-3 shadow-lg shadow-indigo-600/20 flex items-center justify-center">
          {!logoError ? (
            <img 
              src={LOGO_URL} 
              alt="Ara Sinau Logo" 
              onError={() => setLogoError(true)}
              className="w-full h-full object-contain rounded-xl bg-white p-1"
            />
          ) : (
            <span className="text-white font-black text-xl">ARA</span>
          )}
        </div>

        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Ara Sinau</h2>
        <p className="text-xs text-slate-500 mt-0.5">Sistem Portal Ujian & Evaluasi Online Terpadu</p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex border-b border-slate-100 bg-white">
        <button
          onClick={() => setMode('login')}
          className={`flex-1 py-3 text-xs font-bold text-center transition-all border-b-2 ${
            mode === 'login'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Masuk Email
        </button>
        <button
          onClick={() => setMode('register')}
          className={`flex-1 py-3 text-xs font-bold text-center transition-all border-b-2 ${
            mode === 'register'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30'
              : 'border-transparent text-slate-400 hover:text-slate-600'
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
              <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Personel / Pengguna</label>

              <select
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full mb-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500"
              >
                <option value="">-- Pilih Akun Personel ({allUsers.length}) --</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.email}>
                    {u.name} • {u.department}
                  </option>
                ))}
              </select>

              <label className="block text-xs font-bold text-slate-700 mb-1">Atau Ketik Email / Nama</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ketik email atau nama..."
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kata Sandi</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center space-x-2 active:scale-98"
            >
              <span>Masuk ke Ara Sinau</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Nama Lengkap Karyawan"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-all font-medium"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email Perusahaan</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="email"
                  placeholder="karyawan@perusahaan.id"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-all font-medium"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Akses Sistem</label>
                <select
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value as UserRole)}
                  className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500"
                >
                  <option value="karyawan">Peserta / Pengerja Ujian</option>
                  <option value="admin">Pembuat Soal / Evaluator</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Departemen</label>
                <select
                  value={regDepartment}
                  onChange={(e) => setRegDepartment(e.target.value)}
                  className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500"
                >
                  <option value="IT & Technology">IT & Tech</option>
                  <option value="Human Resources">HRD</option>
                  <option value="Operations & Logistics">Operations</option>
                  <option value="Marketing & Sales">Marketing</option>
                  <option value="Finance & Accounting">Finance</option>
                </select>
              </div>
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-fade-in">
      {content}
    </div>
  );
};

