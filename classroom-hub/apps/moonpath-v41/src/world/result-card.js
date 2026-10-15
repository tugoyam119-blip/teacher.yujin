/** PHASE 2-8: minimal text-only result presentation, NOT approved pixel art/UI.
 * Accepts public-only counts; teacher answers, identity, audit never enter here.
 */
import {insist} from '../engine/model.js';
const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function renderRegionResultMarkup(summary,{regionName='',themeName=''}={}){
  insist(summary&&typeof summary==='object'&&summary.keyGranted===true&&
    Number.isInteger(summary.baseQuota)&&Number.isInteger(summary.processed)&&
    Number.isInteger(summary.correct)&&Number.isInteger(summary.incorrect)&&
    Number.isInteger(summary.unresolvedRecovery)&&summary.correct>=0&&summary.incorrect>=0&&
    summary.processed===summary.correct+summary.incorrect&&summary.processed===summary.baseQuota&&
    summary.starlightFromRegionCompletion===0,
    'REGION_RESULT_INVALID','완료된 공개 지역 결과 요약이 필요합니다.');
  return `<article class="mp-region-result" role="region" aria-label="지역 완료 결과" data-region-id="${esc(summary.regionId)}">
  <header><small>${esc(themeName)}</small><h2>${esc(regionName||summary.regionId)} · 지역 완료</h2></header>
  <dl><div><dt>기본 문제 처리</dt><dd>${summary.processed}/${summary.baseQuota}</dd></div>
    <div><dt>정답</dt><dd>${summary.correct}</dd></div><div><dt>오답</dt><dd>${summary.incorrect}</dd></div>
    <div><dt>남은 회수미션</dt><dd>${summary.unresolvedRecovery}</dd></div></dl>
  <p>지역 최초 완료 열쇠 +1 · 지역 완료 별빛 +0</p>
</article>`;
}
