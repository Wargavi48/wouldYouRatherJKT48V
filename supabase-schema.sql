-- ============================================================
-- "Pilih Salah Satu" — Supabase schema
-- Jalankan seluruh file ini di Supabase Dashboard > SQL Editor
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- TABLES ----------

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  emoji text not null default '🎯',
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  option_a text not null,
  option_b text not null,
  created_at timestamptz not null default now()
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  choice text not null check (choice in ('a', 'b')),
  created_at timestamptz not null default now()
);

create index if not exists questions_category_id_idx on questions(category_id);
create index if not exists votes_question_id_idx on votes(question_id);
create index if not exists votes_question_choice_idx on votes(question_id, choice);

-- ---------- ROW LEVEL SECURITY ----------
-- Aplikasi ini publik & tanpa login (siapa pun bisa menambah/mengedit/
-- menghapus kategori, dan siapa pun bisa vote). Itu sesuai requirement
-- "bisa dilihat & diisi semua pengunjung". Catatan: ini berarti TIDAK ADA
-- proteksi terhadap penyalahgunaan (orang lain bisa menghapus kategori
-- orang lain). Kalau nanti mau dibatasi, tambahkan kolom owner + auth.

alter table categories enable row level security;
alter table questions enable row level security;
alter table votes enable row level security;

-- categories: semua orang boleh baca, tambah, ubah, hapus
create policy "categories_select_all" on categories for select using (true);
create policy "categories_insert_all" on categories for insert with check (true);
create policy "categories_update_all" on categories for update using (true);
create policy "categories_delete_all" on categories for delete using (true);

-- questions: sama
create policy "questions_select_all" on questions for select using (true);
create policy "questions_insert_all" on questions for insert with check (true);
create policy "questions_update_all" on questions for update using (true);
create policy "questions_delete_all" on questions for delete using (true);

-- votes: semua orang boleh baca (untuk hitung %) dan menambah vote baru.
-- Tidak ada update/delete vote — sekali vote tercatat, permanen.
create policy "votes_select_all" on votes for select using (true);
create policy "votes_insert_all" on votes for insert with check (true);
