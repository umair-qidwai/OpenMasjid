import site from '../lib/site.json';
import { validateSite } from '@openmasjid/core';
import { buildEditor, exportDraft, importJson, importCsv, prepareLogoUpload, publishDraft, syncForm } from '../lib/admin.js';

const editor = document.querySelector('#editor');
const message = document.querySelector('#editor-message');
let savedDraft = null;
try {
  const parsedDraft = JSON.parse(localStorage.getItem('openmasjid-draft') || 'null');
  savedDraft = parsedDraft ? validateSite(parsedDraft) : null;
} catch {
  localStorage.removeItem('openmasjid-draft');
  savedDraft = null;
}
const state = { content: structuredClone(savedDraft || site), dirty: false };
let pendingLogo = null;
const editorRoots = () => [document.querySelector('#campus-editor'), document.querySelector('#content-editor'), document.querySelector('#program-editor'), document.querySelector('#service-editor')];
const rebuildEditor = () => buildEditor(state, ...editorRoots());
const applyOrganizationDraft = () => {
  Object.entries({
    'organization.name': state.content.organization.name,
    'organization.tagline': state.content.organization.tagline,
    'organization.description': state.content.organization.description,
    'organization.email': state.content.organization.email,
    'organization.phone': state.content.organization.phone,
    'organization.website': state.content.organization.website,
    'organization.logo': state.content.organization.logo,
    'organization.theme.accent': state.content.organization.theme.accent,
    'organization.theme.background': state.content.organization.theme.background,
    'donation.mode': state.content.donation.mode,
    'donation.externalUrl': state.content.donation.externalUrl ?? '',
    'donation.customHtml': state.content.donation.customHtml,
  }).forEach(([name, value]) => {
    const field = editor.querySelector(`[name="${name}"]`);
    if (field) field.value = value;
  });
};
rebuildEditor();
applyOrganizationDraft();
editor.querySelector('[name="donation.mode"]')?.addEventListener('change', (event) => {
  const mode = event.target.value;
  if (mode !== 'external') editor.querySelector('[name="donation.externalUrl"]').value = '';
  if (mode !== 'custom') editor.querySelector('[name="donation.customHtml"]').value = '';
});
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-tab],.tab').forEach((el) => el.classList.remove('active')); button.classList.add('active'); document.querySelector(`[data-panel="${button.dataset.tab}"]`).classList.add('active'); }));
document.querySelector('#add-campus').addEventListener('click', () => { state.content.campuses.push({id:`campus-${state.content.campuses.length+1}`,name:'New campus',address:'',city:'',timezone:'America/New_York',latitude:0,longitude:0,phone:'',email:'',facilities:[],calculation:{method:'NorthAmerica',madhab:'Shafi'},iqamah:{fajr:'05:30',dhuhr:'13:00',asr:'16:00',maghrib:'19:00',isha:'20:30'},jumuah:[],timetable:[]}); rebuildEditor(); });
document.querySelector('#add-event').addEventListener('click', () => { state.content.events.push({id:`event-${Date.now()}`,title:'New event',description:'',startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+3*60*60*1000).toISOString(),campusIds:[],location:'',category:'Community'}); rebuildEditor(); });
document.querySelector('#add-announcement').addEventListener('click', () => { state.content.announcements.push({id:`announcement-${Date.now()}`,title:'New announcement',body:'',campusIds:[],publishedAt:new Date().toISOString(),expiresAt:null}); rebuildEditor(); });
document.querySelector('#add-program').addEventListener('click', () => { state.content.programs.push({id:`program-${Date.now()}`,title:'New program',description:'Describe this program',campusIds:[],details:{enabled:false,content:'',image:''}}); rebuildEditor(); });
document.querySelector('#add-service').addEventListener('click', () => { state.content.services.push({id:`service-${Date.now()}`,title:'New service',description:'Describe this service',campusIds:[],details:{enabled:false,content:'',image:''}}); rebuildEditor(); });
editor.addEventListener('input', () => { state.dirty = true; message.textContent='Unsaved local changes'; });
editor.addEventListener('submit',(e)=>{e.preventDefault(); try { syncForm(state, editor); localStorage.setItem('openmasjid-draft',JSON.stringify(state.content)); state.dirty=false; message.textContent='Saved locally · validated, not published'; } catch (error) { message.textContent=`Save rejected: ${error.message}`; }});
document.querySelector('#export-json').addEventListener('click', () => { try { syncForm(state, editor); exportDraft(state.content); } catch (error) { message.textContent = `Export rejected: ${error.message}`; } });
document.querySelector('#import-json').addEventListener('change',(e)=>importJson(e.target.files[0],state,()=>{rebuildEditor();applyOrganizationDraft();},message));
document.querySelector('#import-csv').addEventListener('change',(e)=>importCsv(e.target.files[0],state,message));
document.querySelector('#logo-upload').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const nextLogo = await prepareLogoUpload(file);
    if (pendingLogo?.previewUrl) URL.revokeObjectURL(pendingLogo.previewUrl);
    pendingLogo = nextLogo;
    document.querySelector('#logo-preview').src = pendingLogo.previewUrl;
    document.querySelector('#cancel-logo-upload').hidden = false;
    document.querySelector('#logo-upload-status').textContent = `${file.name} selected · publish to apply everywhere`;
    state.dirty = true;
    message.textContent = 'New logo ready to publish';
  } catch (error) {
    event.target.value = '';
    document.querySelector('#logo-upload-status').textContent = error instanceof Error ? error.message : 'Logo could not be read';
  }
});
const clearPendingLogo = (status = 'Using the existing image URL or asset path') => {
  if (pendingLogo?.previewUrl) URL.revokeObjectURL(pendingLogo.previewUrl);
  pendingLogo = null;
  document.querySelector('#logo-upload').value = '';
  document.querySelector('#cancel-logo-upload').hidden = true;
  document.querySelector('#logo-upload-status').textContent = status;
  const value = editor.querySelector('[name="organization.logo"]').value;
  try {
    const brandUrl = document.querySelector('.admin-top .brand').href;
    const source = value.startsWith('https://') ? value : new URL(value.replace(/^\//, ''), brandUrl).href;
    document.querySelector('#logo-preview').src = source;
  } catch {}
};
document.querySelector('#cancel-logo-upload').addEventListener('click', () => clearPendingLogo());
editor.querySelector('[name="organization.logo"]').addEventListener('input', () => {
  if (pendingLogo) clearPendingLogo('Upload cancelled · the entered image location will be used');
});
const publishButton = document.querySelector('#publish');
publishButton.addEventListener('click', async () => {
  publishButton.disabled = true;
  try {
    const result = await publishDraft(state,message,editor,pendingLogo);
    if (result?.assetPath) {
      const logoField = editor.querySelector('[name="organization.logo"]');
      if (logoField) logoField.value = result.assetPath;
      localStorage.setItem('openmasjid-draft', JSON.stringify(state.content));
      clearPendingLogo('Logo published and used across the site');
    }
  } finally {
    publishButton.disabled = false;
  }
});
