import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function listAllUsers() {
  const { data: users } = await client.from('users').select('id, name, email');
  console.log("Supabase Users List:");
  console.table(users);
}

listAllUsers();
