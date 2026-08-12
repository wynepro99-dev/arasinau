import React, { useMemo } from 'react';
import { X, Trophy, Medal } from 'lucide-react';
import { ExamAttempt, ExamPackage } from '../../types';

interface BankRankingModalProps {
  attempts: ExamAttempt[];
  exams: ExamPackage[];
  onClose: () => void;
}

export const BankRankingModal: React.FC<BankRankingModalProps> = ({ attempts, exams, onClose }) => {
  const ranking = useMemo(() => {
    // 1. Get all BANK exams
    const bankExamIds = new Set(exams.filter(e => e.scope === 'BANK').map(e => e.id));

    // 2. Filter attempts to only those for BANK exams
    const bankAttempts = attempts.filter(a => bankExamIds.has(a.examId));

    // 3. Aggregate per user
    const userStats: Record<string, { userId: string; userName: string; userDepartment: string; totalScore: number; count: number }> = {};

    bankAttempts.forEach(a => {
      if (!userStats[a.userId]) {
        userStats[a.userId] = {
          userId: a.userId,
          userName: a.userName,
          userDepartment: a.userDepartment || 'Lainnya',
          totalScore: 0,
          count: 0
        };
      }
      userStats[a.userId].totalScore += a.score;
      userStats[a.userId].count += 1;
    });

    // 4. Calculate average and sort
    const ranked = Object.values(userStats).map(u => ({
      ...u,
      averageScore: u.count > 0 ? Math.round(u.totalScore / u.count) : 0
    }));

    ranked.sort((a, b) => {
      if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
      return b.count - a.count;
    });

    return ranked;
  }, [attempts, exams]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white dark:bg-zinc-900 z-10 rounded-t-2xl">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Ranking Nilai BANK</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">Peringkat karyawan berdasarkan nilai rata-rata pada ujian ber-scope BANK.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600 dark:text-zinc-300 border-collapse">
                <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-400 font-semibold border-b border-slate-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-5 py-4 w-20 text-center">Peringkat</th>
                    <th className="px-5 py-4">Nama Karyawan</th>
                    <th className="px-5 py-4">Departemen</th>
                    <th className="px-5 py-4 text-center">Ujian Selesai</th>
                    <th className="px-5 py-4 text-center">Rata-rata Nilai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                  {ranking.map((r, i) => (
                    <tr key={r.userId} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                      <td className="px-5 py-4 text-center">
                        {i === 0 ? <Medal className="w-6 h-6 text-yellow-500 mx-auto" /> : 
                         i === 1 ? <Medal className="w-6 h-6 text-slate-400 mx-auto" /> :
                         i === 2 ? <Medal className="w-6 h-6 text-amber-700 mx-auto" /> :
                         <span className="font-bold text-slate-400 dark:text-zinc-500">{i + 1}</span>}
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-800 dark:text-white">{r.userName}</td>
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 rounded-lg text-xs font-medium">
                          {r.userDepartment}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center font-mono font-medium">{r.count}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`font-bold ${r.averageScore >= 75 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {r.averageScore}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {ranking.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-500 dark:text-zinc-500">
                        Belum ada data nilai BANK yang terkumpul.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
