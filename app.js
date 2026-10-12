const STORAGE_KEY = 'planim-cekimler-v1';
const $ = (selector) => document.querySelector(selector);
const rows = $('#taskRows');
const dialog = $('#taskDialog');
const reminderDialog = $('#reminderDialog');
const authDialog = $('#authDialog');
function showDialog(target) { if (typeof target.showModal === 'function') target.showModal(); else target.setAttribute('open', ''); }
function hideDialog(target) { if (typeof target.close === 'function' && target.open) target.close(); else target.removeAttribute('open'); }
let tasks = loadTasks();
let reminders = loadReminders();
let cloud = null;
let cloudUser = null;
let authMode = 'sign-in';
let cloudReady = false;
let realtimeChannel = null;
let cloudRefreshTimer = null;
let activeFilter = 'all';
let query = '';
let newestFirst = false;
let toastTimer;
const SYNC_QUEUE_KEY = 'planim-sync-queue-v1';
let syncInProgress = false;
let syncAgainRequested = false;

function readSyncQueue() {
  try { const value = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function queueSync(table, items, deleteId) {
  if (!cloudUser) return;
  const queue = readSyncQueue();
  const userId = cloudUser.id;
  if (deleteId) {
    queue.push({ opId: crypto.randomUUID(), table, userId, deleteId, at: Date.now() });
  } else {
    // Keep only the latest full snapshot per table/user; it includes every local change.
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].table === table && queue[i].userId === userId && Object.hasOwn(queue[i], 'items')) queue.splice(i, 1);
    queue.push({ opId: crypto.randomUUID(), table, userId, items: structuredClone(items), at: Date.now() });
  }
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  updateConnectionStatus();
  if (navigator.onLine) flushSyncQueue();
}
function updateConnectionStatus(message) {
  const label = $('#storageLabel');
  if (!label) return;
  const pending = readSyncQueue().some(item => !cloudUser || item.userId === cloudUser.id);
  const text = message || (!navigator.onLine ? 'Çevrimdışı · bu cihazda kaydediliyor' : pending ? 'Eşitleme bekliyor' : cloudUser ? 'Tüm cihazlarla eşitlendi' : 'Bilgilerin bu cihazda saklanır');
  label.innerHTML = `${escapeHTML(text)} <span class="lock">◈</span>`;
}
async function flushSyncQueue() {
  if (!cloud || !cloudUser || !navigator.onLine) return false;
  if (syncInProgress) { syncAgainRequested = true; return false; }
  syncInProgress = true; updateConnectionStatus('Eşitleniyor…');
  try {
    let queue = readSyncQueue();
    for (const item of queue) {
      if (item.userId !== cloudUser.id) continue;
      const ok = await syncRows(item.table, item.items || [], item.deleteId);
      if (!ok) throw new Error('Kayıtlar henüz gönderilemedi.');
      queue = readSyncQueue().filter(entry => entry.opId !== item.opId);
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch (error) {
    console.warn('Eşitleme kuyruğu bekliyor:', error);
  } finally {
    syncInProgress = false; updateConnectionStatus();
    const rerun = syncAgainRequested; syncAgainRequested = false;
    if (rerun && navigator.onLine && cloudUser) window.setTimeout(flushSyncQueue, 0);
  }
  return !readSyncQueue().some(item => item.userId === cloudUser.id);
}

function loadTasks() {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function loadReminders() {
  try { const value = JSON.parse(localStorage.getItem('planim-animsaticilar-v1') || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function saveTasks(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); render();
  queueSync('shoots', tasks, options.deleteId);
}
function saveReminders(options = {}) {
  localStorage.setItem('planim-animsaticilar-v1', JSON.stringify(reminders)); render();
  queueSync('reminders', reminders, options.deleteId);
}
function todayISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function dateForDisplay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}
function dateForStorage(value) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((value || '').trim());
  if (!match) return '';
  const day = Number(match[1]); const month = Number(match[2]); const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function normalizeTime(value) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec((value || '').trim());
  if (!match || Number(match[1]) > 23) return value;
  return `${String(Number(match[1])).padStart(2,'0')}:${match[2]}`;
}
function dateValue(value) {
  if (!value) return 'Tarih eklenmedi';
  return new Date(`${value}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function escapeHTML(value = '') { return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function progressed(task) { return [task.shot, task.edited, task.published].filter(Boolean).length; }
function compareScheduled(a, b, dateField, timeField) {
  const dateA = a[dateField] || '9999-12-31';
  const dateB = b[dateField] || '9999-12-31';
  const timeA = a[timeField] || '99:99';
  const timeB = b[timeField] || '99:99';
  return dateA.localeCompare(dateB) || timeA.localeCompare(timeB) || (a.createdAt || 0) - (b.createdAt || 0);
}
function visibleTasks() {
  const now = todayISO();
  return tasks.filter((task) => {
    const text = `${task.title} ${task.location} ${task.details}`.toLocaleLowerCase('tr');
    if (query && !text.includes(query.toLocaleLowerCase('tr'))) return false;
    if (activeFilter === 'done') return !!task.done;
    if (task.done) return false;
    if (activeFilter === 'upcoming' && (task.published || !task.shootDate || task.shootDate < now)) return false;
    if (activeFilter === 'completed' && !task.published) return false;
    if (activeFilter === 'today' && task.shootDate !== now) return false;
    return true;
  }).sort((a,b) => compareScheduled(a, b, 'shootDate', 'shootTime') * (newestFirst ? -1 : 1));
}
function taskRow(task) {
  const progress = progressed(task);
  const platforms = task.platforms || {};
  const shortName = (n) => n === 'Instagram' ? 'Insta' : (n === 'YouTube' ? 'YT' : n);
  const progressHTML = `<div class="stage-grid">${stageBox('shot','Çekim','◷')}${stageBox('edited','Montaj','✳')}<div class="stage-box share-box ${task.published ? 'done' : ''}"><span class="share-title"><span class="stage-check">${task.published ? '✓' : '↗'}</span> Paylaşım</span><div class="platforms">${['Instagram','LinkedIn','YouTube'].map(name => `<button class="platform ${platforms[name] ? 'selected' : ''}" data-platform="${name}" data-id="${task.id}" aria-pressed="${!!platforms[name]}" title="${name}"><span class="plat-full">${name}</span><span class="plat-short">${shortName(name)}</span></button>`).join('')}</div></div></div>`;
  return `<tr class="timeline-shoot ${task.done ? 'is-complete' : ''}">
    <td><div class="task-main"><span class="task-mark">✳</span><div><div class="task-name" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</div><div class="task-detail">${escapeHTML(task.details || 'Not eklenmedi')}</div></div></div></td>
    <td><div class="date-main">${dateValue(task.shootDate)}</div><div class="date-sub">${escapeHTML(task.shootTime || 'Saat belirtilmedi')}</div></td>
    <td class="location-cell" title="${escapeHTML(task.location)}">${escapeHTML(task.location || 'Yer belirtilmedi')}</td>
    <td>${progressHTML}</td>
    <td class="completion-cell"><input type="checkbox" data-complete="${task.id}" aria-label="Tamamlandı olarak işaretle" ${task.done ? 'checked' : ''}></td>
    <td class="published-cell ${task.published ? 'is-published' : ''}">${task.published ? dateValue(task.publishedDate || todayISO()) : '<span>—</span>'}</td>
    <td class="row-actions"><button class="menu-button" data-menu="${task.id}" aria-label="İçerik seçenekleri">···</button><div class="action-menu" data-actions="${task.id}" hidden><button data-edit="${task.id}">Düzenle</button><button data-task-cal="${task.id}">📅 Takvime ekle</button><button class="delete" data-delete="${task.id}">Sil</button></div></td>
  </tr>`;
}
function reminderRow(reminder) {
  return `<tr class="timeline-reminder ${reminder.done ? 'is-done' : ''}">
    <td colspan="3"><div class="task-main"><span class="reminder-mark">◷</span><div><div class="task-name">${escapeHTML(reminder.title)}</div><div class="task-detail">${escapeHTML(reminder.note || 'Anımsatıcı')}</div></div></div></td>
    <td><div class="date-main">${dateValue(reminder.date)}</div><div class="date-sub">${escapeHTML(reminder.time || 'Saat belirtilmedi')}</div></td>
    <td class="completion-cell"><button class="reminder-check" data-reminder-toggle="${reminder.id}" aria-label="${reminder.done ? 'Tamamlandı işaretini kaldır' : 'Tamamlandı olarak işaretle'}" aria-pressed="${!!reminder.done}">${reminder.done ? '✓' : ''}</button></td>
    <td colspan="2" class="reminder-actions-cell"><div class="reminder-actions"><button data-reminder-cal="${reminder.id}" title="iPhone / Google Takvime ekle">📅 Takvim</button><button data-reminder-edit="${reminder.id}">Düzenle</button><button data-reminder-delete="${reminder.id}">Sil</button></div></td>
  </tr>`;
}
function dayLabel(value) {
  if (!value) return 'Tarih belirtilmedi';
  return new Date(`${value}T12:00:00`).toLocaleDateString('tr-TR', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function render() {
  const list = visibleTasks();
  const events = [
    ...list.map(item => ({kind:'shoot', date:item.shootDate || '', time:item.shootTime || '', item})),
    ...(activeFilter === 'done' ? [] : reminders.map(item => ({kind:'reminder', date:item.date || '', time:item.time || '', item})))
  ].sort((a,b) => (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31') || (a.time || '99:99').localeCompare(b.time || '99:99') || (a.item.createdAt || 0) - (b.item.createdAt || 0));
  const groups = [];
  for (const event of events) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== event.date) { group = {date:event.date,events:[]}; groups.push(group); }
    group.events.push(event);
  }
  rows.innerHTML = groups.map(group => `<tr class="day-divider"><td colspan="7"><div class="day-label"><strong>${escapeHTML(dayLabel(group.date))}</strong><span>${group.events.length} kayıt</span></div></td></tr>` + group.events.map(event => event.kind === 'shoot' ? taskRow(event.item) : reminderRow(event.item)).join('')).join('');
  const hasVisible = events.length > 0;
  $('.table-wrap').style.display = hasVisible ? '' : 'none';
  $('#emptyState').style.display = hasVisible ? 'none' : 'block';
  const noTasks = tasks.length === 0 && reminders.length === 0;
  $('#emptyState h3').textContent = noTasks ? 'İlk çekimini planla' : 'Burada kayıt yok';
  $('#emptyState p').textContent = noTasks ? 'Çekim fikirlerini ekle, sürecin her adımını kolayca takip et.' : 'Başka bir filtre seçebilir veya aramanı değiştirebilirsin.';
  $('#emptyAdd').style.display = tasks.length === 0 ? '' : 'none';
  $('#listTitle').textContent = activeFilter === 'done' ? 'Bitenler' : 'Ajandan';
  $('#listDescription').textContent = activeFilter === 'done' ? 'Tamamlandı olarak işaretlediğin çekimler.' : 'Çekimler ve anımsatıcılar günlerine göre.';
  $('#totalStat').textContent = tasks.length;
  $('#shootStat').textContent = tasks.filter(t => !t.shot).length;
  $('#editStat').textContent = tasks.filter(t => t.shot && !t.edited).length;
  $('#publishedStat').textContent = tasks.filter(t => t.published).length;
  $('#doneCount').textContent = tasks.filter(t => t.done).length;
  $('#allCount').textContent = tasks.length + reminders.length;
  $('#footerCount').textContent = `${events.length} kayıt gösteriliyor`;
  renderReminders();
}
function renderReminders() {
  const list = $('#reminderList');
  const ordered = reminders.slice().sort((a,b) => Number(a.done) - Number(b.done) || compareScheduled(a, b, 'date', 'time'));
  $('#reminderCount').textContent = reminders.filter(r => !r.done).length;
  $('#reminderEmpty').style.display = reminders.length ? 'none' : 'block';
  list.innerHTML = ordered.map(reminder => `<article class="reminder-item ${reminder.done ? 'is-done' : ''}">
    <button class="reminder-check" data-reminder-toggle="${reminder.id}" aria-label="${reminder.done ? 'Tamamlandı işaretini kaldır' : 'Tamamlandı olarak işaretle'}" aria-pressed="${!!reminder.done}">${reminder.done ? '✓' : ''}</button>
    <div class="reminder-copy"><strong>${escapeHTML(reminder.title)}</strong><span>${escapeHTML(reminder.note || 'Not yok')}</span></div>
    <div class="reminder-when">${dateValue(reminder.date)}${reminder.time ? ` · ${escapeHTML(reminder.time)}` : ''}</div>
    <div class="reminder-actions"><button data-reminder-cal="${reminder.id}" title="iPhone / Google Takvime ekle">📅 Takvim</button><button data-reminder-edit="${reminder.id}">Düzenle</button><button data-reminder-delete="${reminder.id}">Sil</button></div>
  </article>`).join('');
}
function openReminder(reminder) {
  $('#reminderForm').reset();
  $('#reminderId').value = reminder?.id || '';
  $('#reminderDialogTitle').textContent = reminder ? 'Anımsatıcıyı düzenle' : 'Yeni anımsatıcı';
  if (reminder) { $('#reminderTitle').value = reminder.title; $('#reminderDate').value = dateForDisplay(reminder.date); $('#reminderTime').value = reminder.time || ''; $('#reminderNote').value = reminder.note || ''; }
  showDialog(reminderDialog); setTimeout(() => $('#reminderTitle').focus(), 50);
}
function openForm(task) {
  $('#taskForm').reset();
  $('#taskId').value = task?.id || '';
  $('#dialogTitle').textContent = task ? 'Çekimi düzenle' : 'Yeni çekim planla';
  if (task) {
    $('#title').value = task.title; $('#shootDate').value = dateForDisplay(task.shootDate);
    $('#shootTime').value = task.shootTime || ''; $('#location').value = task.location || '';
    $('#details').value = task.details || ''; $('#publishedDate').value = dateForDisplay(task.publishedDate || '');
  }
  showDialog(dialog);
  setTimeout(() => $('#title').focus(), 50);
}
function openNativePicker(fieldId) {
  const picker = document.querySelector(`[data-picker-for="${fieldId}"]`);
  if (!picker) return;
  const field = document.getElementById(fieldId);
  if (field) picker.value = picker.type === 'date' ? dateForStorage(field.value) : normalizeTime(field.value);
  try { if (picker.showPicker) picker.showPicker(); else picker.click(); }
  catch { picker.focus(); picker.click(); }
}
document.querySelectorAll('[data-open-picker]').forEach((button) => button.addEventListener('click', () => openNativePicker(button.dataset.openPicker)));
document.querySelectorAll('.formatted-date').forEach((field) => field.addEventListener('click', () => openNativePicker(field.id)));
document.querySelectorAll('.formatted-time').forEach((field) => field.addEventListener('input', () => {
  const digits = field.value.replace(/\D/g, '').slice(0, 4);
  const formatted = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits.length === 2 ? `${digits}:` : digits;
  field.value = formatted;
  const caret = digits.length >= 2 ? 3 + Math.max(0, digits.length - 2) : digits.length;
  field.setSelectionRange(caret, caret);
}));
document.querySelectorAll('.native-picker').forEach((picker) => picker.addEventListener('change', () => {
  const field = document.getElementById(picker.dataset.pickerFor);
  if (field) field.value = picker.type === 'date' ? dateForDisplay(picker.value) : picker.value;
}));
document.querySelectorAll('.formatted-date').forEach((field) => field.addEventListener('blur', () => {
  const iso = dateForStorage(field.value);
  if (iso) field.value = dateForDisplay(iso);
}));
document.querySelectorAll('.formatted-time').forEach((field) => field.addEventListener('blur', () => { field.value = normalizeTime(field.value); }));
function notify(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}
function setAuthMessage(message, success = false) {
  const target = $('#authMessage'); target.textContent = message; target.classList.toggle('success', success);
}
function updateAccountButton() {
  const button = $('#accountButton');
  const storageLabel = $('#storageLabel');
  if (cloudUser) {
    button.textContent = 'Eşitleniyor · çıkış'; button.classList.add('signed-in');
    button.title = `Giriş yapıldı: ${cloudUser.email || ''}`;
    storageLabel.innerHTML = 'Bu hesap bulutla eşitlenir <span class="lock">◈</span>';
  } else if (cloudReady) {
    button.textContent = 'Giriş yap · eşitle'; button.classList.remove('signed-in');
    button.title = 'Aynı kayıtları diğer cihazlarında açmak için giriş yap';
    storageLabel.innerHTML = 'Giriş yapınca kayıtların eşitlenir <span class="lock">◈</span>';
  } else {
    button.textContent = 'Eşitleme kuruluyor'; button.classList.remove('signed-in');
    button.title = 'Bulut bağlantısı yapılandırılana kadar bu cihazda saklanır';
    storageLabel.innerHTML = 'Bilgilerin bu cihazda saklanır <span class="lock">◈</span>';
  }
}
function shootToRow(item) {
  return { id:item.id, user_id:cloudUser.id, title:item.title, shoot_date:item.shootDate, shoot_time:item.shootTime || null,
    location:item.location || '', details:item.details || '', published_date:item.publishedDate || null,
    shot:!!item.shot, edited:!!item.edited, published:!!item.published, platforms:{...(item.platforms || {}), _done:!!item.done}, created_at:new Date(item.createdAt || Date.now()).toISOString() };
}
function reminderToRow(item) {
  return { id:item.id, user_id:cloudUser.id, title:item.title, due_date:item.date, due_time:item.time || null,
    note:item.note || '', done:!!item.done, created_at:new Date(item.createdAt || Date.now()).toISOString() };
}
function shootFromRow(row) {
  return { id:row.id, title:row.title, shootDate:row.shoot_date, shootTime:row.shoot_time || '', location:row.location || '', details:row.details || '',
    publishedDate:row.published_date || '', shot:row.shot, edited:row.edited, published:row.published, done:!!row.platforms?._done, platforms:Object.fromEntries(Object.entries(row.platforms || {}).filter(([key]) => key !== '_done')), createdAt:new Date(row.created_at).getTime() || Date.now() };
}
function reminderFromRow(row) {
  return { id:row.id, title:row.title, date:row.due_date, time:row.due_time || '', note:row.note || '', done:row.done,
    createdAt:new Date(row.created_at).getTime() || Date.now() };
}
async function syncRows(table, items, deleteId) {
  if (!cloud || !cloudUser) return false;
  let result;
  if (deleteId) result = await cloud.from(table).delete().eq('user_id', cloudUser.id).eq('id', deleteId);
  else if (items.length) result = await cloud.from(table).upsert(items.map(table === 'shoots' ? shootToRow : reminderToRow));
  if (result?.error) { notify(`Buluta kaydedemedim: ${result.error.message}`); return false; }
  return true;
}
let refreshInProgress = false;
async function refreshCloudData() {
  if (!cloud || !cloudUser || refreshInProgress || !navigator.onLine) return;
  if (!(await flushSyncQueue())) return;
  refreshInProgress = true;
  try {
    const [shootResult, reminderResult] = await Promise.all([
      cloud.from('shoots').select('*').order('shoot_date').order('shoot_time'),
      cloud.from('reminders').select('*').order('due_date').order('due_time')
    ]);
    if (shootResult.error) throw shootResult.error;
    if (reminderResult.error) throw reminderResult.error;
    const remoteShoots = shootResult.data.map(shootFromRow);
    const remoteReminders = reminderResult.data.map(reminderFromRow);
    // Merge by id: cloud values win for records already synced, while local-only
    // records survive login and are added to the cloud instead of being discarded.
    const mergeAndUploadLocalOnly = async (table, localItems, remoteItems) => {
      const remoteIds = new Set(remoteItems.map(item => item.id));
      const localOnly = localItems.filter(item => !remoteIds.has(item.id));
      const merged = [...remoteItems, ...localOnly];
      if (localOnly.length && !(await syncRows(table, localOnly))) queueSync(table, merged);
      return merged;
    };
    tasks = await mergeAndUploadLocalOnly('shoots', tasks, remoteShoots);
    reminders = await mergeAndUploadLocalOnly('reminders', reminders, remoteReminders);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    localStorage.setItem('planim-animsaticilar-v1', JSON.stringify(reminders));
    render(); updateAccountButton();
  } catch (error) {
    notify(`Eşitleme başarısız: ${error.message || error}`);
  } finally { refreshInProgress = false; }
}
function subscribeToCloudChanges() {
  if (!cloud || !cloudUser) return;
  if (realtimeChannel) cloud.removeChannel(realtimeChannel);
  realtimeChannel = cloud.channel(`planim-${cloudUser.id}`)
    .on('postgres_changes', { event:'*', schema:'public', table:'shoots', filter:`user_id=eq.${cloudUser.id}` }, scheduleCloudRefresh)
    .on('postgres_changes', { event:'*', schema:'public', table:'reminders', filter:`user_id=eq.${cloudUser.id}` }, scheduleCloudRefresh)
    .subscribe();
}
function scheduleCloudRefresh() {
  clearTimeout(cloudRefreshTimer);
  cloudRefreshTimer = window.setTimeout(refreshCloudData, 250);
}
function initializeCloud() {
  const config = window.PLANIM_SUPABASE_CONFIG || {};
  if (!config.url || !config.publishableKey || !window.supabase?.createClient) {
    updateAccountButton(); render(); updateConnectionStatus(); return;
  }
  cloudReady = true;
  cloud = window.supabase.createClient(config.url, config.publishableKey, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
  cloud.auth.onAuthStateChange((event, session) => {
    cloudUser = session?.user || null; updateAccountButton();
    if (event === 'PASSWORD_RECOVERY') {
      window.setTimeout(async () => {
        const newPassword = window.prompt('Yeni şifreni belirle (en az 8 karakter):');
        if (!newPassword || newPassword.length < 8) { notify('Şifre en az 8 karakter olmalı.'); return; }
        const { error } = await cloud.auth.updateUser({ password:newPassword });
        if (error) notify(`Şifre güncellenemedi: ${error.message}`);
        else window.alert('Şifren güncellendi. Artık yeni şifrenle giriş yapabilirsin.');
      }, 0);
    }
    if (cloudUser) { hideDialog(authDialog); subscribeToCloudChanges(); window.setTimeout(async () => { await flushSyncQueue(); refreshCloudData(); }, 0); }
    else if (realtimeChannel) { cloud.removeChannel(realtimeChannel); realtimeChannel = null; }
  });
  updateAccountButton();
  updateConnectionStatus();
}

$('#accountButton').addEventListener('click', async () => {
  if (!cloudReady) { notify('Bulut eşitlemesi henüz yapılandırılmadı.'); return; }
  if (cloudUser) {
    const { error } = await cloud.auth.signOut();
    if (error) notify(`Çıkış yapılamadı: ${error.message}`);
    else { cloudUser = null; updateAccountButton(); notify('Hesaptan çıkış yapıldı.'); }
    return;
  }
  authMode = 'sign-in'; $('#authTitle').textContent = 'Hesabına giriş yap';
  $('#authSubmit').innerHTML = 'Giriş yap <span>→</span>'; $('#authModeToggle').textContent = 'Yeni hesap oluştur';
  setAuthMessage(''); showDialog(authDialog);
});
$('#closeAuth').addEventListener('click', () => hideDialog(authDialog));
$('#forgotPassword').addEventListener('click', async () => {
  const email = $('#authEmail').value.trim();
  if (!email) { $('#authEmail').focus(); setAuthMessage('Önce e-posta adresini yaz.'); return; }
  const button = $('#forgotPassword'); button.disabled = true; setAuthMessage('Sıfırlama bağlantısı gönderiliyor…');
  try {
    const { error } = await cloud.auth.resetPasswordForEmail(email, { redirectTo:'https://tozcane.github.io/ajanda/' });
    if (error) throw error;
    setAuthMessage('Şifre yenileme bağlantısını e-postana gönderdim. Gelen kutunu ve spam klasörünü kontrol et.', true);
  } catch (error) { setAuthMessage(error.message || 'Şifre yenileme e-postası gönderilemedi.'); }
  finally { button.disabled = false; }
});
$('#authModeToggle').addEventListener('click', () => {
  authMode = authMode === 'sign-in' ? 'sign-up' : 'sign-in';
  const signup = authMode === 'sign-up';
  $('#authTitle').textContent = signup ? 'Yeni hesap oluştur' : 'Hesabına giriş yap';
  $('#authSubmit').innerHTML = signup ? 'Hesap oluştur <span>→</span>' : 'Giriş yap <span>→</span>';
  $('#authModeToggle').textContent = signup ? 'Zaten hesabım var' : 'Yeni hesap oluştur';
  setAuthMessage('');
});
$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('#authEmail').value.trim(); const password = $('#authPassword').value;
  const button = $('#authSubmit'); button.disabled = true; setAuthMessage('Bağlanıyor…');
  try {
    const result = authMode === 'sign-up'
      ? await cloud.auth.signUp({ email, password, options:{ emailRedirectTo:window.location.href.split('?')[0] } })
      : await cloud.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (authMode === 'sign-up' && !result.data.session) {
      setAuthMessage('E-posta adresine gelen doğrulama bağlantısına tıkla, ardından giriş yap.', true);
    } else { setAuthMessage('Giriş başarılı. Kayıtların eşitleniyor…', true); }
  } catch (error) { setAuthMessage(error.message || 'Giriş başarısız. Bilgilerini kontrol et.'); }
  finally { button.disabled = false; }
});
window.addEventListener('online', () => { updateConnectionStatus('Bağlantı geldi · eşitleniyor…'); flushSyncQueue().then(() => refreshCloudData()); });
window.addEventListener('offline', () => updateConnectionStatus());
window.addEventListener('focus', () => { if (cloudUser && navigator.onLine) { flushSyncQueue().then(() => refreshCloudData()); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && cloudUser && navigator.onLine) { flushSyncQueue().then(() => refreshCloudData()); } });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Çevrimdışı uygulama önbelleği açılamadı:', error));
updateConnectionStatus();

$('#newTask').addEventListener('click', () => openForm());
$('#emptyAdd').addEventListener('click', () => openForm());
$('#newReminder').addEventListener('click', () => openReminder());
$('#closeReminder').addEventListener('click', () => hideDialog(reminderDialog));
$('#cancelReminder').addEventListener('click', () => hideDialog(reminderDialog));
reminderDialog.addEventListener('click', (event) => { if (event.target === reminderDialog) hideDialog(reminderDialog); });
$('#reminderForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('#reminderId').value;
  const existing = reminders.find(item => item.id === id);
  const reminder = { id: id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), title: $('#reminderTitle').value.trim(), date: dateForStorage($('#reminderDate').value), time: normalizeTime($('#reminderTime').value), note: $('#reminderNote').value.trim(), done: existing?.done || false, createdAt: existing?.createdAt || Date.now() };
  reminders = existing ? reminders.map(item => item.id === id ? reminder : item) : [...reminders, reminder];
  hideDialog(reminderDialog); saveReminders(); notify(existing ? 'Anımsatıcı güncellendi.' : 'Anımsatıcı eklendi.');
});
$('#closeDialog').addEventListener('click', () => hideDialog(dialog));
$('#cancelDialog').addEventListener('click', () => hideDialog(dialog));
dialog.addEventListener('click', (event) => { if (event.target === dialog) hideDialog(dialog); });
$('#taskForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('#taskId').value;
  const existing = tasks.find((t) => t.id === id);
  const task = {
    id: id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    title: $('#title').value.trim(), shootDate: dateForStorage($('#shootDate').value), shootTime: normalizeTime($('#shootTime').value),
    location: $('#location').value.trim(), details: $('#details').value.trim(), publishedDate: dateForStorage($('#publishedDate').value),
    shot: existing?.shot || false, edited: existing?.edited || false, published: existing?.published || false, done: existing?.done || false,
    platforms: existing?.platforms || {}, createdAt: existing?.createdAt || Date.now()
  };
  tasks = existing ? tasks.map(t => t.id === id ? task : t) : [...tasks, task];
  hideDialog(dialog); saveTasks(); notify(existing ? 'Çekim bilgileri güncellendi.' : 'Yeni çekim planına eklendi.');
});
$('.tabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]'); if (!button) return;
  activeFilter = button.dataset.filter;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  document.querySelectorAll('.side-nav [data-filter-link]').forEach(link => link.classList.toggle('active', link.dataset.filterLink === activeFilter)); render();
});
document.querySelectorAll('[data-filter-link]').forEach(link => link.addEventListener('click', () => {
  activeFilter = link.dataset.filterLink;
  document.querySelectorAll('.side-nav [data-filter-link]').forEach(item => item.classList.toggle('active', item.dataset.filterLink === activeFilter));
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.filter === activeFilter)); render();
}));
$('#searchInput').addEventListener('input', (event) => { query = event.target.value.trim(); render(); });
$('#sortButton').addEventListener('click', () => { newestFirst = !newestFirst; render(); });
rows.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-complete]');
  if (!checkbox) return;
  const task = tasks.find(item => item.id === checkbox.dataset.complete);
  if (task) { task.done = checkbox.checked; saveTasks(); }
});
rows.addEventListener('click', (event) => {
  const reminderToggle = event.target.closest('[data-reminder-toggle]');
  if (reminderToggle) { const reminder = reminders.find(item => item.id === reminderToggle.dataset.reminderToggle); if (reminder) { reminder.done = !reminder.done; saveReminders(); } return; }
  const reminderEdit = event.target.closest('[data-reminder-edit]');
  if (reminderEdit) { openReminder(reminders.find(item => item.id === reminderEdit.dataset.reminderEdit)); return; }
  const reminderDelete = event.target.closest('[data-reminder-delete]');
  if (reminderDelete) { reminders = reminders.filter(item => item.id !== reminderDelete.dataset.reminderDelete); saveReminders({deleteId:reminderDelete.dataset.reminderDelete}); notify('Anımsatıcı silindi.'); return; }
  const platformButton = event.target.closest('[data-platform]');
  if (platformButton) {
    const task = tasks.find(t => t.id === platformButton.dataset.id);
    task.platforms ||= {};
    const name = platformButton.dataset.platform;
    task.platforms[name] = !task.platforms[name];
    const isNowShared = ['Instagram','LinkedIn','YouTube'].some(platform => task.platforms[platform]);
    if (isNowShared) { task.published = true; task.publishedDate ||= todayISO(); }
    else if (task.published) { task.published = false; task.publishedDate = ''; }
    saveTasks(); notify(`${name} paylaşımı ${task.platforms[name] ? 'işaretlendi' : 'kaldırıldı'}.`); return;
  }
  const stageButton = event.target.closest('[data-stage]');
  if (stageButton) {
    const task = tasks.find(t => t.id === stageButton.dataset.id); const stage = stageButton.dataset.stage;
    task[stage] = !task[stage];
    if (stage === 'published') task.publishedDate = task.published ? (task.publishedDate || todayISO()) : '';
    saveTasks(); notify(task[stage] ? `${stage === 'shot' ? 'Çekildi' : stage === 'edited' ? 'Montajlandı' : 'Paylaşıldı'} olarak işaretlendi.` : 'Aşama güncellendi.'); return;
  }
  const menuButton = event.target.closest('[data-menu]');
  if (menuButton) {
    const menu = document.querySelector(`[data-actions="${menuButton.dataset.menu}"]`);
    document.querySelectorAll('.action-menu').forEach(m => { if (m !== menu) m.hidden = true; }); menu.hidden = !menu.hidden; return;
  }
  const taskCal = event.target.closest('[data-task-cal]');
  if (taskCal) { const task = tasks.find(t => t.id === taskCal.dataset.taskCal); if (task) { downloadShootICS(task); notify('Takvim dosyası (.ics) indirildi.'); } return; }
  const reminderCal = event.target.closest('[data-reminder-cal]');
  if (reminderCal) { const reminder = reminders.find(r => r.id === reminderCal.dataset.reminderCal); if (reminder) { downloadReminderICS(reminder); notify('Takvim dosyası (.ics) indirildi.'); } return; }
  const editButton = event.target.closest('[data-edit]');
  if (editButton) { const task = tasks.find(t => t.id === editButton.dataset.edit); openForm(task); return; }
  const deleteButton = event.target.closest('[data-delete]');
  if (deleteButton) { const task = tasks.find(t => t.id === deleteButton.dataset.delete); tasks = tasks.filter(t => t.id !== deleteButton.dataset.delete); saveTasks({deleteId:task.id}); notify(`“${task.title}” silindi.`); }
});
$('#reminderList').addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-reminder-toggle]');
  if (toggle) { const reminder = reminders.find(item => item.id === toggle.dataset.reminderToggle); reminder.done = !reminder.done; saveReminders(); return; }
  const cal = event.target.closest('[data-reminder-cal]');
  if (cal) { const reminder = reminders.find(item => item.id === cal.dataset.reminderCal); if (reminder) { downloadReminderICS(reminder); notify('Takvim dosyası (.ics) indirildi.'); } return; }
  const edit = event.target.closest('[data-reminder-edit]');
  if (edit) { openReminder(reminders.find(item => item.id === edit.dataset.reminderEdit)); return; }
  const remove = event.target.closest('[data-reminder-delete]');
  if (remove) { reminders = reminders.filter(item => item.id !== remove.dataset.reminderDelete); saveReminders({deleteId:remove.dataset.reminderDelete}); notify('Anımsatıcı silindi.'); }
});
document.addEventListener('click', (event) => { if (!event.target.closest('.row-actions')) document.querySelectorAll('.action-menu').forEach(m => m.hidden = true); });

// ── Bildirimler & Takvim (.ics) ──
const NOTIFIED_KEY = 'planim-notified-reminders-v1';
function getNotifiedIds() {
  try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]'); } catch { return []; }
}
function markAsNotified(id) {
  const ids = getNotifiedIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(ids.slice(-200)));
  }
}
function notifyUser(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options = {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: tag || 'planim-alert',
    renotify: true
  };
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, options);
    }).catch(() => {
      try { new Notification(title, options); } catch {}
    });
  } else {
    try { new Notification(title, options); } catch {}
  }
}
function checkDueReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const todayStr = todayISO();
  const curH = String(now.getHours()).padStart(2, '0');
  const curM = String(now.getMinutes()).padStart(2, '0');
  const curTime = `${curH}:${curM}`;
  const notified = getNotifiedIds();

  reminders.forEach(r => {
    if (r.done) return;
    if (notified.includes(r.id)) return;
    if (!r.date) return;

    const isDue = (r.date < todayStr) || (r.date === todayStr && (!r.time || r.time <= curTime));
    if (isDue) {
      markAsNotified(r.id);
      notifyUser(`⏰ Anımsatıcı: ${r.title}`, r.note || (r.time ? `Saat: ${r.time}` : 'Vakti geldi!'), `reminder-${r.id}`);
    }
  });
}
function updateNotifyButton() {
  const btn = $('#notifyButton');
  if (!btn) return;
  if (!('Notification' in window)) {
    btn.style.display = 'none';
    return;
  }
  if (Notification.permission === 'granted') {
    btn.textContent = '🔔 Bildirimler Açık';
    btn.classList.add('enabled');
    btn.title = 'Anımsatıcı saatinde bildirim alacaksın';
  } else {
    btn.textContent = '🔔 Bildirimleri Aç';
    btn.classList.remove('enabled');
    btn.title = 'Anımsatıcı saatinde bildirim almak için tıkla';
  }
}
async function handleNotifyButtonClick() {
  if (!('Notification' in window)) {
    notify('Tarayıcın bildirimleri desteklemiyor.');
    return;
  }
  if (Notification.permission === 'granted') {
    notifyUser('🔔 Bildirimler Aktif', 'Anımsatıcılarının vakti geldiğinde buradan bildirim alacaksın.');
    notify('Bildirimler zaten açık.');
    return;
  }
  if (Notification.permission === 'denied') {
    notify('Bildirim izni engellenmiş. Tarayıcı adres çubuğundaki kilit simgesinden izin verebilirsin.');
    return;
  }
  const perm = await Notification.requestPermission();
  updateNotifyButton();
  if (perm === 'granted') {
    notifyUser('🔔 Bildirimler Açıldı', 'Anımsatıcılarının vakti geldiğinde buradan bildirim alacaksın.');
    notify('Bildirimler aktif edildi!');
    checkDueReminders();
  } else {
    notify('Bildirim izni verilmedi.');
  }
}

function downloadReminderICS(reminder) {
  const [y, m, d] = (reminder.date || todayISO()).split('-').map(Number);
  const [h, min] = (reminder.time || '09:00').split(':').map(Number);
  const start = new Date(y, m - 1, d, h, min, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const stamp = (dt) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const pad = (n) => String(n).padStart(2, '0');
  const dtStr = `${y}${pad(m)}${pad(d)}T${pad(h)}${pad(min)}00`;
  const endStr = `${end.getFullYear()}${pad(end.getMonth()+1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Planim//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${reminder.id || Date.now()}@planim`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${dtStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:Anımsatıcı: ${reminder.title}`,
    reminder.note ? `DESCRIPTION:${reminder.note.replace(/\n/g, '\\n')}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${reminder.title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reminder.title || 'animsatici'}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadShootICS(task) {
  const [y, m, d] = (task.shootDate || todayISO()).split('-').map(Number);
  const [h, min] = (task.shootTime || '10:00').split(':').map(Number);
  const start = new Date(y, m - 1, d, h, min, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = (dt) => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const pad = (n) => String(n).padStart(2, '0');
  const dtStr = `${y}${pad(m)}${pad(d)}T${pad(h)}${pad(min)}00`;
  const endStr = `${end.getFullYear()}${pad(end.getMonth()+1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Planim//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${task.id || Date.now()}@planim`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${dtStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:Çekim: ${task.title}`,
    task.location ? `LOCATION:${task.location}` : '',
    task.details ? `DESCRIPTION:${task.details.replace(/\n/g, '\\n')}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Çekim: ${task.title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${task.title || 'cekim'}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#notifyButton')?.addEventListener('click', handleNotifyButtonClick);
updateNotifyButton();
setInterval(checkDueReminders, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDueReminders(); });

// ── Gece / Gündüz Modu (Dark Mode) ──
const THEME_KEY = 'planim-theme-preference';
function applyTheme(pref) {
  const root = document.documentElement;
  const isDark = pref === 'dark' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  updateThemeButton(isDark);
}
function updateThemeButton(isDark) {
  const btn = $('#themeToggle');
  if (!btn) return;
  btn.innerHTML = isDark ? '☀️' : '🌙';
  btn.title = isDark ? 'Gündüz moduna geç' : 'Gece moduna geç';
  btn.setAttribute('aria-label', btn.title);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

const savedTheme = localStorage.getItem(THEME_KEY) || 'auto';
applyTheme(savedTheme);
$('#themeToggle')?.addEventListener('click', toggleTheme);
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') applyTheme('auto');
  });
} catch {}

$('#todayLabel').textContent = new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long' });
initializeCloud();
setTimeout(checkDueReminders, 1500);
