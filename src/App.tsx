import React, { useState, useEffect } from 'react';
import { User, ExamPackage, Question, ExamAttempt } from './types';
import { 
  initStorage, 
  getCurrentUser, 
  setCurrentUser, 
  getExams, 
  getQuestions, 
  getAttempts, 
  getQuestionsByExamId,
  startSupabaseAutoSync
} from './lib/storage';

// Components
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { ExamManagement } from './components/admin/ExamManagement';
import { QuestionEditorModal } from './components/admin/QuestionEditorModal';
import { ScoresDashboard } from './components/admin/ScoresDashboard';
import { EmployeeDashboard } from './components/employee/EmployeeDashboard';
import { ExamTakingScreen } from './components/employee/ExamTakingScreen';
import { ExamResultModal } from './components/employee/ExamResultModal';
import { Toast } from './components/Toast';
import { MobileBottomNav } from './components/MobileBottomNav';

export default function App() {
  const [currentUser, setCurrentUserTab] = useState<User | null>(() => {
    return getCurrentUser();
  });
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const user = getCurrentUser();
      if (user) {
        if (user.role === 'karyawan') return 'employee_dashboard';
        try {
          const savedTab = localStorage.getItem('ara_active_tab');
          return savedTab || 'dashboard';
        } catch {
          return 'dashboard';
        }
      }
    }
    return 'dashboard';
  });

  // Data State
  const [exams, setExams] = useState<ExamPackage[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);

  // Modals & Active Screens
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [activeQuestionExam, setActiveQuestionExam] = useState<ExamPackage | null>(null);
  const [activeTakingExam, setActiveTakingExam] = useState<ExamPackage | null>(null);
  const [activeResultAttempt, setActiveResultAttempt] = useState<ExamAttempt | null>(null);
  
  // Loading Screen State
  const [showLoading, setShowLoading] = useState(true);
  const [loadingHidden, setLoadingHidden] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ msg, type });
  };

  const loadData = () => {
    initStorage();
    const user = getCurrentUser();
    setCurrentUserTab(user);
    setExams(getExams());
    setQuestions(getQuestions());
    setAttempts(getAttempts());

    if (user) {
      if (user.role === 'karyawan' && (activeTab === 'dashboard' || activeTab === 'exams' || activeTab === 'scores')) {
        setActiveTab('employee_dashboard');
      }
    }
  };

  useEffect(() => {
    loadData();
    // Auto sync from Supabase immediately & subscribe to real-time additions/updates
    startSupabaseAutoSync(() => {
      setExams(getExams());
      setQuestions(getQuestions());
      setAttempts(getAttempts());
    });
  }, []);

  // Persist and restore activeTab, activeQuestionExam, and activeTakingExam in localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedTab = localStorage.getItem('ara_active_tab');
        if (savedTab) {
          // Only restore if role is compatible
          const user = getCurrentUser();
          if (user) {
            const isKaryawan = user.role === 'karyawan';
            const isAdminTab = savedTab === 'dashboard' || savedTab === 'exams' || savedTab === 'scores';
            if (isKaryawan && isAdminTab) {
              setActiveTab('employee_dashboard');
            } else {
              setActiveTab(savedTab);
            }
          } else {
            setActiveTab(savedTab);
          }
        }
      } catch (e) {
        console.warn('Failed to access localStorage:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && activeTab) {
      try {
        localStorage.setItem('ara_active_tab', activeTab);
      } catch (e) {}
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (activeQuestionExam) {
          localStorage.setItem('ara_active_question_exam_id', activeQuestionExam.id);
        } else {
          localStorage.removeItem('ara_active_question_exam_id');
        }
      } catch (e) {}
    }
  }, [activeQuestionExam]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (activeTakingExam) {
          localStorage.setItem('ara_active_taking_exam_id', activeTakingExam.id);
        } else {
          localStorage.removeItem('ara_active_taking_exam_id');
        }
      } catch (e) {}
    }
  }, [activeTakingExam]);

  useEffect(() => {
    if (exams.length > 0) {
      try {
        const savedQExamId = localStorage.getItem('ara_active_question_exam_id');
        if (savedQExamId && !activeQuestionExam) {
          const found = exams.find(e => e.id === savedQExamId);
          if (found) setActiveQuestionExam(found);
        }

        const savedTakingExamId = localStorage.getItem('ara_active_taking_exam_id');
        if (savedTakingExamId && !activeTakingExam) {
          const found = exams.find(e => e.id === savedTakingExamId);
          if (found) setActiveTakingExam(found);
        }
      } catch (e) {
        console.warn('Failed to read active IDs from localStorage:', e);
      }
    }
  }, [exams]);

  // Loading Screen Transition Effects on Mount
  useEffect(() => {
    document.body.classList.add('loading-active');
    
    // Smooth transition timers
    const fadeTimer = setTimeout(() => {
      setLoadingHidden(true);
      document.body.classList.remove('loading-active');
    }, 1200);

    const removeTimer = setTimeout(() => {
      setShowLoading(false);
    }, 1800);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      document.body.classList.remove('loading-active');
    };
  }, []);

  const handleSelectUser = (user: User | null) => {
    setCurrentUser(user);
    setCurrentUserTab(user);
    if (user) {
      if (user.role === 'admin') {
        setActiveTab('dashboard');
      } else {
        setActiveTab('employee_dashboard');
      }
    } else {
      setActiveTab('dashboard');
    }
    loadData();
  };

  const handleStartExam = (exam: ExamPackage) => {
    const qList = getQuestionsByExamId(exam.id);
    if (qList.length === 0) {
      showToast('Soal untuk ujian ini belum ditambahkan oleh Admin.', 'error');
      return;
    }
    setActiveTakingExam(exam);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-zinc-100 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      
      {/* Loading Screen Overlay */}
      {showLoading && (
        <div 
          id="meta-loading-screen" 
          className={loadingHidden ? 'hidden' : ''}
        >
          <img 
            src="https://antarrumeksaarta.vittoriaproperti.com/uploads/profile/d96a287d-a983-4e54-8719-b46c7a2f3694.png" 
            alt="Antar Rumeksa Arta Logo" 
            className="loading-logo" 
          />
        </div>
      )}
      
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        onSelectUser={handleSelectUser}
        onOpenAuthModal={() => setIsAuthOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onToast={showToast}
      />

      {/* Main Container Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-6">
        
        {/* If taking an active live exam */}
        {activeTakingExam && currentUser ? (
          <ExamTakingScreen
            currentUser={currentUser}
            exam={activeTakingExam}
            questions={getQuestionsByExamId(activeTakingExam.id)}
            onCancelExam={() => setActiveTakingExam(null)}
            onFinishExam={(attempt) => {
              setActiveTakingExam(null);
              setAttempts(getAttempts());
              setActiveResultAttempt(attempt);
            }}
            onToast={showToast}
          />
        ) : (
          <>
            {/* ADMIN PANELS */}
            {currentUser && currentUser.role === 'admin' && (
              <>
                {activeTab === 'dashboard' && (
                  <AdminDashboard
                    exams={exams}
                    questions={questions}
                    attempts={attempts}
                    onNavigateTab={setActiveTab}
                    onOpenCreateExam={() => setActiveTab('exams')}
                    onViewAttemptDetail={(att) => {
                      setActiveResultAttempt(att);
                    }}
                  />
                )}

                {activeTab === 'exams' && (
                  <ExamManagement
                    currentUser={currentUser}
                    exams={exams}
                    questions={questions}
                    onRefresh={loadData}
                    onManageQuestions={(exam) => setActiveQuestionExam(exam)}
                    onToast={showToast}
                  />
                )}

                {activeTab === 'scores' && (
                  <ScoresDashboard
                    attempts={attempts}
                    exams={exams}
                    onRefresh={loadData}
                    onToast={showToast}
                  />
                )}

                {(activeTab === 'employee_dashboard' || activeTab === 'employee_history') && (
                  <EmployeeDashboard
                    currentUser={currentUser}
                    exams={exams}
                    questions={questions}
                    attempts={attempts}
                    onStartExam={handleStartExam}
                    onViewResultDetail={(att) => setActiveResultAttempt(att)}
                    activeTab={activeTab}
                  />
                )}
              </>
            )}

            {/* EMPLOYEE PANELS */}
            {currentUser && currentUser.role === 'karyawan' && (
              <EmployeeDashboard
                currentUser={currentUser}
                exams={exams}
                questions={questions}
                attempts={attempts}
                onStartExam={handleStartExam}
                onViewResultDetail={(att) => setActiveResultAttempt(att)}
                activeTab={activeTab}
              />
            )}

            {/* IF NOT LOGGED IN: SHOW ARA SINAU LOGIN PORTAL */}
            {!currentUser && (
              <AuthModal
                isOpen={true}
                isInlineScreen={true}
                onLoginSuccess={(u) => handleSelectUser(u)}
                onToast={showToast}
              />
            )}
          </>
        )}

      </main>

      <footer className="bg-white dark:bg-black border-t border-slate-200/80 dark:border-zinc-800/80 py-4 mt-8 text-center text-xs text-slate-500 dark:text-zinc-500 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 flex justify-center">
          <p>© 2026 Ara Sinau Enterprise</p>
        </div>
      </footer>

      {/* MODALS */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(u) => handleSelectUser(u)}
        onToast={showToast}
      />

      {activeQuestionExam && (
        <QuestionEditorModal
          exam={activeQuestionExam}
          isOpen={!!activeQuestionExam}
          onClose={() => setActiveQuestionExam(null)}
          onRefresh={loadData}
          onToast={showToast}
        />
      )}

      {activeResultAttempt && (
        <ExamResultModal
          attempt={activeResultAttempt}
          questions={getQuestionsByExamId(activeResultAttempt.examId)}
          onClose={() => setActiveResultAttempt(null)}
          onRetakeExam={() => {
            const exam = exams.find(e => e.id === activeResultAttempt.examId);
            setActiveResultAttempt(null);
            if (exam && currentUser) {
              handleStartExam(exam);
            }
          }}
        />
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR (IPHONE STYLE) */}
      <MobileBottomNav
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isTakingExam={!!activeTakingExam}
      />

    </div>
  );
}
