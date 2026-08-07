import React from 'react';
import { User } from '../types';
import { 
  LayoutDashboard, 
  BookOpen, 
  Award, 
  History
} from 'lucide-react';

interface MobileBottomNavProps {
  currentUser: User | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isTakingExam: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  isTakingExam
}) => {
  // Don't render bottom nav if user is not logged in or is currently taking an active exam
  if (!currentUser || isTakingExam) return null;

  const isAdmin = currentUser.role === 'admin';

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-xl border-t border-slate-200/80 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] px-4 pt-2 pb-5 animate-slide-up">
      <div className="flex items-center justify-around max-w-sm mx-auto">
        {isAdmin ? (
          <>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex flex-col items-center justify-center py-1 px-4 rounded-2xl transition-all duration-200 active:scale-90 ${
                activeTab === 'dashboard'
                  ? 'text-indigo-600 font-extrabold'
                  : 'text-slate-400 hover:text-slate-600 font-medium'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-indigo-50 shadow-inner' : ''}`}>
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('exams')}
              className={`flex flex-col items-center justify-center py-1 px-4 rounded-2xl transition-all duration-200 active:scale-90 ${
                activeTab === 'exams'
                  ? 'text-indigo-600 font-extrabold'
                  : 'text-slate-400 hover:text-slate-600 font-medium'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'exams' ? 'bg-indigo-50 shadow-inner' : ''}`}>
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Paket Ujian</span>
            </button>

            <button
              onClick={() => setActiveTab('scores')}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all duration-200 active:scale-90 ${
                activeTab === 'scores'
                  ? 'text-indigo-600 font-extrabold'
                  : 'text-slate-400 hover:text-slate-600 font-medium'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'scores' ? 'bg-indigo-50 shadow-inner' : ''}`}>
                <Award className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Nilai</span>
            </button>

            <button
              onClick={() => setActiveTab('employee_dashboard')}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all duration-200 active:scale-90 ${
                activeTab === 'employee_dashboard' || activeTab === 'employee_history'
                  ? 'text-indigo-600 font-extrabold'
                  : 'text-slate-400 hover:text-slate-600 font-medium'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'employee_dashboard' || activeTab === 'employee_history' ? 'bg-indigo-50 shadow-inner' : ''}`}>
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Ikuti Ujian</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveTab('employee_dashboard')}
              className={`flex flex-col items-center justify-center py-1 px-5 rounded-2xl transition-all duration-200 active:scale-90 ${
                activeTab === 'employee_dashboard'
                  ? 'text-indigo-600 font-extrabold'
                  : 'text-slate-400 hover:text-slate-600 font-medium'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'employee_dashboard' ? 'bg-indigo-50 shadow-inner' : ''}`}>
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Ujian Saya</span>
            </button>

            <button
              onClick={() => setActiveTab('employee_history')}
              className={`flex flex-col items-center justify-center py-1 px-5 rounded-2xl transition-all duration-200 active:scale-90 ${
                activeTab === 'employee_history'
                  ? 'text-indigo-600 font-extrabold'
                  : 'text-slate-400 hover:text-slate-600 font-medium'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'employee_history' ? 'bg-indigo-50 shadow-inner' : ''}`}>
                <History className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Riwayat Nilai</span>
            </button>
          </>
        )}
      </div>

      {/* iPhone Home Bar Pill Indicator */}
      <div className="w-32 h-1 bg-slate-300 rounded-full mx-auto mt-2 opacity-60"></div>
    </div>
  );
};

