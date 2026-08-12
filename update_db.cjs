require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  // 1. Update author for 'Manifesto Bab I'
  const { data: exams, error: e1 } = await supabase.from('exam_packages').select('id, title').ilike('title', '%Manifesto Bab I%');
  if (e1) console.error(e1);
  else {
    for (const exam of exams) {
      console.log('Updating exam:', exam.title);
      await supabase.from('exam_packages').update({ author_name: 'Huda' }).eq('id', exam.id);
    }
  }

  // 2. Update roles for Vergiawan, Lilis, Putri
  const emails = ['vergiawan@arasinau.co.id', 'lilis.ariyani@arasinau.co.id', 'putri@arasinau.co.id'];
  for (const email of emails) {
    console.log('Updating role for:', email);
    const { error: e2 } = await supabase.from('users').update({ role: 'admin' }).eq('email', email);
    if (e2) console.error(e2);
  }
  
  console.log('Done.');
}
run();
