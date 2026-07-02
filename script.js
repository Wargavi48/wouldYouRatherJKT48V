let categories = [];     // [{id, emoji, name, questions:[{id, a, b}]}]
let currentCatId = null;
let order = {};      // catId -> shuffled array of question indices
let position = {};   // catId -> next index to take from order[catId]
let current = null;       // {id, a, b}
let answered = false;
let editingCatId = null;
let autoAdvanceTimer = null;
let countdownInterval = null;

const labelTop = document.getElementById('labelTop');
const labelBottom = document.getElementById('labelBottom');
const choiceTop = document.getElementById('choiceTop');
const choiceBottom = document.getElementById('choiceBottom');
const barTrackTop = document.getElementById('barTrackTop');
const barTrackBottom = document.getElementById('barTrackBottom');
const barFillTop = document.getElementById('barFillTop');
const barFillBottom = document.getElementById('barFillBottom');
const pctTop = document.getElementById('pctTop');
const pctBottom = document.getElementById('pctBottom');
const catTag = document.getElementById('catTag');
const progressTag = document.getElementById('progressTag');
const tally = document.getElementById('tally');
const autoPill = document.getElementById('autoPill');

function allCategories() { return categories; }
function getCategoryById(id) { return categories.find(c => c.id === id); }

function formatVotes(n) {
  return n.toLocaleString('id-ID') + ' orang sudah memilih';
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resetCategoryProgress(catId) {
  const cat = getCategoryById(catId);
  if (!cat) return;
  order[catId] = shuffleArray(cat.questions.map((_, i) => i));
  position[catId] = 0;
}

/* ---------- Load semua data dari Supabase ---------- */
async function fetchCategoriesFromDB() {
  const { data, error } = await sb
    .from('categories')
    .select('id, emoji, name, questions(id, option_a, option_b)')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Gagal memuat kategori:', error);
    return [];
  }

  return (data || []).map(c => ({
    id: c.id,
    emoji: c.emoji,
    name: c.name,
    questions: (c.questions || []).map(q => ({ id: q.id, a: q.option_a, b: q.option_b }))
  }));
}

/* ---------- Seed data default (sekali saja, kalau DB masih kosong) ---------- */
async function seedDefaultsIfEmpty() {
  const { count, error } = await sb
    .from('categories')
    .select('*', { count: 'exact', head: true });

  if (error) { console.error('Gagal cek kategori:', error); return; }
  if (count && count > 0) return;

  for (const cat of defaultCategories) {
    const { data: newCat, error: catErr } = await sb
      .from('categories')
      .insert({ emoji: cat.emoji, name: cat.name, is_default: true })
      .select()
      .single();
    if (catErr || !newCat) { console.error('Gagal seed kategori:', catErr); continue; }

    const rows = cat.questions.map(q => ({
      category_id: newCat.id,
      option_a: q[0],
      option_b: q[1]
    }));
    const { error: qErr } = await sb.from('questions').insert(rows);
    if (qErr) console.error('Gagal seed pertanyaan:', qErr);
  }
}

/* ============== GAME LOGIC ============== */

function clearAutoAdvance() {
  if (autoAdvanceTimer) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

function resetCardVisual() {
  barTrackTop.classList.remove('show');
  barTrackBottom.classList.remove('show');
  barFillTop.style.width = '0%';
  barFillBottom.style.width = '0%';
  pctTop.classList.remove('show');
  pctBottom.classList.remove('show');
  pctTop.textContent = '';
  pctBottom.textContent = '';
  choiceTop.classList.remove('picked', 'revealed');
  choiceBottom.classList.remove('picked', 'revealed');
  tally.classList.remove('show');
  tally.textContent = '';
  autoPill.classList.remove('show');
  answered = false;
}

function applyNewQuestion(cat) {
  if (!order[currentCatId] || order[currentCatId].length !== cat.questions.length) {
    resetCategoryProgress(currentCatId);
  }
  if (position[currentCatId] >= order[currentCatId].length) {
    resetCategoryProgress(currentCatId);
  }

  const idx = order[currentCatId][position[currentCatId]];
  position[currentCatId]++;
  current = cat.questions[idx];

  labelTop.textContent = current.a;
  labelBottom.textContent = current.b;
  catTag.textContent = cat.emoji + " " + cat.name;
  progressTag.textContent = position[currentCatId] + " / " + cat.questions.length;

  resetCardVisual();
}

function pickQuestion(skipAnimation) {
  clearAutoAdvance();
  const cat = getCategoryById(currentCatId);

  if (!cat || !cat.questions || cat.questions.length === 0) {
    labelTop.textContent = "Belum ada kategori";
    labelBottom.textContent = "Ketuk ☰ untuk menambah kategori baru";
    catTag.textContent = "Kosong";
    progressTag.textContent = "";
    current = null;
    resetCardVisual();
    return;
  }

  if (skipAnimation || !current) {
    applyNewQuestion(cat);
    return;
  }

  // Swipe out current cards
  choiceTop.classList.add('swipe-out-left');
  choiceBottom.classList.add('swipe-out-right');

  setTimeout(() => {
    // Remove swipe-out, hide cards, update content
    choiceTop.classList.remove('swipe-out-left');
    choiceBottom.classList.remove('swipe-out-right');
    applyNewQuestion(cat);

    // Swipe in new cards
    choiceTop.classList.add('swipe-in-left');
    choiceBottom.classList.add('swipe-in-right');
    setTimeout(() => {
      choiceTop.classList.remove('swipe-in-left');
      choiceBottom.classList.remove('swipe-in-right');
    }, 450);
  }, 380);
}

/* Hitung % berdasarkan vote sungguhan di Supabase */
async function getVoteStats(questionId) {
  const [{ count: countA, error: errA }, { count: countB, error: errB }] = await Promise.all([
    sb.from('votes').select('*', { count: 'exact', head: true }).eq('question_id', questionId).eq('choice', 'a'),
    sb.from('votes').select('*', { count: 'exact', head: true }).eq('question_id', questionId).eq('choice', 'b')
  ]);

  if (errA || errB) console.error('Gagal hitung vote:', errA || errB);

  const a = countA || 0;
  const b = countB || 0;
  const total = a + b;
  const pctA = total > 0 ? Math.round((a / total) * 1000) / 10 : 50;
  const pctB = total > 0 ? Math.round((100 - pctA) * 10) / 10 : 50;

  return { pctA, pctB, totalVotes: total };
}

async function choose(which) {
  if (answered || !current) return;
  answered = true;

  const questionId = current.id;
  const choiceVal = which === 'top' ? 'a' : 'b';

  choiceTop.classList.add('revealed');
  choiceBottom.classList.add('revealed');
  if (which === 'top') choiceTop.classList.add('picked');
  else choiceBottom.classList.add('picked');

  barTrackTop.classList.add('show');
  barTrackBottom.classList.add('show');

  // Catat vote ini, baru ambil statistik terbaru (termasuk vote ini sendiri)
  const { error: voteErr } = await sb.from('votes').insert({ question_id: questionId, choice: choiceVal });
  if (voteErr) console.error('Gagal menyimpan vote:', voteErr);

  const stats = await getVoteStats(questionId);

  // Kalau user sudah pindah pertanyaan sebelum hasil datang, jangan render ke kartu yang salah
  if (!current || current.id !== questionId) return;

  setTimeout(() => {
    barFillTop.style.width = stats.pctA + '%';
    barFillBottom.style.width = stats.pctB + '%';
    pctTop.textContent = stats.pctA.toFixed(1) + '% memilih ini';
    pctBottom.textContent = stats.pctB.toFixed(1) + '% memilih ini';
    pctTop.classList.add('show');
    pctBottom.classList.add('show');
    tally.textContent = formatVotes(stats.totalVotes);
    tally.classList.add('show');
    autoPill.classList.add('show');

    let secondsLeft = 10;
    autoPill.textContent = 'Lanjut dalam ' + secondsLeft + ' detik';
    countdownInterval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) autoPill.textContent = 'Lanjut dalam ' + secondsLeft + ' detik';
    }, 1000);
    autoAdvanceTimer = setTimeout(() => {
      clearAutoAdvance();
      pickQuestion();
    }, 10000);
  }, 250);
}

choiceTop.addEventListener('click', () => choose('top'));
choiceBottom.addEventListener('click', () => choose('bottom'));
autoPill.addEventListener('click', pickQuestion);

/* ============== MUSIK ============== */
const bgMusic = document.getElementById('bgMusic');
const musicWrap = document.getElementById('musicWrap');
const musicToggleBtn = document.getElementById('musicToggleBtn');
const volumePopover = document.getElementById('volumePopover');
const volumeSlider = document.getElementById('volumeSlider');
const nextSongBtn = document.getElementById('nextSongBtn');

/* ---- Daftar lagu (playlist) ----
   Tambahkan lagu baru dengan menambah baris baru di array ini.
   Urutan pemutaran sesuai urutan di array. Setelah lagu terakhir
   selesai, otomatis kembali ke lagu pertama (loop playlist). */
const musicPlaylist = [
  'Asset/Dreamcatcher_inst_v2.mp3',
  'Asset/Suatu Saat Bertemu (Instrumental).mp3'
];

let currentTrackIndex = 0;
let musicMuted = false;
let hoverHideTimer = null;

function loadTrack(index, autoplay) {
  currentTrackIndex = (index + musicPlaylist.length) % musicPlaylist.length;
  bgMusic.src = musicPlaylist[currentTrackIndex];
  if (autoplay) {
    bgMusic.play().catch(err => console.error('Gagal memutar musik:', err));
  }
}

function playNextTrack() {
  loadTrack(currentTrackIndex + 1, true);
}

function updateMusicIcons() {
  const showMuted = musicMuted || Number(volumeSlider.value) === 0;
  musicToggleBtn.innerHTML = showMuted ? '&#128263;' : '&#127925;';
  musicToggleBtn.classList.toggle('playing', !showMuted);
}

/* Klik tombol musik = toggle mute */
musicToggleBtn.addEventListener('click', () => {
  musicMuted = !musicMuted;
  bgMusic.muted = musicMuted;
  updateMusicIcons();
});

/* Lagu berikutnya (manual skip) */
nextSongBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  playNextTrack();
});

/* Saat lagu selesai, otomatis lanjut ke lagu berikutnya (loop ke awal jika sudah lagu terakhir) */
bgMusic.addEventListener('ended', playNextTrack);

/* Kursor mendekat ke tombol musik -> tampilkan slider volume (desktop) */
musicWrap.addEventListener('mouseenter', () => {
  clearTimeout(hoverHideTimer);
  volumePopover.classList.add('open');
});
musicWrap.addEventListener('mouseleave', () => {
  hoverHideTimer = setTimeout(() => volumePopover.classList.remove('open'), 250);
});

/* Fallback untuk layar sentuh: tekan-tahan tombol musik untuk buka slider volume */
let touchHoldTimer = null;
let isTouchHold = false;
musicToggleBtn.addEventListener('touchstart', () => {
  isTouchHold = false;
  touchHoldTimer = setTimeout(() => {
    isTouchHold = true;
    volumePopover.classList.add('open');
  }, 350);
});
musicToggleBtn.addEventListener('touchend', (e) => {
  clearTimeout(touchHoldTimer);
  if (isTouchHold) e.preventDefault();
});

volumeSlider.addEventListener('click', (e) => e.stopPropagation());
volumeSlider.addEventListener('input', () => {
  const val = Number(volumeSlider.value);
  bgMusic.volume = val / 100;
  musicMuted = val === 0;
  bgMusic.muted = musicMuted;
  updateMusicIcons();
});

document.addEventListener('click', (e) => {
  if (!musicWrap.contains(e.target)) {
    volumePopover.classList.remove('open');
  }
});

/* Coba putar otomatis saat halaman dibuka.
   Kalau browser memblokir autoplay bersuara, musik akan mulai
   otomatis begitu pengguna melakukan interaksi pertama (klik/tap/keydown
   di mana saja di halaman) - ini batasan kebijakan browser, bukan bug. */
bgMusic.volume = volumeSlider.value / 100;
loadTrack(0, false);

function startMusicOnFirstInteraction() {
  bgMusic.play().catch(err => console.error('Gagal memutar musik:', err));
  document.removeEventListener('click', startMusicOnFirstInteraction);
  document.removeEventListener('touchstart', startMusicOnFirstInteraction);
  document.removeEventListener('keydown', startMusicOnFirstInteraction);
}

bgMusic.play().catch(() => {
  document.addEventListener('click', startMusicOnFirstInteraction, { once: true });
  document.addEventListener('touchstart', startMusicOnFirstInteraction, { once: true });
  document.addEventListener('keydown', startMusicOnFirstInteraction, { once: true });
});

updateMusicIcons();

/* ============== MENU KATEGORI ============== */
const menuScreen = document.getElementById('menu-screen');
const menuList = document.getElementById('menuList');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMenu() {
  menuList.innerHTML = "";

  if (allCategories().length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Belum ada kategori. Ketuk tombol + di kanan bawah untuk menambah satu.';
    menuList.appendChild(empty);
    return;
  }

  allCategories().forEach(cat => {
    const card = document.createElement('div');
    card.className = 'cat-card' + (cat.id === currentCatId ? ' active-cat' : '');

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'cat-card-main';
    main.innerHTML = '<span class="emoji">' + cat.emoji + '</span><span class="name">' + escapeHtml(cat.name) + '</span><span class="qcount">' + cat.questions.length + ' pertanyaan</span>';
    main.addEventListener('click', () => {
      currentCatId = cat.id;
      resetCategoryProgress(currentCatId);
      renderMenu();
      closeMenu();
      pickQuestion(true);
    });
    card.appendChild(main);

    const actions = document.createElement('div');
    actions.className = 'cat-card-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit pertanyaan';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openForm(cat.id);
    });
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = 'Hapus kategori';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = window.confirm('Hapus kategori "' + cat.name + '" secara permanen untuk SEMUA pengunjung? Tindakan ini tidak bisa dibatalkan.');
      if (!ok) return;

      delBtn.disabled = true;
      const { error } = await sb.from('categories').delete().eq('id', cat.id);
      if (error) {
        console.error('Gagal menghapus kategori:', error);
        window.alert('Gagal menghapus kategori. Coba lagi.');
        delBtn.disabled = false;
        return;
      }

      categories = categories.filter(c => c.id !== cat.id);
      if (currentCatId === cat.id) {
        const fallback = allCategories()[0];
        currentCatId = fallback ? fallback.id : null;
        resetCategoryProgress(currentCatId);
      }
      renderMenu();
      pickQuestion(true);
    });
    actions.appendChild(delBtn);

    card.appendChild(actions);
    menuList.appendChild(card);
  });
}

function openMenu() { renderMenu(); menuScreen.classList.add('open'); }
function closeMenu() { menuScreen.classList.remove('open'); }

document.getElementById('menuOpenBtn').addEventListener('click', openMenu);
document.getElementById('menuCloseBtn').addEventListener('click', closeMenu);

/* ============== FORM KATEGORI ============== */
const formScreen = document.getElementById('form-screen');
const questionListEl = document.getElementById('questionList');
const catEmojiInput = document.getElementById('catEmojiInput');
const catNameInput = document.getElementById('catNameInput');
const formTitle = document.getElementById('formTitle');
const saveBtn = document.getElementById('saveBtn');

function blankQuestionBlock(valA, valB) {
  const block = document.createElement('div');
  block.className = 'q-block';
  block.innerHTML =
    '<button type="button" class="q-remove-btn" aria-label="Hapus pertanyaan">&#10005;</button>' +
    '<div class="q-num"></div>' +
    '<input type="text" class="qa-input" placeholder="Pilihan pertama">' +
    '<input type="text" class="qb-input" placeholder="Pilihan kedua">';
  block.querySelector('.qa-input').value = valA || "";
  block.querySelector('.qb-input').value = valB || "";
  block.querySelector('.q-remove-btn').addEventListener('click', () => {
    block.remove();
    renumberQuestions();
  });
  return block;
}

function renumberQuestions() {
  questionListEl.querySelectorAll('.q-block').forEach((b, i) => {
    b.querySelector('.q-num').textContent = 'Pertanyaan ' + (i + 1);
  });
}

function addQuestionBlock(valA, valB) {
  questionListEl.appendChild(blankQuestionBlock(valA, valB));
  renumberQuestions();
}

document.getElementById('addQuestionBtn').addEventListener('click', () => addQuestionBlock());

function openForm(catId) {
  editingCatId = catId || null;
  questionListEl.innerHTML = "";

  if (catId) {
    const cat = getCategoryById(catId);
    formTitle.textContent = "Edit kategori";
    catEmojiInput.value = cat.emoji;
    catNameInput.value = cat.name;
    cat.questions.forEach(q => addQuestionBlock(q.a, q.b));
    saveBtn.textContent = "Simpan perubahan";
  } else {
    formTitle.textContent = "Kategori baru";
    catEmojiInput.value = "🎯";
    catNameInput.value = "";
    addQuestionBlock();
    addQuestionBlock();
    saveBtn.textContent = "Simpan kategori";
  }

  formScreen.classList.add('open');
}

function closeForm() { formScreen.classList.remove('open'); }

document.getElementById('addCatBtn').addEventListener('click', () => openForm(null));
document.getElementById('formCloseBtn').addEventListener('click', closeForm);

saveBtn.addEventListener('click', async () => {
  const name = catNameInput.value.trim();
  const emoji = catEmojiInput.value.trim() || "🎯";

  if (!name) { window.alert("Nama kategori tidak boleh kosong."); return; }

  const questionPairs = [];
  questionListEl.querySelectorAll('.q-block').forEach(b => {
    const a = b.querySelector('.qa-input').value.trim();
    const c = b.querySelector('.qb-input').value.trim();
    if (a && c) questionPairs.push([a, c]);
  });

  if (questionPairs.length === 0) {
    window.alert("Tambahkan minimal 1 pertanyaan dengan kedua pilihan terisi.");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Menyimpan...";

  try {
    if (editingCatId) {
      const { error: catErr } = await sb
        .from('categories')
        .update({ emoji, name })
        .eq('id', editingCatId);
      if (catErr) throw catErr;

      // Ganti seluruh pertanyaan (cara paling sederhana & konsisten).
      // Catatan: ini akan menghapus riwayat vote pertanyaan lama di kategori ini
      // karena vote terikat ke pertanyaan (cascade delete saat pertanyaan dihapus).
      const { error: delErr } = await sb.from('questions').delete().eq('category_id', editingCatId);
      if (delErr) throw delErr;

      const rows = questionPairs.map(([a, b]) => ({ category_id: editingCatId, option_a: a, option_b: b }));
      const { error: insErr } = await sb.from('questions').insert(rows);
      if (insErr) throw insErr;

      currentCatId = editingCatId;
    } else {
      const { data: newCat, error: catErr } = await sb
        .from('categories')
        .insert({ emoji, name })
        .select()
        .single();
      if (catErr) throw catErr;

      const rows = questionPairs.map(([a, b]) => ({ category_id: newCat.id, option_a: a, option_b: b }));
      const { error: insErr } = await sb.from('questions').insert(rows);
      if (insErr) throw insErr;

      currentCatId = newCat.id;
    }

    categories = await fetchCategoriesFromDB();
    closeForm();
    renderMenu();
    resetCategoryProgress(currentCatId);
    pickQuestion(true);
  } catch (err) {
    console.error('Gagal menyimpan kategori:', err);
    window.alert('Gagal menyimpan kategori. Coba lagi.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = editingCatId ? "Simpan perubahan" : "Simpan kategori";
  }
});

/* ============== INIT ============== */
async function init() {
  catTag.textContent = "Memuat...";
  labelTop.textContent = "";
  labelBottom.textContent = "";

  try {
    await seedDefaultsIfEmpty();
    categories = await fetchCategoriesFromDB();
  } catch (err) {
    console.error('Gagal inisialisasi:', err);
    catTag.textContent = "Gagal memuat";
    labelTop.textContent = "Tidak bisa terhubung ke database";
    labelBottom.textContent = "Periksa koneksi & konfigurasi Supabase";
    return;
  }

  currentCatId = categories.length > 0 ? categories[0].id : null;
  pickQuestion(true);
}

init();