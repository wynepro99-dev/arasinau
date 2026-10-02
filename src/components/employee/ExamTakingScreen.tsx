import React, { useState, useEffect } from 'react';
import { User, ExamPackage, Question, ExamAttempt, AttemptAnswer } from '../../types';
import { saveAttempt } from '../../lib/storage';
import {
  Clock,
  Check,
  Flag,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Send,
  AlertTriangle,
  FileCheck2,
  BookOpen,
  Lock,
  LayoutGrid
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
    
    // Gboard/Keyboard Clipboard Injection Protection
    const oldTextLength = existing.essayText?.length || 0;
    if (text.length - oldTextLength > 3) {
      onToast('🔒 Anti-Kecurangan Aktif: Input teks terlalu cepat (dicurigai hasil Paste dari keyboard). Anda wajib mengetik secara manual.', 'error');
      return;
    }

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

  // Status per soal (urutan sama dengan nomor soal) untuk progres, daftar soal & konfirmasi
  const isAnswered = (qId: string) => {
    const a = userAnswers[qId];
    return !!(a && (a.answerId || a.essayText?.trim()));
  };
  const answeredCount = questions.filter(q => isAnswered(q.id)).length;
  const unansweredCount = questions.length - answeredCount;
  const unansweredNumbers = questions.map((q, i) => (isAnswered(q.id) ? 0 : i + 1)).filter(Boolean);
  const doubtNumbers = questions.map((q, i) => (userAnswers[q.id]?.isFlaggedDoubt ? i + 1 : 0)).filter(Boolean);
  const [showQuestionList, setShowQuestionList] = useState(false);

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

  const isTimeWarning = timeLeftSeconds < 180; // Less than 3 minutes
  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return h > 0 ? `${h}:${mmss}` : mmss;
  };

  if (!currentQ) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-lg text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl">
        Terjadi kesalahan memuat soal ujian.
      </div>
    );
  }

  const isEssayType = currentQ.type === 'case_study' || currentQ.type === 'essay';
  const isTrueFalse = currentQ.type === 'true_false';
  const isLastQuestion = currentIndex === questions.length - 1;
  const isFlagged = !!userAnswers[currentQ.id]?.isFlaggedDoubt;
  const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const essayText = userAnswers[currentQ.id]?.essayText || '';
  const essayWordCount = essayText.trim().split(/\s+/).filter(Boolean).length;
  const answerHint = isEssayType ? 'Jawab dengan menulis' : isTrueFalse ? 'Pilih Benar atau Salah' : 'Pilih satu jawaban';

  const safeOptions = Array.isArray(currentQ?.options)
    ? currentQ.options
    : (typeof currentQ?.options === 'string'
        ? (() => { try { return JSON.parse(currentQ.options); } catch { return []; } })()
        : []);

  const goToQuestion = (index: number) => {
    setCurrentIndex(Math.min(questions.length - 1, Math.max(0, index)));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const FOCUS_RING = 'focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/40';

  return (
    <div className="max-w-3xl mx-auto w-full animate-fade-in text-slate-900 dark:text-zinc-100">

      {/* Header ujian: judul, sisa waktu, progres (menempel di bawah navbar) */}
      <div className="sticky top-16 [@media(max-height:560px)]:static z-30 -mx-4 sm:mx-0 px-4 sm:px-0 pt-1 pb-3 bg-slate-50/95 dark:bg-black/95 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {exam.category && (
              <p className="text-sm text-slate-500 dark:text-zinc-400 truncate">{exam.category}</p>
            )}
            <h1 className="text-base sm:text-lg font-bold leading-snug line-clamp-2 break-words">{exam.title}</h1>
          </div>

          <div
            role="timer"
            aria-label="Sisa waktu ujian"
            className={`shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-2xl border-2 ${
              isTimeWarning
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100'
            }`}
          >
            <Clock className="w-5 h-5 shrink-0" />
            <div className="leading-tight">
              <p className="text-[11px] sm:text-xs font-medium opacity-80">Sisa waktu</p>
              <p className="text-lg sm:text-xl font-bold tabular-nums">{formatTime(timeLeftSeconds)}</p>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-3 text-sm sm:text-base">
            <span className="font-semibold">
              Soal {currentIndex + 1} dari {questions.length}
            </span>
            <span className="text-slate-600 dark:text-zinc-400">{answeredCount} sudah dijawab</span>
          </div>
          <div
            className="mt-2 h-2.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden"
            role="progressbar"
            aria-label="Soal yang sudah dijawab"
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-valuenow={answeredCount}
          >
            <div className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {isTimeWarning && (
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Waktu hampir habis. Jawaban dikumpulkan otomatis saat waktu habis.</span>
          </p>
        )}
      </div>

      {/* Kartu soal */}
      <div className="mt-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm sm:text-base text-slate-600 dark:text-zinc-400">
            <span className="font-bold text-slate-900 dark:text-white">Soal {currentIndex + 1}</span>
            <span className="mx-2" aria-hidden="true">·</span>
            {answerHint}
          </p>
          <button
            type="button"
            onClick={handleToggleDoubt}
            aria-pressed={isFlagged}
            className={`min-h-11 px-4 rounded-xl border-2 text-sm sm:text-base font-semibold flex items-center gap-2 transition-colors ${FOCUS_RING} ${
              isFlagged
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:border-slate-400 dark:hover:border-zinc-500'
            }`}
          >
            <Flag className="w-4 h-4" />
            <span>{isFlagged ? 'Ditandai ragu-ragu' : 'Tandai ragu-ragu'}</span>
          </button>
        </div>

        {isEssayType && currentQ.caseStudyStory && (
          <div className="rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-zinc-400 mb-3">
              <BookOpen className="w-4 h-4" />
              <span>Bacaan studi kasus</span>
            </p>
            <p className="text-base sm:text-lg text-slate-800 dark:text-zinc-200 whitespace-pre-line leading-relaxed">
              <AntiCheatText text={currentQ.caseStudyStory} />
            </p>
          </div>
        )}

        <h2 className="text-xl sm:text-2xl font-semibold leading-relaxed text-slate-900 dark:text-white">
          <AntiCheatText text={currentQ.questionText} />
        </h2>

        {isEssayType ? (
          <div className="space-y-3">
            <label htmlFor={`essay-${currentQ.id}`} className="block text-base sm:text-lg font-semibold">
              Tulis jawaban Anda
            </label>
            <textarea
              id={`essay-${currentQ.id}`}
              rows={8}
              placeholder="Ketik jawaban Anda di sini..."
              value={essayText}
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
              className="w-full p-4 sm:p-5 bg-white dark:bg-zinc-950 border-2 border-slate-300 dark:border-zinc-700 focus:border-indigo-600 dark:focus:border-indigo-400 rounded-2xl text-base sm:text-lg leading-relaxed text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15 transition-colors"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-zinc-400">
              <span>{essayWordCount} kata</span>
              {essayText.trim() ? (
                <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                  <Check className="w-4 h-4" />
                  <span>Jawaban tersimpan</span>
                </span>
              ) : (
                <span>Belum dijawab</span>
              )}
            </div>
            <p className="flex items-start gap-2 text-sm text-slate-500 dark:text-zinc-400">
              <Lock className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Jawaban diketik sendiri. Fitur salin dan tempel (copy-paste) tidak dapat digunakan.</span>
            </p>
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label={`Pilihan jawaban soal ${currentIndex + 1}`}
            className={isTrueFalse ? 'grid grid-cols-2 gap-3 sm:gap-4' : 'space-y-3'}
          >
            {safeOptions.map((opt: { id: string; text: string } | null, idx: number) => {
              if (!opt) return null;
              const letters = ['A', 'B', 'C', 'D', 'E'];
              const isSelected = userAnswers[currentQ.id]?.answerId === opt.id;

              if (isTrueFalse) {
                return (
                  <button
                    key={`opt-${currentQ.id}-${opt.id}-${idx}`}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleSelectOption(opt.id)}
                    className={`min-h-20 px-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 text-lg sm:text-xl font-bold transition-colors ${FOCUS_RING} ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-600 dark:border-indigo-400 text-indigo-900 dark:text-indigo-100'
                        : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 hover:border-slate-400 dark:hover:border-zinc-500'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {isSelected && <Check className="w-5 h-5 stroke-[3]" />}
                      <AntiCheatText text={opt.text} />
                    </span>
                    {isSelected && <span className="text-sm font-semibold">Pilihan Anda</span>}
                  </button>
                );
              }

              return (
                <button
                  key={`opt-${currentQ.id}-${opt.id}-${idx}`}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelectOption(opt.id)}
                  className={`w-full min-h-16 text-left p-4 sm:p-5 rounded-2xl border-2 flex items-center gap-4 transition-colors ${FOCUS_RING} ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-600 dark:border-indigo-400'
                      : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-500'
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-base font-bold shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 dark:bg-indigo-500 border-indigo-600 dark:border-indigo-500 text-white'
                        : 'border-slate-300 dark:border-zinc-600 text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    {letters[idx] || idx + 1}
                  </span>
                  <span className="flex-1 text-base sm:text-lg leading-relaxed text-slate-900 dark:text-zinc-100">
                    <AntiCheatText text={opt.text} />
                  </span>
                  {isSelected && (
                    <span className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                      <Check className="w-5 h-5 stroke-[3]" />
                      <span className="hidden sm:inline">Pilihan Anda</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Daftar soal (bisa dibuka/tutup) */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowQuestionList(v => !v)}
          aria-expanded={showQuestionList}
          aria-controls="daftar-soal"
          className={`w-full sm:w-auto min-h-12 px-5 rounded-2xl border-2 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-base font-semibold text-slate-800 dark:text-zinc-200 hover:border-slate-400 dark:hover:border-zinc-500 flex items-center justify-center gap-2 transition-colors ${FOCUS_RING}`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span>Daftar Soal</span>
          <span className="font-normal text-slate-500 dark:text-zinc-400">({answeredCount}/{questions.length} dijawab)</span>
          <ChevronDown className={`w-5 h-5 transition-transform ${showQuestionList ? 'rotate-180' : ''}`} />
        </button>

        {showQuestionList && (
          <div id="daftar-soal" className="mt-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 sm:gap-3">
              {questions.map((q, i) => {
                const answered = isAnswered(q.id);
                const doubt = !!userAnswers[q.id]?.isFlaggedDoubt;
                const isCurrent = i === currentIndex;
                const stateClass = doubt
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                  : answered
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                    : 'bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300';
                const status = doubt ? 'ragu-ragu' : answered ? 'sudah dijawab' : 'belum dijawab';
                return (
                  <button
                    key={`nav-q-${q.id}-${i}`}
                    type="button"
                    onClick={() => goToQuestion(i)}
                    aria-label={`Soal ${i + 1}, ${status}`}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`relative h-12 rounded-xl border-2 text-base font-bold tabular-nums flex items-center justify-center transition-colors ${FOCUS_RING} ${stateClass} ${
                      isCurrent ? 'ring-4 ring-indigo-500/40 border-indigo-600 dark:border-indigo-400' : ''
                    }`}
                  >
                    {i + 1}
                    {(doubt || answered) && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white dark:bg-zinc-900 border border-current flex items-center justify-center">
                        {doubt ? <Flag className="w-3 h-3" /> : <Check className="w-3 h-3 stroke-[3]" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-zinc-400">
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" /> Sudah dijawab
              </span>
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30" /> Ragu-ragu
              </span>
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border-2 border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900" /> Belum dijawab
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className={`w-full sm:w-auto min-h-12 px-5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-base font-bold flex items-center justify-center gap-2 transition-colors ${FOCUS_RING}`}
            >
              <Send className="w-5 h-5" />
              <span>Kumpulkan Jawaban</span>
            </button>
          </div>
        )}
      </div>

      {/* Tombol navigasi bawah (selalu terlihat) */}
      <div className="sticky bottom-0 z-30 -mx-4 sm:mx-0 mt-4 px-4 sm:px-0 py-3 bg-slate-50/95 dark:bg-black/95 backdrop-blur-sm border-t border-slate-200 dark:border-zinc-800 sm:border-t-0">
        <div className="flex items-stretch gap-3">
          <button
            type="button"
            onClick={() => goToQuestion(currentIndex - 1)}
            disabled={currentIndex === 0}
            className={`flex-1 sm:flex-none sm:min-w-44 min-h-14 px-5 rounded-2xl border-2 bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-base sm:text-lg font-semibold text-slate-800 dark:text-zinc-200 hover:border-slate-400 dark:hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors ${FOCUS_RING}`}
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Sebelumnya</span>
          </button>

          {isLastQuestion ? (
            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className={`flex-1 min-h-14 px-5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-base sm:text-lg font-bold flex items-center justify-center gap-2 shadow-sm transition-colors ${FOCUS_RING}`}
            >
              <Send className="w-5 h-5" />
              <span>Kumpulkan Jawaban</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToQuestion(currentIndex + 1)}
              className={`flex-1 min-h-14 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-base sm:text-lg font-bold flex items-center justify-center gap-2 shadow-sm transition-colors ${FOCUS_RING}`}
            >
              <span>Berikutnya</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Konfirmasi pengumpulan */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="judul-kumpulkan"
            className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-6 sm:p-7 text-slate-900 dark:text-zinc-100 space-y-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <h3 id="judul-kumpulkan" className="text-xl font-bold">Kumpulkan jawaban sekarang?</h3>
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-4 space-y-3 text-base">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600 dark:text-zinc-400">Sudah dijawab</span>
                <span className="font-bold">{answeredCount} dari {questions.length} soal</span>
              </div>
              {unansweredCount > 0 && (
                <div className="text-rose-700 dark:text-rose-300">
                  <div className="flex items-center justify-between gap-3">
                    <span>Belum dijawab</span>
                    <span className="font-bold">{unansweredCount} soal</span>
                  </div>
                  <p className="text-sm mt-0.5">No. {unansweredNumbers.join(', ')}</p>
                </div>
              )}
              {doubtNumbers.length > 0 && (
                <div className="text-amber-800 dark:text-amber-300">
                  <div className="flex items-center justify-between gap-3">
                    <span>Ditandai ragu-ragu</span>
                    <span className="font-bold">{doubtNumbers.length} soal</span>
                  </div>
                  <p className="text-sm mt-0.5">No. {doubtNumbers.join(', ')}</p>
                </div>
              )}
            </div>

            <p className="text-sm text-slate-600 dark:text-zinc-400">
              Setelah dikumpulkan, jawaban tidak dapat diubah lagi.
            </p>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSubmitModal(false);
                  if (unansweredNumbers.length > 0) goToQuestion(unansweredNumbers[0] - 1);
                }}
                className={`flex-1 min-h-12 px-4 rounded-2xl border-2 bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-base font-semibold text-slate-800 dark:text-zinc-200 hover:border-slate-400 transition-colors ${FOCUS_RING}`}
              >
                {unansweredNumbers.length > 0 ? `Ke Soal No. ${unansweredNumbers[0]}` : 'Kembali Periksa'}
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                className={`flex-1 min-h-12 px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-base font-bold transition-colors ${FOCUS_RING}`}
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
