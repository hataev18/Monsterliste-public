'use strict';

/* Monsterliste – offline To-do-App. Alle Daten liegen nur im localStorage dieses Geräts. */

const KEY = 'monsterliste.v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

/* ---------- Daten ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function defaults() {
  const id = uid();
  return { lists: [{ id, name: 'Meine Aufgaben' }], tasks: [], activeList: id, filter: 'open' };
}

function sanitize(raw) {
  if (!raw || !Array.isArray(raw.lists) || !Array.isArray(raw.tasks)) return null;
  const lists = raw.lists
    .filter(l => l && typeof l.id === 'string' && typeof l.name === 'string')
    .map(l => ({ id: l.id, name: l.name.slice(0, 60) }));
  if (!lists.length) return null;
  const ids = new Set(lists.map(l => l.id));
  const tasks = raw.tasks
    .filter(t => t && typeof t.title === 'string' && ids.has(t.listId))
    .map(t => ({
      id: typeof t.id === 'string' ? t.id : uid(),
      listId: t.listId,
      title: t.title.slice(0, 200),
      note: typeof t.note === 'string' ? t.note.slice(0, 1000) : '',
      prio: [1, 2, 3].includes(Number(t.prio)) ? Number(t.prio) : 2,
      due: typeof t.due === 'string' && t.due && !isNaN(new Date(t.due)) ? t.due : '',
      remind: Number(t.remind) > 0 ? Number(t.remind) : 0,
      done: !!t.done,
      doneAt: t.doneAt || null,
      notified: !!t.notified,
      created: Number(t.created) || Date.now()
    }));
  const active = ids.has(raw.activeList) ? raw.activeList : lists[0].id;
  const filter = ['open', 'done', 'all'].includes(raw.filter) ? raw.filter : 'open';
  return { lists, tasks, activeList: active, filter };
}

function load() {
  try {
    const s = sanitize(JSON.parse(localStorage.getItem(KEY)));
    if (s) return s;
  } catch (e) { /* ignorieren */ }
  return defaults();
}

let state = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Speichern nicht möglich (Speicher voll?)'); }
}

/* ---------- Hilfsfunktionen ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

const fmtDue = iso => new Date(iso).toLocaleString('de-DE', {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
});
const PRIO = { 1: 'Hoch', 2: 'Mittel', 3: 'Niedrig' };
const currentList = () => state.lists.find(l => l.id === state.activeList) || state.lists[0];
const remindAt = t => t.due ? new Date(t.due).getTime() - (t.remind || 0) * 60000 : null;

function sortTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.prio !== b.prio) return a.prio - b.prio;
  const da = a.due ? new Date(a.due).getTime() : Infinity;
  const db = b.due ? new Date(b.due).getTime() : Infinity;
  if (da !== db) return da - db;
  return a.created - b.created;
}

/* ---------- Rendering ---------- */
function render() {
  renderLists();
  renderFilters();
  renderTasks();
  renderBanner();
}

function renderLists() {
  const nav = $('#lists');
  nav.replaceChildren();
  state.lists.forEach(l => {
    const open = state.tasks.filter(t => t.listId === l.id && !t.done).length;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (l.id === state.activeList ? ' active' : '');
    b.textContent = open ? `${l.name} (${open})` : l.name;
    b.onclick = () => { state.activeList = l.id; save(); render(); };
    nav.appendChild(b);
  });
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'chip'; add.textContent = '＋ Liste';
  add.onclick = newList;
  nav.appendChild(add);
}

function renderFilters() {
  $$('.filters .chip').forEach(c => c.classList.toggle('active', c.dataset.filter === state.filter));
}

function renderTasks() {
  const ul = $('#tasks');
  ul.replaceChildren();
  const now = Date.now();
  const items = state.tasks
    .filter(t => t.listId === state.activeList)
    .filter(t => state.filter === 'all' || (state.filter === 'open' ? !t.done : t.done))
    .sort(sortTasks);

  items.forEach(t => ul.appendChild(taskEl(t, now)));
  $('#empty').hidden = items.length > 0;
}

function taskEl(t, now) {
  const li = document.createElement('li');
  li.className = `task prio${t.prio}${t.done ? ' done' : ''}`;

  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = t.done;
  cb.setAttribute('aria-label', `„${t.title}“ erledigt`);
  cb.onchange = () => {
    t.done = cb.checked; t.doneAt = t.done ? Date.now() : null;
    save(); render();
  };

  const body = document.createElement('button');
  body.type = 'button'; body.className = 'body';
  body.onclick = () => openTask(t);

  const title = document.createElement('span');
  title.className = 't'; title.textContent = t.title;
  body.appendChild(title);

  const meta = document.createElement('span');
  meta.className = 'm';
  const parts = [`Priorität ${PRIO[t.prio]}`];
  if (t.due) {
    const d = new Date(t.due).getTime();
    parts.push(`bis ${fmtDue(t.due)}`);
    if (!t.done) {
      if (d < now) { meta.classList.add('over'); parts.push('überfällig'); }
      else if (d - now < 24 * 3600 * 1000) meta.classList.add('soon');
    }
  }
  meta.textContent = parts.join(' · ');
  body.appendChild(meta);

  if (t.note) {
    const n = document.createElement('span');
    n.className = 'note'; n.textContent = t.note;
    body.appendChild(n);
  }

  li.append(cb, body);
  return li;
}

function renderBanner() {
  const el = $('#banner');
  const now = Date.now();
  const over = state.tasks.filter(t => !t.done && t.due && new Date(t.due).getTime() < now)
    .sort((a, b) => new Date(a.due) - new Date(b.due));
  if (!over.length) { el.hidden = true; return; }
  el.replaceChildren();
  const s = document.createElement('strong');
  s.textContent = over.length === 1 ? '⏰ 1 Aufgabe ist überfällig' : `⏰ ${over.length} Aufgaben sind überfällig`;
  el.appendChild(s);
  const names = over.slice(0, 3).map(t => t.title).join(', ');
  el.appendChild(document.createTextNode(names + (over.length > 3 ? ' …' : '')));
  el.hidden = false;
}

/* ---------- Aufgaben-Dialog ---------- */
const taskDlg = $('#taskDlg');
let editing = null;

function fillListSelect(selected) {
  const sel = $('#fList');
  sel.replaceChildren();
  state.lists.forEach(l => {
    const o = document.createElement('option');
    o.value = l.id; o.textContent = l.name;
    sel.appendChild(o);
  });
  sel.value = selected;
}

function openTask(t) {
  editing = t || null;
  $('#taskDlgTitle').textContent = t ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
  $('#fTitle').value = t ? t.title : '';
  $(`#p${t ? t.prio : 2}`).checked = true;
  $('#fDue').value = t ? t.due : '';
  $('#fRemind').value = String(t ? t.remind : 0);
  $('#fNote').value = t ? t.note : '';
  fillListSelect(t ? t.listId : state.activeList);
  $('#delTask').hidden = !t;
  $('#fRemind').disabled = !$('#fDue').value;
  taskDlg.showModal();
  if (!t) $('#fTitle').focus();
}

$('#fab').onclick = () => openTask(null);
$('#fDue').addEventListener('input', () => { $('#fRemind').disabled = !$('#fDue').value; });
$('#cancelTask').onclick = () => taskDlg.close();

$('#taskForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('#fTitle').value.trim();
  if (!title) return;
  const data = {
    title,
    prio: Number(($('input[name=prio]:checked') || {}).value) || 2,
    due: $('#fDue').value,
    remind: $('#fDue').value ? Number($('#fRemind').value) : 0,
    note: $('#fNote').value.trim(),
    listId: $('#fList').value
  };
  if (editing) {
    const changedTime = editing.due !== data.due || editing.remind !== data.remind;
    Object.assign(editing, data);
    if (changedTime) editing.notified = false;
  } else {
    state.tasks.push({ id: uid(), done: false, doneAt: null, notified: false, created: Date.now(), ...data });
  }
  state.activeList = data.listId;
  save(); taskDlg.close(); render(); checkReminders();
});

$('#delTask').onclick = () => {
  if (!editing || !confirm(`„${editing.title}“ wirklich löschen?`)) return;
  state.tasks = state.tasks.filter(t => t !== editing);
  save(); taskDlg.close(); render();
};

/* ---------- Filter ---------- */
$$('.filters .chip').forEach(c => c.onclick = () => { state.filter = c.dataset.filter; save(); render(); });

/* ---------- Listen verwalten ---------- */
const nameDlg = $('#nameDlg');
let nameCb = null;
function askName(title, value, cb) {
  $('#nameTitle').textContent = title;
  $('#nameInput').value = value || '';
  nameCb = cb;
  nameDlg.showModal();
  $('#nameInput').focus(); $('#nameInput').select();
}
$('#nameCancel').onclick = () => nameDlg.close();
$('#nameForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#nameInput').value.trim();
  if (v && nameCb) nameCb(v);
  nameDlg.close();
});

function newList() {
  menuDlg.open && menuDlg.close();
  askName('Neue Liste', '', name => {
    const l = { id: uid(), name };
    state.lists.push(l); state.activeList = l.id; save(); render();
  });
}

/* ---------- Menü ---------- */
const menuDlg = $('#menuDlg');
const exportDlg = $('#exportDlg');
let installEvt = null;

function notifHint() {
  const h = $('#notifHint'), b = $('#mNotif');
  if (!('Notification' in window)) { h.textContent = 'Dieses Gerät unterstützt keine Benachrichtigungen.'; b.hidden = true; return; }
  const p = Notification.permission;
  b.hidden = p === 'granted';
  h.textContent = p === 'granted'
    ? 'Erinnerungen sind aktiv. Sie erscheinen, solange die App geöffnet oder im Hintergrund aktiv ist; verpasste Fälligkeiten siehst du beim nächsten Öffnen oben als Hinweis.'
    : p === 'denied'
      ? 'Benachrichtigungen sind blockiert. Bitte in den Android-Einstellungen für diese App erlauben.'
      : 'Erlaube Benachrichtigungen, damit die App dich an fällige Aufgaben erinnern kann.';
}

$('#menuBtn').onclick = () => { notifHint(); $('#mInstall').hidden = !installEvt; menuDlg.showModal(); };
$$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

$('#mNewList').onclick = newList;
$('#mRename').onclick = () => {
  menuDlg.close();
  const l = currentList();
  askName('Liste umbenennen', l.name, name => { l.name = name; save(); render(); });
};
$('#mDelList').onclick = () => {
  const l = currentList();
  if (state.lists.length === 1) { toast('Die letzte Liste kann nicht gelöscht werden.'); return; }
  const n = state.tasks.filter(t => t.listId === l.id).length;
  if (!confirm(`Liste „${l.name}“ mit ${n} Aufgabe(n) wirklich löschen?`)) return;
  state.tasks = state.tasks.filter(t => t.listId !== l.id);
  state.lists = state.lists.filter(x => x !== l);
  state.activeList = state.lists[0].id;
  save(); menuDlg.close(); render();
};
$('#mClearDone').onclick = () => {
  const n = state.tasks.filter(t => t.listId === state.activeList && t.done).length;
  if (!n) { toast('Keine erledigten Aufgaben in dieser Liste.'); return; }
  if (!confirm(`${n} erledigte Aufgabe(n) endgültig entfernen?`)) return;
  state.tasks = state.tasks.filter(t => !(t.listId === state.activeList && t.done));
  save(); menuDlg.close(); render();
};
$('#mNotif').onclick = async () => {
  try {
    const p = await Notification.requestPermission();
    notifHint();
    if (p === 'granted') { toast('Erinnerungen aktiviert'); checkReminders(); }
  } catch (e) { toast('Benachrichtigungen nicht verfügbar'); }
};
$('#mExport').onclick = () => { menuDlg.close(); exportDlg.showModal(); };

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
$('#mInstall').onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice; installEvt = null; menuDlg.close();
};

/* ---------- Export / Import ---------- */
function exportText() {
  const all = $('#xScope').value === 'all';
  const withDone = $('#xDone').checked;
  const lists = all ? state.lists : [currentList()];
  const out = [];
  lists.forEach(l => {
    const items = state.tasks.filter(t => t.listId === l.id && (withDone || !t.done)).sort(sortTasks);
    out.push(l.name.toUpperCase(), '='.repeat(Math.min(l.name.length, 40)));
    if (!items.length) out.push('(keine Aufgaben)');
    items.forEach(t => {
      let line = `[${t.done ? 'x' : ' '}] ${t.title} (${PRIO[t.prio]}`;
      if (t.due) line += `, bis ${fmtDue(t.due)}`;
      line += ')';
      out.push(line);
      if (t.note) out.push('    ' + t.note.replace(/\n/g, '\n    '));
    });
    out.push('');
  });
  const stamp = new Date().toLocaleDateString('de-DE');
  return `To-do-Liste, Stand ${stamp}\n\n` + out.join('\n').trim() + '\n';
}

function subject() {
  const all = $('#xScope').value === 'all';
  return all ? 'To-do-Listen' : `To-do-Liste: ${currentList().name}`;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function openMail() {
  const url = `mailto:?subject=${encodeURIComponent(subject())}&body=${encodeURIComponent(exportText())}`;
  window.location.href = url;
}

$('#xMail').onclick = openMail;
$('#xShare').onclick = async () => {
  const text = exportText();
  if (navigator.share) {
    try { await navigator.share({ title: subject(), text }); }
    catch (e) { if (e.name !== 'AbortError') openMail(); }
  } else openMail();
};
$('#xTxt').onclick = () => {
  download(`todo-${new Date().toISOString().slice(0, 10)}.txt`, exportText(), 'text/plain;charset=utf-8');
  toast('Textdatei gespeichert');
};
$('#xJson').onclick = () => {
  download(`monsterliste-sicherung-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(state, null, 2), 'application/json');
  toast('Sicherung gespeichert');
};
$('#xImport').onclick = () => $('#xFile').click();
$('#xFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const s = sanitize(JSON.parse(await f.text()));
    if (!s) throw new Error('format');
    if (!confirm(`Sicherung mit ${s.lists.length} Liste(n) und ${s.tasks.length} Aufgabe(n) laden? Die aktuellen Daten werden ersetzt.`)) return;
    state = s; save(); exportDlg.close(); render(); toast('Sicherung wiederhergestellt');
  } catch (err) { toast('Die Datei ist keine gültige Sicherung.'); }
});

/* ---------- Erinnerungen ---------- */
async function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [200, 100, 200] };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
    return true;
  } catch (e) { return false; }
}

async function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const t of state.tasks) {
    if (t.done || !t.due || t.notified) continue;
    if (remindAt(t) <= now) {
      const overdue = new Date(t.due).getTime() <= now;
      const ok = await notify(
        overdue ? 'Aufgabe fällig' : 'Erinnerung',
        `${t.title}${overdue ? '' : ' – bis ' + fmtDue(t.due)}`,
        t.id
      );
      if (ok) { t.notified = true; changed = true; }
    }
  }
  if (changed) save();
  renderBanner();
  renderTasks();
}

setInterval(checkReminders, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
window.addEventListener('focus', checkReminders);

/* ---------- Start ---------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* z. B. bei file:// */ });
}
render();
checkReminders();
