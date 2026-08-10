import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://jlfaserqvbqtotdjtyrc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZmFzZXJxdmJxdG90ZGp0eXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI0NDcsImV4cCI6MjEwMTY3ODQ0N30.yeZPaWxde0vkDMiAAUmGQJOVj66I4-oTXQnbBQjTiL0';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runForensicTest() {
  console.log('🕵️‍♂️ Memulai FORENSIC CAPTURE TEST...');
  const newPassword = 'sandi_baru_forensik_' + Date.now();
  
  console.log(`\n[1/3] Menulis sandi baru secara sengaja (Simulasi UI): ${newPassword}`);
  const { error: updateErr } = await supabase
    .from('users')
    .update({ password: newPassword })
    .eq('id', 'user-sop-4');

  if (updateErr) {
    console.error('❌ Gagal update sandi:', updateErr);
    return;
  }
  
  const writeTime = new Date().toISOString();
  console.log(`✅ Berhasil di-update pada: ${writeTime}`);

  console.log('\n[2/3] Menunggu 75 detik agar Ghost Client (throttle 60s) me-revert sandi...');
  
  // Wait 75 seconds with a countdown
  for (let i = 75; i > 0; i--) {
    process.stdout.write(`⏳ Menunggu... ${i} detik tersisa\r`);
    await new Promise(res => setTimeout(res, 1000));
  }
  console.log('\n✅ Waktu tunggu selesai.');

  console.log('\n[3/3] Menarik data dari tabel Audit V3...');
  const { data: auditData, error: auditErr } = await supabase
    .from('user_audit_trail_v3')
    .select('*')
    .eq('record_id', 'user-sop-4')
    .order('created_at', { ascending: false })
    .limit(5);

  if (auditErr) {
    console.error('❌ Gagal membaca Audit V3:', auditErr);
    return;
  }

  console.log('\n📊 HASIL AUDIT V3 TERBARU (5 Teratas):');
  console.log(JSON.stringify(auditData, null, 2));

  fs.writeFileSync('audit_v3_results.json', JSON.stringify(auditData, null, 2));
  console.log('\n✅ Data tersimpan di audit_v3_results.json');
}

runForensicTest();
