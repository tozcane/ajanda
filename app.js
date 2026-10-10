const STORAGE_KEY = 'planim-cekimler-v1';
const $ = (selector) => document.querySelector(selector);
const rows = $('#taskRows');
const dialog = $('#taskDialog');
const reminderDialog = $('#reminderDialog');
let tasks = loadTasks();
let reminders = loadReminders();
let activeFilter = 'all';
let query = '';
let newestFirst = false;
let toastTimer;

function loadTasks() {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function loadReminders() {
  try { const value = JSON.parse(localStorage.getItem('planim-animsaticilar-v1') || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); render(); }
function saveReminders() { localStorage.setItem('planim-animsaticilar-v1', JSON.stringify(reminders)); renderReminders(); }
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
    if (activeFilter === 'upcoming' && (task.published || !task.shootDate || task.shootDate < now)) return false;
    if (activeFilter === 'completed' && !task.published) return false;
    if (activeFilter === 'today' && task.shootDate !== now) return false;
    return true;
  }).sort((a,b) => compareScheduled(a, b, 'shootDate', 'shootTime') * (newestFirst ? -1 : 1));
}
function taskRow(task) {
  const progress = progressed(task);
  const platforms = task.platforms || {};
  const stageBox = (stage, label, symbol) => `<button class="stage-box ${task[stage] ? 'done' : ''}" data-stage="${stage}" data-id="${task.id}" aria-pressed="${!!task[stage]}"><span class="stage-check">${task[stage] ? '✓' : symbol}</span><span>${label}</span></button>`;
  const progressHTML = `<div class="stage-grid">${stageBox('shot','Çekim','◷')}${stageBox('edited','Montaj','✳')}<div class="stage-box share-box ${task.published ? 'done' : ''}"><span class="share-title"><span class="stage-check">${task.published ? '✓' : '↗'}</span> Paylaşım</span><div class="platforms">${['Instagram','LinkedIn','YouTube'].map(name => `<button class="platform ${platforms[name] ? 'selected' : ''}" data-platform="${name}" data-id="${task.id}" aria-pressed="${!!platforms[name]}">${name}</button>`).join('')}</div></div></div>`;
  return `<tr>
    <td><div class="task-main"><span class="task-mark">✳</span><div><div class="task-name" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</div><div class="task-detail">${escapeHTML(task.details || 'Not eklenmedi')}</div></div></div></td>
    <td><div class="date-main">${dateValue(task.shootDate)}</div><div class="date-sub">${escapeHTML(task.shootTime || 'Saat belirtilmedi')}</div></td>
    <td class="location-cell" title="${escapeHTML(task.location)}">${escapeHTML(task.location || 'Yer belirtilmedi')}</td>
    <td>${progressHTML}<div class="progress-caption">${progress}/3 tamamlandı</div></td>
    <td class="published-cell ${task.published ? 'is-published' : ''}">${task.published ? dateValue(task.publishedDate || todayISO()) : '<span>—</span>'}</td>
    <td class="row-actions"><button class="menu-button" data-menu="${task.id}" aria-label="İçerik seçenekleri">···</button><div class="action-menu" data-actions="${task.id}" hidden><button data-edit="${task.id}">Düzenle</button><button class="delete" data-delete="${task.id}">Sil</button></div></td>
  </tr>`;
}
function render() {
  const list = visibleTasks();
  rows.innerHTML = list.map(taskRow).join('');
  const hasVisible = list.length > 0;
  $('.table-wrap').style.display = hasVisible ? '' : 'none';
  $('#emptyState').style.display = hasVisible ? 'none' : 'block';
  const noTasks = tasks.length === 0;
  $('#emptyState h3').textContent = noTasks ? 'İlk çekimini planla' : 'Burada içerik yok';
  $('#emptyState p').textContent = noTasks ? 'Çekim fikirlerini ekle, sürecin her adımını kolayca takip et.' : 'Başka bir filtre seçebilir veya aramanı değiştirebilirsin.';
  $('#emptyAdd').style.display = noTasks ? '' : 'none';
  $('#totalStat').textContent = tasks.length;
  $('#shootStat').textContent = tasks.filter(t => !t.shot).length;
  $('#editStat').textContent = tasks.filter(t => t.shot && !t.edited).length;
  $('#publishedStat').textContent = tasks.filter(t => t.published).length;
  $('#navCount').textContent = tasks.filter(t => !t.published).length;
  $('#allCount').textContent = tasks.length;
  $('#footerCount').textContent = `${list.length} içerik gösteriliyor`;
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
    <div class="reminder-actions"><button data-reminder-edit="${reminder.id}">Düzenle</button><button data-reminder-delete="${reminder.id}">Sil</button></div>
  </article>`).join('');
}
function openReminder(reminder) {
  $('#reminderForm').reset();
  $('#reminderId').value = reminder?.id || '';
  $('#reminderDialogTitle').textContent = reminder ? 'Anımsatıcıyı düzenle' : 'Yeni anımsatıcı';
  if (reminder) { $('#reminderTitle').value = reminder.title; $('#reminderDate').value = dateForDisplay(reminder.date); $('#reminderTime').value = reminder.time || ''; $('#reminderNote').value = reminder.note || ''; }
  reminderDialog.showModal(); setTimeout(() => $('#reminderTitle').focus(), 50);
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
  dialog.showModal();
  setTimeout(() => $('#title').focus(), 50);
}
document.querySelectorAll('[data-open-picker]').forEach((button) => button.addEventListener('click', () => {
  const picker = document.querySelector(`[data-picker-for="${button.dataset.openPicker}"]`);
  if (!picker) return;
  const field = document.getElementById(button.dataset.openPicker);
  if (field) picker.value = picker.type === 'date' ? dateForStorage(field.value) : normalizeTime(field.value);
  try { if (picker.showPicker) picker.showPicker(); else picker.click(); }
  catch { picker.focus(); picker.click(); }
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

$('#newTask').addEventListener('click', () => openForm());
$('#emptyAdd').addEventListener('click', () => openForm());
$('#newReminder').addEventListener('click', () => openReminder());
$('#closeReminder').addEventListener('click', () => reminderDialog.close());
$('#cancelReminder').addEventListener('click', () => reminderDialog.close());
reminderDialog.addEventListener('click', (event) => { if (event.target === reminderDialog) reminderDialog.close(); });
$('#reminderForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('#reminderId').value;
  const existing = reminders.find(item => item.id === id);
  const reminder = { id: id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), title: $('#reminderTitle').value.trim(), date: dateForStorage($('#reminderDate').value), time: normalizeTime($('#reminderTime').value), note: $('#reminderNote').value.trim(), done: existing?.done || false, createdAt: existing?.createdAt || Date.now() };
  reminders = existing ? reminders.map(item => item.id === id ? reminder : item) : [...reminders, reminder];
  reminderDialog.close(); saveReminders(); notify(existing ? 'Anımsatıcı güncellendi.' : 'Anımsatıcı eklendi.');
});
$('#closeDialog').addEventListener('click', () => dialog.close());
$('#cancelDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
$('#taskForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('#taskId').value;
  const existing = tasks.find((t) => t.id === id);
  const task = {
    id: id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    title: $('#title').value.trim(), shootDate: dateForStorage($('#shootDate').value), shootTime: normalizeTime($('#shootTime').value),
    location: $('#location').value.trim(), details: $('#details').value.trim(), publishedDate: dateForStorage($('#publishedDate').value),
    shot: existing?.shot || false, edited: existing?.edited || false, published: existing?.published || false,
    platforms: existing?.platforms || {}, createdAt: existing?.createdAt || Date.now()
  };
  tasks = existing ? tasks.map(t => t.id === id ? task : t) : [...tasks, task];
  dialog.close(); saveTasks(); notify(existing ? 'Çekim bilgileri güncellendi.' : 'Yeni çekim planına eklendi.');
});
$('.tabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]'); if (!button) return;
  activeFilter = button.dataset.filter;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button)); render();
});
document.querySelectorAll('[data-filter-link]').forEach(link => link.addEventListener('click', () => {
  activeFilter = link.dataset.filterLink;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.filter === activeFilter)); render();
}));
$('#searchInput').addEventListener('input', (event) => { query = event.target.value.trim(); render(); });
$('#sortButton').addEventListener('click', () => { newestFirst = !newestFirst; render(); });
rows.addEventListener('click', (event) => {
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
  const editButton = event.target.closest('[data-edit]');
  if (editButton) { const task = tasks.find(t => t.id === editButton.dataset.edit); openForm(task); return; }
  const deleteButton = event.target.closest('[data-delete]');
  if (deleteButton) { const task = tasks.find(t => t.id === deleteButton.dataset.delete); tasks = tasks.filter(t => t.id !== deleteButton.dataset.delete); saveTasks(); notify(`“${task.title}” silindi.`); }
});
$('#reminderList').addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-reminder-toggle]');
  if (toggle) { const reminder = reminders.find(item => item.id === toggle.dataset.reminderToggle); reminder.done = !reminder.done; saveReminders(); return; }
  const edit = event.target.closest('[data-reminder-edit]');
  if (edit) { openReminder(reminders.find(item => item.id === edit.dataset.reminderEdit)); return; }
  const remove = event.target.closest('[data-reminder-delete]');
  if (remove) { reminders = reminders.filter(item => item.id !== remove.dataset.reminderDelete); saveReminders(); notify('Anımsatıcı silindi.'); }
});
document.addEventListener('click', (event) => { if (!event.target.closest('.row-actions')) document.querySelectorAll('.action-menu').forEach(m => m.hidden = true); });
$('#todayLabel').textContent = new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long' });
render();
