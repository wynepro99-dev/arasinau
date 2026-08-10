import React, { useState, useEffect, useRef } from 'react';
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
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Dragging States for gestures
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);

  // System Dark Mode Detection
  const [isSystemDark, setIsSystemDark] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const isEgi = currentUser?.role === 'egi';
  const isKaryawan = currentUser?.role === 'karyawan';

  useEffect(() => {
    // Detect system prefers-color-scheme
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsSystemDark(mediaQuery.matches);

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      setIsSystemDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  // Dynamic Glow Customization based on Tab selection (For borders & rainbow chromatic lines)
  const getGlowColors = (tab: string) => {
    let key = tab;
    if (isAdmin && (tab === 'employee_dashboard' || tab === 'employee_history')) {
      key = 'employee_dashboard';
    }

    switch (key) {
      case 'dashboard': // Cyan / Light Blue
        return {
          gradientTop: 'from-cyan-500 via-sky-400 to-blue-500',
          gradientBottom: 'from-blue-500 via-sky-400 to-cyan-500',
          borderGlow: isSystemDark ? 'rgba(34, 211, 238, 0.25)' : 'rgba(6, 182, 212, 0.15)',
        };
      case 'exams': // Lime / Green
        return {
          gradientTop: 'from-emerald-500 via-green-400 to-lime-400',
          gradientBottom: 'from-lime-400 via-green-400 to-emerald-500',
          borderGlow: isSystemDark ? 'rgba(52, 211, 153, 0.25)' : 'rgba(16, 185, 129, 0.15)',
        };
      case 'scores': // Gold / Yellow
        return {
          gradientTop: 'from-amber-500 via-yellow-400 to-orange-500',
          gradientBottom: 'from-orange-500 via-yellow-400 to-amber-500',
          borderGlow: isSystemDark ? 'rgba(252, 211, 77, 0.25)' : 'rgba(245, 158, 11, 0.15)',
        };
      case 'employee_dashboard': // Magenta / Pink / Purple
      case 'employee_history':
        return {
          gradientTop: 'from-pink-500 via-rose-400 to-purple-500',
          gradientBottom: 'from-purple-500 via-rose-400 to-pink-500',
          borderGlow: isSystemDark ? 'rgba(244, 114, 182, 0.25)' : 'rgba(236, 72, 153, 0.15)',
        };
      case 'modules': // Indigo / Violet
      default:
        return {
          gradientTop: 'from-indigo-500 via-violet-400 to-fuchsia-500',
          gradientBottom: 'from-fuchsia-500 via-violet-400 to-indigo-500',
          borderGlow: isSystemDark ? 'rgba(167, 139, 250, 0.25)' : 'rgba(139, 92, 246, 0.15)',
        };
    }
  };

  const getButtonClass = (key: string) => {
    const isActive = (isAdmin || isEgi)
      ? (key === 'employee_dashboard' ? (activeTab === 'employee_dashboard' || activeTab === 'employee_history') : activeTab === key)
      : activeTab === key;

    if (isActive) {
      return `relative z-10 flex flex-col items-center justify-center pt-3 pb-2 px-3 rounded-full transition-all duration-250 active:scale-90 select-none ${
        (isAdmin || isKaryawan) ? 'min-w-[64px]' : 'min-w-[90px]'
      } text-slate-900 dark:text-zinc-100 font-black scale-[1.03] ${
        key === 'dashboard' ? 'dark:drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]' :
        key === 'exams' ? 'dark:drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]' :
        key === 'scores' ? 'dark:drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]' :
        'dark:drop-shadow-[0_0_8px_rgba(244,114,182,0.4)]'
      }`;
    }

    return `relative z-10 flex flex-col items-center justify-center pt-3 pb-2 px-3 rounded-full transition-all duration-250 active:scale-90 select-none ${
      (isAdmin || isKaryawan) ? 'min-w-[64px]' : 'min-w-[90px]'
    } text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 font-semibold`;
  };

  useEffect(() => {
    if (!currentUser || isTakingExam) return;

    let key = activeTab;
    if ((isAdmin || isEgi) && (activeTab === 'employee_dashboard' || activeTab === 'employee_history')) {
      key = 'employee_dashboard';
    }
    
    const activeEl = buttonRefs.current[key];
    if (activeEl) {
      const updatePosition = () => {
        setIndicatorStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
        });
      };

      // Set position immediately
      updatePosition();

      // Render delay fallback
      const timer = setTimeout(updatePosition, 50);
      
      window.addEventListener('resize', updatePosition);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [activeTab, currentUser, isTakingExam, isAdmin]);

  // Touch and Drag Gesture handlers
  const handleDragStart = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const localX = clientX - rect.left;
    setIsDragging(true);
    setDragX(localX);
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const localX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setDragX(localX);
  };

  const handleDragEnd = () => {
    if (!isDragging || !containerRef.current) return;
    setIsDragging(false);

    let closestKey = activeTab;
    let minDistance = Infinity;

    const keys = isAdmin 
      ? ['dashboard', 'exams', 'modules', 'scores', 'employee_dashboard'] 
      : isEgi 
        ? ['modules', 'scores', 'employee_dashboard']
        : ['employee_dashboard', 'employee_history', 'modules'];

    keys.forEach(key => {
      const el = buttonRefs.current[key];
      if (el) {
        const center = el.offsetLeft + el.offsetWidth / 2;
        const dist = Math.abs(dragX - center);
        if (dist < minDistance) {
          minDistance = dist;
          closestKey = key;
        }
      }
    });

    if (closestKey !== activeTab) {
      setActiveTab(closestKey);
    }
  };

  // Don't render bottom nav if user is not logged in or is currently taking an active exam
  if (!currentUser || isTakingExam) return null;

  const colors = getGlowColors(activeTab);
  const containerWidth = containerRef.current?.offsetWidth || 0;
  
  // Realtime indicator left style based on dragging gesture
  const currentLeft = isDragging
    ? Math.max(0, Math.min(dragX - indicatorStyle.width / 2, containerWidth - indicatorStyle.width))
    : indicatorStyle.left;

  return (
    <div className="md:hidden fixed bottom-5 left-4 right-4 z-40 bg-white/70 dark:bg-black/95 backdrop-blur-xl border border-slate-200/50 dark:border-zinc-800 rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.3)] px-3 py-1.5 animate-slide-up">
      <div 
        ref={containerRef}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
        onTouchEnd={handleDragEnd}
        onMouseDown={(e) => handleDragStart(e.clientX)}
        onMouseMove={(e) => handleDragMove(e.clientX)}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        className="relative flex items-center justify-around max-w-sm mx-auto cursor-grab active:cursor-grabbing select-none"
      >
        
        {/* Chromatic Aberration Liquid Glass Lens (Adaptive frosted glass theme) */}
        <div
          className={`absolute rounded-full pointer-events-none overflow-hidden z-0 ${
            isDragging ? 'transition-none' : 'transition-all duration-[320ms] ease-[cubic-bezier(0.25,0.8,0.25,1)]'
          }`}
          style={{
            left: currentLeft,
            width: indicatorStyle.width,
            top: '2px',
            bottom: '2px',
            backgroundColor: isSystemDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.45)',
            backdropFilter: 'blur(20px)',
            border: isSystemDark ? '1px solid rgba(255, 255, 255, 0.08)' : `1px solid ${colors.borderGlow}`,
            boxShadow: isSystemDark 
              ? 'inset 0 1px 1.5px rgba(255, 255, 255, 0.15), 0 0 16px rgba(255, 255, 255, 0.03), 0 8px 24px rgba(0, 0, 0, 0.4)'
              : 'inset 0 1px 1px rgba(255, 255, 255, 0.6), 0 6px 12px rgba(0, 0, 0, 0.05)',
          }}
        >
          {/* Top chromatic aberration rainbow line */}
          <div className={`absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r ${colors.gradientTop} opacity-95 transition-all duration-[320ms]`} />
          {/* Bottom chromatic aberration rainbow line */}
          <div className={`absolute bottom-0 left-0 right-0 h-[1.5px] bg-gradient-to-r ${colors.gradientBottom} opacity-95 transition-all duration-[320ms]`} />
        </div>

        {isAdmin ? (
          <>
            <button
              ref={(el) => { buttonRefs.current['dashboard'] = el; }}
              onClick={() => setActiveTab('dashboard')}
              className={getButtonClass('dashboard')}
            >
              <LayoutDashboard className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Overview</span>
            </button>

            <button
              ref={(el) => { buttonRefs.current['exams'] = el; }}
              onClick={() => setActiveTab('exams')}
              className={getButtonClass('exams')}
            >
              <BookOpen className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Ujian</span>
            </button>

            <button
              ref={(el) => { buttonRefs.current['modules'] = el; }}
              onClick={() => setActiveTab('modules')}
              className={getButtonClass('modules')}
            >
              <BookOpen className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Modul</span>
            </button>

            <button
              ref={(el) => { buttonRefs.current['scores'] = el; }}
              onClick={() => setActiveTab('scores')}
              className={getButtonClass('scores')}
            >
              <Award className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Nilai</span>
            </button>

            <button
              ref={(el) => { buttonRefs.current['employee_dashboard'] = el; }}
              onClick={() => setActiveTab('employee_dashboard')}
              className={getButtonClass('employee_dashboard')}
            >
              <BookOpen className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Ikut</span>
            </button>
          </>
        ) : isEgi ? (
          <>
            <button
              ref={(el) => { buttonRefs.current['modules'] = el; }}
              onClick={() => setActiveTab('modules')}
              className={getButtonClass('modules')}
            >
              <BookOpen className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Modul</span>
            </button>
            <button
              ref={(el) => { buttonRefs.current['scores'] = el; }}
              onClick={() => setActiveTab('scores')}
              className={getButtonClass('scores')}
            >
              <Award className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Nilai</span>
            </button>
            <button
              ref={(el) => { buttonRefs.current['employee_dashboard'] = el; }}
              onClick={() => setActiveTab('employee_dashboard')}
              className={getButtonClass('employee_dashboard')}
            >
              <BookOpen className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Ikut</span>
            </button>
          </>
        ) : (
          <>
            <button
              ref={(el) => { buttonRefs.current['employee_dashboard'] = el; }}
              onClick={() => setActiveTab('employee_dashboard')}
              className={getButtonClass('employee_dashboard')}
            >
              <BookOpen className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Ujian</span>
            </button>

            <button
              ref={(el) => { buttonRefs.current['employee_history'] = el; }}
              onClick={() => setActiveTab('employee_history')}
              className={getButtonClass('employee_history')}
            >
              <History className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Riwayat</span>
            </button>

            <button
              ref={(el) => { buttonRefs.current['modules'] = el; }}
              onClick={() => setActiveTab('modules')}
              className={getButtonClass('modules')}
            >
              <BookOpen className="w-5 h-5 transition-transform duration-200" />
              <span className="text-[10px] mt-1 tracking-tight">Modul</span>
            </button>
          </>
        )}
      </div>

      {/* iPhone Home Bar Pill Indicator */}
      <div className="w-32 h-1 bg-slate-300 dark:bg-zinc-800 rounded-full mx-auto mt-2 opacity-60"></div>
    </div>
  );
};
