import React, { useState } from 'react';
import { User, ExamPackage, Question, ExamAttempt } from '../../types';
import { getQuestionsByExamId } from '../../lib/storage';
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
  Lock
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

  // Filter attempts for this current employee
  const myAttempts = attempts.filter(a => a.userId === currentUser.id);

  const totalTaken = myAttempts.length;
  const passedCount = myAttempts.filter(a => a.passed).length;
  const myAvgScore = totalTaken > 0
    ? Math.round(myAttempts.reduce((acc, curr) => acc + curr.score, 0) / totalTaken)
    : 0;

  const availableExams = exams.filter(e => e.status === 'active' || e.status === 'closed');
  const categories = Array.from(new Set(availableExams.map(e => e.category)));

  const filteredExams = availableExams.filter(e => 
    categoryFilter === 'all' || e.category === categoryFilter
  );

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Welcome & Personal Stats Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950/40 border border-slate-800 p-4 sm:p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-12 sm:w-14 h-12 sm:h-14 rounded-2xl bg-indigo-600/30 text-indigo-300 border-2 border-indigo-500/40 shadow-lg flex items-center justify-center font-bold text-base sm:text-lg shrink-0">
            {currentUser.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
              <h1 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">Selamat Datang, {currentUser.name}</h1>
              <span className="px-2 py-0.5 text-[9px] sm:text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full uppercase whitespace-nowrap w-fit">
                {currentUser.department}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Portal Ujian Karyawan & Evaluasi Kompetensi
            </p>
          </div>
        </div>

        {/* Stat Cards - Responsive Grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-slate-900/80 border border-slate-800 p-2.5 sm:p-4 rounded-lg text-center">
            <div className="text-slate-400 text-[8px] sm:text-[10px] font-semibold uppercase">Selesai</div>
            <div className="text-lg sm:text-2xl font-black text-white mt-1 sm:mt-2">{totalTaken}</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-2.5 sm:p-4 rounded-lg text-center">
            <div className="text-slate-400 text-[8px] sm:text-[10px] font-semibold uppercase">Rata-rata</div>
            <div className="text-lg sm:text-2xl font-black text-emerald-400 mt-1 sm:mt-2">{myAvgScore}</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-2.5 sm:p-4 rounded-lg text-center">
            <div className="text-slate-400 text-[8px] sm:text-[10px] font-semibold uppercase">Lulus</div>
            <div className="text-lg sm:text-2xl font-black text-teal-400 mt-1 sm:mt-2">{passedCount}</div>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: AVAILABLE EXAMS CATALOG */}
      {activeTab === 'employee_dashboard' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white">Daftar Paket Ujian Wajib & Opsional</h2>
              <p className="text-xs text-slate-400">Pilih ujian di bawah ini untuk memulai evaluasi otomatis</p>
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Semua Kategori ({availableExams.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredExams.map((exam) => {
              const examQCount = questions.filter(q => q.examId === exam.id).length;
              const prevAttempt = myAttempts.find(a => a.examId === exam.id);
              const isClosed = exam.status === 'closed';

              return (
                <div
                  key={exam.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between transition-all group shadow-md relative"
                >
                  <div>
                    {/* Category & Pass Grade badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-1 text-[10px] font-semibold bg-slate-800 text-slate-300 rounded-lg border border-slate-700/60 flex items-center space-x-1">
                        <Tag className="w-3 h-3 text-emerald-400" />
                        <span>{exam.category}</span>
                      </span>

                      <div className="flex items-center space-x-1.5">
                        {isClosed && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center space-x-1">
                            <Lock className="w-3 h-3" />
                            <span>Sesi Ditutup</span>
                          </span>
                        )}

                        {prevAttempt && (
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider flex items-center space-x-1 ${
                            prevAttempt.passed
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}>
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Pernah Tes ({prevAttempt.score} pts)</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors leading-snug">
                      {exam.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-2 leading-relaxed">
                      {exam.description}
                    </p>

                    {/* Metadata Specs */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-[11px]">
                      <div className="bg-slate-850 p-2 rounded-xl">
                        <div className="text-slate-400">Durasi</div>
                        <div className="font-bold text-white mt-0.5">{exam.durationMinutes} mnt</div>
                      </div>
                      <div className="bg-slate-850 p-2 rounded-xl">
                        <div className="text-slate-400">Jumlah Soal</div>
                        <div className="font-bold text-white mt-0.5">{examQCount} soal</div>
                      </div>
                      <div className="bg-slate-850 p-2 rounded-xl">
                        <div className="text-slate-400">Min. Lulus</div>
                        <div className="font-bold text-emerald-400 mt-0.5">{exam.passingScore}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Start Button */}
                  <div className="mt-5 pt-3 border-t border-slate-800">
                    <button
                      onClick={() => onStartExam(exam)}
                      disabled={examQCount === 0 || isClosed}
                      className={`w-full py-2.5 px-4 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-2 ${
                        isClosed
                          ? 'bg-rose-950/40 text-rose-300 border border-rose-800/50 cursor-not-allowed'
                          : examQCount === 0
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-98'
                      }`}
                    >
                      {isClosed ? (
                        <>
                          <Lock className="w-4 h-4 text-rose-400" />
                          <span>Sesi Ujian Ditutup oleh Admin</span>
                        </>
                      ) : examQCount === 0 ? (
                        <span>Soal Belum Tersedia</span>
                      ) : prevAttempt ? (
                        <>
                          <RotateCcw className="w-4 h-4" />
                          <span>Ulangi Ujian Ini</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" />
                          <span>Mulai Ujian Sekarang</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: EMPLOYEE EXAM HISTORY */}
      {activeTab === 'employee_history' && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-white">Riwayat Pengerjaan & Hasil Nilai Saya</h2>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
            <div className="divide-y divide-slate-800">
              {myAttempts.map((att) => (
                <div key={att.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-850/50 transition-colors">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-white">{att.examTitle}</h3>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        att.passed
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {att.passed ? 'LULUS' : 'TIDAK LULUS'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1">
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
                      <div className="text-xl font-black text-white">{att.score} <span className="text-xs font-normal text-slate-400">/ 100</span></div>
                      <span className="text-[10px] text-slate-500">
                        Durasi: {Math.floor(att.durationSecondsUsed / 60)}m {att.durationSecondsUsed % 60}s
                      </span>
                    </div>

                    <button
                      onClick={() => onViewResultDetail(att)}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-emerald-400 border border-slate-700 rounded-xl text-xs font-semibold transition-all"
                    >
                      Lihat Detail
                    </button>
                  </div>
                </div>
              ))}

              {myAttempts.length === 0 && (
                <div className="p-10 text-center text-slate-400 text-xs">
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
