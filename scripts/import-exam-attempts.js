import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const supabaseUrl = 'https://jlfaserqvbqtotdjtyrc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZmFzZXJxdmJxdG90ZGp0eXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI0NDcsImV4cCI6MjEwMTY3ODQ0N30.yeZPaWxde0vkDMiAAUmGQJOVj66I4-oTXQnbBQjTiL0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function importExamAttempts() {
  try {
    const csvPath = path.join(process.cwd(), 'exam_attempts.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');

    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(`Found ${records.length} records to import...`);

    // Convert string data to proper types
    const formattedRecords = records.map((record) => ({
      id: (record.id || '').trim(),
      exam_id: (record.exam_id || '').trim(),
      user_id: (record.user_id || '').trim(),
      user_name: (record.user_name || '').trim(),
      user_department: (record.user_department || '').trim(),
      exam_title: (record.exam_title || '').trim(),
      score: record.score ? parseFloat(record.score) : null,
      total_points_earned: record.total_points_earned ? parseInt(record.total_points_earned) : null,
      total_max_points: record.total_max_points ? parseInt(record.total_max_points) : null,
      passed: record.passed === 'true' || record.passed === '1',
      started_at: (record.started_at || '').trim(),
      completed_at: (record.completed_at || '').trim(),
      duration_seconds_used: record.duration_seconds_used ? parseInt(record.duration_seconds_used) : null,
      answers: record.answers ? JSON.parse(record.answers.toString()) : null,
    }));

    // Insert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < formattedRecords.length; i += batchSize) {
      const batch = formattedRecords.slice(i, i + batchSize);
      const { error } = await supabase
        .from('exam_attempts')
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
      } else {
        console.log(`✅ Inserted batch ${i / batchSize + 1} (${batch.length} records)`);
      }
    }

    console.log('✅ Import completed!');
  } catch (err) {
    console.error('❌ Import failed:', err.message);
  }
}

importExamAttempts();
