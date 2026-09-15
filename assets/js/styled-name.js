import { resolveNameCustomization, readableNameColor } from './name-customization.js';

const profiles = new Map();
const uniqueNames = new Map();
let authoritative = false;
export function getNameProfile(id) { return profiles.get(String(id)); }
function currentProfile(user) {
  if (!user?.id) return user || {};
  return profiles.get(String(user.id)) || (authoritative ? {name:user.name,role:'guest'} : user);
}
function paintName(node,user) {
  node.textContent=String(user?.name || 'Pengguna');
  const config=resolveNameCustomization(user);
  node.dataset.nameStyle=config.name_style;
  node.removeAttribute('style');
  if(config.name_style==='default')return;
  const colors=[config.name_color_1,config.name_color_2,config.name_color_3 || config.name_color_1];
  colors.forEach((color,i)=>{
    for(const theme of ['light','dark'])node.style.setProperty(`--name-c${i+1}-${theme}`,readableNameColor(color,theme));
  });
}

// The only visual name renderer. It creates real text nodes, never interprets names as HTML.
export function StyledName(user={}, {preview=false}={}) {
  const node=document.createElement('span');
  node.className='styled-name';
  if(user.id && !preview)node.dataset.nameUser=String(user.id);
  paintName(node,preview?user:currentProfile(user));
  return node;
}
// Adapter for existing vanilla template strings; serialization comes from the same DOM component.
export function styledName(user) { return StyledName(user).outerHTML; }
export function legacyMemberName(name) {
  const text=String(name || 'Pengguna');
  const node=StyledName(uniqueNames.get(text) || {name:text,role:'guest'},{preview:true});
  node.dataset.nameLookup=text;
  return node.outerHTML;
}
export function referencedName(id,name) { return id ? styledName({id,name,role:'guest'}) : legacyMemberName(name); }

export function publishNameProfiles(rows,{replace=false}={}) {
  if(replace){profiles.clear();authoritative=true;}
  for(const row of rows)if(row?.id)profiles.set(String(row.id),{...profiles.get(String(row.id)),...row});
  uniqueNames.clear();
  for(const profile of profiles.values())if(profile.name) {
    // Legacy piket/queue rows contain names only. Never guess between duplicates.
    uniqueNames.set(profile.name,uniqueNames.has(profile.name)?null:profile);
  }
  for(const node of document.querySelectorAll('.styled-name[data-name-user], .styled-name[data-name-lookup]')) {
    const user=node.hasAttribute('data-name-lookup')?uniqueNames.get(node.dataset.nameLookup):profiles.get(node.dataset.nameUser);
    paintName(node,user || {name:node.textContent,role:'guest'});
  }
  document.dispatchEvent(new CustomEvent('clouven:name-profiles'));
}
