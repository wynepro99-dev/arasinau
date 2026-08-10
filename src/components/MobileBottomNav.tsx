import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { 
  LayoutDashboard, 
  BookOpen, 
  Award, 
  History
} from 'lucide-react';
import { 
  motion, 
  AnimatePresence, 
  useMotionValue, 
  useTransform, 
  useSpring,
  useVelocity,
  animate,
  PanInfo,
  useDragControls
} from 'framer-motion';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  // Early return moved to bottom to prevent React Hook errors
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
        isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-zinc-400'
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

  // --- PHYSICS & INTERACTION LOGIC ---

  const x = useMotionValue(0);
  const width = useMotionValue(0);
  const xVelocity = useVelocity(x);
  const dragControls = useDragControls();
  
  // Smooth velocity for stable scaling
  const smoothVelocity = useSpring(xVelocity, { stiffness: 400, damping: 50 });
  
  // Liquid stretch based on velocity
  const scaleX = useTransform(smoothVelocity, [-1500, 0, 1500], [1.35, 1, 1.35]);

  // Specular highlight shift (parallax effect inside the bubble)
  const highlightX = useTransform(x, [0, 300], ['-30%', '130%']);

  // Move the bubble to the currently active tab
  const snapToActive = () => {
    const activeEl = buttonRefs.current[effectiveActiveTab];
    if (activeEl && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      const localX = elRect.left - containerRect.left;
      
      animate(x, localX, { type: 'spring', stiffness: 350, damping: 30, mass: 0.8 });
      animate(width, elRect.width, { type: 'spring', stiffness: 350, damping: 30, mass: 0.8 });
    }
  };

  // Snap to active element on mount and when dependencies change
  useEffect(() => {
    // Slight delay to ensure layout is calculated, especially when compact state changes
    const timer = setTimeout(() => {
      snapToActive();
    }, 50);
    return () => clearTimeout(timer);
  }, [effectiveActiveTab, isCompact, tabKeys.length]);

  const handleDragEnd = (event: any, info: PanInfo) => {
    if (!containerRef.current) return;
    
    const currentAbsoluteX = containerRef.current.getBoundingClientRect().left + x.get() + width.get() / 2;
    let closestKey = effectiveActiveTab;
    let minDistance = Infinity;

    tabKeys.forEach(key => {
      const el = buttonRefs.current[key];
      if (el) {
        const elRect = el.getBoundingClientRect();
        const center = elRect.left + elRect.width / 2;
        const dist = Math.abs(currentAbsoluteX - center);
        
        if (dist < minDistance) {
          minDistance = dist;
          closestKey = key;
        }
      }
    });

    if (closestKey !== effectiveActiveTab) {
      setActiveTab(closestKey); // The useEffect will handle snapping
    } else {
      snapToActive(); // Snap back to current if it hasn't changed
    }
  };

  if (!currentUser || isTakingExam) return null;

  return (
    <div 
      className="md:hidden fixed z-50 left-0 right-0 flex justify-center pointer-events-none" 
      style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <motion.div
        ref={containerRef}
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
          backdrop-blur-[24px] saturate-[2]
          bg-white/40 dark:bg-[#121212]/50
          border border-white/60 dark:border-white/10
          shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),inset_0_-1px_1px_rgba(0,0,0,0.05),0_12px_40px_rgba(0,0,0,0.1),0_4px_12px_rgba(0,0,0,0.05)]
          dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),inset_0_-1px_1px_rgba(0,0,0,0.3),0_12px_40px_rgba(0,0,0,0.6),0_4px_12px_rgba(0,0,0,0.3)]
        `}
      >
        {/* Top Edge Highlight for Thickness Impression */}
        <div className="absolute inset-0 rounded-[inherit] border-t-[1.5px] border-white/80 dark:border-white/15 pointer-events-none" />

        {/* The Draggable Liquid Bubble */}
        <motion.div
          drag="x"
          dragControls={dragControls}
          dragListener={false} // Only drag via controls
          dragConstraints={containerRef}
          dragElastic={0.15}
          dragDirectionLock 
          onDragEnd={handleDragEnd}
          style={{
            x,
            width,
            scaleX,
            position: 'absolute',
            top: isCompact ? '6px' : '10px',
            bottom: isCompact ? '6px' : '10px',
            borderRadius: 999,
          }}
          className={`
            z-0 pointer-events-none
            bg-white/90 dark:bg-white/15
            shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),0_4px_12px_rgba(0,0,0,0.08)]
            dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_2px_12px_rgba(0,0,0,0.3)]
          `}
        >
          {/* Specular Highlight inside Bubble */}
          <motion.div 
            className="absolute inset-0 rounded-full pointer-events-none opacity-50 dark:opacity-30"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
              backgroundPosition: highlightX,
              backgroundSize: '200% 100%',
              backgroundRepeat: 'no-repeat'
            }}
          />
        </motion.div>

        {tabKeys.map((key) => {
          const isActive = effectiveActiveTab === key;
          
          return (
            <motion.button
              key={key}
              ref={(el) => { buttonRefs.current[key] = el; }}
              layout="position"
              onPointerDown={(e) => {
                if (isActive) dragControls.start(e);
              }}
              onClick={() => setActiveTab(key)}
              className={`relative flex flex-col items-center justify-center rounded-full z-10 transition-transform active:scale-95 ${isActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
              style={{ flex: 1, minHeight: 44 }}
            >
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
                        isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-zinc-400'
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
