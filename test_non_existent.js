import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testUpdateNonExistent() {
  const { data, error } = await client.from('users').update({
    password: 'testpassword'
  }).eq('id', 'user-that-does-not-exist').select();

  console.log("Error:", error);
  console.log("Returned data from update:", data);
}

testUpdateNonExistent();
