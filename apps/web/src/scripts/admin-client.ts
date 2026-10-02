import site from '../lib/site.json';
import { validateSite } from '@openmasjid/core';
import { buildEditor, exportDraft, importJson, importCsv, publishDraft, syncForm } from '../lib/admin.js';

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
buildEditor(state, document.querySelector('#campus-editor'), document.querySelector('#content-editor'));
applyOrganizationDraft();
editor.querySelector('[name="donation.mode"]')?.addEventListener('change', (event) => {
  const mode = event.target.value;
  if (mode !== 'external') editor.querySelector('[name="donation.externalUrl"]').value = '';
  if (mode !== 'custom') editor.querySelector('[name="donation.customHtml"]').value = '';
});
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-tab],.tab').forEach((el) => el.classList.remove('active')); button.classList.add('active'); document.querySelector(`[data-panel="${button.dataset.tab}"]`).classList.add('active'); }));
document.querySelector('#add-campus').addEventListener('click', () => { state.content.campuses.push({id:`campus-${state.content.campuses.length+1}`,name:'New campus',address:'',city:'',timezone:'America/New_York',latitude:0,longitude:0,phone:'',email:'',facilities:[],calculation:{method:'NorthAmerica',madhab:'Shafi'},iqamah:{fajr:'05:30',dhuhr:'13:00',asr:'16:00',maghrib:'19:00',isha:'20:30'},jumuah:[],timetable:[]}); buildEditor(state,document.querySelector('#campus-editor'),document.querySelector('#content-editor')); });
document.querySelector('#add-event').addEventListener('click', () => { state.content.events.push({id:`event-${Date.now()}`,title:'New event',description:'',startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+3*60*60*1000).toISOString(),campusIds:[],location:'',category:'Community'}); buildEditor(state,document.querySelector('#campus-editor'),document.querySelector('#content-editor')); });
document.querySelector('#add-announcement').addEventListener('click', () => { state.content.announcements.push({id:`announcement-${Date.now()}`,title:'New announcement',body:'',campusIds:[],publishedAt:new Date().toISOString(),expiresAt:null}); buildEditor(state,document.querySelector('#campus-editor'),document.querySelector('#content-editor')); });
editor.addEventListener('input', () => { state.dirty = true; message.textContent='Unsaved local changes'; });
editor.addEventListener('submit',(e)=>{e.preventDefault(); try { syncForm(state, editor); localStorage.setItem('openmasjid-draft',JSON.stringify(state.content)); state.dirty=false; message.textContent='Saved locally · validated, not published'; } catch (error) { message.textContent=`Save rejected: ${error.message}`; }});
document.querySelector('#export-json').addEventListener('click',()=>exportDraft(state.content));
document.querySelector('#import-json').addEventListener('change',(e)=>importJson(e.target.files[0],state,()=>{buildEditor(state,document.querySelector('#campus-editor'),document.querySelector('#content-editor'));applyOrganizationDraft();},message));
document.querySelector('#import-csv').addEventListener('change',(e)=>importCsv(e.target.files[0],state,message));
document.querySelector('#publish').addEventListener('click',()=>publishDraft(state,message,editor));
