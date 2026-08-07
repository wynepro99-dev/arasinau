import React, { useState } from 'react';
import { User } from '../types';
import { getUsers } from '../lib/storage';
import { 
  LogOut, 
  ChevronDown,
  LayoutDashboard,
  Award,
  BookOpen,
  User as UserIcon
} from 'lucide-react';

interface NavbarProps {
  currentUser: User | null;
  onSelectUser: (user: User | null) => void;
  onOpenAuthModal: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const LOGO_URL = "https://antarrumeksaarta.vittoriaproperti.com/uploads/profile/d96a287d-a983-4e54-8719-b46c7a2f3694.png";

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onSelectUser,
  onOpenAuthModal,
  activeTab,
  setActiveTab,
  onToast
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const users = getUsers();

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 text-slate-900 shadow-sm transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div 
            className="flex items-center space-x-3 cursor-pointer group" 
            onClick={() => {
              if (currentUser) {
                setActiveTab(currentUser.role === 'admin' ? 'dashboard' : 'employee_dashboard');
              }
            }}
          >
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center p-1 shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              {!logoError ? (
                <img 
                  src={LOGO_URL} 
                  alt="Ara Sinau Logo" 
                  onError={() => setLogoError(true)}
                  className="w-full h-full object-contain rounded-lg bg-white/90 p-0.5"
                />
              ) : (
                <div className="text-white font-black text-base tracking-tighter">ARA</div>
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-700 bg-clip-text text-transparent">
                  Ara Sinau
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-full uppercase tracking-wider">
                  Enterprise
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden sm:block">Sistem Ujian & Evaluasi Online</p>
            </div>
          </div>

          {/* Navigation Tabs for Desktop (if logged in) */}
          {currentUser && (
            <nav className="hidden md:flex items-center space-x-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/70">
              {currentUser.role === 'admin' ? (
                <>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'dashboard'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Overview</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('exams')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'exams'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Paket Ujian</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('scores')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'scores'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <Award className="w-4 h-4" />
                    <span>Laporan Nilai</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('employee_dashboard')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'employee_dashboard' || activeTab === 'employee_history'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Ikuti Ujian</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setActiveTab('employee_dashboard')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'employee_dashboard'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Ujian Saya</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('employee_history')}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'employee_history'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <Award className="w-4 h-4" />
                    <span>Riwayat Nilai</span>
                  </button>
                </>
              )}
            </nav>
          )}

          {/* Right Controls / Profile & Login */}
          <div className="flex items-center space-x-2 sm:space-x-3">

            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center space-x-2 bg-slate-50 hover:bg-slate-100 p-1.5 pr-3 rounded-2xl border border-slate-200/80 transition-all text-left shadow-sm active:scale-95"
                >
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 border border-indigo-200/80 flex items-center justify-center font-bold text-xs shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="hidden sm:block leading-tight">
                    <div className="text-xs font-bold text-slate-800">
                      <span className="truncate max-w-[140px] block">{currentUser.name}</span>
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Profile Dropdown Sheet */}
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200/80 rounded-2xl shadow-xl py-2 z-50 divide-y divide-slate-100 animate-fade-in">
                    <div className="px-4 py-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 border border-indigo-200/80 flex items-center justify-center font-bold text-xs shrink-0">
                          <UserIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="px-2 py-1.5">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onSelectUser(null);
                          onToast('Anda telah keluar dari Ara Sinau.', 'info');
                        }}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 rounded-xl transition-colors font-semibold"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Keluar Akun (Logout)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenAuthModal}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-2xl shadow-md shadow-indigo-600/20 transition-all active:scale-95"
              >
                <UserIcon className="w-4 h-4" />
                <span>Masuk Sistem</span>
              </button>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};

