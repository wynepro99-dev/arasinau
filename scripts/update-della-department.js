import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jlfaserqvbqtotdjtyrc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZmFzZXJxdmJxdG90ZGp0eXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI0NDcsImV4cCI6MjEwMTY3ODQ0N30.yeZPaWxde0vkDMiAAUmGQJOVj66I4-oTXQnbBQjTiL0'
);

async function updateDellaAnantu() {
  try {
    console.log('Updating Della Ananto department...');

    // Update users table
    const { error: userError } = await supabase
      .from('users')
      .update({ department: 'Project Manager (PM)' })
      .eq('id', 'user-dir-2');

    if (userError) {
      console.error('Error updating users:', userError);
    } else {
      console.log('✅ Users table updated!');
    }

    // Update exam_attempts table
    const { error: examError } = await supabase
      .from('exam_attempts')
      .update({ user_department: 'Project Manager (PM)' })
      .eq('user_id', 'user-dir-2');

    if (examError) {
      console.error('Error updating exam_attempts:', examError);
    } else {
      console.log('✅ Exam attempts table updated!');
    }

    console.log('\n✅ All updates completed successfully!');
  } catch (err) {
    console.error('❌ Update failed:', err.message);
  }
}

updateDellaAnantu();
