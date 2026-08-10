import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const supabaseUrl = 'https://jlfaserqvbqtotdjtyrc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZmFzZXJxdmJxdG90ZGp0eXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI0NDcsImV4cCI6MjEwMTY3ODQ0N30.yeZPaWxde0vkDMiAAUmGQJOVj66I4-oTXQnbBQjTiL0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function importUsers() {
  try {
    const content = fs.readFileSync('./users.csv', 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });

    console.log(`Found ${records.length} users to import...`);

    // Upsert users
    const { error } = await supabase
      .from('users')
      .upsert(records);

    if (error) {
      console.error('Error inserting users:', error);
    } else {
      console.log(`✅ Successfully inserted ${records.length} users!`);
    }
  } catch (err) {
    console.error('❌ Import failed:', err.message);
  }
}

importUsers();
