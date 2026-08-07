import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());

// API Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// AI Document Parser Endpoint for Bulk Upload from Word, Docs, TXT, PDF, CSV
app.post("/api/parse-document-questions", async (req, res) => {
  try {
    const { documentText, category = "Umum" } = req.body;

    if (!documentText || typeof documentText !== "string" || !documentText.trim()) {
      return res.status(400).json({ error: "Isi teks dokumen tidak boleh kosong" });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ 
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });
        const prompt = `Anda adalah sistem ekstraktor soal ujian berpengalaman.
Tugas Anda: Ekstrak dan susun seluruh soal dari dokumen teks berikut menjadi array JSON berisi soal pilihan ganda atau Benar/Salah dalam Bahasa Indonesia.

Kategori Ujian: "${category}"

Isi Dokumen Teks:
"""
${documentText.slice(0, 15000)}
"""

Petunjuk Ekstraksi:
1. Temukan setiap pertanyaan/soal dalam teks.
2. Temukan pilihan jawabannya (opsi A, B, C, D atau True/False). Jika dokumen hanya menyajikan pertanyaan tanpa opsi, buatkan 4 opsi jawaban logis yang relevan.
3. Tentukan mana jawaban yang benar berdasarkan dokumen atau pengetahuan umum.
4. Sertakan penjelasan/pembahasan ringkas jika tersedia atau dapat disimpulkan.
5. Set nilai default "points" = 25 per soal.

FORMAT Wajib Respon JSON BERSIH TANPA MARKDOWN BACKTICKS:
[
  {
    "questionText": "Pertanyaan...",
    "type": "multiple_choice",
    "options": [
      { "id": "opt-a", "text": "Pilihan A" },
      { "id": "opt-b", "text": "Pilihan B" },
      { "id": "opt-c", "text": "Pilihan C" },
      { "id": "opt-d", "text": "Pilihan D" }
    ],
    "correctAnswerId": "opt-a",
    "explanation": "Pembahasan singkat...",
    "points": 25
  }
]`;

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          }
        });

        const textResult = response.text || "[]";
        const parsed = JSON.parse(textResult);
        return res.json({ success: true, questions: parsed });
      } catch (geminiError) {
        console.warn("Gemini Document Parser call warning, falling back to regex parser:", geminiError);
      }
    }

    // Smart Regex Fallback Parser for local/offline parsing
    const lines = documentText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsedQuestions: any[] = [];
    let currentQ: any = null;

    for (const line of lines) {
      if (/^(soal\s*)?\d+[\.\)]/i.test(line) || /^\d+\s*-\s*/.test(line)) {
        if (currentQ && currentQ.questionText) {
          if (currentQ.options.length < 2) {
            currentQ.options = [
              { id: "opt-a", text: "Sesuai dengan SOP" },
              { id: "opt-b", text: "Tidak sesuai dengan SOP" },
              { id: "opt-c", text: "Opsional tergantung kondisi" },
              { id: "opt-d", text: "Bukan wewenang karyawan" }
            ];
          }
          parsedQuestions.push(currentQ);
        }
        currentQ = {
          questionText: line.replace(/^(soal\s*)?\d+[\.\)]\s*/i, "").replace(/^\d+\s*-\s*/, ""),
          type: "multiple_choice",
          options: [],
          correctAnswerId: "opt-a",
          explanation: "Diimpor secara otomatis dari dokumen.",
          points: 25
        };
      } else if (currentQ) {
        const optMatch = line.match(/^([a-d])[\.\)]\s*(.*)/i);
        if (optMatch) {
          const letter = optMatch[1].toLowerCase();
          const optId = `opt-${letter}`;
          currentQ.options.push({
            id: optId,
            text: optMatch[2]
          });
        } else if (/^(kunci|jawaban|ans|answer)\s*:\s*([a-d])/i.test(line)) {
          const keyMatch = line.match(/([a-d])$/i);
          if (keyMatch) {
            currentQ.correctAnswerId = `opt-${keyMatch[1].toLowerCase()}`;
          }
        } else if (/^(pembahasan|penjelasan|expl)\s*:\s*(.*)/i.test(line)) {
          currentQ.explanation = line.replace(/^(pembahasan|penjelasan|expl)\s*:\s*/i, "");
        } else if (currentQ.options.length === 0) {
          currentQ.questionText += " " + line;
        }
      }
    }

    if (currentQ && currentQ.questionText) {
      if (currentQ.options.length < 2) {
        currentQ.options = [
          { id: "opt-a", text: "Sesuai dengan SOP" },
          { id: "opt-b", text: "Tidak sesuai dengan SOP" },
          { id: "opt-c", text: "Opsional tergantung kondisi" },
          { id: "opt-d", text: "Bukan wewenang karyawan" }
        ];
      }
      parsedQuestions.push(currentQ);
    }

    if (parsedQuestions.length === 0) {
      parsedQuestions.push({
        questionText: documentText.slice(0, 200) + "...",
        type: "multiple_choice",
        options: [
          { id: "opt-a", text: "Sesuai ketentuan standar operasional" },
          { id: "opt-b", text: "Memerlukan konfirmasi dari supervisor" },
          { id: "opt-c", text: "Hanya berlaku untuk kasus darurat" },
          { id: "opt-d", text: "Tidak disarankan dalam prosedur" }
        ],
        correctAnswerId: "opt-a",
        explanation: "Hasil konversi dokumen.",
        points: 25
      });
    }

    return res.json({ success: true, questions: parsedQuestions });
  } catch (err: any) {
    console.error("Document parse error:", err);
    res.status(500).json({ error: err?.message || "Gagal memproses dokumen" });
  }
});

// AI Question Generation Endpoint for Admin
app.post("/api/generate-questions", async (req, res) => {
  try {
    const { topic, count = 3, category = "Umum" } = req.body;

    if (!topic) {
      return res.status(400).json({ error: "Topik ujian diperlukan" });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ 
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });
        const prompt = `Anda adalah pakar pembuatan soal ujian pelatihan karyawan profesional dalam Bahasa Indonesia.
Buatkan ${count} soal pilihan ganda berkualitas tinggi untuk kategori "${category}" tentang topik: "${topic}".

Setiap soal harus menyertakan 4 pilihan jawaban (opsi A, B, C, D), sebutkan kunci jawaban yang benar (satu dari id opsi), serta berikan penjelasan singkat (pembahasan).

Kembalikan respon DALAM FORMAT JSON BERSIH TANPA MARKDOWN BACKTICKS:
[
  {
    "questionText": "Teks soal...",
    "type": "multiple_choice",
    "options": [
      { "id": "opt-a", "text": "Pilihan A" },
      { "id": "opt-b", "text": "Pilihan B" },
      { "id": "opt-c", "text": "Pilihan C" },
      { "id": "opt-d", "text": "Pilihan D" }
    ],
    "correctAnswerId": "opt-a",
    "explanation": "Pembahasan kenapa jawaban ini benar...",
    "points": 25
  }
]`;

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          }
        });

        const textResult = response.text || "[]";
        const parsed = JSON.parse(textResult);
        return res.json({ success: true, questions: parsed });
      } catch (geminiError) {
        console.warn("Gemini API call warning, falling back to smart template:", geminiError);
      }
    }

    const fallbackQuestions = [
      {
        questionText: `Manakah dari pernyataan berikut yang paling tepat mengenai implementasi "${topic}" di lingkungan kerja?`,
        type: "multiple_choice",
        options: [
          { id: "opt-a", text: `Memastikan seluruh standar dan SOP terkait ${topic} dipatuhi dengan konsisten` },
          { id: "opt-b", text: `Menyerahkan seluruh tanggung jawab ${topic} hanya kepada manajemen puncak` },
          { id: "opt-c", text: `Menerapkan ${topic} hanya saat dilakukan inspeksi berkala` },
          { id: "opt-d", text: `Mengabaikan prosedur jika target pekerjaan sangat mendesak` }
        ],
        correctAnswerId: "opt-a",
        explanation: `Pengelolaan ${topic} yang efektif memerlukan kepatuhan konsisten terhadap SOP oleh seluruh anggota tim.`,
        points: 25
      },
      {
        questionText: `Langkah awal yang direkomendasikan jika menemukan potensi masalah terkait ${topic} adalah:`,
        type: "multiple_choice",
        options: [
          { id: "opt-a", text: "Mendokumentasikan dan segera melaporkan ke atasan atau tim terkait" },
          { id: "opt-b", text: "Membiarkan hingga terjadi kendala operasional" },
          { id: "opt-c", text: "Menyembunyikan informasi agar tidak menjadi beban kerja tambahan" },
          { id: "opt-d", text: "Mengeluh di media sosial tanpa konfirmasi internal" }
        ],
        correctAnswerId: "opt-a",
        explanation: "Pelaporan cepat dan dokumentasi yang baik mencegah eskalasi risiko di perusahaan.",
        points: 25
      },
      {
        questionText: `Kunci keberhasilan jangka panjang dalam menerapkan ${topic} secara berkelanjutan adalah:`,
        type: "multiple_choice",
        options: [
          { id: "opt-a", text: "Komunikasi transparan, pelatihan rutin, dan evaluasi berkala" },
          { id: "opt-b", text: "Pemberian sanksi tanpa ada bimbingan terlebih dahulu" },
          { id: "opt-c", text: "Mengganti aturan setiap minggu" },
          { id: "opt-d", text: "Hanya fokus pada penghematan biaya pendek" }
        ],
        correctAnswerId: "opt-a",
        explanation: "Budaya kerja unggul dibangun melalui edukasi terus menerus dan umpan balik konstruktif.",
        points: 25
      }
    ];

    return res.json({ success: true, questions: fallbackQuestions.slice(0, Number(count)) });
  } catch (err: any) {
    console.error("Generate error:", err);
    res.status(500).json({ error: err?.message || "Gagal membuat soal AI" });
  }
});

export default app;
