export type UserRole = 'admin' | 'karyawan' | 'egi';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  department: string;
  avatar?: string;
  company?: 'BANK' | 'SEC' | 'ALL'; // BANK = Bank, SEC = Bimbel, ALL = Both
}

export type QuestionType = 'multiple_choice' | 'true_false' | 'case_study' | 'essay';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  examId: string;
  type: QuestionType;
  questionText: string;
  options: QuestionOption[];
  correctAnswerId: string; // Option ID or 'true'/'false' or 'essay'
  explanation?: string;
  points: number;
  caseStudyStory?: string; // Cerita/skenario/narasi studi kasus
  sampleAnswer?: string; // Acuan kunci jawaban / rubrik penilaian essay
  scope?: 'BANK' | 'SEC' | 'ALL';
  createdAt?: string; // Tanggal soal dibuat
}

export interface ExamPackage {
  id: string;
  title: string;
  description: string;
  category: string; // e.g. K3, IT Security, Softskills, Onboarding
  durationMinutes: number; // Duration in minutes
  passingScore: number; // Minimum passing percentage e.g. 70
  createdAt: string;
  status: 'active' | 'draft' | 'closed';
  authorName: string;
  scope?: 'BANK' | 'SEC' | 'ALL';
  startTime?: string;
  endTime?: string;
}

export interface AttemptAnswer {
  questionId: string;
  selectedAnswerId: string;
  isCorrect: boolean;
  pointsEarned: number;
  isFlaggedDoubt?: boolean;
  essayAnswer?: string;
  aiFeedback?: string;
}

export interface ExamAttempt {
  id: string;
  examId: string;
  userId: string;
  userName: string;
  userDepartment: string;
  examTitle: string;
  score: number; // 0 - 100 percentage
  totalPointsEarned: number;
  totalMaxPoints: number;
  passed: boolean;
  startedAt: string;
  completedAt: string;
  durationSecondsUsed: number;
  answers: Record<string, AttemptAnswer>; // questionId -> Answer
}

export interface ExamWithQuestions extends ExamPackage {
  questions: Question[];
}

export interface LearningModule {
  id: string;
  title: string;
  description: string;
  imageUrl?: string; // Optional cover image
  fileUrl: string; // Could be a real URL or base64 data URL
  fileName: string;
  uploadedBy: string; // User name
  createdAt: string;
}
