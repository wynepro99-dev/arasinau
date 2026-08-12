import React, { useState, useEffect } from 'react';
import { User, ExamPackage, Question, ExamAttempt, AttemptAnswer } from '../../types';
import { saveAttempt } from '../../lib/storage';
import { 
  Clock, 
  HelpCircle, 
  Check, 
  Flag, 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  AlertTriangle, 
  X,
  FileCheck2,
  BookOpen,
  ShieldAlert,
  Lock
} from 'lucide-react';

interface ExamTakingScreenProps {
  currentUser: User;
  exam: ExamPackage;
  questions: Question[];
  onFinishExam: (attempt: ExamAttempt) => void;
  onCancelExam: () => void;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

// Invisible noise character injector to disrupt OCR/DOM-scanning AI sidebars (Gemini, Copilot, etc.)
const AntiCheatText: React.FC<{ text: any }> = ({ text }) => {
  if (text === null || text === undefined) return null;
  const textStr = String(text);
  if (!textStr.trim()) return null;
  
  const lines = textStr.split('\n');
  return (
    <span translate="no" className="notranslate">
      {lines.map((line, lIdx) => {
        const words = line.split(' ');
        return (
          <React.Fragment key={lIdx}>
            {words.map((word, wIdx) => {
              if (typeof word !== 'string') return null;
              return (
                <span key={wIdx} className="inline-block mr-1">
                  {word.split('').map((char, cIdx) => {
                    const showNoise = (wIdx + cIdx) % 3 === 0;
                    const noiseChars = ['x', 'z', 'q', 'y', '1', '7', '@', '#'];
                    const noise = noiseChars[(wIdx + cIdx) % noiseChars.length];
                    return (
                      <React.Fragment key={cIdx}>
                        {char}
                        {showNoise && (
                          <span className="absolute opacity-0 pointer-events-none select-none text-[0px] w-0 h-0 inline-block overflow-hidden" aria-hidden="true">
                            {noise}
                          </span>
                        )}
                      </React.Fragment>
                    );
                  })}
                </span>
              );
            })}
            {lIdx < lines.length - 1 && <br />}
          </React.Fragment>
        );
      })}
    </span>
  );
};

export const ExamTakingScreen: React.FC<ExamTakingScreenProps> = ({
  currentUser,
  exam,
  questions,
  onFinishExam,
  onCancelExam,
  onToast
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`exam_session_idx_${currentUser.id}_${exam.id}`);
        return saved ? Number(saved) : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  });

  const [userAnswers, setUserAnswers] = useState<Record<string, { answerId: string; essayText?: string; isFlaggedDoubt: boolean }>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`exam_session_answers_${currentUser.id}_${exam.id}`);
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(`exam_session_time_${currentUser.id}_${exam.id}`);
        return saved ? Number(saved) : exam.durationMinutes * 60;
      } catch {
        return exam.durationMinutes * 60;
      }
    }
    return exam.durationMinutes * 60;
  });

  const [startTime] = useState(new Date().toISOString());
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Save session state to localStorage on state change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`exam_session_idx_${currentUser.id}_${exam.id}`, String(currentIndex));
    }
  }, [currentIndex, currentUser.id, exam.id]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`exam_session_answers_${currentUser.id}_${exam.id}`, JSON.stringify(userAnswers));
    }
  }, [userAnswers, currentUser.id, exam.id]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`exam_session_time_${currentUser.id}_${exam.id}`, String(timeLeftSeconds));
    }
  }, [timeLeftSeconds, currentUser.id, exam.id]);



  // Countdown timer effect (resistant to background tab throttling)
  const lastTickRef = React.useRef<number>(Date.now());

  useEffect(() => {
    lastTickRef.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const deltaMs = now - lastTickRef.current;
      const secondsPassed = Math.floor(deltaMs / 1000);

      if (secondsPassed > 0) {
        setTimeLeftSeconds(prev => Math.max(0, prev - secondsPassed));
        lastTickRef.current += secondsPassed * 1000;
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Separate effect to trigger auto-submit when time is up
  useEffect(() => {
    if (timeLeftSeconds <= 0) {
      handleFinalSubmit();
    }
  }, [timeLeftSeconds]);

  // Anti-cheat listeners to block right-click, copy, cut, drag, and standard clipboard keys
  useEffect(() => {
    const preventDefault = (e: Event) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block Ctrl+C, Cmd+C, Ctrl+X, Cmd+X, Ctrl+U, Cmd+U, Ctrl+S, Cmd+S, Ctrl+P, Cmd+P
      if (
        (e.ctrlKey || e.metaKey) && 
        ['c', 'C', 'u', 'U', 's', 'S', 'x', 'X', 'p', 'P'].includes(e.key)
      ) {
        e.preventDefault();
        onToast('🔒 Dilarang menyalin teks (Copy/Cut/Source) demi integritas ujian!', 'error');
      }
      // F12 and Ctrl+Shift+I/J/C
      if (
        e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(e.key))
      ) {
        e.preventDefault();
        onToast('🔒 Developer Tools dinonaktifkan!', 'error');
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      onToast('🔒 Dilarang keras menyalin soal ujian!', 'error');
    };

    document.addEventListener('contextmenu', preventDefault);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', preventDefault);
    document.addEventListener('dragstart', preventDefault);
    document.addEventListener('keydown', handleKeyDown);

    // Disable text selection at DOM body level
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    return () => {
      document.removeEventListener('contextmenu', preventDefault);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', preventDefault);
      document.removeEventListener('dragstart', preventDefault);
      document.removeEventListener('keydown', handleKeyDown);
      
      document.body.style.userSelect = 'auto';
      document.body.style.webkitUserSelect = 'auto';
    };
  }, [onToast]);

  const currentQ = questions[currentIndex];

  const handleSelectOption = (optionId: string) => {
    if (!currentQ) return;
    const existing = userAnswers[currentQ.id] || { answerId: '', isFlaggedDoubt: false };
    setUserAnswers(prev => ({
      ...prev,
      [currentQ.id]: {
        ...existing,
        answerId: optionId
      }
    }));
  };

  const handleWriteEssay = (text: string) => {
    if (!currentQ) return;
    const existing = userAnswers[currentQ.id] || { answerId: '', essayText: '', isFlaggedDoubt: false };
    setUserAnswers(prev => ({
      ...prev,
      [currentQ.id]: {
        ...existing,
        answerId: text.trim() ? 'essay' : '',
        essayText: text
      }
    }));
  };

  const handleToggleDoubt = () => {
    if (!currentQ) return;
    const existing = userAnswers[currentQ.id] || { answerId: '', isFlaggedDoubt: false };
    setUserAnswers(prev => ({
      ...prev,
      [currentQ.id]: {
        ...existing,
        isFlaggedDoubt: !existing.isFlaggedDoubt
      }
    }));
  };

  const answeredCount = Object.values(userAnswers).filter((a: { answerId: string; essayText?: string }) => a.answerId || a.essayText?.trim()).length;
  const unansweredCount = questions.length - answeredCount;

  const handleFinalSubmit = async () => {
    setShowSubmitModal(false);

    // Clear local storage exam session keys
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`exam_session_idx_${currentUser.id}_${exam.id}`);
      localStorage.removeItem(`exam_session_answers_${currentUser.id}_${exam.id}`);
      localStorage.removeItem(`exam_session_time_${currentUser.id}_${exam.id}`);
      localStorage.removeItem('ara_active_taking_exam_id');
    }

    let totalPointsEarned = 0;
    let totalMaxPoints = 0;
    const answersRecord: Record<string, AttemptAnswer> = {};

    questions.forEach((q) => {
      totalMaxPoints += q.points;
      const userAns = userAnswers[q.id];
      const selectedId = userAns?.answerId || '';
      
      let isCorrect = false;
      let pointsEarned = 0;
      let aiFeedback = '';

      if (q.type === 'case_study' || q.type === 'essay') {
        const userText = userAns?.essayText || '';
        if (userText.trim().length > 0) {
          isCorrect = false; // Pending review by Admin
          pointsEarned = 0;
          aiFeedback = 'Menunggu penilaian manual dari Admin.';
        } else {
          pointsEarned = 0;
          isCorrect = false;
          aiFeedback = 'Jawaban tidak diisi oleh peserta.';
        }
      } else {
        isCorrect = selectedId === q.correctAnswerId;
        pointsEarned = isCorrect ? q.points : 0;
        totalPointsEarned += pointsEarned;
      }

      answersRecord[q.id] = {
        questionId: q.id,
        selectedAnswerId: selectedId,
        isCorrect,
        pointsEarned,
        isFlaggedDoubt: userAns?.isFlaggedDoubt || false,
        essayAnswer: userAns?.essayText || '',
        aiFeedback
      };
    });

    const score = totalMaxPoints > 0
      ? Math.round((totalPointsEarned / totalMaxPoints) * 100)
      : 0;

    const passed = score >= exam.passingScore;
    const completedAt = new Date().toISOString();
    const durationSecondsUsed = (exam.durationMinutes * 60) - timeLeftSeconds;

    const savedAttempt = await saveAttempt({
      examId: exam.id,
      userId: currentUser.id,
      userName: currentUser.name,
      userDepartment: currentUser.department,
      examTitle: exam.title,
      score,
      totalPointsEarned,
      totalMaxPoints,
      passed,
      startedAt: startTime,
      completedAt,
      durationSecondsUsed,
      answers: answersRecord
    });

    onToast('Ujian berhasil dikumpulkan! Jawaban essay akan diperiksa dan dinilai oleh Admin.', 'success');
    onFinishExam(savedAttempt);
  };

  const minutes = Math.floor(timeLeftSeconds / 60);
  const seconds = timeLeftSeconds % 60;
  const isTimeWarning = timeLeftSeconds < 180; // Less than 3 minutes

  if (!currentQ) {
    return (
      <div className="p-8 text-center text-white">
        Terjadi kesalahan memuat soal ujian.
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex flex-col justify-between bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden animate-fade-in text-slate-100">
      
      {/* Top Fixed Exam Header Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-20">
        <div>
          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            {exam.category}
          </span>
          <h2 className="text-sm font-bold text-white mt-1">{exam.title}</h2>
        </div>

        {/* Live Timer Gauge & Progress */}
        <div className="flex items-center space-x-4">
          <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all ${
            isTimeWarning
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
              : 'bg-slate-800 text-slate-200 border-slate-700'
          }`}>
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

      {/* Main Examination Center Body */}
      <div className="p-6 md:p-8 max-w-4xl mx-auto w-full flex-1 flex flex-col justify-between">
        
        <div className="space-y-6">
          
          {/* Question Metadata */}
          <div className="flex items-center justify-between border-b border-slate-850 pb-3">
            <span className="text-xs font-bold text-slate-400">
              Soal Nomor <span className="text-emerald-400 text-sm font-black">{currentIndex + 1}</span> dari {questions.length}
            </span>

            <button
              onClick={handleToggleDoubt}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                userAnswers[currentQ.id]?.isFlaggedDoubt
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{userAnswers[currentQ.id]?.isFlaggedDoubt ? 'Ragu-ragu (Ditandai)' : 'Tandai Ragu-ragu'}</span>
            </button>
          </div>

          {/* Question Statement */}
          {currentQ.type === 'case_study' || currentQ.type === 'essay' ? (
            <div className="space-y-4">
              {/* Story Narrative Box */}
              {currentQ.caseStudyStory && (
                <div className="bg-slate-900 border border-purple-500/30 p-5 rounded-2xl space-y-2">
                  <div className="flex items-center space-x-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
                    <BookOpen className="w-4 h-4" />
                    <span>Cerita / Skenario Studi Kasus</span>
                  </div>
                  <p className="text-xs md:text-sm text-slate-200 whitespace-pre-line leading-relaxed font-sans">
                    <AntiCheatText text={currentQ.caseStudyStory} />
                  </p>
                </div>
              )}

              {/* Essay Question Prompt */}
              <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Pertanyaan Essay / Instruksi Analisa:</span>
                <h3 className="text-sm md:text-base font-semibold text-white leading-relaxed">
                  <AntiCheatText text={currentQ.questionText} />
                </h3>
              </div>

              {/* Essay Text Area */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300">
                    Tuliskan Jawaban & Analisa Essay Anda di Sini:
                  </label>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center space-x-1">
                    <ShieldAlert className="w-3 h-3 text-rose-400" />
                    <span>Anti-Paste / Wajib Ketik Manual</span>
                  </span>
                </div>

                <textarea
                  rows={6}
                  placeholder="Ketikkan hasil analisa dan jawaban Anda secara manual... (Fitur Paste/Tempel dinonaktifkan untuk mencegah kecurangan)"
                  value={userAnswers[currentQ.id]?.essayText || ''}
                  onChange={(e) => handleWriteEssay(e.target.value)}
                  onPaste={(e) => {
                    e.preventDefault();
                    onToast('🔒 Anti-Kecurangan Aktif: Menempelkan teks (Paste) dinonaktifkan. Anda wajib mengetik jawaban esai secara manual.', 'error');
                  }}
                  onCopy={(e) => {
                    e.preventDefault();
                    onToast('🔒 Fitur salin teks (Copy) dinonaktifkan.', 'info');
                  }}
                  onCut={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    onToast('🔒 Fitur drag-and-drop teks dinonaktifkan.', 'error');
                  }}
                  className="w-full p-4 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-2xl text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-sans leading-relaxed transition-colors shadow-inner"
                />

                <div className="p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-center space-x-2 text-[11px] text-amber-300">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Mode Anti-Kecurangan Aktif:</strong> Salin & Tempel (Copy-Paste) dinonaktifkan pada soal esai. Jawaban harus diketikkan secara manual oleh peserta.
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                  <span>
                    {((userAnswers[currentQ.id]?.essayText || '').trim().split(/\s+/).filter(Boolean).length || 0)} Kata
                  </span>
                  {userAnswers[currentQ.id]?.essayText?.trim() ? (
                    <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Jawaban Essay Tersimpan</span>
                    </span>
                  ) : (
                    <span className="text-amber-400">Silakan isi analisa Anda untuk menjawab soal ini</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl">
                <h3 className="text-sm md:text-base font-semibold text-white leading-relaxed">
                  <AntiCheatText text={currentQ.questionText} />
                </h3>
              </div>

              {/* Option Selection List */}
              <div className="space-y-3">
                {(() => {
                  const safeOptions = Array.isArray(currentQ?.options)
                    ? currentQ.options
                    : (typeof currentQ?.options === 'string'
                        ? (() => { try { return JSON.parse(currentQ.options); } catch { return []; } })()
                        : []);
                  return safeOptions.map((opt, idx) => {
                    if (!opt) return null;
                    const letters = ['A', 'B', 'C', 'D'];
                    const isSelected = userAnswers[currentQ.id]?.answerId === opt.id;

                    return (
                      <button
                        key={`opt-${currentQ.id}-${opt.id}-${idx}`}
                        onClick={() => handleSelectOption(opt.id)}
                      className={`w-full text-left p-4 rounded-xl border text-xs md:text-sm font-medium transition-all flex items-center justify-between group ${
                        isSelected
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-200 font-semibold shadow-md'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex items-center space-x-3.5 pr-4">
                        <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 border transition-all ${
                          isSelected
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                            : 'bg-slate-800 text-slate-400 border-slate-700 group-hover:text-white'
                        }`}>
                          {currentQ.type === 'true_false' ? (idx === 0 ? 'T' : 'F') : letters[idx]}
                        </span>
                        <span className="leading-snug"><AntiCheatText text={opt.text} /></span>
                      </div>

                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                });
              })()}
              </div>
            </>
          )}

        </div>

        {/* Bottom Pagination & Navigation */}
        <div className="mt-8 pt-4 border-t border-slate-850 flex items-center justify-between">
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 border border-slate-800 rounded-xl text-xs font-semibold flex items-center space-x-1"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Sebelumnya</span>
          </button>

          {/* Quick Number Selector Palette */}
          <div className="hidden sm:flex items-center space-x-1.5 overflow-x-auto max-w-[300px] p-1">
            {questions.map((q, i) => {
              const ans = userAnswers[q.id];
              const isCurr = i === currentIndex;
              let btnClass = 'bg-slate-900 text-slate-400 border-slate-800';

              if (ans?.answerId) {
                btnClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold';
              }
              if (ans?.isFlaggedDoubt) {
                btnClass = 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold';
              }
              if (isCurr) {
                btnClass += ' ring-2 ring-emerald-400';
              }

              return (
                <button
                  key={`nav-q-${q.id}-${i}`}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-7 h-7 rounded-lg text-[11px] font-mono border transition-all flex items-center justify-center ${btnClass}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {currentIndex === questions.length - 1 ? (
            <button
              onClick={() => setShowSubmitModal(true)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 border border-emerald-500 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Kumpulkan Ujian</span>
            </button>
          ) : (
            <button
              onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-xs font-semibold flex items-center space-x-1"
            >
              <span>Selanjutnya</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

      </div>

      {/* Confirmation Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 text-center space-y-4">
            
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <FileCheck2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Konfirmasi Pengumpulan Ujian</h3>
              <p className="text-xs text-slate-400 mt-1">
                Apakah Anda sudah yakin ingin mengakhiri dan mengumpulkan jawaban ujian ini?
              </p>
            </div>

            <div className="p-3 bg-slate-850 border border-slate-800 rounded-xl text-xs text-left space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Soal Dijawab:</span>
                <span className="font-bold text-emerald-400">{answeredCount} dari {questions.length}</span>
              </div>
              {unansweredCount > 0 && (
                <div className="flex justify-between text-rose-400">
                  <span>Belum Dijawab:</span>
                  <span className="font-bold">{unansweredCount} soal</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs"
              >
                Kembali Periksa
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20"
              >
                Ya, Kumpulkan
              </button>
            </div>

          </div>
          </div>
      )}

    </div>
  );
};
