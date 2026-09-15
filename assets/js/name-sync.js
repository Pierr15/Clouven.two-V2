import { supabase } from './supabase.js';
import { readWithTimeout } from './load-state.js';
import { publishNameProfiles } from './styled-name.js';

let stopSync;
let refreshSync=async()=>{};
export function refreshNameSync() { return refreshSync(); }

async function publicDeveloperProfiles() {
  try {
    const response=await fetch('/api/public/developer-name',{cache:'no-store'});
    const data=await response.json().catch(()=>null);
    if(response.ok && Array.isArray(data))return data;
  } catch {}
  // Compatibility for static hosting and databases that already expose the narrow public view.
  const {data,error}=await readWithTimeout(()=>supabase.from('public_developer_name_profiles').select('*'));
  if(error)throw error;
  return data || [];
}

export function startNameSync(session) {
  stopSync?.();
  if(!session?.user){
    let stopped=false;
    const refresh=async()=>{
      try {
        const data=await readWithTimeout(publicDeveloperProfiles);
        if(stopped)return;
        publishNameProfiles(data || [],{replace:true});
      } catch { if(!stopped)publishNameProfiles([],{replace:true}); }
    };
    stopSync=()=>{stopped=true;};
    refreshSync=refresh;
    refresh();
    return;
  }
  publishNameProfiles(session.profile?[session.profile]:[]);
  let stopped=false,version=0;
  const refresh=async()=>{
    const ticket=++version;
    try {
      // select * also works before the additive migration; missing columns render Default.
      const {data,error}=await readWithTimeout(()=>supabase.from('members').select('*'));
      if(stopped || ticket!==version)return;
      if(error)throw error;
      publishNameProfiles(data || [],{replace:true});
    } catch {if(!stopped && ticket===version)publishNameProfiles([],{replace:true});}
  };
  const channel=supabase.channel('clouven-display-names')
    .on('postgres_changes',{event:'*',schema:'public',table:'members'},(event={})=>{
      if(event.eventType==='DELETE')publishNameProfiles([{id:event.old?.id,role:'guest'}]);
      else if(event.new?.id)publishNameProfiles([event.new]);
      refresh();
    }).subscribe(status=>{if(status==='SUBSCRIBED')refresh();});
  const focus=()=>{if(document.visibilityState!=='hidden')refresh();};
  window.addEventListener('focus',focus);
  document.addEventListener('visibilitychange',focus);
  stopSync=()=>{stopped=true;version++;supabase.removeChannel(channel);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  // One auth listener for the shared renderer; clear customization immediately on sign-out.
  const authListener=supabase.auth.onAuthStateChange?.(event=>{
    if(event==='SIGNED_OUT'){stopSync?.();publishNameProfiles([],{replace:true});}
  });
  const stop=stopSync;
  stopSync=()=>{stop();authListener?.data?.subscription?.unsubscribe();};
  refreshSync=refresh;
  refresh();
}
