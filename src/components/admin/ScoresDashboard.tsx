import React, { useState, useEffect } from 'react';
import { ExamAttempt, ExamPackage, AttemptAnswer } from '../../types';
import { getQuestions, updateAttempt, clearAllAttempts } from '../../lib/storage';
import { 
  Award, 
  Search, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User as UserIcon,
  BookOpen,
  Eye,
  X,
  FileCheck,
  Edit3,
  Save,
  Check,
  Trash2
} from 'lucide-react';

interface ScoresDashboardProps {
  attempts: ExamAttempt[];
  exams: ExamPackage[];
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  selectedAttemptFromParent?: ExamAttempt | null;
  onClearSelectedAttempt?: () => void;
  onRefresh?: () => void;
}

export const ScoresDashboard: React.FC<ScoresDashboardProps> = ({
  attempts,
  exams,
  onToast,
  selectedAttemptFromParent,
  onClearSelectedAttempt,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [examFilter, setExamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');

  // Detail Modal Inspection State
  const [activeAttemptDetail, setActiveAttemptDetail] = useState<ExamAttempt | null>(
    selectedAttemptFromParent || null
  );

  // Manual Essay Grading State per question
  const [essayGrades, setEssayGrades] = useState<Record<string, { pointsEarned: number; feedback: string }>>({});

  useEffect(() => {
    if (activeAttemptDetail) {
      const initialMap: Record<string, { pointsEarned: number; feedback: string }> = {};
      (Object.entries(activeAttemptDetail.answers) as [string, AttemptAnswer][]).forEach(([qId, ans]) => {
        initialMap[qId] = {
          pointsEarned: ans.pointsEarned || 0,
          feedback: ans.aiFeedback || ''
        };
      });
      setEssayGrades(initialMap);
    }
  }, [activeAttemptDetail]);

  useEffect(() => {
    if (selectedAttemptFromParent) {
      setActiveAttemptDetail(selectedAttemptFromParent);
    }
  }, [selectedAttemptFromParent]);

  const handleGradeChange = (qId: string, field: 'pointsEarned' | 'feedback', value: any) => {
    setEssayGrades(prev => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        [field]: value
      }
    }));
  };

  const handleSaveGrades = () => {
    if (!activeAttemptDetail) return;

    const allQuestions = getQuestions();
    const qMap = new Map(allQuestions.map(q => [q.id, q]));

    let newTotalPoints = 0;
    let newTotalMax = 0;
    const updatedAnswers: Record<string, AttemptAnswer> = {};

    (Object.entries(activeAttemptDetail.answers) as [string, AttemptAnswer][]).forEach(([qId, ans]) => {
      const qObj = qMap.get(qId);
      const maxPts = qObj?.points || 25;
      const isEssay = qObj?.type === 'case_study' || qObj?.type === 'essay' || !!ans.essayAnswer;

      if (isEssay && essayGrades[qId]) {
        const inputPts = Math.min(maxPts, Math.max(0, Number(essayGrades[qId].pointsEarned || 0)));
        const fb = essayGrades[qId].feedback || '';
        const isPass = inputPts >= Math.round(maxPts * 0.55);

        updatedAnswers[qId] = {
          ...ans,
          pointsEarned: inputPts,
          isCorrect: isPass,
          aiFeedback: fb
        };
      } else {
        updatedAnswers[qId] = { ...ans };
      }

      newTotalPoints += updatedAnswers[qId].pointsEarned || 0;
      newTotalMax += maxPts;
    });

    const activeExam = exams.find(e => e.id === activeAttemptDetail.examId);
    const passPct = activeExam?.passingScore || 75;
    const finalScore = newTotalMax > 0 ? Math.round((newTotalPoints / newTotalMax) * 100) : 0;
    const isPassed = finalScore >= passPct;

    const updated: ExamAttempt = {
      ...activeAttemptDetail,
      answers: updatedAnswers,
      totalPointsEarned: newTotalPoints,
      totalMaxPoints: newTotalMax,
      score: finalScore,
      passed: isPassed
    };

    updateAttempt(updated);
    onToast('Nilai evaluasi manual berhasil disimpan!', 'success');
    setActiveAttemptDetail(updated);
    if (onRefresh) onRefresh();
  };

  const handleExportExcel = () => {
    if (filteredAttempts.length === 0) {
      onToast('Tidak ada data hasil ujian untuk di-export.', 'error');
      return;
    }

    const allQuestions = getQuestions();
    const qMap = new Map(allQuestions.map(q => [q.id, q]));

    let maxQCount = 0;
    filteredAttempts.forEach(a => {
      const qCount = Object.keys(a.answers || {}).length;
      if (qCount > maxQCount) maxQCount = qCount;
    });

    let headerHTML = `
      <tr>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">No</th>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">ID Attempt</th>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">Nama Karyawan</th>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">Departemen</th>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">Ujian</th>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">Tanggal Selesai</th>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">Durasi</th>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">Poin Diperoleh</th>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">Poin Max</th>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">Skor Akhir (%)</th>
        <th style="background-color: #6366f1; color: white; border: 1px solid #cbd5e1; padding: 8px;">Status</th>
    `;

    for (let i = 1; i <= maxQCount; i++) {
      headerHTML += `
        <th style="background-color: #4f46e5; color: white; border: 1px solid #cbd5e1; padding: 8px;">Jawaban Soal ${i}</th>
        <th style="background-color: #4f46e5; color: white; border: 1px solid #cbd5e1; padding: 8px;">Status Soal ${i}</th>
        <th style="background-color: #4f46e5; color: white; border: 1px solid #cbd5e1; padding: 8px;">Skor Soal ${i}</th>
      `;
    }
    headerHTML += `</tr>`;

    const escapeXml = (str: string) => {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    };

    const rowsHTML = filteredAttempts.map((a, index) => {
      const mins = Math.floor(a.durationSecondsUsed / 60);
      const secs = a.durationSecondsUsed % 60;
      const durationStr = `${mins}m ${secs}s`;
      const dateStr = a.completedAt
        ? new Date(a.completedAt).toLocaleString('id-ID')
        : '-';

      let rowHTML = `
        <tr>
          <td style="text-align: center; border: 1px solid #e2e8f0; padding: 8px;">${index + 1}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px;">${escapeXml(a.id)}</td>
          <td style="font-weight: bold; border: 1px solid #e2e8f0; padding: 8px;">${escapeXml(a.userName)}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px;">${escapeXml(a.userDepartment)}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px;">${escapeXml(a.examTitle)}</td>
          <td style="text-align: center; border: 1px solid #e2e8f0; padding: 8px;">${dateStr}</td>
          <td style="text-align: center; border: 1px solid #e2e8f0; padding: 8px;">${durationStr}</td>
          <td style="text-align: right; border: 1px solid #e2e8f0; padding: 8px;">${a.totalPointsEarned ?? '-'}</td>
          <td style="text-align: right; border: 1px solid #e2e8f0; padding: 8px;">${a.totalMaxPoints ?? '-'}</td>
          <td style="text-align: right; font-weight: bold; border: 1px solid #e2e8f0; padding: 8px;">${a.score}%</td>
          <td style="text-align: center; font-weight: bold; color: ${a.passed ? '#059669' : '#dc2626'}; border: 1px solid #e2e8f0; padding: 8px;">
            ${a.passed ? 'LULUS' : 'TIDAK LULUS'}
          </td>
      `;

      const answerEntries = Object.entries(a.answers || {}) as [string, AttemptAnswer][];
      for (let i = 0; i < maxQCount; i++) {
        if (i < answerEntries.length) {
          const [qId, ans] = answerEntries[i];
          const qObj = qMap.get(qId);
          let userText = ans.essayAnswer || '';
          if (!userText && ans.selectedAnswerId && qObj?.options) {
            const matchedOpt = qObj.options.find(o => o.id === ans.selectedAnswerId);
            userText = matchedOpt ? matchedOpt.text : ans.selectedAnswerId;
          }
          if (!userText) userText = '-';

          const isCorrectStr = ans.isCorrect ? 'BENAR' : 'SALAH';
          const ptsStr = `${ans.pointsEarned ?? 0}`;

          rowHTML += `
            <td style="border: 1px solid #e2e8f0; padding: 8px;">${escapeXml(userText)}</td>
            <td style="text-align: center; border: 1px solid #e2e8f0; padding: 8px; color: ${ans.isCorrect ? '#059669' : '#dc2626'}; font-weight: bold;">${isCorrectStr}</td>
            <td style="text-align: right; border: 1px solid #e2e8f0; padding: 8px;">${ptsStr}</td>
          `;
        } else {
          rowHTML += `
            <td style="border: 1px solid #e2e8f0; padding: 8px;">-</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px;">-</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px;">-</td>
          `;
        }
      }

      rowHTML += `</tr>`;
      return rowHTML;
    }).join('');

    const template = `
      <html xmlns:o="urn:schemas-microsoft-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Rekap Hasil Ujian Ara Sinau</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: sans-serif; font-size: 12px; }
          table { border-collapse: collapse; width: 100%; }
        </style>
      </head>
      <body>
        <h2 style="font-family: sans-serif; color: #1e1b4b;">Rekapitulasi Hasil Ujian Peserta - Ara Sinau</h2>
        <table border="1">
          <thead>${headerHTML}</thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + template], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rekap_Hasil_Ujian_Ara_Sinau_${new Date().toISOString().split('T')[0]}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onToast('File Excel Rekap Hasil Ujian berhasil diunduh dengan kolom terpisah!', 'success');
  };

  // Unique filters data source
  const departments = Array.from(new Set(attempts.map((a) => a.userDepartment || 'Lainnya')));

  const filteredAttempts = attempts.filter((att) => {
    const matchesSearch = att.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          att.examTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = deptFilter === 'all' || att.userDepartment === deptFilter;
    const matchesExam = examFilter === 'all' || att.examId === examFilter;
    
    let matchesStatus = true;
    if (statusFilter === 'passed') matchesStatus = att.passed;
    if (statusFilter === 'failed') matchesStatus = !att.passed;

    const activeExam = exams.find(e => e.id === att.examId);
    const examScope = activeExam?.scope || 'BANK';
    const matchesScope = scopeFilter === 'all' || examScope === scopeFilter;

    return matchesSearch && matchesDept && matchesExam && matchesStatus && matchesScope;
  });

  const avgFilteredScore = filteredAttempts.length > 0
    ? Math.round(filteredAttempts.reduce((acc, curr) => acc + curr.score, 0) / filteredAttempts.length)
    : 0;

  const passedFilteredCount = filteredAttempts.filter(a => a.passed).length;

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-zinc-200">
      
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-4 sm:p-6 rounded-2xl shadow-sm print:hidden">
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white tracking-tight">
              Rekap & Evaluasi Nilai Ujian
            </h1>
            <span className="px-2 py-1 text-[9px] sm:text-[10px] font-bold bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-800 rounded-full uppercase tracking-wider whitespace-nowrap w-fit">
              ⚙ Kalkulasi Otomatis
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2 leading-relaxed">
            Laporan hasil pengerjaan real-time, transparansi penilaian instan, dan riwayat kelulusan per individu.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2 shrink-0">
          {attempts.length > 0 && (
            <button
              onClick={async () => {
                if (window.confirm('Apakah Anda yakin ingin menghapus SELURUH riwayat nilai ujian? Tindakan ini tidak dapat dibatalkan.')) {
                  await clearAllAttempts();
                  onToast('Seluruh riwayat nilai ujian telah berhasil dihapus.', 'info');
                  if (onRefresh) onRefresh();
                }
              }}
              className="px-3.5 py-2.5 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-semibold border border-transparent dark:border-rose-900/40 transition-all flex items-center space-x-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus</span>
            </button>
          )}
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 dark:shadow-none transition-all flex items-center space-x-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Filter and Metrics Summary */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-4 rounded-2xl space-y-4 shadow-sm print:hidden">
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          
          {/* Search Name */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama karyawan / ujian..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900"
            />
          </div>

          {/* Dept Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all" className="dark:bg-slate-900">Semua Departemen ({departments.length})</option>
            {departments.map((d) => (
              <option key={d} value={d} className="dark:bg-slate-900">{d}</option>
            ))}
          </select>

          {/* Exam Filter */}
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all" className="dark:bg-slate-900">Semua Ujian ({exams.length})</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id} className="dark:bg-slate-900">{e.title}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all" className="dark:bg-zinc-900">Semua Status</option>
            <option value="passed" className="dark:bg-zinc-900">Hanya LULUS</option>
            <option value="failed" className="dark:bg-zinc-900">Hanya TIDAK LULUS</option>
          </select>

          {/* Scope Filter */}
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all" className="dark:bg-zinc-900">Semua Scope</option>
            <option value="BANK" className="dark:bg-zinc-900">ARA</option>
            <option value="SEC" className="dark:bg-zinc-900">SEC</option>
            <option value="ALL" className="dark:bg-zinc-900">ALL</option>
          </select>

        </div>

        {/* Quick View Metrics Bar */}
        <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-4">
          <div className="flex items-center space-x-6">
            <div>
              <span className="dark:text-zinc-400">Terpilih: </span>
              <span className="font-bold text-slate-900 dark:text-white">{filteredAttempts.length} data</span>
            </div>
            <div>
              <span className="dark:text-zinc-400">Rata-rata Skor: </span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{avgFilteredScore} / 100</span>
            </div>
            <div>
              <span className="dark:text-zinc-400">Jumlah Lulus: </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{passedFilteredCount} Peserta</span>
            </div>
          </div>
        </div>

      </div>

      {/* Main Results Table */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-zinc-300 border-collapse">
            <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-400 font-semibold border-b border-slate-200/80 dark:border-zinc-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Nama Peserta</th>
                <th className="px-5 py-3.5">Departemen</th>
                <th className="px-5 py-3.5">Judul Ujian</th>
                <th className="px-5 py-3.5">Skor Akhir</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Waktu Selesai</th>
                <th className="px-5 py-3.5 text-right print:hidden">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {filteredAttempts.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50/80 dark:hover:bg-zinc-950/40 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-zinc-800 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center shrink-0">
                      {att.userName.substring(0, 1)}
                    </div>
                    <span>{att.userName}</span>
                  </td>

                  <td className="px-5 py-3.5 text-slate-500 dark:text-zinc-400">
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-zinc-400 rounded text-[11px] border border-transparent dark:border-zinc-800">
                      {att.userDepartment}
                    </span>
                  </td>

                  <td className="px-5 py-3.5 text-slate-800 dark:text-zinc-200 font-medium">
                    {att.examTitle}
                  </td>

                  <td className="px-5 py-3.5">
                    <span className="text-sm font-black text-slate-900 dark:text-white">{att.score}</span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500"> / 100</span>
                  </td>

                  <td className="px-5 py-3.5">
                    {att.passed ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-transparent dark:border-emerald-900/40">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>LULUS</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-transparent dark:border-rose-900/40">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>TIDAK LULUS</span>
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3.5 text-slate-500 dark:text-zinc-400 text-[11px]">
                    {new Date(att.completedAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>

                  <td className="px-5 py-3.5 text-right print:hidden">
                    <button
                      onClick={() => setActiveAttemptDetail(att)}
                      className="px-3 py-1.5 bg-indigo-50 dark:bg-zinc-950 hover:bg-indigo-100 dark:hover:bg-zinc-800 text-indigo-700 dark:text-indigo-400 border border-transparent dark:border-zinc-800 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center space-x-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Detail Lembar Jawaban</span>
                    </button>
                  </td>
                </tr>
              ))}

              {filteredAttempts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 dark:text-zinc-500 text-xs">
                    Tidak ada lembar jawaban karyawan yang sesuai filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Attempt Inspection Modal */}
      {activeAttemptDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-zinc-200 max-h-[90vh] flex flex-col animate-fade-in">
            
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Detail Lembar Jawaban Ujian</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{activeAttemptDetail.userName} ({activeAttemptDetail.userDepartment})</p>
              </div>
              <button
                onClick={() => {
                  setActiveAttemptDetail(null);
                  if (onClearSelectedAttempt) onClearSelectedAttempt();
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-zinc-850"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Summary card */}
              <div className="p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200/80 dark:border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-450 dark:text-zinc-550">Judul Ujian:</span>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{escapeXml(activeAttemptDetail.examTitle)}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Durasi Terpakai: {Math.floor(activeAttemptDetail.durationSecondsUsed / 60)}m {activeAttemptDetail.durationSecondsUsed % 60}s
                  </p>
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{activeAttemptDetail.score} <span className="text-xs font-normal text-slate-400">/ 100</span></div>
                  <span className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded-full mt-1 ${
                    activeAttemptDetail.passed
                      ? 'bg-emerald-100 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-450'
                      : 'bg-rose-100 dark:bg-rose-950/20 text-rose-700 dark:text-rose-450'
                  }`}>
                    {activeAttemptDetail.passed ? 'LULUS' : 'TIDAK LULUS'}
                  </span>
                </div>
              </div>

              {/* Questions list */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Rekap Pengerjaan Soal</h4>
                
                {(() => {
                  const allQuestions = getQuestions();
                  const qMap = new Map(allQuestions.map(q => [q.id, q]));

                  return (Object.entries(activeAttemptDetail.answers || {}) as [string, AttemptAnswer][]).map(([qId, ans], idx) => {
                    const qObj = qMap.get(qId);
                    if (!qObj) return null;

                    const isEssay = qObj.type === 'case_study' || qObj.type === 'essay' || !!ans.essayAnswer;
                    const maxPts = qObj.points || 25;

                    return (
                      <div key={qId} className="p-4 border border-slate-100 dark:border-zinc-800 rounded-xl space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-xs font-extrabold text-slate-400 dark:text-zinc-500">Soal {idx + 1}</span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                            ans.isCorrect
                              ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400'
                          }`}>
                            {ans.isCorrect ? 'Benar' : 'Salah'}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200">{qObj.text}</p>

                        <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-lg text-xs space-y-1">
                          <span className="text-slate-400 dark:text-zinc-550 block font-medium">Jawaban Karyawan:</span>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {ans.essayAnswer || (() => {
                              const opt = qObj.options?.find(o => o.id === ans.selectedAnswerId);
                              return opt ? opt.text : ans.selectedAnswerId || '-';
                            })()}
                          </p>
                        </div>

                        {isEssay && qObj.sampleAnswer && (
                          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/40 dark:border-emerald-900/30 p-3 rounded-lg text-xs space-y-1">
                            <span className="text-emerald-700 dark:text-emerald-400 block font-bold">Acuan Jawaban / Rubrik Penilaian:</span>
                            <p className="italic text-slate-700 dark:text-zinc-300 whitespace-pre-line font-medium">{qObj.sampleAnswer}</p>
                          </div>
                        )}

                        {/* AI Grading & Feedback / Manual Adjustment */}
                        <div className="p-3 bg-indigo-50/50 dark:bg-zinc-850 border border-indigo-100/30 dark:border-zinc-800 rounded-lg text-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-indigo-700 dark:text-indigo-400 font-bold flex items-center gap-1.5">
                              <FileCheck className="w-3.5 h-3.5" />
                              <span>Evaluasi & Skor Penilaian</span>
                            </span>
                            
                            <div className="flex items-center space-x-1">
                              <span className="text-[10px] text-slate-400 font-medium">Skor:</span>
                              {isEssay ? (
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={maxPts}
                                    value={essayGrades[qId]?.pointsEarned ?? ans.pointsEarned ?? 0}
                                    onChange={(e) => handleGradeChange(qId, 'pointsEarned', Number(e.target.value))}
                                    className="w-12 text-center py-0.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded font-bold text-slate-900 dark:text-white"
                                  />
                                  <span className="text-slate-400">/ {maxPts}</span>
                                </div>
                              ) : (
                                <span className="font-extrabold text-slate-800 dark:text-zinc-200">
                                  {ans.pointsEarned} / {maxPts}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 dark:text-zinc-550 font-medium">Catatan / Umpan Balik Evaluator (Admin):</span>
                            {isEssay ? (
                              <textarea
                                rows={2}
                                value={essayGrades[qId]?.feedback ?? ans.aiFeedback ?? ''}
                                onChange={(e) => handleGradeChange(qId, 'feedback', e.target.value)}
                                placeholder="Tulis umpan balik guru atau nilai revisi di sini..."
                                className="w-full p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg text-[11px] text-slate-800 dark:text-zinc-200 focus:outline-none"
                              />
                            ) : (
                              <p className="text-slate-600 dark:text-zinc-400 italic">
                                {ans.aiFeedback || 'Evaluasi otomatis berbasis kunci jawaban pilihan ganda.'}
                              </p>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  });
                })()}
              </div>

            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setActiveAttemptDetail(null);
                  if (onClearSelectedAttempt) onClearSelectedAttempt();
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 rounded-xl text-xs font-semibold"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={handleSaveGrades}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/20 dark:shadow-none flex items-center space-x-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Penilaian</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

// Helper function to escape XML strings for Excel output safely
function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
