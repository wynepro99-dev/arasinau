import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkAll() {
  const { data: users } = await client.from('users').select('name, email, password');
  console.log("USERS:", users);
}

checkAll();
