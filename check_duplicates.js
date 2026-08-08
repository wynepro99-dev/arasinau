import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkDuplicates() {
  const { data: users } = await client.from('users').select('*');
  console.log("Total users count:", users ? users.length : 0);
  
  const emailMap = new Map();
  const idMap = new Map();

  for (const u of (users || [])) {
    if (emailMap.has(u.email)) {
      console.log("DUPLICATE EMAIL FOUND:", u.email, "IDs:", emailMap.get(u.email).id, "and", u.id);
    } else {
      emailMap.set(u.email, u);
    }

    if (idMap.has(u.id)) {
      console.log("DUPLICATE ID FOUND:", u.id);
    } else {
      idMap.set(u.id, u);
    }
  }

  console.log("\nSample users with passwords:");
  for (const u of (users || []).slice(0, 10)) {
    console.log(`ID: ${u.id} | Name: ${u.name} | Email: ${u.email} | Pass: ${u.password}`);
  }
}

checkDuplicates();
