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

export const INITIAL_EXAMS: ExamPackage[] = [
  {
    id: 'exam-sec-m1',
    title: 'KUIS SEC MINGGU 1',
    description: 'Evaluasi pemahaman filosofi, SEOS, dan framework pembelajaran Smarteducafe Minggu 1.',
    category: 'Smarteducafe',
    durationMinutes: 20,
    passingScore: 70,
    createdAt: new Date().toISOString().split('T')[0],
    status: 'active',
    authorName: 'Taka Ditya Darma',
    scope: 'SEC'
  }
];

export const INITIAL_QUESTIONS: Question[] = [
  {
    id: 'q-sec-m1-1',
    examId: 'exam-sec-m1',
    type: 'multiple_choice',
    questionText: 'Seorang siswa selalu memperoleh nilai tinggi pada latihan yang polanya sama dengan contoh guru. Namun ketika soal dimodifikasi sedikit, ia tidak mampu menyelesaikannya. Menurut filosofi Smarteducafe, penyebab utama kondisi tersebut adalah...',
    options: [
      { id: 'opt-a', text: 'Siswa kurang menghafal rumus.' },
      { id: 'opt-b', text: 'Pembelajaran terlalu menekankan pengenalan pola jawaban daripada membangun model berpikir.' },
      { id: 'opt-c', text: 'Guru memberikan soal yang terlalu sulit.' },
      { id: 'opt-d', text: 'Siswa membutuhkan lebih banyak latihan soal.' }
    ],
    correctAnswerId: 'opt-b',
    points: 10,
    scope: 'SEC'
  },
  {
    id: 'q-sec-m1-2',
    examId: 'exam-sec-m1',
    type: 'multiple_choice',
    questionText: 'Dalam Smarteducafe Education Operating System (SEOS), sebuah kelas berhasil meningkatkan motivasi siswa, tetapi proses belajarnya tidak memiliki alur yang jelas sehingga pemahaman siswa tidak berkembang secara konsisten. Fondasi yang paling perlu diperkuat adalah...',
    options: [
      { id: 'opt-a', text: 'Student Development' },
      { id: 'opt-b', text: 'Knowledge Intelligence' },
      { id: 'opt-c', text: 'Learning System' },
      { id: 'opt-d', text: 'Teaching Excellence' }
    ],
    correctAnswerId: 'opt-c',
    points: 10,
    scope: 'SEC'
  },
  {
    id: 'q-sec-m1-3',
    examId: 'exam-sec-m1',
    type: 'multiple_choice',
    questionText: 'Seorang tentor selalu memberikan jawaban ketika siswa mengalami kesulitan agar kelas berjalan cepat. Berdasarkan Prolog Smarteducafe, tindakan tersebut kurang tepat karena...',
    options: [
      { id: 'opt-a', text: 'Guru tidak boleh membantu siswa.' },
      { id: 'opt-b', text: 'AI lebih baik daripada guru dalam menjawab pertanyaan.' },
      { id: 'opt-c', text: 'Nilai tentor terletak pada kemampuan membimbing proses berpikir, bukan sekadar memberikan jawaban.' },
      { id: 'opt-d', text: 'Siswa seharusnya belajar sendiri tanpa bimbingan.' }
    ],
    correctAnswerId: 'opt-c',
    points: 10,
    scope: 'SEC'
  },
  {
    id: 'q-sec-m1-4',
    examId: 'exam-sec-m1',
    type: 'multiple_choice',
    questionText: 'Dalam Society 5.0, Smarteducafe memandang hubungan antara teknologi dan manusia sebagai...',
    options: [
      { id: 'opt-a', text: 'Teknologi menggantikan seluruh peran guru.' },
      { id: 'opt-b', text: 'AI menjadi satu-satunya sumber pembelajaran.' },
      { id: 'opt-c', text: 'Teknologi digunakan untuk memperkuat peran mentor manusia dalam pembelajaran.' },
      { id: 'opt-d', text: 'Guru hanya bertugas mengawasi penggunaan AI.' }
    ],
    correctAnswerId: 'opt-c',
    points: 10,
    scope: 'SEC'
  },
  {
    id: 'q-sec-m1-5',
    examId: 'exam-sec-m1',
    type: 'multiple_choice',
    questionText: 'Seorang guru mengubah sistem penilaian dari hanya melihat jawaban akhir menjadi menilai alasan, strategi, dan refleksi siswa. Perubahan tersebut paling sesuai dengan tujuan...',
    options: [
      { id: 'opt-a', text: 'Meningkatkan jumlah soal latihan.' },
      { id: 'opt-b', text: 'Mengukur proses berpikir, bukan sekadar hasil akhir.' },
      { id: 'opt-c', text: 'Mengurangi beban koreksi guru.' },
      { id: 'opt-d', text: 'Meningkatkan tingkat kesulitan ujian.' }
    ],
    correctAnswerId: 'opt-b',
    points: 10,
    scope: 'SEC'
  },
  {
    id: 'q-sec-m1-6',
    examId: 'exam-sec-m1',
    type: 'multiple_choice',
    questionText: 'Mengapa Smarteducafe menilai bahwa nilai tinggi tidak selalu menjadi indikator keberhasilan belajar?',
    options: [
      { id: 'opt-a', text: 'Karena nilai tidak diperlukan dalam pendidikan.' },
      { id: 'opt-b', text: 'Karena dunia kerja hanya membutuhkan karakter.' },
      { id: 'opt-c', text: 'Karena nilai dapat diperoleh tanpa kemampuan berpikir, refleksi, dan belajar mandiri.' },
      { id: 'opt-d', text: 'Karena semua bentuk evaluasi harus dihapuskan.' }
    ],
    correctAnswerId: 'opt-c',
    points: 10,
    scope: 'SEC'
  },
  {
    id: 'q-sec-m1-7',
    examId: 'exam-sec-m1',
    type: 'multiple_choice',
    questionText: 'Dalam konsep Learning Economy, kompetensi yang paling penting dimiliki seseorang adalah...',
    options: [
      { id: 'opt-a', text: 'Menghafal sebanyak mungkin informasi.' },
      { id: 'opt-b', text: 'Memiliki sertifikat sebanyak mungkin.' },
      { id: 'opt-c', text: 'Kemampuan untuk terus belajar, beradaptasi, dan melakukan unlearning.' },
      { id: 'opt-d', text: 'Menguasai satu keterampilan teknis sepanjang hidup.' }
    ],
    correctAnswerId: 'opt-c',
    points: 10,
    scope: 'SEC'
  },
  {
    id: 'q-sec-m1-8',
    examId: 'exam-sec-m1',
    type: 'multiple_choice',
    questionText: 'Seorang tentor rutin mencatat kesalahan siswa, membagikan strategi mengajar yang efektif kepada tim, dan memperbaiki metode berdasarkan data kelas. Perilaku tersebut menunjukkan penerapan...',
    options: [
      { id: 'opt-a', text: 'Teaching Excellence saja.' },
      { id: 'opt-b', text: 'Student Development saja.' },
      { id: 'opt-c', text: 'Knowledge Intelligence.' },
      { id: 'opt-d', text: 'Learning System saja.' }
    ],
    correctAnswerId: 'opt-c',
    points: 10,
    scope: 'SEC'
  },
  {
    id: 'q-sec-m1-9',
    examId: 'exam-sec-m1',
    type: 'multiple_choice',
    questionText: 'Dalam Framework Smarteducafe (Radar Krisis Pendidikan), sebuah sekolah hanya berfokus pada peringkat dan kelulusan tanpa memperhatikan kemampuan berpikir siswa. Fokus yang terlalu dominan adalah...',
    options: [
      { id: 'opt-a', text: 'Capacity' },
      { id: 'opt-b', text: 'Experience' },
      { id: 'opt-c', text: 'Output' },
      { id: 'opt-d', text: 'System' }
    ],
    correctAnswerId: 'opt-c',
    points: 10,
    scope: 'SEC'
  },
  {
    id: 'q-sec-m1-10',
    examId: 'exam-sec-m1',
    type: 'multiple_choice',
    questionText: 'Seorang kepala program meminta seluruh tentor menambahkan pertanyaan "Mengapa?" pada setiap tugas inti. Tujuan utama kebijakan tersebut adalah...',
    options: [
      { id: 'opt-a', text: 'Memperbanyak jumlah soal.' },
      { id: 'opt-b', text: 'Membuat tugas lebih sulit.' },
      { id: 'opt-c', text: 'Mendorong siswa menjelaskan proses berpikir sehingga rasa ingin tahu dan penalaran berkembang.' },
      { id: 'opt-d', text: 'Mengurangi waktu diskusi di kelas.' }
    ],
    correctAnswerId: 'opt-c',
    points: 10,
    scope: 'SEC'
  }
];

export const INITIAL_ATTEMPTS: ExamAttempt[] = [];
