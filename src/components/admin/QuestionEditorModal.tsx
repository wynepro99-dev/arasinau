import React, { useState } from 'react';
import { ExamPackage, Question, QuestionOption, QuestionType } from '../../types';
import { getQuestionsByExamId, saveQuestion, deleteQuestion } from '../../lib/storage';
import { 
  X, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  FileText,
  Database,
  Upload
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
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'import'>('list');
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

  // Import State
  const [importText, setImportText] = useState('');
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);

  const handleParseText = () => {
    if (!importText.trim()) {
      onToast('Silakan tempel teks soal terlebih dahulu.', 'error');
      return;
    }
    const lines = importText.split(/\r?\n/);
    const result: any[] = [];
    let currentQuestion: any = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Question start detection (e.g. "1. ..." or "1) ...")
      const qMatch = line.match(/^(\d+)[\.\)]\s+(.*)$/);
      if (qMatch) {
        if (currentQuestion) {
          result.push(currentQuestion);
        }
        currentQuestion = {
          type: 'multiple_choice',
          questionText: qMatch[2].trim(),
          options: [],
          correctAnswerId: '',
          explanation: '',
          points: 25,
          scope: exam.scope || 'BANK'
        };
        continue;
      }

      // Option detection (e.g. "A. ..." or "A) ...")
      const optMatch = line.match(/^([A-D])[\.\)]\s+(.*)$/i);
      if (optMatch && currentQuestion) {
        const letter = optMatch[1].toUpperCase();
        currentQuestion.options.push({
          id: `opt-${letter.toLowerCase()}`,
          text: optMatch[2].trim()
        });
        continue;
      }

      // Answer key detection (e.g. "Kunci Jawaban: B" or "Kunci: B" or "Kunci Jawaban: Pembelajaran...")
      const keyMatch = line.match(/^(?:Kunci Jawaban|Kunci|Jawaban)\s*:\s*(.*)$/i);
      if (keyMatch && currentQuestion) {
        const keyVal = keyMatch[1].trim();
        if (/^[A-D]$/i.test(keyVal)) {
          currentQuestion.type = 'multiple_choice';
          currentQuestion.correctAnswerId = `opt-${keyVal.toLowerCase()}`;
        } else if (/^(?:Benar|Salah|True|False)$/i.test(keyVal)) {
          currentQuestion.type = 'true_false';
          currentQuestion.options = [
            { id: 'true', text: 'Benar' },
            { id: 'false', text: 'Salah' }
          ];
          currentQuestion.correctAnswerId = keyVal.toLowerCase().startsWith('t') || keyVal.toLowerCase().startsWith('b') ? 'true' : 'false';
        } else {
          currentQuestion.type = 'essay';
          currentQuestion.sampleAnswer = keyVal;
          currentQuestion.correctAnswerId = 'essay';
          currentQuestion.options = [];
        }
        continue;
      }

      // Explanation detection (e.g. "Pembahasan: ...")
      const expMatch = line.match(/^(?:Pembahasan|Penjelasan|Explanation)\s*:\s*(.*)$/i);
      if (expMatch && currentQuestion) {
        currentQuestion.explanation = expMatch[1].trim();
        continue;
      }

      // Append multiline text
      if (currentQuestion) {
        if (currentQuestion.options.length === 0) {
          currentQuestion.questionText += '\n' + line;
        } else if (currentQuestion.options.length > 0 && !currentQuestion.correctAnswerId) {
          const lastOpt = currentQuestion.options[currentQuestion.options.length - 1];
          lastOpt.text += '\n' + line;
        }
      }
    }

    if (currentQuestion) {
      result.push(currentQuestion);
    }

    if (result.length === 0) {
      onToast('Format teks tidak dikenali. Silakan ikuti petunjuk format contoh di bawah.', 'error');
    } else {
      setPreviewQuestions(result);
      onToast(`Berhasil mengenali ${result.length} soal! Silakan periksa tinjauan di bawah.`, 'success');
    }
  };

  const handleSaveImport = async () => {
    if (previewQuestions.length === 0) return;
    
    for (const q of previewQuestions) {
      await saveQuestion({
        examId: exam.id,
        type: q.type,
        questionText: q.questionText,
        caseStudyStory: '',
        sampleAnswer: q.sampleAnswer || '',
        options: q.options,
        correctAnswerId: q.correctAnswerId,
        explanation: q.explanation || '',
        points: q.points,
        scope: q.scope
      });
    }

    onToast(`Berhasil menyimpan ${previewQuestions.length} soal baru ke bank soal!`, 'success');
    setImportText('');
    setPreviewQuestions([]);
    setActiveTab('list');
    onRefresh();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportText(text);
      // Auto parse
      const lines = text.split(/\r?\n/);
      const result: any[] = [];
      let currentQuestion: any = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const qMatch = line.match(/^(\d+)[\.\)]\s+(.*)$/);
        if (qMatch) {
          if (currentQuestion) result.push(currentQuestion);
          currentQuestion = {
            type: 'multiple_choice',
            questionText: qMatch[2].trim(),
            options: [],
            correctAnswerId: '',
            explanation: '',
            points: 25,
            scope: exam.scope || 'BANK'
          };
          continue;
        }
        const optMatch = line.match(/^([A-D])[\.\)]\s+(.*)$/i);
        if (optMatch && currentQuestion) {
          const letter = optMatch[1].toUpperCase();
          currentQuestion.options.push({
            id: `opt-${letter.toLowerCase()}`,
            text: optMatch[2].trim()
          });
          continue;
        }
        const keyMatch = line.match(/^(?:Kunci Jawaban|Kunci|Jawaban)\s*:\s*(.*)$/i);
        if (keyMatch && currentQuestion) {
          const keyVal = keyMatch[1].trim();
          if (/^[A-D]$/i.test(keyVal)) {
            currentQuestion.type = 'multiple_choice';
            currentQuestion.correctAnswerId = `opt-${keyVal.toLowerCase()}`;
          } else if (/^(?:Benar|Salah|True|False)$/i.test(keyVal)) {
            currentQuestion.type = 'true_false';
            currentQuestion.options = [
              { id: 'true', text: 'Benar' },
              { id: 'false', text: 'Salah' }
            ];
            currentQuestion.correctAnswerId = keyVal.toLowerCase().startsWith('t') || keyVal.toLowerCase().startsWith('b') ? 'true' : 'false';
          } else {
            currentQuestion.type = 'essay';
            currentQuestion.sampleAnswer = keyVal;
            currentQuestion.correctAnswerId = 'essay';
            currentQuestion.options = [];
          }
          continue;
        }
        const expMatch = line.match(/^(?:Pembahasan|Penjelasan|Explanation)\s*:\s*(.*)$/i);
        if (expMatch && currentQuestion) {
          currentQuestion.explanation = expMatch[1].trim();
          continue;
        }
        if (currentQuestion) {
          if (currentQuestion.options.length === 0) {
            currentQuestion.questionText += '\n' + line;
          } else if (currentQuestion.options.length > 0 && !currentQuestion.correctAnswerId) {
            const lastOpt = currentQuestion.options[currentQuestion.options.length - 1];
            lastOpt.text += '\n' + line;
          }
        }
      }
      if (currentQuestion) result.push(currentQuestion);
      setPreviewQuestions(result);
      onToast(`Berhasil membaca file dan mendeteksi ${result.length} soal!`, 'success');
    };
    reader.readAsText(file);
  };

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

  const handleSaveQuestion = async (e: React.FormEvent) => {
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

    await saveQuestion({
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

  const handleDeleteQ = async (qId: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus soal ini?')) {
      await deleteQuestion(qId);
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

          <button
            onClick={() => {
              setImportText('');
              setPreviewQuestions([]);
              setActiveTab('import');
            }}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'import'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Import Massal (Text / Word)</span>
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

          {/* TAB 3: IMPORT MASSAL PANEL */}
          {activeTab === 'import' && (
            <div className="space-y-5">
              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-xs space-y-2">
                <h4 className="font-extrabold text-indigo-950 flex items-center gap-1.5 text-[13px]">
                  <Database className="w-4 h-4" />
                  <span>Panduan Format Copy-Paste Soal</span>
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Buka dokumen Microsoft Word atau dokumen teks Anda, salin teks soal Anda, lalu tempelkan ke kolom di bawah. 
                  Sistem akan mem-parsing secara otomatis dengan format berikut:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div className="bg-white p-3 rounded-xl border border-indigo-100/50 font-mono text-[10px] text-slate-700 space-y-1">
                    <span className="text-indigo-600 font-bold block mb-1">// FORMAT PILIHAN GANDA (MCQ):</span>
                    <p>1. Apa kepanjangan dari SEOS?</p>
                    <p>A. Smarteducafe Education Operating System</p>
                    <p>B. Smarteducafe Operating System</p>
                    <p>C. Smart Education Online System</p>
                    <p>D. Smart Operating System</p>
                    <p className="font-bold text-emerald-600">Kunci Jawaban: A</p>
                    <p className="text-slate-400">Pembahasan: SEOS adalah operating system pendidikan.</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-indigo-100/50 font-mono text-[10px] text-slate-700 space-y-1">
                    <span className="text-purple-600 font-bold block mb-1">// FORMAT ESSAY / RUBRIK:</span>
                    <p>2. Jelaskan filosofi dasar dari Smarteducafe!</p>
                    <p className="font-bold text-emerald-600">Kunci Jawaban: Filosofi kami berpusat pada pemahaman konsep logis mendalam, bukan sekadar menghafal rumus pola jawaban ujian.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Tempel Teks Soal Dokumen Di Sini</label>
                  <label className="cursor-pointer text-xs font-bold text-indigo-600 hover:text-indigo-500 flex items-center space-x-1">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload File (.txt)</span>
                    <input
                      type="file"
                      accept=".txt,.md"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  rows={8}
                  placeholder="Tempel teks dokumen Anda di sini (Pastikan format penomoran 1., 2. dan opsi A., B. lengkap)..."
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setImportText('');
                    setPreviewQuestions([]);
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-all"
                >
                  Bersihkan
                </button>
                <button
                  type="button"
                  onClick={handleParseText}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center space-x-1.5"
                >
                  <span>Analisa & Tinjau Soal</span>
                </button>
              </div>

              {/* Preview parsed questions */}
              {previewQuestions.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Tinjauan Hasil Parsing ({previewQuestions.length} Soal Terdeteksi)
                    </h4>
                    <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      Pastikan isi & kunci jawaban sudah pas sebelum disimpan!
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-2xl">
                    {previewQuestions.map((q, idx) => (
                      <div key={idx} className="bg-white p-4 border border-slate-200/60 rounded-xl space-y-2 text-xs shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-slate-850">Soal {idx + 1}</span>
                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase ${
                            q.type === 'multiple_choice' 
                              ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}>
                            {q.type === 'multiple_choice' ? 'Pilihan Ganda' : 'Essay'}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-800 whitespace-pre-line">{q.questionText}</p>
                        
                        {q.type === 'multiple_choice' && q.options.length > 0 && (
                          <div className="grid grid-cols-1 gap-1.5 pl-3 pt-1">
                            {q.options.map((opt: any) => (
                              <div 
                                key={opt.id} 
                                className={`p-2 rounded-lg border text-[11px] flex items-center space-x-2 font-medium ${
                                  q.correctAnswerId === opt.id
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                              >
                                <span className="font-bold text-[10px] uppercase bg-white px-1.5 py-0.5 rounded border border-inherit">
                                  {opt.id.replace('opt-', '')}
                                </span>
                                <span className="truncate">{opt.text}</span>
                                {q.correctAnswerId === opt.id && <Check className="w-3.5 h-3.5 ml-auto text-emerald-600 shrink-0" />}
                              </div>
                            ))}
                          </div>
                        )}

                        {q.type === 'essay' && (
                          <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 text-[11px] text-slate-700">
                            <strong className="text-emerald-700 font-bold block mb-0.5">Acuan Jawaban Essay:</strong>
                            <p className="italic leading-relaxed">{q.sampleAnswer || '-'}</p>
                          </div>
                        )}

                        {q.explanation && (
                          <div className="text-[10px] text-slate-500 italic pt-1">
                            Pembahasan: {q.explanation}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveImport}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-550 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-600/25 transition-all text-center flex items-center justify-center space-x-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Simpan {previewQuestions.length} Soal ke Bank Soal</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

