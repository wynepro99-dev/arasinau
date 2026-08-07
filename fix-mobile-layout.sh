#!/bin/bash

# Fix AdminDashboard.tsx - button labels dan mobile responsiveness
sed -i '' 's/Lihat Laporan Skor/Laporan Skor/g' src/components/admin/AdminDashboard.tsx
sed -i '' 's/Buat Ujian Baru/Buat Ujian/g' src/components/admin/AdminDashboard.tsx

# Fix ScoresDashboard.tsx - mobile button labels
sed -i '' 's/Hapus Semua Nilai/Hapus/g' src/components/admin/ScoresDashboard.tsx

echo "✅ Mobile button labels fixed!"
