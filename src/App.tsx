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
  const [currentUser, setCurrentUserTab] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Data State
  const [exams, setExams] = useState<ExamPackage[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);

  // Modals & Active Screens
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [activeQuestionExam, setActiveQuestionExam] = useState<ExamPackage | null>(null);
  const [activeTakingExam, setActiveTakingExam] = useState<ExamPackage | null>(null);
  const [activeResultAttempt, setActiveResultAttempt] = useState<ExamAttempt | null>(null);

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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white">
      
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

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-4 mt-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 Ara Sinau Enterprise • Sistem Manajemen & Evaluasi Ujian Online</p>
          <div className="flex items-center space-x-4 text-[11px] text-slate-500">
            <span>Standar Kelulusan: 70% - 80%</span>
            <span>•</span>
            <span className="text-indigo-600 font-bold">Terhubung Realtime</span>
          </div>
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
