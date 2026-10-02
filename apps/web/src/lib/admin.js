import { importTimetableCSV, validateSite } from '@openmasjid/core';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const input = (label, name, value, type = 'text') => `<label>${esc(label)}<input type="${type}" data-path="${esc(name)}" value="${esc(value)}"></label>`;
const select = (label, name, value, options) => `<label>${esc(label)}<select data-path="${esc(name)}">${options.map((option) => `<option value="${esc(option)}"${option === value ? ' selected' : ''}>${esc(option)}</option>`).join('')}</select></label>`;
const textarea = (label, name, value, rows = 3) => `<label>${esc(label)}<textarea data-path="${esc(name)}" rows="${rows}">${esc(value)}</textarea></label>`;
const keys = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const prayerKeys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const methods = ['NorthAmerica', 'MuslimWorldLeague', 'Egyptian', 'Karachi', 'UmmAlQura', 'Dubai', 'MoonsightingCommittee'];

export function buildEditor(state, campusRoot, contentRoot) {
  campusRoot.innerHTML = state.content.campuses.map((campus, index) => {
    const facilities = campus.facilities.join(', ');
    const jumuah = campus.jumuah.map((item) => `${item.label}|${item.time}`).join('\n');
    return `<article class="campus-card"><div class="card-head"><h3>${esc(campus.name || `Campus ${index + 1}`)}</h3><button type="button" class="remove-item" data-kind="campus" data-index="${index}">Delete campus</button></div><div class="mini-grid">${input('ID', `campuses.${index}.id`, campus.id)}${input('Name', `campuses.${index}.name`, campus.name)}${input('City', `campuses.${index}.city`, campus.city)}${input('Address', `campuses.${index}.address`, campus.address)}${input('Timezone (IANA)', `campuses.${index}.timezone`, campus.timezone)}${input('Latitude', `campuses.${index}.latitude`, campus.latitude, 'number')}${input('Longitude', `campuses.${index}.longitude`, campus.longitude, 'number')}${input('Phone', `campuses.${index}.phone`, campus.phone)}${input('Email', `campuses.${index}.email`, campus.email, 'email')}${textarea('Facilities (comma-separated)', `campuses.${index}.facilities`, facilities)}${select('Calculation method', `campuses.${index}.calculation.method`, campus.calculation.method, methods)}${select('Madhab', `campuses.${index}.calculation.madhab`, campus.calculation.madhab, ['Shafi', 'Hanafi'])}</div><fieldset><legend>Fixed iqamah schedule (HH:mm)</legend><div class="mini-grid">${keys.map((key) => input(key, `campuses.${index}.iqamah.${key}`, campus.iqamah[key], 'time')).join('')}</div></fieldset><fieldset><legend>Jumuah gatherings (one label|HH:mm per line)</legend>${textarea('Gatherings', `campuses.${index}.jumuah`, jumuah, 4)}</fieldset></article>`;
  }).join('');
  contentRoot.innerHTML = [...state.content.events.map((item, index) => contentCard('Event', item, index)), ...state.content.announcements.map((item, index) => contentCard('Announcement', item, index, 'announcement'))].join('');
  campusRoot.querySelectorAll('[data-path]').forEach((element) => element.addEventListener('input', (event) => setPath(state.content, element.dataset.path, event.target.value)));
  contentRoot.querySelectorAll('[data-path]').forEach((element) => element.addEventListener('input', (event) => setPath(state.content, element.dataset.path, event.target.value)));
  document.querySelectorAll('.remove-item').forEach((element) => element.addEventListener('click', () => {
    const collection = element.dataset.kind === 'campus' ? state.content.campuses : element.dataset.kind === 'announcement' ? state.content.announcements : state.content.events;
    collection.splice(Number(element.dataset.index), 1);
    buildEditor(state, campusRoot, contentRoot);
  }));
}

function contentCard(kind, item, index, collection = 'event') {
  const plural = collection === 'announcement' ? 'announcements' : 'events';
  const prefix = `${plural}.${index}`;
  const campusIds = item.campusIds.join(', ');
  return `<article class="content-card"><div class="card-head"><h3>${esc(kind)} · ${esc(item.title)}</h3><button type="button" class="remove-item" data-kind="${collection}" data-index="${index}">Delete ${esc(kind.toLowerCase())}</button></div>${input('ID', `${prefix}.id`, item.id)}${input('Title', `${prefix}.title`, item.title)}${textarea(collection === 'announcement' ? 'Body' : 'Description', `${prefix}.${collection === 'announcement' ? 'body' : 'description'}`, collection === 'announcement' ? item.body : item.description)}${input('Campus IDs (blank = all)', `${prefix}.campusIds`, campusIds)}${input(collection === 'announcement' ? 'Published (RFC3339)' : 'Starts (RFC3339)', `${prefix}.${collection === 'announcement' ? 'publishedAt' : 'startsAt'}`, collection === 'announcement' ? item.publishedAt : item.startsAt)}${collection === 'announcement' ? input('Expires (RFC3339 or blank)', `${prefix}.expiresAt`, item.expiresAt ?? '') : `${input('Ends (RFC3339)', `${prefix}.endsAt`, item.endsAt)}${input('Location', `${prefix}.location`, item.location)}${input('Category', `${prefix}.category`, item.category)}`}</article>`;
}

function setPath(target, path, value) {
  if (path === 'donation.mode') {
    target.donation.mode = value;
    if (value === 'none') { target.donation.externalUrl = null; target.donation.customHtml = ''; }
    else if (value === 'external') target.donation.customHtml = '';
    else if (value === 'custom') target.donation.externalUrl = null;
    return;
  }
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor[part];
  const key = parts.at(-1);
  if (key === 'facilities') cursor[key] = value.split(',').map((item) => item.trim()).filter(Boolean);
  else if (key === 'jumuah') cursor[key] = value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { const [label, time] = line.split('|'); return { label: label?.trim() ?? '', time: time?.trim() ?? '' }; });
  else if (key === 'campusIds') cursor[key] = value.split(',').map((item) => item.trim()).filter(Boolean);
  else if (path === 'donation.externalUrl') cursor[key] = value.trim() || null;
  else if (key === 'expiresAt') cursor[key] = value.trim() || null;
  else if (['latitude', 'longitude'].includes(key)) cursor[key] = Number(value);
  else cursor[key] = value;
}

export function syncForm(state, form) {
  form.querySelectorAll('[data-path]').forEach((element) => setPath(state.content, element.dataset.path, element.value));
  const formFields = form.querySelectorAll('[name]');
  formFields.forEach((element) => setPath(state.content, element.name, element.value));
  if (state.content.donation.mode === 'none') { state.content.donation.externalUrl = null; state.content.donation.customHtml = ''; }
  else if (state.content.donation.mode === 'external') state.content.donation.customHtml = '';
  else if (state.content.donation.mode === 'custom') state.content.donation.externalUrl = null;
  return validateSite(state.content);
}

export function exportDraft(content) {
  const blob = new Blob([JSON.stringify(validateSite(content), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'openmasjid-site-backup.json'; link.click(); URL.revokeObjectURL(url);
}

export async function importJson(file, state, refresh, message) {
  if (!file) return;
  try { const parsed = validateSite(JSON.parse(await file.text())); state.content = parsed; refresh(); message.textContent = 'Imported locally · validated, not published'; }
  catch (error) { message.textContent = `Import rejected: ${error instanceof Error ? error.message : 'invalid document'}`; }
}

export async function importCsv(file, state, message) {
  if (!file) return;
  try {
    const rows = importTimetableCSV(await file.text());
    const campus = state.content.campuses[0];
    if (!campus) throw new Error('Add a campus before importing a timetable');
    const existing = new Set(campus.timetable.map((row) => row.date));
    if (rows.some((row) => existing.has(row.date))) throw new Error('CSV contains a date already present in the selected campus');
    campus.timetable.push(...rows);
    validateSite(state.content);
    message.textContent = `Imported ${rows.length} timetable rows locally · validated`;
  } catch (error) { message.textContent = `CSV rejected: ${error instanceof Error ? error.message : 'invalid CSV'}`; }
}

export async function publishDraft(state, message, form) {
  try { syncForm(state, form); } catch (error) { message.textContent = `Publish rejected: ${error instanceof Error ? error.message : 'invalid content'}`; return; }
  const configured = import.meta.env.PUBLIC_PUBLISHER_URL || '/api';
  try {
    const sessionResponse = await fetch(`${configured}/session`, { credentials: 'include' });
    const session = await sessionResponse.json();
    if (!session.authenticated || !session.csrfToken) { message.textContent = 'Sign in to publish'; return; }
    const currentResponse = await fetch(`${configured}/content`, { credentials: 'include' });
    if (!currentResponse.ok) throw new Error(`Content lookup failed (${currentResponse.status})`);
    const current = await currentResponse.json();
    const response = await fetch(`${configured}/publish`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ content: state.content, sha: current.sha }) });
    if (!response.ok) { message.textContent = response.status === 409 ? 'Conflict: reload committed content before publishing' : `Publish failed (${response.status})`; return; }
    message.textContent = 'Committed · publisher confirmed the response';
  } catch (error) { message.textContent = `Publish unavailable: ${error instanceof Error ? error.message : 'network error'}`; }
}
