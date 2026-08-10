import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { 
  LayoutDashboard, 
  BookOpen, 
  Award, 
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiquidGlassNavigation } from '../hooks/useLiquidGlassNavigation';

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
  const { navState } = useLiquidGlassNavigation(40);
  const isCompact = navState === 'compact';

  const [isSystemDark, setIsSystemDark] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const isEgi = currentUser?.role === 'egi';
  const isKaryawan = currentUser?.role === 'karyawan';

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsSystemDark(mediaQuery.matches);
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      setIsSystemDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, []);

  if (!currentUser || isTakingExam) return null;

  // Configuration of tabs based on role
  let tabKeys: string[] = [];
  if (isAdmin) {
    tabKeys = ['dashboard', 'exams', 'modules', 'scores', 'employee_dashboard'];
  } else if (isEgi) {
    tabKeys = ['employee_dashboard', 'modules', 'employee_history', 'scores'];
  } else {
    tabKeys = ['employee_dashboard', 'employee_history', 'modules'];
  }

  // Fallback if current activeTab is not explicitly a button in the nav
  let effectiveActiveTab = activeTab;
  if (!tabKeys.includes(activeTab)) {
    if (activeTab === 'employee_history' && isAdmin) {
      effectiveActiveTab = 'employee_dashboard';
    } else if (tabKeys.length > 0) {
      effectiveActiveTab = tabKeys[0];
    }
  }

  const getTabLabel = (key: string) => {
    switch (key) {
      case 'dashboard': return 'Overview';
      case 'exams': return 'Ujian';
      case 'modules': return 'Modul';
      case 'scores': return isAdmin ? 'Nilai' : 'Laporan';
      case 'employee_dashboard': return isAdmin ? 'Ikut' : 'Ujian';
      case 'employee_history': return 'Riwayat';
      default: return key;
    }
  };

  const getTabIcon = (key: string, isActive: boolean) => {
    const iconProps = { 
      className: `w-[22px] h-[22px] transition-colors duration-300 ${
        isActive ? 'text-white dark:text-zinc-50' : 'text-slate-500 dark:text-zinc-400'
      }` 
    };
    switch (key) {
      case 'dashboard': return <LayoutDashboard {...iconProps} />;
      case 'employee_history': return <History {...iconProps} />;
      case 'scores': return <Award {...iconProps} />;
      case 'exams':
      case 'modules':
      case 'employee_dashboard':
      default:
        return <BookOpen {...iconProps} />;
    }
  };

  return (
    <div 
      className="md:hidden fixed z-50 left-0 right-0 flex justify-center pointer-events-none" 
      style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <motion.div
        layout
        initial={false}
        animate={{
          width: isCompact ? (tabKeys.length * 64 + 16) : 'calc(100% - 24px)',
          maxWidth: isCompact ? 360 : 500,
          padding: isCompact ? '6px 8px' : '10px 12px',
          borderRadius: 48
        }}
        transition={{
          type: 'spring',
          stiffness: 350,
          damping: 30,
          mass: 0.8
        }}
        className={`
          pointer-events-auto
          relative flex items-center justify-between
          overflow-hidden
          backdrop-blur-2xl saturate-[1.8]
          bg-white/50 dark:bg-[#151515]/75
          border border-white/50 dark:border-white/10
          shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),inset_0_-1px_1px_rgba(0,0,0,0.05),0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.04)]
          dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),inset_0_-1px_1px_rgba(0,0,0,0.3),0_12px_40px_rgba(0,0,0,0.4),0_2px_12px_rgba(0,0,0,0.2)]
        `}
      >
        {/* Top Edge Highlight for Thickness Impression */}
        <div className="absolute inset-0 rounded-[inherit] border-t-[1.5px] border-white/70 dark:border-white/15 pointer-events-none" />

        {tabKeys.map((key) => {
          const isActive = effectiveActiveTab === key;
          
          return (
            <motion.button
              key={key}
              layout="position"
              onClick={() => setActiveTab(key)}
              className="relative flex flex-col items-center justify-center rounded-full z-10 transition-transform active:scale-90"
              style={{ flex: 1, minHeight: 44 }}
            >
              {isActive && (
                <motion.div
                  layoutId="liquidActiveIndicator"
                  className="absolute inset-0 rounded-full z-0 bg-black/80 dark:bg-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_2px_8px_rgba(0,0,0,0.15)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.9 }}
                />
              )}
              
              <motion.div layout="position" className="relative z-10 flex flex-col items-center justify-center pointer-events-none">
                {getTabIcon(key, isActive)}
                
                <AnimatePresence>
                  {!isCompact && (
                    <motion.span
                      initial={{ opacity: 0, height: 0, scale: 0.8 }}
                      animate={{ opacity: 1, height: 'auto', scale: 1 }}
                      exit={{ opacity: 0, height: 0, scale: 0.8 }}
                      transition={{ duration: 0.15, ease: "easeInOut" }}
                      className={`text-[10px] font-semibold tracking-tight mt-1 truncate max-w-[64px] px-1 ${
                        isActive ? 'text-white dark:text-zinc-50' : 'text-slate-500 dark:text-zinc-400'
                      }`}
                    >
                      {getTabLabel(key)}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
};
