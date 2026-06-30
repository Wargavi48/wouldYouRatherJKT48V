/* ============== KONFIGURASI SUPABASE ==============
   Isi dua nilai di bawah ini dengan kredensial project Supabase kamu:
   1. Buka https://supabase.com/dashboard -> pilih project kamu
   2. Klik "Connect" / Project Settings -> API
   3. Salin "Project URL" ke SUPABASE_URL
   4. Salin "anon public" key ke SUPABASE_ANON_KEY
   (anon key ini AMAN untuk ditaruh di kode frontend — itu memang fungsinya,
   akses sebenarnya diatur lewat Row Level Security di database) */

const SUPABASE_URL = "https://fdtyqedfutktfjvritpw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkdHlxZWRmdXRrdGZqdnJpdHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTE2NTAsImV4cCI6MjA5ODM2NzY1MH0.0d5IHndurQP8tOJk3Gk5s8gVMKO76eAAJGsAAJs6JIs";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
