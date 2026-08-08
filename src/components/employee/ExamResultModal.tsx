import React, { useEffect } from 'react';
import { ExamAttempt, Question } from '../../types';
import confetti from 'canvas-confetti';
import { 
  Award, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RotateCcw, 
  X, 
  BookOpen, 
  HelpCircle
} from 'lucide-react';

interface ExamResultModalProps {
  attempt: ExamAttempt;
  questions: Question[];
  onClose: () => void;
  onRetakeExam?: () => void;
}

export const ExamResultModal: React.FC<ExamResultModalProps> = ({
  attempt,
  questions,
  onClose,
  onRetakeExam
}) => {
  useEffect(() => {
    if (attempt.passed) {
      // Trigger confetti celebration on pass
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {
        // ignore if confetti fails
      }
    }
  }, [attempt.passed]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 max-h-[92vh] flex flex-col">
        
        {/* Header Banner */}
        <div className={`p-6 border-b text-center relative ${
          attempt.passed
            ? 'bg-gradient-to-b from-emerald-950/60 to-slate-900 border-emerald-500/30'
            : 'bg-gradient-to-b from-rose-950/60 to-slate-900 border-rose-500/30'
        }`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Badge Icon */}
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 border shadow-xl ${
            attempt.passed
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
          }`}>
            {attempt.passed ? <Award className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </div>

          <h2 className="text-xl font-black text-white">
            {attempt.passed ? 'Selamat! Anda Dinyatakan LULUS' : 'Belum Memenuhi Passing Grade'}
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
            {attempt.examTitle}
          </p>

          {/* Main Big Score */}
          <div className="mt-4 inline-flex items-baseline space-x-1 px-6 py-2 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <span className={`text-4xl font-black ${attempt.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
              {attempt.score}
            </span>
            <span className="text-xs text-slate-400 font-semibold">/ 100 PTS</span>
          </div>
        </div>

        {/* Specs & Question Review Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="bg-slate-850 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">Total Poin Diperoleh</span>
              <div className="font-bold text-white mt-0.5">{attempt.totalPointsEarned} / {attempt.totalMaxPoints}</div>
            </div>

            <div className="bg-slate-850 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">Waktu Pengerjaan</span>
              <div className="font-bold text-white mt-0.5">
                {Math.floor(attempt.durationSecondsUsed / 60)}m {attempt.durationSecondsUsed % 60}s
              </div>
            </div>

            <div className="bg-slate-850 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">Status Evaluasi</span>
              <div className={`font-bold mt-0.5 ${attempt.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {attempt.passed ? 'Memenuhi Standard' : 'Perlu Remedial'}
              </div>
            </div>
          </div>

          {/* Question Breakdown with Explanations */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Pembahasan & Evaluasi Jawaban</span>
              <span className="text-[10px] text-emerald-400 font-normal">Kunci Jawaban Resmi</span>
            </h3>

            {questions.map((q, idx) => {
              const ans = attempt.answers[q.id];
              const isCorrect = ans?.isCorrect;
              const selectedOpt = q.options.find(o => o.id === ans?.selectedAnswerId);
              const correctOpt = q.options.find(o => o.id === q.correctAnswerId);

              if (q.type === 'case_study' || q.type === 'essay') {
                return (
                  <div key={`res-q-${q.id}-${idx}`} className="p-4 bg-slate-850 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border mr-2 ${
                          q.type === 'case_study'
                            ? 'text-purple-400 bg-purple-500/10 border-purple-500/20'
                            : 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                        }`}>
                          {q.type === 'case_study' ? 'Studi Kasus & Essay' : 'Soal Essay'}
                        </span>
                        <span className="text-xs font-bold text-white">Soal #{idx + 1}</span>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md shrink-0 ${
                        ans?.essayAnswer
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {ans?.essayAnswer ? 'DIJAWAB' : 'KOSONG'}
                      </span>
                    </div>

                    {q.caseStudyStory && (
                      <div className="p-3 bg-slate-900/80 border border-purple-500/20 rounded-xl text-xs text-slate-300 space-y-1">
                        <span className="text-[10px] font-bold text-purple-400 block">Cerita Studi Kasus:</span>
                        <p className="whitespace-pre-line leading-relaxed text-slate-200">{q.caseStudyStory}</p>
                      </div>
                    )}

                    <div className="text-xs text-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 block">Pertanyaan / Instruksi:</span>
                      <p className="font-semibold text-white">{q.questionText}</p>
                    </div>

                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-bold block">Jawaban Essay Anda:</span>
                        <span className="text-[11px] font-bold text-emerald-400">
                          Nilai: {ans?.pointsEarned ?? 0} / {q.points} Poin
                        </span>
                      </div>
                      <p className="font-sans text-emerald-300 whitespace-pre-line leading-relaxed">
                        {ans?.essayAnswer || 'Tidak diisi.'}
                      </p>
                    </div>

                    {ans?.aiFeedback && (
                      <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between text-indigo-300 font-bold text-[11px]">
                          <span className="flex items-center space-x-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Catatan & Evaluasi Penilaian Admin:</span>
                          </span>
                          <span className="text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30 font-mono">
                            {ans.pointsEarned} / {q.points} PTS
                          </span>
                        </div>
                        <p className="text-slate-200 whitespace-pre-line leading-relaxed font-sans pt-0.5">
                          {ans.aiFeedback}
                        </p>
                      </div>
                    )}

                    {(q.sampleAnswer || q.explanation) && (
                      <div className="text-[11px] text-slate-300 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80">
                        <span className="font-bold text-emerald-400">Acuan Jawaban / Rubrik Penilaian: </span>
                        {q.sampleAnswer || q.explanation}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={`res-q-${q.id}-${idx}`} className="p-4 bg-slate-850 border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-white">Soal #{idx + 1}: {q.questionText}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md shrink-0 ${
                      isCorrect
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}>
                      {isCorrect ? 'BENAR' : 'SALAH'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Jawaban Anda:</span>
                      <span className={`font-medium ${isCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {selectedOpt?.text || 'Tidak Dijawab'}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Kunci Jawaban Benar:</span>
                      <span className="font-medium text-emerald-400">
                        {correctOpt?.text || '-'}
                      </span>
                    </div>
                  </div>

                  {q.explanation && (
                    <div className="text-[11px] text-slate-300 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 mt-1">
                      <span className="font-bold text-emerald-400">Penjelasan / Pembahasan: </span>
                      {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end space-x-2">

          <button
            onClick={onClose}
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20"
          >
            Tutup Lembar Hasil
          </button>
        </div>

      </div>
    </div>
  );
};
