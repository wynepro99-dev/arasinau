import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, ExamPackage, Question, ExamAttempt } from '../types';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseConfig() {
  const env = (import.meta as any).env || {};
  let url = env.VITE_SUPABASE_URL || '';
  let key = env.VITE_SUPABASE_ANON_KEY || '';

  if (typeof window !== 'undefined') {
    url = url || (window as any).__SUPABASE_URL__ || localStorage.getItem('ara_supabase_url') || '';
    key = key || (window as any).__SUPABASE_ANON_KEY__ || localStorage.getItem('ara_supabase_key') || '';
  }
  return { url, key };
}

export function setRuntimeSupabaseConfig(url: string, key: string) {
  if (typeof window !== 'undefined') {
    (window as any).__SUPABASE_URL__ = url;
    (window as any).__SUPABASE_ANON_KEY__ = key;
    if (url && key) {
      try {
        localStorage.setItem('ara_supabase_url', url);
        localStorage.setItem('ara_supabase_key', key);
      } catch (e) {
        // ignore storage errors
      }
    }
  }
  if (url && key) {
    supabaseInstance = createClient(url, key, {
      global: {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    });
  } else {
    supabaseInstance = null;
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const { url, key } = getSupabaseConfig();
  if (url && key) {
    try {
      supabaseInstance = createClient(url, key, {
        global: {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      });
      return supabaseInstance;
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
      return null;
    }
  }
  return null;
}

export const SUPABASE_SQL_SCHEMA = `-- COPY DAN JALANKAN SQL INI DI SUPABASE SQL EDITOR ANDA
-- Table 1: Users (Pengguna)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT DEFAULT '123456',
  role TEXT NOT NULL DEFAULT 'karyawan',
  department TEXT,
  avatar TEXT,
  company TEXT NOT NULL DEFAULT 'BANK',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: Exam Packages (Paket Ujian)
CREATE TABLE IF NOT EXISTS public.exam_packages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  duration_minutes INT DEFAULT 15,
  passing_score INT DEFAULT 70,
  created_at TEXT,
  status TEXT DEFAULT 'active',
  author_name TEXT,
  scope TEXT NOT NULL DEFAULT 'BANK'
);

-- Table 3: Questions (Soal Ujian)
CREATE TABLE IF NOT EXISTS public.questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT REFERENCES public.exam_packages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer_id TEXT NOT NULL,
  explanation TEXT,
  points INT DEFAULT 25,
  scope TEXT NOT NULL DEFAULT 'BANK'
);

-- Table 4: Exam Attempts (Hasil & Riwayat Ujian)
CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id TEXT PRIMARY KEY,
  exam_id TEXT,
  user_id TEXT,
  user_name TEXT,
  user_department TEXT,
  exam_title TEXT,
  score NUMERIC,
  total_points_earned INT,
  total_max_points INT,
  passed BOOLEAN,
  started_at TEXT,
  completed_at TEXT,
  duration_seconds_used INT,
  answers JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Row Level Security) with public access policy for demo/testing
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on users" ON public.users FOR ALL USING (true);
CREATE POLICY "Allow public all on exam_packages" ON public.exam_packages FOR ALL USING (true);
CREATE POLICY "Allow public all on questions" ON public.questions FOR ALL USING (true);
CREATE POLICY "Allow public all on exam_attempts" ON public.exam_attempts FOR ALL USING (true);
`;
