import React, { useState } from 'react';
import { ExamPackage, Question, QuestionOption, QuestionType } from '../../types';
import { getQuestionsByExamId, saveQuestion, deleteQuestion } from '../../lib/storage';
import { 
  X, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  FileText
} from 'lucide-react';

interface QuestionEditorModalProps {
  exam: ExamPackage;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  exam,
  isOpen,
  onClose,
  onRefresh,
  onToast
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const questions = getQuestionsByExamId(exam.id);

  // Question Manual Form State
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType>('multiple_choice');
  const [questionText, setQuestionText] = useState('');
  const [caseStudyStory, setCaseStudyStory] = useState('');
  const [sampleAnswer, setSampleAnswer] = useState('');
  const [options, setOptions] = useState<QuestionOption[]>([
    { id: 'opt-a', text: '' },
    { id: 'opt-b', text: '' },
    { id: 'opt-c', text: '' },
    { id: 'opt-d', text: '' }
  ]);
  const [correctAnswerId, setCorrectAnswerId] = useState('opt-a');
  const [explanation, setExplanation] = useState('');
  const [points, setPoints] = useState(25);
  const [qScope, setQScope] = useState<'BANK' | 'SEC' | 'ALL'>('BANK');

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingQuestionId(null);
    setQuestionType('multiple_choice');
    setQuestionText('');
    setCaseStudyStory('');
    setSampleAnswer('');
    setOptions([
      { id: 'opt-a', text: '' },
      { id: 'opt-b', text: '' },
      { id: 'opt-c', text: '' },
      { id: 'opt-d', text: '' }
    ]);
    setCorrectAnswerId('opt-a');
    setExplanation('');
    setPoints(25);
    setQScope('BANK');
  };

  const handleEditClick = (q: Question) => {
    setEditingQuestionId(q.id);
    setQuestionType(q.type);
    setQuestionText(q.questionText);
    setCaseStudyStory(q.caseStudyStory || '');
    setSampleAnswer(q.sampleAnswer || '');
    setOptions(q.options.length ? q.options : [
      { id: 'opt-a', text: '' },
      { id: 'opt-b', text: '' },
      { id: 'opt-c', text: '' },
      { id: 'opt-d', text: '' }
    ]);
    setCorrectAnswerId(q.correctAnswerId);
    setExplanation(q.explanation || '');
    setPoints(q.points);
    setQScope(q.scope || exam.scope || 'BANK');
    setActiveTab('create');
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) {
      onToast('Teks pertanyaan / instruksi essay wajib diisi.', 'error');
      return;
    }

    if (questionType === 'case_study' && !caseStudyStory.trim()) {
      onToast('Cerita / Narasi studi kasus wajib diisi.', 'error');
      return;
    }

    if (questionType === 'multiple_choice') {
      const emptyOpt = options.find(o => !o.text.trim());
      if (emptyOpt) {
        onToast('Seluruh 4 opsi jawaban pilihan ganda wajib diisi.', 'error');
        return;
      }
    }

    let finalOptions: QuestionOption[] = [];
    let finalCorrectAnswerId = correctAnswerId;

    if (questionType === 'multiple_choice') {
      finalOptions = options;
    } else if (questionType === 'true_false') {
      finalOptions = [
        { id: 'true', text: 'Benar' },
        { id: 'false', text: 'Salah' }
      ];
    } else if (questionType === 'case_study' || questionType === 'essay') {
      finalOptions = [];
      finalCorrectAnswerId = 'essay';
    }

    saveQuestion({
      id: editingQuestionId || undefined,
      examId: exam.id,
      type: questionType,
      questionText: questionText.trim(),
      caseStudyStory: caseStudyStory.trim(),
      sampleAnswer: sampleAnswer.trim(),
      options: finalOptions,
      correctAnswerId: finalCorrectAnswerId,
      explanation: explanation.trim(),
      points: Number(points),
      scope: qScope
    });

    onToast(editingQuestionId ? 'Soal berhasil diperbarui!' : 'Soal baru berhasil ditambahkan!', 'success');
    resetForm();
    setActiveTab('list');
    onRefresh();
  };

  const handleDeleteQ = (qId: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus soal ini?')) {
      deleteQuestion(qId);
      onToast('Soal telah dihapus.', 'info');
      onRefresh();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-white border border-slate-200/80 rounded-2xl shadow-2xl overflow-hidden text-slate-900 flex flex-col max-h-[90vh] animate-fade-in">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200/80">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md">
                {exam.category}
              </span>
              <span className="text-xs text-slate-500">• Total Soal: {questions.length}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-1">Kelola Bank Soal: {exam.title}</h2>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6">
          <button
            onClick={() => setActiveTab('list')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'list'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Daftar Soal ({questions.length})</span>
          </button>

          <button
            onClick={() => {
              resetForm();
              setActiveTab('create');
            }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'create'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>{editingQuestionId ? 'Edit Soal' : 'Tambah Soal'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">

          {/* TAB 1: LIST QUESTIONS */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              {questions.map((q, idx) => (
                <div key={`q-${q.id || 'id'}-${idx}`} className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl hover:border-slate-300 transition-all shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start space-x-3 flex-1">
                      <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center space-x-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            q.type === 'case_study' 
                              ? 'bg-purple-50 text-purple-700 border-purple-200' 
                              : q.type === 'essay'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : q.type === 'true_false'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}>
                            {q.type === 'case_study' ? 'Studi Kasus & Essay' : q.type === 'essay' ? 'Soal Essay' : q.type === 'true_false' ? 'Benar / Salah' : 'Pilihan Ganda'}
                          </span>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border uppercase tracking-wider ${
                            q.scope === 'SEC'
                              ? 'bg-purple-100/70 border-purple-200 text-purple-700'
                              : q.scope === 'ALL'
                              ? 'bg-blue-100/70 border-blue-200 text-blue-700'
                              : 'bg-emerald-100/70 border-emerald-200 text-emerald-700'
                          }`}>
                            Scope: {q.scope || 'BANK'}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400">• {q.points} Poin</span>
                        </div>

                        {q.type === 'case_study' && q.caseStudyStory && (
                          <div className="p-3 bg-purple-50/60 border border-purple-200/80 rounded-xl text-xs text-purple-950 space-y-1">
                            <span className="font-bold text-purple-800 text-[11px] block">Cerita / Skenario Studi Kasus:</span>
                            <p className="whitespace-pre-line leading-relaxed text-slate-800">{q.caseStudyStory}</p>
                          </div>
                        )}

                        <div>
                          <span className="text-[11px] font-bold text-slate-500 block">Pertanyaan / Instruksi:</span>
                          <p className="text-xs font-semibold text-slate-900 leading-relaxed">{q.questionText}</p>
                        </div>

                        {q.type !== 'case_study' && q.type !== 'essay' && (
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options.map((opt, oIdx) => {
                              const isCorrect = opt.id === q.correctAnswerId;
                              return (
                                <div
                                  key={`opt-${q.id}-${opt.id || 'opt'}-${oIdx}`}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between border ${
                                    isCorrect
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium'
                                      : 'bg-white border-slate-200 text-slate-600'
                                  }`}
                                >
                                  <span className="truncate">{opt.text}</span>
                                  {isCorrect && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {(q.sampleAnswer || q.explanation) && (
                          <div className="mt-2 text-[11px] text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
                            <span className="font-semibold text-indigo-600">Acuan Jawaban / Pembahasan: </span>
                            {q.sampleAnswer || q.explanation}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleEditClick(q)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60"
                        title="Edit Soal"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteQ(q.id)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50"
                        title="Hapus Soal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {questions.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Belum ada soal untuk paket ujian ini. Klik "Tambah Soal" untuk membuat soal baru.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREATE/EDIT QUESTION */}
          {activeTab === 'create' && (
            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Soal</label>
                  <select
                    value={questionType}
                    onChange={(e) => {
                      const type = e.target.value as QuestionType;
                      setQuestionType(type);
                      if (type === 'true_false') {
                        setCorrectAnswerId('true');
                      } else if (type === 'case_study' || type === 'essay') {
                        setCorrectAnswerId('essay');
                      } else {
                        setCorrectAnswerId('opt-a');
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="multiple_choice">Pilihan Ganda (A, B, C, D)</option>
                    <option value="true_false">Benar / Salah (True / False)</option>
                    <option value="essay">Soal Essay / Uraian</option>
                    <option value="case_study">Studi Kasus (Cerita / Skenario & Essay)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bobot Nilai (Poin)</label>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={points}
                    onChange={(e) => setPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Keperluan Soal / Scope</label>
                  <select
                    value={qScope}
                    onChange={(e) => setQScope(e.target.value as 'BANK' | 'SEC' | 'ALL')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 font-medium"
                  >
                    <option value="BANK">BANK</option>
                    <option value="SEC">SEC</option>
                    <option value="ALL">ALL</option>
                  </select>
                </div>
              </div>

              {questionType === 'case_study' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cerita / Skenario Studi Kasus <span className="text-purple-600 font-normal">(Narasi awal yang wajib dibaca peserta)</span>
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Tuliskan cerita, latar belakang masalah, atau skenario studi kasus secara detail..."
                    value={caseStudyStory}
                    onChange={(e) => setCaseStudyStory(e.target.value)}
                    className="w-full px-3 py-2 bg-purple-50/30 border border-purple-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-purple-500 font-sans leading-relaxed"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {(questionType === 'case_study' || questionType === 'essay') ? 'Pertanyaan Essay / Instruksi Analisa' : 'Pertanyaan / Soal'}
                </label>
                <textarea
                  rows={3}
                  placeholder={(questionType === 'case_study' || questionType === 'essay') ? "Contoh: Jelaskan langkah-langkah penanganan keadaan darurat K3 di lokasi operasional!" : "Tuliskan teks pertanyaan secara jelas..."}
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {(questionType === 'case_study' || questionType === 'essay') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Acuan Kunci Jawaban / Rubrik Penilaian Essay <span className="text-slate-400 font-normal">(Untuk pedoman evaluasi penilai)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Tuliskan poin-poin acuan jawaban ideal atau rubrik penilaian untuk memeriksa essay..."
                    value={sampleAnswer}
                    onChange={(e) => setSampleAnswer(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Options Section */}
              {questionType === 'multiple_choice' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">Pilihan Jawaban & Kunci Jawaban Benar</label>
                  {options.map((opt, idx) => {
                    const letters = ['A', 'B', 'C', 'D'];
                    const isSelectedKey = correctAnswerId === opt.id;
                    return (
                      <div key={opt.id} className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setCorrectAnswerId(opt.id)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
                            isSelectedKey
                              ? 'bg-emerald-600 text-white shadow-md'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                          title="Tandai sebagai Kunci Jawaban"
                        >
                          {letters[idx]}
                        </button>

                        <input
                          type="text"
                          placeholder={`Pilihan Opsi ${letters[idx]}`}
                          value={opt.text}
                          onChange={(e) => {
                            const newOpts = [...options];
                            newOpts[idx].text = e.target.value;
                            setOptions(newOpts);
                          }}
                          className={`flex-1 px-3 py-1.5 bg-slate-50 border rounded-xl text-xs text-slate-900 focus:outline-none ${
                            isSelectedKey ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-200'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : questionType === 'true_false' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kunci Jawaban Benar</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCorrectAnswerId('true')}
                      className={`py-2 px-4 rounded-xl text-xs font-bold border transition-all ${
                        correctAnswerId === 'true'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      BENAR (TRUE)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorrectAnswerId('false')}
                      className={`py-2 px-4 rounded-xl text-xs font-bold border transition-all ${
                        correctAnswerId === 'false'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      SALAH (FALSE)
                    </button>
                  </div>
                </div>
              ) : null}

              {questionType !== 'case_study' && questionType !== 'essay' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pembahasan / Penjelasan Jawaban (Opsional)</label>
                  <input
                    type="text"
                    placeholder="Alasan mengapa jawaban tersebut benar untuk evaluasi..."
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/20"
                >
                  Simpan Soal
                </button>
              </div>
            </form>
          )}

        </div>

      </div>
    </div>
  );
};

