import React, { useState } from 'react';
import { User, ExamPackage, Question } from '../../types';
import { saveExam, deleteExam, clearAllExams } from '../../lib/storage';
import { 
  Plus, 
  Search, 
  BookOpen, 
  HelpCircle, 
  Clock, 
  Edit, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  FileCheck,
  Tag,
  X,
  Lock,
  Unlock,
  Play,
  PauseCircle
} from 'lucide-react';

interface ExamManagementProps {
  currentUser: User | null;
  exams: ExamPackage[];
  questions: Question[];
  onRefresh: () => void;
  onManageQuestions: (exam: ExamPackage) => void;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const ExamManagement: React.FC<ExamManagementProps> = ({
  currentUser,
  exams,
  questions,
  onRefresh,
  onManageQuestions,
  onToast
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Modal State for Exam Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamPackage | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Keselamatan Kerja (K3)');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [passingScore, setPassingScore] = useState(75);
  const [status, setStatus] = useState<'active' | 'draft' | 'closed'>('active');
  const [scope, setScope] = useState<'BANK' | 'SEC' | 'ALL'>('BANK');

  const isSuperAdmin = currentUser?.name.toLowerCase().includes('taka') ?? false;

  const userExams = exams.filter(e => {
    if (isSuperAdmin) return true;
    if (!e.authorName) return false;
    return e.authorName.toLowerCase() === currentUser?.name.toLowerCase();
  });

  const categories = Array.from(new Set(userExams.map(e => e.category)));

  const filteredExams = userExams.filter(e => {
    const matchesSearch = e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          e.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'all' || e.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleOpenCreateModal = () => {
    setEditingExam(null);
    setTitle('');
    setDescription('');
    setCategory('Keselamatan Kerja (K3)');
    setDurationMinutes(15);
    setPassingScore(75);
    setStatus('active');
    setScope('BANK');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (exam: ExamPackage) => {
    setEditingExam(exam);
    setTitle(exam.title);
    setDescription(exam.description);
    setCategory(exam.category);
    setDurationMinutes(exam.durationMinutes);
    setPassingScore(exam.passingScore);
    setStatus(exam.status);
    setScope(exam.scope || 'BANK');
    setIsModalOpen(true);
  };

  const handleToggleSession = (exam: ExamPackage) => {
    const newStatus: 'active' | 'closed' = exam.status === 'active' ? 'closed' : 'active';
    const msg = newStatus === 'closed' 
      ? `Sesi ujian "${exam.title}" telah DITUTUP oleh Admin.`
      : `Sesi ujian "${exam.title}" telah DIBUKA kembali untuk peserta.`;

    try {
      saveExam({
        ...exam,
        status: newStatus
      });
      onToast(msg, newStatus === 'closed' ? 'info' : 'success');
      onRefresh();
    } catch (err: any) {
      onToast(err.message || 'Gagal mengubah status sesi', 'error');
    }
  };

  const handleSubmitExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      onToast('Judul dan deskripsi ujian wajib diisi.', 'error');
      return;
    }

    try {
      saveExam({
        id: editingExam?.id,
        title: title.trim(),
        description: description.trim(),
        category,
        durationMinutes: Number(durationMinutes),
        passingScore: Number(passingScore),
        status,
        scope,
        authorName: editingExam?.authorName || currentUser?.name || 'Taka Ditya Darma'
      });

      onToast(editingExam ? 'Paket Ujian berhasil diperbarui!' : 'Paket Ujian baru berhasil dibuat!', 'success');
      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      onToast(err.message || 'Gagal menyimpan ujian', 'error');
    }
  };

  const handleDelete = async (examId: string, examTitle: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus paket ujian "${examTitle}" beserta seluruh soalnya?`)) {
      await deleteExam(examId);
      onToast(`Paket ujian "${examTitle}" telah dihapus.`, 'info');
      onRefresh();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-zinc-200">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Manajemen Paket Ujian & Bank Soal</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Buat paket ujian baru, atur durasi & passing grade, serta tambahkan pilihan ganda / soal AI.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {exams.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Apakah Anda yakin ingin menghapus SELURUH paket ujian? Semua soal dan data ujian akan terhapus.')) {
                  clearAllExams();
                  onToast('Seluruh paket ujian telah berhasil dihapus.', 'info');
                  onRefresh();
                }
              }}
              className="px-3.5 py-2.5 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-semibold border border-transparent dark:border-rose-900/40 transition-all flex items-center space-x-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus Semua Paket Ujian</span>
            </button>
          )}
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 dark:shadow-none transition-all flex items-center justify-center space-x-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Paket Ujian Baru</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari judul ujian atau deskripsi..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-xl text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-xl text-xs text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-indigo-500 shadow-sm min-w-[180px]"
        >
          <option value="all" className="dark:bg-slate-900">Semua Kategori ({exams.length})</option>
          {categories.map((cat) => (
            <option key={cat} value={cat} className="dark:bg-slate-900">{cat}</option>
          ))}
        </select>
      </div>

      {/* Exam Bento Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredExams.map((exam) => {
          const examQuestions = questions.filter(q => q.examId === exam.id);
          return (
            <div
              key={exam.id}
              className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-5 flex flex-col justify-between transition-all group shadow-sm dark:shadow-none hover:shadow-md"
            >
              <div>
                {/* Category & Status */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-1 text-[10px] font-semibold bg-slate-100 dark:bg-zinc-950 text-slate-700 dark:text-zinc-400 rounded-lg flex items-center space-x-1">
                      <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>{exam.category}</span>
                    </span>
                    <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-md border ${
                      exam.scope === 'SEC'
                        ? 'bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 border-purple-200/50 dark:border-purple-900/30'
                        : exam.scope === 'ALL'
                        ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-900/30'
                        : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-900/30'
                    }`}>
                      {exam.scope || 'BANK'}
                    </span>
                  </div>

                  <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${
                    exam.status === 'active'
                      ? 'bg-emerald-100 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-900/40'
                      : exam.status === 'closed'
                      ? 'bg-rose-100 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400 border border-rose-300 dark:border-rose-900/40'
                      : 'bg-amber-100 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-900/40'
                  }`}>
                    {exam.status === 'active' ? 'Sesi Dibuka' : exam.status === 'closed' ? 'Sesi Ditutup' : 'Draft'}
                  </span>
                </div>

                {/* Exam Title & Description */}
                <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">
                  {exam.title}
                </h3>
                {exam.authorName && (
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
                    Pembuat Soal: {exam.authorName}
                  </div>
                )}
                <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 mt-2 leading-relaxed">
                  {exam.description}
                </p>

                {/* Meta details */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="bg-slate-50 dark:bg-zinc-950 p-2 rounded-xl border border-slate-100 dark:border-zinc-800/60">
                    <div className="text-slate-400 dark:text-zinc-500 flex items-center justify-center space-x-1">
                      <HelpCircle className="w-3 h-3 text-blue-500" />
                      <span>Soal</span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white mt-0.5">{examQuestions.length}</div>
                  </div>

                  <div className="bg-slate-50 dark:bg-zinc-950 p-2 rounded-xl border border-slate-100 dark:border-zinc-800/60">
                    <div className="text-slate-400 dark:text-zinc-500 flex items-center justify-center space-x-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      <span>Durasi</span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white mt-0.5">{exam.durationMinutes} mnt</div>
                  </div>

                  <div className="bg-slate-50 dark:bg-zinc-950 p-2 rounded-xl border border-slate-100 dark:border-zinc-800/60">
                    <div className="text-slate-400 dark:text-zinc-500 flex items-center justify-center space-x-1">
                      <FileCheck className="w-3 h-3 text-emerald-500" />
                      <span>Pass %</span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white mt-0.5">{exam.passingScore}%</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => onManageQuestions(exam)}
                    className="flex-1 py-2 px-3 bg-indigo-50 dark:bg-zinc-950 hover:bg-indigo-100 dark:hover:bg-zinc-800 text-indigo-700 dark:text-indigo-400 border border-transparent dark:border-zinc-800 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1.5"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Kelola Soal ({examQuestions.length})</span>
                  </button>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenEditModal(exam)}
                      title="Edit Ujian"
                      className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(exam.id, exam.title)}
                      title="Hapus Ujian"
                      className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Session Control Button */}
                <button
                  onClick={() => handleToggleSession(exam)}
                  className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border ${
                    exam.status === 'active'
                      ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/40'
                      : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
                  }`}
                >
                  {exam.status === 'active' ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-rose-600" />
                      <span>Tutup Sesi Ujian</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Buka Sesi Ujian</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          );
        })}

        {filteredExams.length === 0 && (
          <div className="col-span-full p-12 text-center bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl text-slate-400 dark:text-zinc-500 text-xs shadow-sm">
            Tidak ada paket ujian yang ditemukan. Silakan buat paket ujian baru.
          </div>
        )}
      </div>

      {/* Create / Edit Exam Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-zinc-150 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200/80 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingExam ? 'Edit Paket Ujian' : 'Buat Paket Ujian Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitExam} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Judul Paket Ujian</label>
                <input
                  type="text"
                  placeholder="Contoh: Evaluasi K3 Keselamatan Kerja 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Deskripsi Ujian</label>
                <textarea
                  rows={3}
                  placeholder="Penjelasan ringkas tentang materi evaluasi ini..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Keperluan Ujian / Scope Perusahaan</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as 'BANK' | 'SEC' | 'ALL')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900 font-medium"
                >
                  <option value="BANK" className="dark:bg-zinc-900">BANK</option>
                  <option value="SEC" className="dark:bg-zinc-900">SEC</option>
                  <option value="ALL" className="dark:bg-zinc-900">ALL</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Kategori / Divisi</label>
                  <input
                    type="text"
                    placeholder="Contoh: K3, Cybersecurity, Onboarding"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Status Sesi Ujian</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'draft' | 'closed')}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900 font-medium"
                  >
                    <option value="active" className="dark:bg-zinc-900">Aktif (Sesi Dibuka)</option>
                    <option value="closed" className="dark:bg-zinc-900">Ditutup (Sesi Ditutup Admin)</option>
                    <option value="draft" className="dark:bg-zinc-900">Draft (Disembunyikan)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Durasi Pengerjaan (Menit)</label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Passing Grade Minimal (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={passingScore}
                    onChange={(e) => setPassingScore(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 rounded-xl text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/20 dark:shadow-none"
                >
                  Simpan Paket Ujian
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
