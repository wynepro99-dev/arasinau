import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jlfaserqvbqtotdjtyrc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZmFzZXJxdmJxdG90ZGp0eXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDI0NDcsImV4cCI6MjEwMTY3ODQ0N30.yeZPaWxde0vkDMiAAUmGQJOVj66I4-oTXQnbBQjTiL0'
);

const newUser = {
  id: 'user-dir-2',
  name: 'Della Ananto',
  email: 'della.ananto.dir2@arasinau.co.id',
  password: '123456',
  role: 'karyawan',
  department: 'Dewan Komisaris',
  avatar: null
};

async function insertMissingUser() {
  const { error } = await supabase.from('users').insert([newUser]);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ User dir-2 inserted successfully!');
  }
}

insertMissingUser();
