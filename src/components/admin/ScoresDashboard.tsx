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
        newTotalPoints += inputPts;
      } else {
        updatedAnswers[qId] = { ...ans };
        newTotalPoints += (ans.pointsEarned || 0);
      }
      newTotalMax += maxPts;
    });

    const newScore = newTotalMax > 0 ? Math.round((newTotalPoints / newTotalMax) * 100) : 0;
    const matchedExam = exams.find(e => e.id === activeAttemptDetail.examId);
    const passingScore = matchedExam?.passingScore || 70;
    const isPassed = newScore >= passingScore;

    const updatedAttemptRecord: ExamAttempt = {
      ...activeAttemptDetail,
      score: newScore,
      totalPointsEarned: newTotalPoints,
      totalMaxPoints: newTotalMax,
      passed: isPassed,
      answers: updatedAnswers
    };

    updateAttempt(updatedAttemptRecord);
    setActiveAttemptDetail(updatedAttemptRecord);
    if (onRefresh) onRefresh();
    onToast('Penilaian essay berhasil disimpan dan skor akhir telah diperbarui!', 'success');
  };

  const departments = Array.from(new Set(attempts.map(a => a.userDepartment)));

  const filteredAttempts = attempts.filter(att => {
    const matchesName = att.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        att.examTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = deptFilter === 'all' || att.userDepartment === deptFilter;
    const matchesExam = examFilter === 'all' || att.examId === examFilter;
    const matchesStatus = statusFilter === 'all' ||
                          (statusFilter === 'passed' && att.passed) ||
                          (statusFilter === 'failed' && !att.passed);

    return matchesName && matchesDept && matchesExam && matchesStatus;
  });

  // Summary Metrics for current filtered view
  const avgFilteredScore = filteredAttempts.length > 0
    ? Math.round(filteredAttempts.reduce((acc, curr) => acc + curr.score, 0) / filteredAttempts.length)
    : 0;

  const passedFilteredCount = filteredAttempts.filter(a => a.passed).length;

  const handleExportExcel = () => {
    if (filteredAttempts.length === 0) {
      onToast('Tidak ada data hasil ujian untuk diexport.', 'error');
      return;
    }

    const allQuestions = getQuestions();
    const qMap = new Map(allQuestions.map(q => [q.id, q]));

    // Helper to sanitize text for XML
    const escapeXml = (str: string) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    // Find maximum questions answered across attempts
    let maxQCount = 0;
    filteredAttempts.forEach(a => {
      const qCount = Object.keys(a.answers || {}).length;
      if (qCount > maxQCount) maxQCount = qCount;
    });

    // Build Table Headers
    let headerHTML = `
      <tr>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: center;">No</th>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: left;">ID Percobaan</th>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Nama Peserta</th>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Departemen</th>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Judul Ujian</th>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: center;">Tanggal Selesai</th>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: center;">Durasi</th>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: right;">Poin Diraih</th>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: right;">Poin Maksimal</th>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: right;">Skor (%)</th>
        <th style="background-color: #3730a3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: center;">Status</th>
    `;

    for (let i = 1; i <= maxQCount; i++) {
      headerHTML += `
        <th style="background-color: #4f46e5; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Jawaban Soal ${i}</th>
        <th style="background-color: #4f46e5; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: center;">Hasil Soal ${i}</th>
        <th style="background-color: #4f46e5; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: right;">Poin Soal ${i}</th>
      `;
    }
    headerHTML += `</tr>`;

    // Build Table Body Rows
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

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center space-x-2">
            <span>Rekap & Evaluasi Nilai Ujian</span>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
              Kalkulasi Otomatis
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Laporan hasil pengerjaan real-time, transparansi penilaian instan, dan riwayat kelulusan per individu.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {attempts.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Apakah Anda yakin ingin menghapus SELURUH riwayat nilai ujian? Tindakan ini tidak dapat dibatalkan.')) {
                  clearAllAttempts();
                  onToast('Seluruh riwayat nilai ujian telah berhasil dihapus.', 'info');
                  if (onRefresh) onRefresh();
                }
              }}
              className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus Semua Nilai</span>
            </button>
          )}
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all flex items-center space-x-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Filter and Metrics Summary */}
      <div className="bg-white border border-slate-200/80 p-4 rounded-2xl space-y-4 shadow-sm print:hidden">
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Search Name */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama karyawan / ujian..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          {/* Dept Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Semua Departemen ({departments.length})</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Exam Filter */}
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Semua Paket Ujian ({exams.length})</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Semua Status Kelulusan</option>
            <option value="passed">Hanya LULUS</option>
            <option value="failed">Hanya TIDAK LULUS</option>
          </select>

        </div>

        {/* Quick View Metrics Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-4">
          <div className="flex items-center space-x-6">
            <div>
              <span>Terpilih: </span>
              <span className="font-bold text-slate-900">{filteredAttempts.length} data</span>
            </div>
            <div>
              <span>Rata-rata Skor: </span>
              <span className="font-bold text-indigo-600">{avgFilteredScore} / 100</span>
            </div>
            <div>
              <span>Jumlah Lulus: </span>
              <span className="font-bold text-emerald-600">{passedFilteredCount} Peserta</span>
            </div>
          </div>
        </div>

      </div>

      {/* Main Results Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200/80 uppercase tracking-wider">
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
            <tbody className="divide-y divide-slate-100">
              {filteredAttempts.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-slate-900 flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0">
                      {att.userName.substring(0, 1)}
                    </div>
                    <span>{att.userName}</span>
                  </td>

                  <td className="px-5 py-3.5 text-slate-500">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px]">
                      {att.userDepartment}
                    </span>
                  </td>

                  <td className="px-5 py-3.5 text-slate-800 font-medium">
                    {att.examTitle}
                  </td>

                  <td className="px-5 py-3.5">
                    <span className="text-sm font-black text-slate-900">{att.score}</span>
                    <span className="text-[10px] text-slate-400"> / 100</span>
                  </td>

                  <td className="px-5 py-3.5">
                    {att.passed ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>LULUS</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>TIDAK LULUS</span>
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3.5 text-slate-500 text-[11px]">
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
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center space-x-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Detail Lembar Jawaban</span>
                    </button>
                  </td>
                </tr>
              ))}

              {filteredAttempts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-xs">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden text-slate-900 max-h-[90vh] flex flex-col animate-fade-in">
            
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Detail Lembar Jawaban Ujian</h3>
                <p className="text-xs text-slate-500">{activeAttemptDetail.userName} ({activeAttemptDetail.userDepartment})</p>
              </div>
              <button
                onClick={() => {
                  setActiveAttemptDetail(null);
                  if (onClearSelectedAttempt) onClearSelectedAttempt();
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Summary card */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500">Judul Ujian:</span>
                  <p className="text-sm font-bold text-slate-900">{activeAttemptDetail.examTitle}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Durasi Terpakai: {Math.floor(activeAttemptDetail.durationSecondsUsed / 60)}m {activeAttemptDetail.durationSecondsUsed % 60}s
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-black text-slate-900">{activeAttemptDetail.score} <span className="text-xs font-normal text-slate-400">/ 100</span></div>
                  <span className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded-full mt-1 ${
                    activeAttemptDetail.passed
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}>
                    {activeAttemptDetail.passed ? 'LULUS' : 'TIDAK LULUS'}
                  </span>
                </div>
              </div>

              {/* Answers Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Rincian Jawaban per Nomor Soal
                </h4>

                {(() => {
                  const allQuestions = getQuestions();
                  const qMap = new Map(allQuestions.map(q => [q.id, q]));

                  return (Object.entries(activeAttemptDetail.answers) as [string, AttemptAnswer][]).map(([qId, ans], idx) => {
                    const qObj = qMap.get(qId);
                    const isCaseStudy = qObj?.type === 'case_study' || !!ans.essayAnswer;

                    return (
                      <div key={qId} className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-800">
                            Soal #{idx + 1} {qObj?.questionText ? `: ${qObj.questionText}` : ''}
                          </span>
                          {ans.isCorrect ? (
                            <span className="text-emerald-600 font-bold flex items-center space-x-1 shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Benar (+{ans.pointsEarned} poin)</span>
                            </span>
                          ) : (
                            <span className="text-rose-600 font-bold flex items-center space-x-1 shrink-0">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Salah (0 poin)</span>
                            </span>
                          )}
                        </div>

                        {qObj?.caseStudyStory && (
                          <div className="p-2.5 bg-purple-50/60 border border-purple-200 rounded-lg text-[11px] text-slate-700 space-y-0.5">
                            <span className="font-bold text-purple-800">Cerita Studi Kasus:</span>
                            <p className="whitespace-pre-line text-slate-800">{qObj.caseStudyStory}</p>
                          </div>
                        )}

                        {isCaseStudy ? (
                          <div className="space-y-3 pt-1">
                            <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-1">
                              <span className="font-bold text-indigo-600 text-[11px] block">Jawaban Essay Karyawan:</span>
                              <p className="text-slate-800 whitespace-pre-line font-sans leading-relaxed">
                                {ans.essayAnswer || 'Tidak diisi.'}
                              </p>
                            </div>

                            {(qObj?.sampleAnswer || qObj?.explanation) && (
                              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 space-y-0.5">
                                <span className="font-bold block text-amber-800">Acuan Kunci Jawaban / Rubrik:</span>
                                <p className="whitespace-pre-line">{qObj.sampleAnswer || qObj.explanation}</p>
                              </div>
                            )}

                            {/* Admin Manual Score Input */}
                            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-indigo-900 flex items-center space-x-1">
                                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Penilaian Manual Admin:</span>
                                </span>
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-xs text-slate-600 font-medium">Beri Poin:</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={qObj?.points || 25}
                                    value={essayGrades[qId]?.pointsEarned ?? 0}
                                    onChange={(e) => handleGradeChange(qId, 'pointsEarned', e.target.value)}
                                    className="w-16 px-2 py-1 text-xs font-bold text-indigo-900 bg-white border border-indigo-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                  <span className="text-xs font-bold text-slate-500">/ {qObj?.points || 25} PTS</span>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-indigo-950 mb-1">
                                  Catatan / Ulasan Feedback untuk Karyawan:
                                </label>
                                <textarea
                                  rows={2}
                                  value={essayGrades[qId]?.feedback ?? ''}
                                  onChange={(e) => handleGradeChange(qId, 'feedback', e.target.value)}
                                  placeholder="Tulis ulasan/evaluasi jawaban..."
                                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-600">
                            Jawaban dipilih ID: <span className="font-mono text-indigo-600">{ans.selectedAnswerId}</span>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Modal Footer with Save Button */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200">
              <span className="text-xs text-slate-500">
                Ubah poin essay di atas lalu klik simpan untuk menghitung ulang nilai.
              </span>
              <button
                type="button"
                onClick={handleSaveGrades}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/20 transition-all active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Penilaian Essay</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
