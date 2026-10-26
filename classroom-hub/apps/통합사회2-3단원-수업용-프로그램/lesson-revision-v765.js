// v7.65: one textbook page label and one stable concept-popover lifecycle.
(function fixReferencesAndConcepts765(){
'use strict';
const originalWorksheetHtml=worksheetHtml760;
worksheetHtml760=function(s){return originalWorksheetHtml(s).replace(/<span class="worksheet-book762">[\s\S]*?<\/span>/g,'');};
const pop=document.getElementById('term-popover'),closeButton=document.getElementById('term-popover-close');
const legacyClose=closeTermHover;
window.removeEventListener('blur',legacyClose);window.removeEventListener('resize',legacyClose);document.removeEventListener('scroll',legacyClose,true);
clearTimeout(termHoverTimer);termHoverTimer=null;termHoverAnchor=null;
let anchor=null,pinned=false,hoverTimer=null,leaveTimer=null,restoringFocus=false;
const cancelTimers=()=>{clearTimeout(hoverTimer);clearTimeout(leaveTimer);hoverTimer=leaveTimer=null;};
function close765(restoreFocus=false){cancelTimers();const previous=anchor;anchor=null;pinned=false;pop.hidden=true;if(previous?.isConnected){previous.setAttribute('aria-expanded','false');if(restoreFocus){restoringFocus=true;previous.focus({preventScroll:true});restoringFocus=false;}}}
const oldOpen=openTerm;
openTerm=function(name,button){if(!button?.isConnected)return;cancelTimers();if(anchor&&anchor!==button)anchor.setAttribute('aria-expanded','false');anchor=button;oldOpen(name,button);const tip=document.getElementById('term-popover-tip'),body=document.getElementById('term-popover-body');tip.hidden=tip.textContent.replace(/^추가 설명 · /,'').trim()===body.textContent.trim();pop.classList.toggle('general-term-popover',generalTerms.has(name));pop.setAttribute('aria-labelledby','term-popover-title');button.setAttribute('aria-controls','term-popover');button.setAttribute('aria-expanded','true');};
closeTermHover=function(){close765();};
function show765(button,sticky){pinned=sticky;openTerm(button.dataset.term,button);}
function leave765(){clearTimeout(leaveTimer);if(!pinned)leaveTimer=setTimeout(()=>{if(!pinned)close765();},280);}
// Window capture owns concept events so the former immediate pointerout closer cannot cancel them.
window.addEventListener('pointerover',e=>{const b=e.target.closest?.('[data-term]');if(b){e.stopImmediatePropagation();if(e.pointerType==='touch'||b.contains(e.relatedTarget))return;cancelTimers();if(anchor===b&&!pop.hidden)return;hoverTimer=setTimeout(()=>show765(b,false),600);}else if(pop.contains(e.target)){clearTimeout(leaveTimer);}},true);
window.addEventListener('pointerout',e=>{const b=e.target.closest?.('[data-term]');if(b){e.stopImmediatePropagation();if(b.contains(e.relatedTarget)||pop.contains(e.relatedTarget))return;clearTimeout(hoverTimer);hoverTimer=null;leave765();}else if(pop.contains(e.target)&&!pop.contains(e.relatedTarget)&&!anchor?.contains(e.relatedTarget))leave765();},true);
window.addEventListener('click',e=>{const b=e.target.closest?.('[data-term]');if(b){e.preventDefault();e.stopImmediatePropagation();show765(b,true);return;}if(e.target.closest?.('#term-popover-close')){e.preventDefault();e.stopImmediatePropagation();close765(true);return;}if(!pop.contains(e.target)&&!pop.hidden)close765();},true);
window.addEventListener('focusin',e=>{const b=e.target.closest?.('[data-term]');if(b&&!restoringFocus)show765(b,true);},true);
window.addEventListener('keydown',e=>{if(!pop.hidden&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close765(true);return;}const b=e.target.closest?.('[data-term]');if(b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopImmediatePropagation();show765(b,true);}},true);
closeButton.onclick=()=>close765(true);
window.addEventListener('blur',()=>close765());window.addEventListener('resize',()=>close765());
const style=document.createElement('style');style.textContent='.worksheet-book762{display:none!important}.term{cursor:pointer;touch-action:manipulation}.term-popover{z-index:1200;pointer-events:auto}.term-popover:not([hidden]){display:block!important;visibility:visible!important}';document.head.append(style);
document.title='통합사회2 3단원 · Spotlight 플레이어 v7.65';document.documentElement.dataset.curriculumVersion='7.65';
})();
