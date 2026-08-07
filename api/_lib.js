import { GoogleGenAI } from '@google/genai';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function fallbackQuestions(topic, count = 3, category = 'Umum') {
  const items = [];
  for (let i = 0; i < Math.max(1, Number(count) || 3); i += 1) {
    items.push({
      questionText: `Manakah tindakan terbaik untuk ${topic} dalam konteks ${category}?`,
      type: 'multiple_choice',
      options: [
        { id: 'opt-a', text: 'Mengikuti prosedur yang telah ditetapkan' },
        { id: 'opt-b', text: 'Mengabaikan standar demi kecepatan' },
        { id: 'opt-c', text: 'Menunggu sampai ada masalah besar' },
        { id: 'opt-d', text: 'Mengandalkan pengalaman tanpa dokumentasi' }
      ],
      correctAnswerId: 'opt-a',
      explanation: `Praktik ${topic} yang baik memerlukan kepatuhan terhadap SOP dan dokumentasi yang jelas.`,
      points: 25
    });
  }
  return items;
}

function fallbackParsedQuestions(documentText) {
  const lines = documentText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [
      {
        questionText: 'Apakah dokumen ini sesuai untuk dijadikan bahan ujian?',
        type: 'multiple_choice',
        options: [
          { id: 'opt-a', text: 'Ya, dokumen cukup jelas' },
          { id: 'opt-b', text: 'Tidak, dokumen terlalu singkat' },
          { id: 'opt-c', text: 'Hanya jika ada pembahasan tambahan' },
          { id: 'opt-d', text: 'Tidak bisa dipastikan' }
        ],
        correctAnswerId: 'opt-a',
        explanation: 'Dokumen ini dapat dikonversi menjadi soal dengan format standar.',
        points: 25
      }
    ];
  }

  return lines.slice(0, 3).map((line, index) => ({
    questionText: line.length > 160 ? `${line.slice(0, 157)}...` : line,
    type: 'multiple_choice',
    options: [
      { id: 'opt-a', text: 'Pilihan A' },
      { id: 'opt-b', text: 'Pilihan B' },
      { id: 'opt-c', text: 'Pilihan C' },
      { id: 'opt-d', text: 'Pilihan D' }
    ],
    correctAnswerId: index % 2 === 0 ? 'opt-a' : 'opt-c',
    explanation: 'Soal ini dibuat dari isi dokumen yang diunggah.',
    points: 25
  }));
}

export async function handleHealthCheck(req, res) {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
}

export async function handleParseDocumentQuestions(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { documentText, category = 'Umum' } = body;

    if (!documentText || typeof documentText !== 'string' || !documentText.trim()) {
      res.status(400).json({ error: 'Isi teks dokumen tidak boleh kosong' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `Anda adalah sistem ekstraktor soal ujian. Keluarkan array JSON soal pilihan ganda dalam Bahasa Indonesia. Kategori: "${category}".\n\n${documentText.slice(0, 15000)}`;
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
        const textResult = response.text || '[]';
        const parsed = JSON.parse(textResult);
        res.status(200).json({ success: true, questions: parsed });
        return;
      } catch (error) {
        console.warn('Gemini parse failed, using fallback parser:', error);
      }
    }

    res.status(200).json({ success: true, questions: fallbackParsedQuestions(documentText) });
  } catch (error) {
    console.error('Parse document error:', error);
    res.status(500).json({ error: error.message || 'Gagal memproses dokumen' });
  }
}

export async function handleGenerateQuestions(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const { topic, count = 3, category = 'Umum' } = body;

    if (!topic) {
      res.status(400).json({ error: 'Topik ujian diperlukan' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `Buat ${count} soal pilihan ganda dalam Bahasa Indonesia untuk kategori "${category}" tentang topik "${topic}". Kembalikan format JSON array.`;
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
        const textResult = response.text || '[]';
        const parsed = JSON.parse(textResult);
        res.status(200).json({ success: true, questions: parsed });
        return;
      } catch (error) {
        console.warn('Gemini generation failed, using fallback template:', error);
      }
    }

    res.status(200).json({ success: true, questions: fallbackQuestions(topic, count, category) });
  } catch (error) {
    console.error('Generate questions error:', error);
    res.status(500).json({ error: error.message || 'Gagal membuat soal' });
  }
}
