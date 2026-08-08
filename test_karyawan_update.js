import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testUpdateKaryawan() {
  const { data: users } = await client.from('users').select('*').eq('email', 'eny.setyoningsih@arasinau.co.id').limit(1);
  const u = users[0];
  console.log("Current user:", u);

  const updated = { ...u, password: 'newpassword_test_eny' };
  
  const { error } = await client.from('users').update({
    name: updated.name,
    email: updated.email,
    password: updated.password,
    role: updated.role,
    department: updated.department,
    avatar: updated.avatar,
    company: updated.company || 'BANK'
  }).eq('id', u.id);

  console.log("Update error:", error);
  
  const { data: checkUser } = await client.from('users').select('*').eq('id', u.id).single();
  console.log("User after update:", checkUser);
}

testUpdateKaryawan();
