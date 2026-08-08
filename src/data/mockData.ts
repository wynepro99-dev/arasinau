import { User, ExamPackage, Question, ExamAttempt } from '../types';

const RAW_INITIAL_USERS: User[] = [
  // Dewan Komisaris & Direksi
  {
    id: 'user-dir-1',
    name: 'Taka Ditya Darma',
    email: 'taka.darma@arasinau.co.id',
    password: 'rahasia1',
    role: 'admin',
    department: 'Dewan Komisaris'
  },
  {
    id: 'user-pm-1',
    name: 'Della Ananto',
    email: 'della.ananto@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Project Manager (PM)'
  },
  {
    id: 'user-dir-3',
    name: 'Muhammad Rizky Hidayat Sujimin',
    email: 'm.rizky@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Direksi'
  },
  {
    id: 'user-dir-4',
    name: 'Tunggul Wisnu Hadi',
    email: 'tunggul.wisnu@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Direksi'
  },

  // Pejabat Eksekutif (PE)
  {
    id: 'user-pe-1',
    name: 'Agus Santoso',
    email: 'agus.santoso@arasinau.co.id',
    password: 'rahasia1',
    role: 'admin',
    department: 'PE Audit Intern'
  },
  {
    id: 'user-pe-2',
    name: 'Huda Asrori',
    email: 'huda.asrori@arasinau.co.id',
    password: 'rahasia1',
    role: 'admin',
    department: 'PE Kepatuhan'
  },
  {
    id: 'user-pe-3',
    name: 'Eny Setyoningsih',
    email: 'eny.setyoningsih@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'PE Literasi'
  },

  // Divisi Support & Operasional
  {
    id: 'user-sop-1',
    name: 'Lilis Ariyani',
    email: 'lilis.ariyani@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Admin - SDM - Legal'
  },
  {
    id: 'user-sop-2',
    name: 'Vergiawan A.S',
    email: 'vergiawan@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Pengembangan SDM'
  },
  {
    id: 'user-sop-3',
    name: 'Ghaust Shamdani',
    email: 'ghaust.shamdani@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Teknologi Informasi'
  },
  {
    id: 'user-sop-4',
    name: 'Ahmad Wahyu Aji',
    email: 'ahmad.wahyu@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'CRM'
  },
  {
    id: 'user-sop-5',
    name: 'Yuni Susilowati',
    email: 'yuni.susilowati@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Accounting'
  },
  {
    id: 'user-sop-6a',
    name: 'Ichwan A.M',
    email: 'ichwan.am@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Bagian Umum'
  },
  {
    id: 'user-sop-6b',
    name: 'Sunarti',
    email: 'sunarti@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Bagian Umum'
  },
  {
    id: 'user-sop-7',
    name: 'Agung Bekti P.',
    email: 'agung.bekti@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Analis Kredit'
  },
  {
    id: 'user-media-1',
    name: 'Ridho',
    email: 'ridho@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Media'
  },
  {
    id: 'user-media-2',
    name: 'Titus',
    email: 'titus@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Media'
  },

  // Kantor Pusat
  {
    id: 'user-kp-1',
    name: 'Tiara Suci P',
    email: 'tiara.suci@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Kantor Pusat'
  },
  {
    id: 'user-kp-2a',
    name: 'Anik Budiarti',
    email: 'anik.budiarti@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Kantor Pusat'
  },
  {
    id: 'user-kp-2b',
    name: 'Nada Rizky Eka M',
    email: 'nada.rizky@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Kantor Pusat'
  },

  // Kantor Kas Jumapolo
  {
    id: 'user-kkj-1',
    name: 'Tri Surono',
    email: 'tri.surono@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Kas Jumapolo'
  },
  {
    id: 'user-kkj-2',
    name: 'Nina Suryaningsih',
    email: 'nina.suryaningsih@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Kas Jumapolo'
  },

  // Kantor Kas Matesih
  {
    id: 'user-kkm-1',
    name: 'Memet Fianka',
    email: 'memet.fianka@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Kas Matesih'
  },
  {
    id: 'user-kkm-2',
    name: 'Karolina Rosita',
    email: 'karolina.rosita@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Kas Matesih'
  },
  {
    id: 'user-kkm-3',
    name: 'Widi Miswari',
    email: 'widi.miswari@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Kas Matesih'
  },

  // Kantor Kas Klodran
  {
    id: 'user-kkk-1',
    name: 'Ariyanto',
    email: 'ariyanto@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Kas Klodran'
  },
  {
    id: 'user-kkk-2',
    name: 'Purnaning H T',
    email: 'purnaning@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Kas Klodran'
  },

  // Divisi Collection
  {
    id: 'user-col-1',
    name: 'B. Windra D.H',
    email: 'windra.dh@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Collection'
  },
  {
    id: 'user-col-2a',
    name: 'Y. Deddie E.',
    email: 'deddie.e@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Collection'
  },
  {
    id: 'user-col-2b',
    name: 'Wahid Budi S.',
    email: 'wahid.budi@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'Collection'
  }
];

export const INITIAL_USERS: User[] = [
  ...RAW_INITIAL_USERS.map(u => ({ ...u, company: 'BANK' as const })),
  {
    id: 'user-sec-putri',
    name: 'Putri',
    email: 'putri@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'SEC Bimbel',
    company: 'SEC' as const
  },
  {
    id: 'user-sec-fatima',
    name: 'Fatima',
    email: 'fatima@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'SEC Bimbel',
    company: 'SEC' as const
  },
  {
    id: 'user-sec-khaila',
    name: 'Khaila',
    email: 'khaila@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'SEC Bimbel',
    company: 'SEC' as const
  },
  {
    id: 'user-sec-jehan',
    name: 'Jehan',
    email: 'jehan@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'SEC Bimbel',
    company: 'SEC' as const
  },
  {
    id: 'user-sec-neto',
    name: 'Neto',
    email: 'neto@arasinau.co.id',
    password: '123456',
    role: 'karyawan',
    department: 'SEC Bimbel',
    company: 'SEC' as const
  }
];

export const INITIAL_EXAMS: ExamPackage[] = [];

export const INITIAL_QUESTIONS: Question[] = [];

export const INITIAL_ATTEMPTS: ExamAttempt[] = [];
