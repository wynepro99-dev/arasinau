import { User, ExamPackage, Question, ExamAttempt, ExamWithQuestions } from '../types';
import { INITIAL_USERS, INITIAL_EXAMS, INITIAL_QUESTIONS, INITIAL_ATTEMPTS } from '../data/mockData';
import { getSupabaseClient } from './supabase';

// In-Memory Database Store (Tanpa keharusan localStorage)
let memoryUsers: User[] = [...INITIAL_USERS];
let memoryExams: ExamPackage[] = [...INITIAL_EXAMS];
let memoryQuestions: Question[] = [...INITIAL_QUESTIONS];
let memoryAttempts: ExamAttempt[] = [...INITIAL_ATTEMPTS];
let memoryCurrentUser: User | null = null;

let globalIdSeq = 1;
function generateUniqueId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${Date.now()}-${rand}-${globalIdSeq++}`;
}

export function getUserUsername(user: User): string {
  const words = user.name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
  let firstName = words[0]?.toLowerCase() || '';
  if (firstName.length <= 1 && words.length > 1) {
    firstName = words[1].toLowerCase();
  }
  const suffix = (user.company === 'SEC') ? 'sec' : 'ara';
  return `${firstName}.${suffix}`;
}

// Optional Session Sync helper
function saveSessionUser(user: User | null) {
  memoryCurrentUser = user;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (user) {
        sessionStorage.setItem('ara_session_user', JSON.stringify(user));
      } else {
        sessionStorage.removeItem('ara_session_user');
      }
    }
  } catch (e) {
    // Ignore storage restrictions
  }
}

export function initStorage() {
  if (typeof window === 'undefined') return;
  try {
    if (window.sessionStorage) {
      const sess = sessionStorage.getItem('ara_session_user');
      if (sess) {
        memoryCurrentUser = JSON.parse(sess);
      }
    }
  } catch (e) {
    // Memory fallback
  }

  // Auto trigger background sync if Supabase is connected
  syncFromSupabase().catch(() => {});
}

let autoSyncInterval: any = null;
let realtimeChannel: any = null;

export function startSupabaseAutoSync(onDataChange?: () => void) {
  if (typeof window === 'undefined') return;

  // Run initial sync immediately
  syncFromSupabase().then((res) => {
    if (res.success && onDataChange) {
      onDataChange();
    }
  }).catch(() => {});

  // Clean existing interval/subscription if any
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  if (realtimeChannel) {
    try {
      const client = getSupabaseClient();
      if (client) client.removeChannel(realtimeChannel);
    } catch (e) {}
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      realtimeChannel = client.channel('public:db-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, async () => {
          await syncFromSupabase();
          if (onDataChange) onDataChange();
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscription fallback:', e);
    }
  }

  // Background polling every 8 seconds as robust fallback
  autoSyncInterval = setInterval(async () => {
    const res = await syncFromSupabase();
    if (res.success && onDataChange) {
      onDataChange();
    }
  }, 8000);
}

// --- SUPABASE SYNC OPERATIONS ---
export async function syncFromSupabase(): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Supabase URL/Key belum dikonfigurasi.' };
  }

  try {
    // 1. Ensure all preset INITIAL_USERS and current memoryUsers are upserted into Supabase
    const userMap = new Map<string, User>();
    for (const u of INITIAL_USERS) {
      userMap.set(u.email.toLowerCase(), u);
    }
    for (const u of memoryUsers) {
      userMap.set(u.email.toLowerCase(), u);
    }
    const allUsersToUpsert = Array.from(userMap.values());

    const formattedUsersToUpsert = allUsersToUpsert.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      password: u.password || '123456',
      role: u.role,
      department: u.department,
      avatar: u.avatar,
      company: u.company || 'BANK'
    }));

    const { error: upsertUserErr } = await client.from('users').upsert(formattedUsersToUpsert, { onConflict: 'email' });
    if (upsertUserErr) {
      console.warn('Upsert Initial Users Warning:', upsertUserErr);
    }

    // 2. Fetch users from Supabase
    const { data: usersData, error: usersErr } = await client.from('users').select('*');
    if (!usersErr && usersData && usersData.length > 0) {
      const mergedMap = new Map<string, User>();
      for (const u of allUsersToUpsert) {
        mergedMap.set(u.email.toLowerCase(), u);
      }
      for (const u of usersData) {
        mergedMap.set(u.email.toLowerCase(), {
          id: u.id,
          name: u.name,
          email: u.email,
          password: u.password || '123456',
          role: u.role,
          department: u.department,
          avatar: u.avatar,
          company: u.company || 'BANK'
        });
      }
      memoryUsers = Array.from(mergedMap.values());
    } else {
      memoryUsers = allUsersToUpsert;
    }

    // 3. Fetch exam packages
    const { data: examsData, error: examsErr } = await client.from('exam_packages').select('*');
    if (!examsErr) {
      const examMap = new Map<string, ExamPackage>();
      memoryExams.forEach(e => examMap.set(e.id, e));
      if (examsData && examsData.length > 0) {
        examsData.forEach((e: any) => {
          examMap.set(e.id, {
            id: e.id,
            title: e.title,
            description: e.description,
            category: e.category,
            durationMinutes: e.duration_minutes,
            passingScore: e.passing_score,
            createdAt: e.created_at,
            status: e.status,
            authorName: e.author_name,
            scope: e.scope || 'BANK'
          });
        });
      }
      memoryExams = Array.from(examMap.values());
      
      const formattedExams = memoryExams.map(e => ({
        id: e.id,
        title: e.title,
        description: e.description,
        category: e.category,
        duration_minutes: e.durationMinutes,
        passing_score: e.passingScore,
        created_at: e.createdAt,
        status: e.status,
        author_name: e.authorName,
        scope: e.scope || 'BANK'
      }));
      if (formattedExams.length > 0) {
        await client.from('exam_packages').upsert(formattedExams, { onConflict: 'id' });
      }
    }

    // 4. Fetch questions
    const { data: qData, error: qErr } = await client.from('questions').select('*');
    if (!qErr) {
      const qMap = new Map<string, Question>();
      memoryQuestions.forEach(q => qMap.set(q.id, q));
      if (qData && qData.length > 0) {
        qData.forEach((q: any) => {
          qMap.set(q.id, {
            id: q.id,
            examId: q.exam_id,
            type: q.type,
            questionText: q.question_text,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []),
            correctAnswerId: q.correct_answer_id,
            explanation: q.explanation,
            points: q.points,
            caseStudyStory: q.case_study_story || q.caseStudyStory || '',
            sampleAnswer: q.sample_answer || q.sampleAnswer || '',
            scope: q.scope || 'BANK'
          });
        });
      }
      memoryQuestions = Array.from(qMap.values());

      const formattedQuestions = memoryQuestions.map(q => ({
        id: q.id,
        exam_id: q.examId,
        type: q.type,
        question_text: q.questionText,
        options: q.options,
        correct_answer_id: q.correctAnswerId,
        explanation: q.explanation,
        points: q.points,
        case_study_story: q.caseStudyStory || '',
        sample_answer: q.sampleAnswer || '',
        scope: q.scope || 'BANK'
      }));
      if (formattedQuestions.length > 0) {
        await client.from('questions').upsert(formattedQuestions, { onConflict: 'id' });
      }
    }

    // 5. Fetch attempts
    const { data: attData, error: attErr } = await client.from('exam_attempts').select('*');
    if (!attErr) {
      const attMap = new Map<string, ExamAttempt>();
      memoryAttempts.forEach(a => attMap.set(a.id, a));
      if (attData && attData.length > 0) {
        attData.forEach((a: any) => {
          attMap.set(a.id, {
            id: a.id,
            examId: a.exam_id,
            userId: a.user_id,
            userName: a.user_name,
            userDepartment: a.user_department,
            examTitle: a.exam_title,
            score: Number(a.score),
            totalPointsEarned: a.total_points_earned,
            totalMaxPoints: a.total_max_points,
            passed: a.passed,
            startedAt: a.started_at,
            completedAt: a.completed_at,
            durationSecondsUsed: a.duration_seconds_used,
            answers: typeof a.answers === 'string' ? JSON.parse(a.answers) : a.answers
          });
        });
      }
      memoryAttempts = Array.from(attMap.values());

      const formattedAttempts = memoryAttempts.map(a => ({
        id: a.id,
        exam_id: a.examId,
        user_id: a.userId,
        user_name: a.userName,
        user_department: a.userDepartment,
        exam_title: a.examTitle,
        score: a.score,
        total_points_earned: a.totalPointsEarned,
        total_max_points: a.totalMaxPoints,
        passed: a.passed,
        started_at: a.startedAt,
        completed_at: a.completedAt,
        duration_seconds_used: a.durationSecondsUsed,
        answers: a.answers
      }));
      if (formattedAttempts.length > 0) {
        await client.from('exam_attempts').upsert(formattedAttempts, { onConflict: 'id' });
      }
    }

    return { 
      success: true, 
      message: `Berhasil sinkronisasi! ${memoryUsers.length} Akun Personel & Data Ujian telah terdaftar di Supabase.` 
    };
  } catch (err: any) {
    console.error('Supabase Sync Error:', err);
    return { success: false, message: err.message || 'Gagal tersambung ke database Supabase.' };
  }
}

export async function seedSupabaseDatabase(): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Supabase URL/Key belum dikonfigurasi.' };
  }

  try {
    // 1. Seed Users (All INITIAL_USERS + memoryUsers)
    const userMap = new Map<string, User>();
    for (const u of INITIAL_USERS) {
      userMap.set(u.email.toLowerCase(), u);
    }
    for (const u of memoryUsers) {
      userMap.set(u.email.toLowerCase(), u);
    }
    const allUsers = Array.from(userMap.values());

    const formattedUsers = allUsers.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      password: u.password || '123456',
      role: u.role,
      department: u.department,
      avatar: u.avatar,
      company: u.company || 'BANK'
    }));
    await client.from('users').upsert(formattedUsers, { onConflict: 'email' });

    // 2. Seed Exams
    const formattedExams = memoryExams.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      category: e.category,
      duration_minutes: e.durationMinutes,
      passing_score: e.passingScore,
      created_at: e.createdAt,
      status: e.status,
      author_name: e.authorName,
      scope: e.scope || 'BANK'
    }));
    if (formattedExams.length > 0) {
      await client.from('exam_packages').upsert(formattedExams, { onConflict: 'id' });
    }

    // 3. Seed Questions
    const formattedQuestions = memoryQuestions.map(q => ({
      id: q.id,
      exam_id: q.examId,
      type: q.type,
      question_text: q.questionText,
      options: q.options,
      correct_answer_id: q.correctAnswerId,
      explanation: q.explanation,
      points: q.points,
      case_study_story: q.caseStudyStory || '',
      sample_answer: q.sampleAnswer || '',
      scope: q.scope || 'BANK'
    }));
    if (formattedQuestions.length > 0) {
      await client.from('questions').upsert(formattedQuestions, { onConflict: 'id' });
    }

    // 4. Seed Attempts
    const formattedAttempts = memoryAttempts.map(a => ({
      id: a.id,
      exam_id: a.examId,
      user_id: a.userId,
      user_name: a.userName,
      user_department: a.userDepartment,
      exam_title: a.examTitle,
      score: a.score,
      total_points_earned: a.totalPointsEarned,
      total_max_points: a.totalMaxPoints,
      passed: a.passed,
      started_at: a.startedAt,
      completed_at: a.completedAt,
      duration_seconds_used: a.durationSecondsUsed,
      answers: a.answers
    }));
    if (formattedAttempts.length > 0) {
      await client.from('exam_attempts').upsert(formattedAttempts, { onConflict: 'id' });
    }

    return { 
      success: true, 
      message: `Semua data (${allUsers.length} Akun Personel, Paket Ujian & Soal) berhasil disuntikkan ke Supabase Database!` 
    };
  } catch (err: any) {
    console.error('Seed Supabase Error:', err);
    return { success: false, message: err.message || 'Gagal mengunggah data awal ke Supabase.' };
  }
}

// --- USER & AUTH ---
export function cleanupBrokenProfiles(): number {
  const initialCount = memoryUsers.length;
  // Filter out any broken profiles with missing name, email without @, or undefined string values
  memoryUsers = memoryUsers.filter(u => {
    if (!u.name || typeof u.name !== 'string' || !u.name.trim() || u.name.includes('undefined') || u.name.includes('null')) return false;
    if (!u.email || typeof u.email !== 'string' || !u.email.trim() || !u.email.includes('@') || u.email.includes('undefined')) return false;
    if (!u.role || (u.role !== 'admin' && u.role !== 'karyawan')) return false;
    return true;
  });
  return initialCount - memoryUsers.length;
}

export function deleteUser(userId: string): void {
  memoryUsers = memoryUsers.filter(u => u.id !== userId);
  if (memoryCurrentUser?.id === userId) {
    setCurrentUser(null);
  }
  const client = getSupabaseClient();
  if (client) {
    Promise.resolve(client.from('users').delete().eq('id', userId)).catch(() => {});
  }
}

export function getUsers(): User[] {
  // Always verify PRESET users (Huda, Agus, Taka as admin, Della Ananto PM, etc.) are present
  for (const initUser of INITIAL_USERS) {
    const idx = memoryUsers.findIndex(u => u.id === initUser.id || u.email.toLowerCase() === initUser.email.toLowerCase());
    if (idx === -1) {
      memoryUsers.push(initUser);
    } else {
      // Keep preset role, department, & password updated
      memoryUsers[idx] = { 
        ...memoryUsers[idx], 
        id: initUser.id,
        role: initUser.role, 
        password: initUser.password || '123456', 
        name: initUser.name, 
        department: initUser.department 
      };
    }
  }

  // Auto clean broken/corrupted profiles
  cleanupBrokenProfiles();

  return memoryUsers;
}

export function getCurrentUser(): User | null {
  return memoryCurrentUser;
}

export function setCurrentUser(user: User | null): void {
  saveSessionUser(user);
}

export function registerUser(newUser: Omit<User, 'id'>): User {
  const users = getUsers();
  const existing = users.find(u => u.email.toLowerCase() === newUser.email.toLowerCase());
  if (existing) {
    throw new Error('Email sudah terdaftar. Silakan login atau gunakan email lain.');
  }

  const createdUser: User = {
    ...newUser,
    password: newUser.password || '123456',
    id: generateUniqueId('user')
  };

  memoryUsers.push(createdUser);
  setCurrentUser(createdUser);

  // Sync to Supabase in background if available
  const client = getSupabaseClient();
  if (client) {
    (async () => {
      try {
        await client.from('users').insert({
          id: createdUser.id,
          name: createdUser.name,
          email: createdUser.email,
          password: createdUser.password,
          role: createdUser.role,
          department: createdUser.department,
          avatar: createdUser.avatar,
          company: createdUser.company || 'BANK'
        });
      } catch (e) {
        console.error(e);
      }
    })();
  }

  return createdUser;
}

export function updateUser(userId: string, updates: Partial<User>): User {
  const idx = memoryUsers.findIndex(u => u.id === userId);
  if (idx === -1) {
    throw new Error('User tidak ditemukan.');
  }

  const updated = { ...memoryUsers[idx], ...updates };
  memoryUsers[idx] = updated;

  // If this is the current logged-in user, sync the current user state
  if (memoryCurrentUser && memoryCurrentUser.id === userId) {
    saveSessionUser(updated);
  }

  const client = getSupabaseClient();
  if (client) {
    (async () => {
      try {
        await client.from('users').update({
          name: updated.name,
          email: updated.email,
          password: updated.password,
          role: updated.role,
          department: updated.department,
          avatar: updated.avatar,
          company: updated.company || 'BANK'
        }).eq('id', userId);
      } catch (e) {
        console.error('Update user error:', e);
      }
    })();
  }

  return updated;
}

// --- EXAMS ---
export function getExams(): ExamPackage[] {
  return memoryExams;
}

export function saveExam(exam: Omit<ExamPackage, 'id' | 'createdAt'> & { id?: string }): ExamPackage {
  let saved: ExamPackage;

  if (exam.id) {
    const idx = memoryExams.findIndex(e => e.id === exam.id);
    if (idx !== -1) {
      saved = { ...memoryExams[idx], ...exam };
      memoryExams[idx] = saved;
    } else {
      saved = {
        ...exam,
        id: exam.id,
        createdAt: new Date().toISOString().split('T')[0]
      } as ExamPackage;
      memoryExams.push(saved);
    }
  } else {
    saved = {
      ...exam,
      id: generateUniqueId('exam'),
      createdAt: new Date().toISOString().split('T')[0]
    } as ExamPackage;
    memoryExams.push(saved);
  }

  // Async push to Supabase
  const client = getSupabaseClient();
  if (client) {
    (async () => {
      try {
        await client.from('exam_packages').upsert({
          id: saved.id,
          title: saved.title,
          description: saved.description,
          category: saved.category,
          duration_minutes: saved.durationMinutes,
          passing_score: saved.passingScore,
          created_at: saved.createdAt,
          status: saved.status,
          author_name: saved.authorName,
          scope: saved.scope || 'BANK'
        }, { onConflict: 'id' });
      } catch (e) {
        console.error(e);
      }
    })();
  }

  return saved;
}

export function deleteExam(examId: string): void {
  memoryExams = memoryExams.filter(e => e.id !== examId);
  memoryQuestions = memoryQuestions.filter(q => q.examId !== examId);
  memoryAttempts = memoryAttempts.filter(a => a.examId !== examId);

  const client = getSupabaseClient();
  if (client) {
    (async () => {
      try {
        await client.from('exam_packages').delete().eq('id', examId);
        await client.from('questions').delete().eq('exam_id', examId);
        await client.from('exam_attempts').delete().eq('exam_id', examId);
      } catch (e) {
        console.error(e);
      }
    })();
  }
}

// --- QUESTIONS ---
export function getQuestions(): Question[] {
  return memoryQuestions;
}

export function getQuestionsByExamId(examId: string): Question[] {
  return memoryQuestions.filter(q => q.examId === examId);
}

export function saveQuestion(question: Omit<Question, 'id'> & { id?: string }): Question {
  let saved: Question;

  if (question.id) {
    const idx = memoryQuestions.findIndex(q => q.id === question.id);
    if (idx !== -1) {
      saved = { ...memoryQuestions[idx], ...question };
      memoryQuestions[idx] = saved;
    } else {
      saved = { ...question, id: question.id };
      memoryQuestions.push(saved);
    }
  } else {
    saved = { ...question, id: generateUniqueId('q') };
    memoryQuestions.push(saved);
  }

  const client = getSupabaseClient();
  if (client) {
    (async () => {
      try {
        await client.from('questions').upsert({
          id: saved.id,
          exam_id: saved.examId,
          type: saved.type,
          question_text: saved.questionText,
          options: saved.options,
          correct_answer_id: saved.correctAnswerId,
          explanation: saved.explanation,
          points: saved.points,
          case_study_story: saved.caseStudyStory || '',
          sample_answer: saved.sampleAnswer || '',
          scope: saved.scope || 'BANK'
        }, { onConflict: 'id' });
      } catch (e) {
        console.error(e);
      }
    })();
  }

  return saved;
}

export function deleteQuestion(questionId: string): void {
  memoryQuestions = memoryQuestions.filter(q => q.id !== questionId);
  const client = getSupabaseClient();
  if (client) {
    (async () => {
      try {
        await client.from('questions').delete().eq('id', questionId);
      } catch (e) {
        console.error(e);
      }
    })();
  }
}

export function getExamWithQuestions(examId: string): ExamWithQuestions | null {
  const exam = memoryExams.find(e => e.id === examId);
  if (!exam) return null;
  const questions = getQuestionsByExamId(examId);
  return { ...exam, questions };
}

// --- ATTEMPTS & SCORES ---
export function getAttempts(): ExamAttempt[] {
  return memoryAttempts;
}

export function saveAttempt(attempt: Omit<ExamAttempt, 'id'>): ExamAttempt {
  const saved: ExamAttempt = {
    ...attempt,
    id: generateUniqueId('att')
  };
  memoryAttempts.unshift(saved);

  const client = getSupabaseClient();
  if (client) {
    (async () => {
      try {
        await client.from('exam_attempts').insert({
          id: saved.id,
          exam_id: saved.examId,
          user_id: saved.userId,
          user_name: saved.userName,
          user_department: saved.userDepartment,
          exam_title: saved.examTitle,
          score: saved.score,
          total_points_earned: saved.totalPointsEarned,
          total_max_points: saved.totalMaxPoints,
          passed: saved.passed,
          started_at: saved.startedAt,
          completed_at: saved.completedAt,
          duration_seconds_used: saved.durationSecondsUsed,
          answers: saved.answers
        });
      } catch (e) {
        console.error(e);
      }
    })();
  }

  return saved;
}

export function updateAttempt(updatedAttempt: ExamAttempt): ExamAttempt {
  const idx = memoryAttempts.findIndex(a => a.id === updatedAttempt.id);
  if (idx !== -1) {
    memoryAttempts[idx] = updatedAttempt;
  } else {
    memoryAttempts.unshift(updatedAttempt);
  }

  const client = getSupabaseClient();
  if (client) {
    (async () => {
      try {
        await client.from('exam_attempts').upsert({
          id: updatedAttempt.id,
          exam_id: updatedAttempt.examId,
          user_id: updatedAttempt.userId,
          user_name: updatedAttempt.userName,
          user_department: updatedAttempt.userDepartment,
          exam_title: updatedAttempt.examTitle,
          score: updatedAttempt.score,
          total_points_earned: updatedAttempt.totalPointsEarned,
          total_max_points: updatedAttempt.totalMaxPoints,
          passed: updatedAttempt.passed,
          started_at: updatedAttempt.startedAt,
          completed_at: updatedAttempt.completedAt,
          duration_seconds_used: updatedAttempt.durationSecondsUsed,
          answers: updatedAttempt.answers
        }, { onConflict: 'id' });
      } catch (e) {
        console.error(e);
      }
    })();
  }

  return updatedAttempt;
}

export function clearAllExams(): void {
  memoryExams = [];
  const client = getSupabaseClient();
  if (client) {
    Promise.resolve(client.from('exam_packages').delete().neq('id', '')).catch(() => {});
  }
}

export function clearAllQuestions(): void {
  memoryQuestions = [];
  const client = getSupabaseClient();
  if (client) {
    Promise.resolve(client.from('questions').delete().neq('id', '')).catch(() => {});
  }
}

export function clearAllAttempts(): void {
  memoryAttempts = [];
  const client = getSupabaseClient();
  if (client) {
    Promise.resolve(client.from('exam_attempts').delete().neq('id', '')).catch(() => {});
  }
}

export function clearAllQuestionsAndAttempts(): void {
  memoryQuestions = [];
  memoryAttempts = [];
  const client = getSupabaseClient();
  if (client) {
    Promise.resolve(client.from('questions').delete().neq('id', '')).catch(() => {});
    Promise.resolve(client.from('exam_attempts').delete().neq('id', '')).catch(() => {});
  }
}

export function clearAllData(): void {
  memoryExams = [];
  memoryQuestions = [];
  memoryAttempts = [];
  const client = getSupabaseClient();
  if (client) {
    Promise.resolve(client.from('exam_packages').delete().neq('id', '')).catch(() => {});
    Promise.resolve(client.from('questions').delete().neq('id', '')).catch(() => {});
    Promise.resolve(client.from('exam_attempts').delete().neq('id', '')).catch(() => {});
  }
}

export function resetDemoData(): void {
  memoryUsers = [...INITIAL_USERS];
  memoryExams = [];
  memoryQuestions = [];
  memoryAttempts = [];
  memoryCurrentUser = null;
  clearAllData();
}

