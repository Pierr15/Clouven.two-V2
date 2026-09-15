// The underlying controls keep form values and validation; visible widgets share the site theme.
const enhanced=new WeakMap();let active=null,queued=false;
const icon=name=>'<i class="ti ti-'+name+'" aria-hidden="true"></i>';
function close(restore=false){
 if(!active)return;const previous=active;active=null;
 previous.panel.remove();previous.trigger.setAttribute("aria-expanded","false");previous.trigger.removeAttribute("aria-activedescendant");
 if(restore&&previous.trigger.isConnected)previous.trigger.focus({preventScroll:true});
}
function position(){
 if(!active)return;const {trigger,panel}=active;
 if(!trigger.isConnected||!trigger.getClientRects().length){close();return;}
 const rect=trigger.getBoundingClientRect(),width=Math.min(Math.max(rect.width,active.calendar?290:220),innerWidth-24);
 panel.style.width=width+"px";panel.style.left=Math.max(12,Math.min(rect.left,innerWidth-width-12))+"px";
 panel.style.maxHeight=Math.max(150,Math.min(360,innerHeight-32))+"px";
 const height=Math.min(panel.scrollHeight,360);
 panel.style.top=Math.max(12,rect.bottom+8+height<=innerHeight-12?rect.bottom+8:rect.top-height-8)+"px";
}
function popup(trigger,calendar=false){
 close();const panel=document.createElement("div");panel.className="field-popover"+(calendar?" field-calendar":"");
 panel.id="field-popup-"+crypto.randomUUID();panel.setAttribute("role",calendar?"dialog":"listbox");
 panel.setAttribute("aria-label",trigger.getAttribute("aria-label")||"Pilihan");
 // Keeping a popup inside the modal preserves its focus trap and inert boundary.
 (trigger.closest(".modal")||document.body).append(panel);
 trigger.setAttribute("aria-controls",panel.id);trigger.setAttribute("aria-expanded","true");
 active={panel,trigger,calendar,index:0};return panel;
}
function labelFor(control){return control.getAttribute("aria-label")||[...control.labels||[]].map(l=>l.textContent.trim()).join(" ")||control.name||"Pilih";}
function notify(control){control.dispatchEvent(new Event("input",{bubbles:true}));control.dispatchEvent(new Event("change",{bubbles:true}));}
function attach(control,calendar=false){
 if(enhanced.has(control))return;
 const button=document.createElement("button");button.type="button";button.className="field-trigger";button.setAttribute("aria-haspopup",calendar?"dialog":"listbox");button.setAttribute("aria-expanded","false");
 if(!calendar)button.setAttribute("role","combobox");
 control.classList.add("native-field");control.tabIndex=-1;control.setAttribute("aria-hidden","true");control.after(button);
 const sync=()=>{
  const value=calendar?(control.value?new Date(control.value+"T12:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"}):"Pilih tanggal"):control.selectedOptions[0]?.textContent||"Pilih";
  if(button.dataset.value!==value){button.replaceChildren(document.createTextNode(value));const i=document.createElement("i");i.className="ti ti-"+(calendar?"calendar":"chevron-down");i.setAttribute("aria-hidden","true");button.append(i);button.dataset.value=value;}
  if(button.disabled!==control.disabled)button.disabled=control.disabled;button.setAttribute("aria-label",labelFor(control)+": "+value);
  button.setAttribute("aria-required",String(control.required));
 };
 enhanced.set(control,{button,sync});sync();
 function open(){if(button.disabled)return;calendar?openCalendar(control,button):openSelect(control,button);}
 button.addEventListener("click",()=>active?.trigger===button?close():open());
 button.addEventListener("keydown",event=>{
  if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){event.preventDefault();if(active?.trigger!==button)open();else move(event.key);}
  else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&event.key!==" "&&!calendar){if(active?.trigger!==button)open();const options=[...active.panel.querySelectorAll('[role="option"]')];const found=options.findIndex(el=>el.textContent.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));if(found>=0)setIndex(found);}
  else if(event.key==="Enter"&&active?.trigger===button&&!calendar){event.preventDefault();active.panel.querySelectorAll('[role="option"]')[active.index]?.click();}
 });
 control.addEventListener("change",sync);control.addEventListener("clouven:sync",sync);
 control.addEventListener("invalid",event=>{event.preventDefault();button.setAttribute("aria-invalid","true");open();button.focus();});
 control.addEventListener("input",()=>button.removeAttribute("aria-invalid"));
 for(const label of control.labels||[])label.addEventListener("click",event=>{if(event.target===label){event.preventDefault();button.focus();}});
 control.form?.addEventListener("reset",()=>setTimeout(sync,0));
}
function setIndex(index){
 if(!active)return;const items=[...active.panel.querySelectorAll('[role="option"]')];if(!items.length)return;
 active.index=(index+items.length)%items.length;
 items.forEach((item,i)=>item.classList.toggle("is-focused",i===active.index));
 const selected=items[active.index];active.trigger.setAttribute("aria-activedescendant",selected.id);selected.scrollIntoView({block:"nearest"});
}
function move(key){if(!active)return;const size=active.panel.querySelectorAll('[role="option"]').length;setIndex(key==="Home"?0:key==="End"?size-1:active.index+(key==="ArrowUp"?-1:1));}
function fillOptions(panel,trigger,items,choose,current){
 items.forEach((item,index)=>{
  const option=document.createElement("button");option.type="button";option.tabIndex=-1;option.className="field-option";option.setAttribute("role","option");option.id=panel.id+"-"+index;
  option.textContent=item.label;option.setAttribute("aria-selected",String(item.value===current));panel.append(option);
  option.addEventListener("pointerdown",e=>e.preventDefault());option.addEventListener("click",()=>{choose(item.value);close(true);});
 });
 if(!items.length){const empty=document.createElement("p");empty.className="form-help";empty.textContent="Tidak ada pilihan yang cocok.";panel.append(empty);}
 position();setIndex(Math.max(0,items.findIndex(item=>item.value===current)));
}
function openSelect(control,trigger){
 const panel=popup(trigger);
 fillOptions(panel,trigger,[...control.options].filter(o=>!o.disabled&&!o.hidden).map(o=>({value:o.value,label:o.textContent})),value=>{control.value=value;notify(control);},control.value);
}
function openCalendar(control,trigger){
 const panel=popup(trigger,true);let selected=control.value?new Date(control.value+"T12:00:00"):new Date();let year=selected.getFullYear(),month=selected.getMonth();
 function draw(){
  panel.replaceChildren();const header=document.createElement("div");header.className="calendar-heading";
  for(const [text,label,step]of [["‹","Bulan sebelumnya",-1],["›","Bulan berikutnya",1]]){
   const button=document.createElement("button");button.type="button";button.className="mini-action";button.textContent=text;button.setAttribute("aria-label",label);
   button.addEventListener("click",()=>{const date=new Date(year,month+step,1);year=date.getFullYear();month=date.getMonth();draw();panel.querySelector('[aria-label="'+label+'"]').focus();});header.append(button);
  }
  const title=document.createElement("strong");title.textContent=new Date(year,month,1).toLocaleDateString("id-ID",{month:"long",year:"numeric"});header.insertBefore(title,header.lastChild);panel.append(header);
  const grid=document.createElement("div");grid.className="calendar-grid";panel.append(grid);
  ["Sen","Sel","Rab","Kam","Jum","Sab","Min"].forEach(day=>{const label=document.createElement("span");label.textContent=day;label.className="calendar-weekday";grid.append(label);});
  const offset=(new Date(year,month,1).getDay()+6)%7;for(let i=0;i<offset;i++)grid.append(document.createElement("span"));
  for(let day=1;day<=new Date(year,month+1,0).getDate();day++){
   const value=year+"-"+String(month+1).padStart(2,"0")+"-"+String(day).padStart(2,"0"),button=document.createElement("button");
   button.type="button";button.textContent=String(day);button.className="calendar-day";button.setAttribute("aria-label",new Date(value+"T12:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"}));
   button.disabled=Boolean(control.min&&value<control.min||control.max&&value>control.max);
   button.classList.toggle("is-selected",value===control.value);button.addEventListener("click",()=>{control.value=value;notify(control);close(true);});grid.append(button);
  }
  const clear=document.createElement("button");clear.type="button";clear.className="mini-action";clear.textContent="Kosongkan";clear.addEventListener("click",()=>{control.value="";notify(control);close(true);});panel.append(clear);
  position();
 }
 draw();panel.querySelector(".is-selected:not(:disabled),.calendar-day:not(:disabled)")?.focus();
 panel.addEventListener("keydown",event=>{
  const days=[...panel.querySelectorAll(".calendar-day:not(:disabled)")],index=days.indexOf(document.activeElement);
  if(index>=0&&["ArrowRight","ArrowLeft","ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();days[Math.max(0,Math.min(days.length-1,index+({ArrowRight:1,ArrowLeft:-1,ArrowDown:7,ArrowUp:-7}[event.key])))]?.focus();}
 });
}
function datalist(input){
 if(enhanced.has(input))return;const list=document.getElementById(input.getAttribute("list"));if(!list)return;
 input.removeAttribute("list");input.setAttribute("role","combobox");input.setAttribute("aria-autocomplete","list");input.setAttribute("aria-expanded","false");
 enhanced.set(input,{sync(){}});
 const open=()=>{const panel=popup(input),query=input.value.toLocaleLowerCase();fillOptions(panel,input,[...list.options].filter(o=>o.value.toLocaleLowerCase().includes(query)).map(o=>({value:o.value,label:o.label||o.value})),value=>{input.value=value;notify(input);},input.value);};
 input.addEventListener("focus",open);input.addEventListener("input",open);
 input.addEventListener("keydown",event=>{if(["ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();if(active?.trigger!==input)open();else move(event.key);}if(event.key==="Enter"&&active?.trigger===input){event.preventDefault();active.panel.querySelectorAll('[role="option"]')[active.index]?.click();}});
 if(document.activeElement===input)open();
}
function scan(){
 queued=false;document.querySelectorAll('select,input[type="date"]').forEach(control=>{attach(control,control.type==="date");enhanced.get(control).sync();});
 document.querySelectorAll("input[list]").forEach(datalist);
 if(active)position();
}
new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.(".field-popover,.field-trigger"))&&!queued){queued=true;requestAnimationFrame(scan);}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["disabled","selected","value","required"]});
document.addEventListener("pointerdown",event=>{if(active&&!active.panel.contains(event.target)&&!active.trigger.contains(event.target))close();},true);
document.addEventListener("keydown",event=>{
 if(!active)return;
 if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();close(true);}
 else if(event.key==="Tab"&&!active.calendar)close();
},true);
document.addEventListener("focusin",event=>{if(active&&!active.panel.contains(event.target)&&event.target!==active.trigger)close();});
addEventListener("resize",position);addEventListener("scroll",position,true);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scan);else scan();
