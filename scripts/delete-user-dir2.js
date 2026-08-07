import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jlfaserqvbqtotdjtyrc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZmFzZXJxdmJxdG90ZGp0eXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI0NDcsImV4cCI6MjEwMTY3ODQ0N30.yeZPaWxde0vkDMiAAUmGQJOVj66I4-oTXQnbBQjTiL0'
);

async function deleteUserDir2() {
  try {
    console.log('Step 1: Update exam_attempts to point to user-pm-1 instead of user-dir-2...');
    const { error: updateError } = await supabase
      .from('exam_attempts')
      .update({ user_id: 'user-pm-1' })
      .eq('user_id', 'user-dir-2');

    if (updateError) {
      console.error('Error updating exam_attempts:', updateError);
      return;
    }
    console.log('✅ exam_attempts updated!');

    console.log('\nStep 2: Delete user-dir-2 from users table...');
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', 'user-dir-2');

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return;
    }
    console.log('✅ user-dir-2 deleted!');

    console.log('\n✅ All operations completed successfully!');
  } catch (err) {
    console.error('❌ Operation failed:', err.message);
  }
}

deleteUserDir2();
