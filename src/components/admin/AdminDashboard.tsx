import React from 'react';
import { ExamPackage, Question, ExamAttempt } from '../../types';
import { 
  BookOpen, 
  HelpCircle, 
  CheckCircle2, 
  TrendingUp, 
  Award, 
  Users, 
  ArrowUpRight,
  Clock,
  ChevronRight,
  Plus
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface AdminDashboardProps {
  exams: ExamPackage[];
  questions: Question[];
  attempts: ExamAttempt[];
  onNavigateTab: (tab: string) => void;
  onOpenCreateExam: () => void;
  onViewAttemptDetail: (attempt: ExamAttempt) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  exams,
  questions,
  attempts,
  onNavigateTab,
  onOpenCreateExam,
  onViewAttemptDetail
}) => {
  // Metrics Calculations
  const activeExams = exams.filter(e => e.status === 'active').length;
  const totalQuestions = questions.length;
  const totalAttempts = attempts.length;

  const avgScore = totalAttempts > 0
    ? Math.round(attempts.reduce((acc, curr) => acc + curr.score, 0) / totalAttempts)
    : 0;

  const passedAttemptsCount = attempts.filter(a => a.passed).length;
  const passRate = totalAttempts > 0
    ? Math.round((passedAttemptsCount / totalAttempts) * 100)
    : 0;

  // Chart Data: Department Average Scores
  const deptMap: Record<string, { totalScore: number; count: number }> = {};
  attempts.forEach(a => {
    const dept = a.userDepartment || 'Lainnya';
    if (!deptMap[dept]) {
      deptMap[dept] = { totalScore: 0, count: 0 };
    }
    deptMap[dept].totalScore += a.score;
    deptMap[dept].count += 1;
  });

  const departmentChartData = Object.keys(deptMap).map(dept => ({
    department: dept.replace('& Technology', '').replace('& Operations', ''),
    rataSkor: Math.round(deptMap[dept].totalScore / deptMap[dept].count),
    pesertaCount: deptMap[dept].count
  }));

  // Chart Data: Pass vs Fail Pie
  const pieData = [
    { name: 'Lulus', value: passedAttemptsCount, color: '#10b981' },
    { name: 'Tidak Lulus', value: totalAttempts - passedAttemptsCount, color: '#f43f5e' }
  ];

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-zinc-200">
      
      {/* Welcome & Quick Action Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-4 sm:p-6 rounded-2xl shadow-sm">
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white tracking-tight">
              Ringkasan Aktivitas Ujian
            </h1>
            <span className="px-2 py-1 text-[9px] sm:text-[10px] font-bold bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-800 rounded-full uppercase tracking-wider whitespace-nowrap">
              ● Live Realtime
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2 leading-relaxed">
            Pantau kinerja ujian, statistik kelulusan departemen, dan rekapitulasi nilai otomatis.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={() => onNavigateTab('scores')}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-semibold rounded-xl transition-all flex items-center space-x-2"
          >
            <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Laporan Skor</span>
          </button>
          <button
            onClick={onOpenCreateExam}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 dark:shadow-none transition-all flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Ujian</span>
          </button>
        </div>
      </div>

      {/* KPI Bento Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Active Exams */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-zinc-800 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Total Paket Ujian</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{activeExams} <span className="text-xs text-slate-400 dark:text-zinc-500 font-normal">Aktif</span></p>
          </div>
        </div>

        {/* Card 2: Total Questions */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-zinc-800 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center shrink-0">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Bank Soal Terdaftar</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{totalQuestions} <span className="text-xs text-slate-400 dark:text-zinc-500 font-normal">Soal</span></p>
          </div>
        </div>

        {/* Card 3: Average Score */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-zinc-800 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 rounded-xl flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Rata-rata Skor</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{avgScore} <span className="text-xs text-slate-400 dark:text-zinc-500 font-normal">/ 100</span></p>
          </div>
        </div>

        {/* Card 4: Pass Rate */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-zinc-800 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Tingkat Kelulusan</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{passRate}%</p>
          </div>
        </div>

      </div>

      {/* Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Bar Chart: Departemen Performance */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Rata-Rata Nilai per Departemen</h3>
              <p className="text-xs text-slate-400 dark:text-zinc-400">Evaluasi tingkat pemahaman materi tiap divisi</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-zinc-800" />
                <XAxis dataKey="department" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                />
                <Bar dataKey="rataSkor" name="Rata-rata Skor" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart: Pass vs Fail Ratio */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Rasio Kelulusan Peserta</h3>
            <p className="text-xs text-slate-400 dark:text-zinc-400">Perbandingan jumlah hasil Lulus vs Tidak Lulus</p>
          </div>
          
          <div className="h-48 w-full my-2 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <span className="text-xl font-bold text-slate-900 dark:text-white">{passRate}%</span>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider font-bold">Lulus</p>
            </div>
          </div>

          <div className="flex items-center justify-around text-xs border-t border-slate-100 dark:border-zinc-800 pt-3">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <span className="text-slate-600 dark:text-zinc-450 font-medium">Lulus: {passedAttemptsCount}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-rose-500"></span>
              <span className="text-slate-600 dark:text-zinc-450 font-medium">Remidi: {totalAttempts - passedAttemptsCount}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Recent Test Submissions Feed (Bento Table) */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Hasil Ujian Terbaru</h3>
            <p className="text-xs text-slate-400 dark:text-zinc-400">Pengerjaan evaluasi karyawan secara realtime</p>
          </div>
          <button
            onClick={() => onNavigateTab('scores')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center space-x-1"
          >
            <span>Lihat Semua</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-550 dark:text-zinc-400 text-xs uppercase">
              <tr className="border-b border-slate-100 dark:border-zinc-800">
                <th className="px-6 py-3 font-semibold">Nama Peserta</th>
                <th className="px-6 py-3 font-semibold">Kategori Ujian</th>
                <th className="px-6 py-3 font-semibold">Skor</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-850 text-sm">
              {[...attempts]
                .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
                .slice(0, 5)
                .map((att) => (
                <tr
                  key={att.id}
                  onClick={() => onViewAttemptDetail(att)}
                  className="hover:bg-slate-50/80 dark:hover:bg-zinc-950/40 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-zinc-800 border border-indigo-100 dark:border-zinc-700 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0">
                        {att.userName.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white text-xs">{att.userName}</div>
                        <div className="text-[10px] text-slate-400 dark:text-zinc-500">{att.userDepartment}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-700 dark:text-zinc-300">{att.examTitle}</td>
                  <td className={`px-6 py-4 text-xs font-bold ${att.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                    {att.score} / 100
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      att.passed
                        ? 'bg-green-100 dark:bg-emerald-950/20 text-green-700 dark:text-emerald-400'
                        : 'bg-rose-100 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400'
                    }`}>
                      {att.passed ? 'LULUS' : 'REMIDI'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 text-xs font-semibold inline-flex items-center space-x-1">
                      <span>Detail</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {attempts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 dark:text-zinc-500 text-xs">
                    Belum ada peserta yang menyelesaikan ujian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto Sync Banner */}
      <div className="bg-slate-200/50 dark:bg-zinc-900/40 rounded-2xl border border-dashed border-slate-300 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between px-6 py-3.5 gap-2">
        <div className="flex items-center gap-3">
          <span className="animate-pulse w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Sistem sinkronisasi otomatis aktif • Data diperbarui secara realtime</span>
        </div>
        <div className="flex gap-6 text-xs font-semibold text-slate-400 dark:text-zinc-500">
          <span>Versi v4.1.2</span>
          <span>Dukungan HRD</span>
          <span>Dokumentasi</span>
        </div>
      </div>

    </div>
  );
};
