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
    <div className="space-y-6 animate-fade-in">
      
      {/* Welcome & Quick Action Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center space-x-2">
            <span>Ringkasan Aktivitas Ujian</span>
            <span className="px-2.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200/60 rounded-full uppercase tracking-wider">
              Live Realtime
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pantau kinerja ujian, statistik kelulusan departemen, dan rekapitulasi nilai otomatis.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => onNavigateTab('scores')}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center space-x-2"
          >
            <Award className="w-4 h-4 text-indigo-600" />
            <span>Lihat Laporan Skor</span>
          </button>
          <button
            onClick={onOpenCreateExam}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Ujian Baru</span>
          </button>
        </div>
      </div>

      {/* KPI Bento Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Active Exams */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl shrink-0">
            📚
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Paket Ujian</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{activeExams} <span className="text-xs text-slate-400 font-normal">Aktif</span></p>
          </div>
        </div>

        {/* Card 2: Total Questions */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center text-xl shrink-0">
            👨‍💼
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bank Soal Terdaftar</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{totalQuestions} <span className="text-xs text-slate-400 font-normal">Soal</span></p>
          </div>
        </div>

        {/* Card 3: Average Score */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center text-xl shrink-0">
            📈
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rata-rata Skor</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{avgScore} <span className="text-xs text-slate-400 font-normal">/ 100</span></p>
          </div>
        </div>

        {/* Card 4: Pass Rate */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-4 hover:shadow-md transition-all">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-xl shrink-0">
            ✅
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tingkat Kelulusan</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{passRate}%</p>
          </div>
        </div>

      </div>

      {/* Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Bar Chart: Departemen Performance */}
        <div className="lg:col-span-2 bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Rata-Rata Nilai per Departemen</h3>
              <p className="text-xs text-slate-400">Evaluasi tingkat pemahaman materi tiap divisi</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="department" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                />
                <Bar dataKey="rataSkor" name="Rata-rata Skor" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart: Pass vs Fail Ratio */}
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Rasio Kelulusan Peserta</h3>
            <p className="text-xs text-slate-400">Perbandingan jumlah hasil Lulus vs Tidak Lulus</p>
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
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', fontSize: '12px', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <span className="text-xl font-bold text-slate-900">{passRate}%</span>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Lulus</p>
            </div>
          </div>

          <div className="flex items-center justify-around text-xs border-t border-slate-100 pt-3">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <span className="text-slate-600 font-medium">Lulus: {passedAttemptsCount}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-rose-500"></span>
              <span className="text-slate-600 font-medium">Remidi: {totalAttempts - passedAttemptsCount}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Recent Test Submissions Feed (Bento Table) */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Hasil Ujian Terbaru</h3>
            <p className="text-xs text-slate-400">Pengerjaan evaluasi karyawan secara realtime</p>
          </div>
          <button
            onClick={() => onNavigateTab('scores')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center space-x-1"
          >
            <span>Lihat Semua</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 font-semibold">Nama Peserta</th>
                <th className="px-6 py-3 font-semibold">Kategori Ujian</th>
                <th className="px-6 py-3 font-semibold">Skor</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {attempts.slice(0, 5).map((att) => (
                <tr
                  key={att.id}
                  onClick={() => onViewAttemptDetail(att)}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                        {att.userName.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-xs">{att.userName}</div>
                        <div className="text-[10px] text-slate-400">{att.userDepartment}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-slate-700">{att.examTitle}</td>
                  <td className={`px-6 py-4 text-xs font-bold ${att.passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {att.score} / 100
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      att.passed
                        ? 'bg-green-100 text-green-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      {att.passed ? 'LULUS' : 'REMIDI'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold inline-flex items-center space-x-1">
                      <span>Detail</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {attempts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 text-xs">
                    Belum ada peserta yang menyelesaikan ujian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto Sync Banner */}
      <div className="bg-slate-200/50 rounded-2xl border border-dashed border-slate-300 flex flex-col sm:flex-row items-center justify-between px-6 py-3.5 gap-2">
        <div className="flex items-center gap-3">
          <span className="animate-pulse w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-xs font-medium text-slate-600">Sistem sinkronisasi otomatis aktif • Data diperbarui secara realtime</span>
        </div>
        <div className="flex gap-6 text-xs font-semibold text-slate-400">
          <span>Versi v4.1.2</span>
          <span>Dukungan HRD</span>
          <span>Dokumentasi</span>
        </div>
      </div>

    </div>
  );
};
