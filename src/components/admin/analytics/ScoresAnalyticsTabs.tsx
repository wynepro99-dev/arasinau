import React, { useEffect, useId, useRef, useState } from 'react';
import { Award, BarChart3 } from 'lucide-react';
import { ExamAttempt, ExamPackage, User } from '../../../types';
import { ScoresDashboard } from '../ScoresDashboard';
import { ExamAnalyticsDashboard } from './ExamAnalyticsDashboard';

type ToastFn = (msg: string, type?: 'success' | 'info' | 'error') => void;
type SubTab = 'scores' | 'analytics';

const SUBTAB_STORAGE_KEY = 'ara_scores_subtab';
const SUBTAB_ORDER: SubTab[] = ['scores', 'analytics'];
const SUBTAB_LABELS: Record<SubTab, string> = { scores: 'Scores', analytics: 'Analytics' };

function readSavedSubTab(): SubTab {
  try {
    return localStorage.getItem(SUBTAB_STORAGE_KEY) === 'analytics' ? 'analytics' : 'scores';
  } catch {
    return 'scores';
  }
}

interface ScoresAnalyticsTabsProps {
  currentUser: User;
  attempts: ExamAttempt[];
  exams: ExamPackage[];
  onRefresh?: () => void;
  onToast: ToastFn;
  /** Paket yang diminta langsung dibuka di tab Analytics (mis. tombol "Lihat Analisis"). */
  focusExamId?: string | null;
  onFocusHandled?: () => void;
}

/**
 * Tab Laporan Nilai: "Scores" = Rekap Nilai existing (ScoresDashboard, props sama persis),
 * "Analytics" = Analisis Paket Ujian.
 */
export const ScoresAnalyticsTabs: React.FC<ScoresAnalyticsTabsProps> = ({
  currentUser,
  attempts,
  exams,
  onRefresh,
  onToast,
  focusExamId,
  onFocusHandled,
}) => {
  const [subTab, setSubTab] = useState<SubTab>(() => (focusExamId ? 'analytics' : readSavedSubTab()));
  // Paket fokus untuk Analytics. `seq` naik saat ada permintaan paket lain agar dashboard dipasang ulang dengan paket itu.
  const [focus, setFocus] = useState<{ examId: string | null; seq: number }>(() => ({
    examId: focusExamId || null,
    seq: 0,
  }));
  const tabRefs = useRef<Record<SubTab, HTMLButtonElement | null>>({ scores: null, analytics: null });
  const baseId = useId();

  useEffect(() => {
    try {
      localStorage.setItem(SUBTAB_STORAGE_KEY, subTab);
    } catch {
      // storage diblokir / mode privat → tab tidak diingat
    }
  }, [subTab]);

  useEffect(() => {
    if (!focusExamId) return;
    setSubTab('analytics');
    setFocus((prev) => (prev.examId === focusExamId ? prev : { examId: focusExamId, seq: prev.seq + 1 }));
    onFocusHandled?.();
  }, [focusExamId]);

  const selectTab = (next: SubTab, moveFocus = false) => {
    if (next !== subTab) {
      setSubTab(next);
      // Paket fokus hanya untuk kunjungan itu; berikutnya dashboard memakai pilihan terakhirnya sendiri.
      if (next === 'scores') setFocus((prev) => (prev.examId ? { examId: null, seq: prev.seq } : prev));
    }
    if (moveFocus) tabRefs.current[next]?.focus();
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = SUBTAB_ORDER.indexOf(subTab);
    let next: SubTab | null = null;
    if (e.key === 'ArrowRight') next = SUBTAB_ORDER[(idx + 1) % SUBTAB_ORDER.length];
    else if (e.key === 'ArrowLeft') next = SUBTAB_ORDER[(idx - 1 + SUBTAB_ORDER.length) % SUBTAB_ORDER.length];
    else if (e.key === 'Home') next = SUBTAB_ORDER[0];
    else if (e.key === 'End') next = SUBTAB_ORDER[SUBTAB_ORDER.length - 1];
    if (!next) return;
    e.preventDefault();
    selectTab(next, true);
  };

  const tabId = (key: SubTab) => `${baseId}-tab-${key}`;
  const panelId = `${baseId}-panel`;

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Laporan Nilai"
        className="print:hidden flex w-full sm:w-fit items-center gap-1 p-1 bg-slate-100/80 dark:bg-zinc-900 rounded-2xl border border-slate-200/70 dark:border-zinc-800"
      >
        {SUBTAB_ORDER.map((key) => {
          const isActive = subTab === key;
          return (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              id={tabId(key)}
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(key)}
              onKeyDown={handleTabKeyDown}
              className={`flex-1 sm:flex-none sm:min-w-[8.5rem] flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-zinc-950/50'
              }`}
            >
              {key === 'scores' ? <Award className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
              <span>{SUBTAB_LABELS[key]}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(subTab)}>
        {subTab === 'scores' ? (
          <ScoresDashboard
            currentUser={currentUser}
            attempts={attempts}
            exams={exams}
            onRefresh={onRefresh}
            onToast={onToast}
          />
        ) : (
          <ExamAnalyticsDashboard
            key={focus.seq}
            currentUser={currentUser}
            exams={exams}
            initialExamId={focus.examId}
            onToast={onToast}
          />
        )}
      </div>
    </div>
  );
};
