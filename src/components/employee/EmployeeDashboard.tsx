import React, { useState } from 'react';
import { User, ExamPackage, Question, ExamAttempt } from '../../types';
import { 
  BookOpen, 
  Clock, 
  Award, 
  CheckCircle2, 
  Play, 
  FileCheck, 
  Tag, 
  AlertCircle,
  RotateCcw,
  Lock,
  ChevronDown
} from 'lucide-react';

interface EmployeeDashboardProps {
  currentUser: User;
  exams: ExamPackage[];
  questions: Question[];
  attempts: ExamAttempt[];
  onStartExam: (exam: ExamPackage) => void;
  onViewResultDetail: (attempt: ExamAttempt) => void;
  activeTab: string;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  currentUser,
  exams,
  questions,
  attempts,
  onStartExam,
  onViewResultDetail,
  activeTab
}) => {
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  // Filter attempts for this current employee
  const myAttempts = attempts.filter(a => a.userId === currentUser.id);

  const totalTaken = myAttempts.length;
  const passedCount = myAttempts.filter(a => a.passed).length;
  const myAvgScore = totalTaken > 0
    ? Math.round(myAttempts.reduce((acc, curr) => acc + curr.score, 0) / totalTaken)
    : 0;

  const availableExams = exams.filter(e => {
    const isStatusOk = e.status === 'active' || e.status === 'closed';
    if (!isStatusOk) return false;
    const userCompany = currentUser?.company || 'BANK';
    const examScope = e.scope || 'BANK';
    return userCompany === 'ALL' || examScope === 'ALL' || examScope === userCompany;
  });
  const categories = Array.from(new Set(availableExams.map(e => e.category)));

  const filteredExams = availableExams.filter(e => 
    categoryFilter === 'all' || e.category === categoryFilter
  );

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-zinc-200">
      
      {/* Welcome & Personal Stats Banner - Clean iOS Light Card (Adaptive Instagram Dark) */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 p-4 sm:p-6 rounded-2xl shadow-sm shadow-slate-100/50 dark:shadow-none space-y-4 transition-colors duration-200">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-12 sm:w-14 h-12 sm:h-14 rounded-2xl bg-indigo-50 dark:bg-zinc-800 text-indigo-700 dark:text-zinc-200 border border-indigo-100 dark:border-zinc-700 shadow-sm flex items-center justify-center font-bold text-base sm:text-lg shrink-0 overflow-hidden">
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              currentUser.name.substring(0, 2).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
                Selamat Datang, {currentUser.name}
              </h1>
              <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/60 rounded-full uppercase whitespace-nowrap w-fit">
                {currentUser.department}
              </span>
            </div>
             <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
              Portal Ujian Karyawan & Evaluasi Kompetensi
            </p>
          </div>
        </div>

        {/* Stat Cards - Responsive Grid */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
          <div className="bg-slate-50/50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800 p-2.5 sm:p-4 rounded-xl text-center transition-colors duration-200">
            <div className="text-slate-400 dark:text-zinc-500 text-[8px] sm:text-[10px] font-bold uppercase tracking-wider">Selesai</div>
            <div className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5 sm:mt-1">{totalTaken}</div>
          </div>

          <div className="bg-slate-50/50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800 p-2.5 sm:p-4 rounded-xl text-center transition-colors duration-200">
            <div className="text-slate-400 dark:text-zinc-500 text-[8px] sm:text-[10px] font-bold uppercase tracking-wider">Rata-rata</div>
            <div className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5 sm:mt-1">{myAvgScore}</div>
          </div>

          <div className="bg-slate-50/50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800 p-2.5 sm:p-4 rounded-xl text-center transition-colors duration-200">
            <div className="text-slate-400 dark:text-zinc-500 text-[8px] sm:text-[10px] font-bold uppercase tracking-wider">Lulus</div>
            <div className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5 sm:mt-1">{passedCount}</div>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: AVAILABLE EXAMS CATALOG */}
      {activeTab === 'employee_dashboard' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
               <h2 className="text-base font-bold text-slate-900 dark:text-white">Daftar Paket Ujian Wajib & Opsional</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Pilih ujian di bawah ini untuk memulai evaluasi otomatis</p>
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-indigo-500 shadow-sm"
            >
              <option value="all" className="dark:bg-zinc-900">Semua Kategori ({availableExams.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat} className="dark:bg-zinc-900">{cat}</option>
              ))}
            </select>
          </div>

          {/* Helper Function to Render Exam Card */}
          {(() => {
            const renderExamRow = (exam: ExamPackage) => {
              const examQCount = questions.filter(q => q.examId === exam.id).length;
              const prevAttempt = myAttempts.find(a => a.examId === exam.id);
              const isClosed = exam.status === 'closed';

              return (
                <div
                  key={exam.id}
                  className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all group shadow-sm hover:shadow-md"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 rounded-lg border border-indigo-100/60 dark:border-indigo-900/40 flex items-center space-x-1 shrink-0">
                        <Tag className="w-3 h-3" />
                        <span>{exam.category}</span>
                      </span>
                      {isClosed && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase bg-rose-50/80 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 flex items-center space-x-1 shrink-0">
                          <Lock className="w-3 h-3" />
                          <span>Sesi Ditutup</span>
                        </span>
                      )}
                      {prevAttempt && (
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase flex items-center space-x-1 shrink-0 ${
                          prevAttempt.passed
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40'
                            : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40'
                        }`}>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Pernah Tes ({prevAttempt.score} pts)</span>
                        </span>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                      {exam.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                      {exam.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6 shrink-0 sm:px-5 sm:border-l border-slate-100 dark:border-zinc-800">
                    <div className="text-center sm:text-left">
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Durasi</div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{exam.durationMinutes}m</div>
                    </div>
                    <div className="text-center sm:text-left">
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Soal</div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{examQCount}</div>
                    </div>
                    <div className="text-center sm:text-left">
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Lulus</div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{exam.passingScore}%</div>
                    </div>
                  </div>

                  <div className="shrink-0 sm:w-36">
                    <button
                      onClick={() => onStartExam(exam)}
                      disabled={examQCount === 0 || isClosed || !!prevAttempt}
                      className={`w-full py-2.5 px-3 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                        isClosed
                          ? 'bg-slate-50 dark:bg-zinc-950 text-slate-400 dark:text-zinc-600 border border-slate-200 dark:border-zinc-800 cursor-not-allowed'
                          : examQCount === 0
                          ? 'bg-slate-100 dark:bg-zinc-900 text-slate-400 border border-slate-200 dark:border-zinc-800 cursor-not-allowed'
                          : prevAttempt
                          ? 'bg-emerald-50 dark:bg-zinc-950 border border-emerald-200/50 dark:border-zinc-800 text-emerald-600 dark:text-emerald-500 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm hover:shadow active:scale-95'
                      }`}
                    >
                      {isClosed ? (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Ditutup</span>
                        </>
                      ) : examQCount === 0 ? (
                        <span>Belum Siap</span>
                      ) : prevAttempt ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Selesai</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Kerjakan</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            };

            const activeExams = filteredExams.filter(e => e.status === 'active' && !myAttempts.find(a => a.examId === e.id));
            const archivedExams = filteredExams.filter(e => e.status === 'closed' || !!myAttempts.find(a => a.examId === e.id));

            return (
              <>
                <div className="flex flex-col gap-3">
                  {activeExams.length > 0 ? (
                    activeExams.map(renderExamRow)
                  ) : (
                    <div className="py-10 text-center bg-slate-50/50 dark:bg-zinc-900/30 rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-800">
                      <p className="text-slate-500 dark:text-zinc-400 text-sm font-medium">Tidak ada ujian baru yang tersedia saat ini.</p>
                    </div>
                  )}
                </div>

                {archivedExams.length > 0 && (
                  <div className="mt-8">
                    <button 
                      onClick={() => setShowArchived(!showArchived)}
                      className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-700 dark:text-zinc-300 font-bold hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <span>Lihat Ujian yang Selesai & Ditutup ({archivedExams.length})</span>
                      <ChevronDown className={`w-5 h-5 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
                    </button>
                    {showArchived && (
                      <div className="flex flex-col gap-3 mt-3">
                        {archivedExams.map(renderExamRow)}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* VIEW MODE 2: EMPLOYEE EXAM HISTORY */}
      {activeTab === 'employee_history' && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Riwayat Pengerjaan & Hasil Nilai Saya</h2>

           <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm shadow-slate-100/50 dark:shadow-none">
            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
              {myAttempts.map((att) => (
                <div key={att.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/40 dark:hover:bg-zinc-950/40 transition-colors">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">{att.examTitle}</h3>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        att.passed
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40'
                          : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40'
                      }`}>
                        {att.passed ? 'LULUS' : 'TIDAK LULUS'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                      Diselesaikan pada: {new Date(att.completedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>

                  <div className="flex items-center space-x-4 shrink-0">
                    <div className="text-right">
                      <div className="text-xl font-black text-slate-800 dark:text-zinc-200">{att.score} <span className="text-xs font-normal text-slate-400 dark:text-zinc-500">/ 100</span></div>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                        Durasi: {Math.floor(att.durationSecondsUsed / 60)}m {att.durationSecondsUsed % 60}s
                      </span>
                    </div>

                    <button
                      onClick={() => onViewResultDetail(att)}
                      className="px-3.5 py-2 bg-slate-50 dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-800 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-bold transition-all"
                    >
                      Lihat Detail
                    </button>
                  </div>
                </div>
              ))}

              {myAttempts.length === 0 && (
                <div className="p-10 text-center text-slate-400 dark:text-zinc-500 text-xs">
                  Anda belum pernah mengerjakan ujian apapun. Silakan pilih ujian dari tab "Daftar Ujian Saya".
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
