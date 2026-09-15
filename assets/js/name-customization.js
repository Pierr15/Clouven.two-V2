import { can } from './permissions.js';

export const NAME_STYLES = Object.freeze(['default', 'solid', 'gradient', 'flow', 'neon', 'prism', 'shimmer']);
export const NAME_DEFAULTS = Object.freeze({
  name_style: 'default', name_color_1: '#7DD3FC', name_color_2: '#A78BFA', name_color_3: null,
});
const fields = Object.keys(NAME_DEFAULTS);
export function isNameColor(value) { return typeof value === 'string' && value.length === 7 && /^#[0-9a-fA-F]{6}$/.test(value); }

// Strict write validation. Never turn invalid input into a successful save.
export function validateNameCustomization(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.includes(key)) ||
      !NAME_STYLES.includes(value.name_style) || !isNameColor(value.name_color_1) ||
      !isNameColor(value.name_color_2) || !(value.name_color_3 === null || isNameColor(value.name_color_3))) {
    throw new Error('Style tidak valid. Gunakan warna hex enam digit, misalnya #7DD3FC.');
  }
  return Object.fromEntries(fields.map(key => [key, key === 'name_style' ? value[key] : value[key]?.toUpperCase() ?? null]));
}

// Reads fail closed, including old profiles from before the migration.
export function resolveNameCustomization(user) {
  if (!can(user?.role, 'customize_name') || !user?.name_style) return {...NAME_DEFAULTS};
  try { return validateNameCustomization(Object.fromEntries(fields.map(key => [key, user[key]]))); }
  catch { return {...NAME_DEFAULTS}; }
}

const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
const hex = channels => '#' + channels.map(x => Math.round(x).toString(16).padStart(2,'0')).join('').toUpperCase();
export function luminance(color) {
  const values=rgb(color).map(x=>{const s=x/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});
  return values[0]*.2126+values[1]*.7152+values[2]*.0722;
}
export function contrast(a,b) { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
// Preserve the chosen hue where possible; adapt luminance to existing light/dark surfaces.
// Both themes are computed once, so changing theme needs CSS only.
const palettes = {
  light: {ink:'#122C21',surfaces:['#FFFDF9','#F5F1E8','#E5EBDF','#D8E5D1']},
  dark: {ink:'#F4EFE4',surfaces:['#1A2820','#26362C','#152219','#293C30']},
};
const colorCache = new Map();
export function readableNameColor(color,theme) {
  const key=color+theme;
  if(colorCache.has(key))return colorCache.get(key);
  const {ink,surfaces}=palettes[theme],a=rgb(color),b=rgb(ink);
  let result=ink;
  for(let step=0;step<=100;step++){
    const candidate=hex(a.map((v,i)=>v+(b[i]-v)*step/100));
    if(surfaces.every(bg=>contrast(candidate,bg)>=4.5)){result=candidate;break;}
  }
  if(colorCache.size>256)colorCache.clear();
  colorCache.set(key,result);return result;
}
