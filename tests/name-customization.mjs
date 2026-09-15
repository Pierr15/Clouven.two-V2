import assert from 'node:assert/strict';
import {NAME_STYLES,NAME_DEFAULTS,resolveNameCustomization,validateNameCustomization,isNameColor,readableNameColor,contrast} from '../assets/js/name-customization.js';
import {can} from '../assets/js/permissions.js';
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
for(const style of NAME_STYLES)check('Developer '+style,()=>assert.equal(resolveNameCustomization({role:'developer',...NAME_DEFAULTS,name_style:style}).name_style,style));
for(const role of ['guest','student','class_officer','teacher','Developer','unknown',undefined])check('Default fallback for '+role,()=>{assert.equal(can(role,'customize_name'),false);assert.equal(resolveNameCustomization({role,...NAME_DEFAULTS,name_style:'flow'}).name_style,'default');});
for(const value of [null,{}, {role:'developer'}, {role:'developer',name_style:'rainbow'}, {role:'developer',...NAME_DEFAULTS,name_style:'flow',name_color_3:'var(--x)'}])check('Missing/invalid profile fallback',()=>assert.equal(resolveNameCustomization(value).name_style,'default'));
for(const color of ['url(x)','var(--x)','expression(x)','#fff','#000000\n','red','" onmouseover="x',null,12,'#GGGGGG'])check('Reject unsafe color '+JSON.stringify(color),()=>{assert.equal(isNameColor(color),false);assert.throws(()=>validateNameCustomization({...NAME_DEFAULTS,name_color_1:color}));});
for(const key of ['role','uid','user_id','css','style'])check('Reject extra payload '+key,()=>assert.throws(()=>validateNameCustomization({...NAME_DEFAULTS,[key]:'developer'})));
check('Case normalization',()=>assert.equal(validateNameCustomization({...NAME_DEFAULTS,name_color_1:'#aabbcc'}).name_color_1,'#AABBCC'));
check('All palette colors retain 4.5 contrast in both themes',()=>{
 for(const color of ['#000000','#FFFFFF','#7DD3FC','#A78BFA','#F9A8D4','#FF0000','#00FF00','#0000FF'])for(const theme of ['light','dark']){
  const backgrounds=theme==='light'?['#FFFDF9','#F5F1E8','#E5EBDF','#D8E5D1']:['#1A2820','#26362C','#152219','#293C30'];
  assert.ok(backgrounds.every(bg=>contrast(readableNameColor(color,theme),bg)>=4.5));
 }
});
console.log(`${checks} customization/validation checks passed.`);
