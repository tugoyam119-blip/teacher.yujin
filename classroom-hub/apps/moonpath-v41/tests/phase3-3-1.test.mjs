import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const registry=load('../data/phase3-reference-registry.json');
const contract=load('../data/phase3-visual-contract.json');
const stages=load('../data/phase3-sixteen-stage-tracker.json');
const world=load('../config/world.json');
const assets=load('../data/asset-manifest.json');
test('3-1 실제 참고 PNG 15개 메타·SHA 형식/중복 확인',()=>{
 assert.equal(registry.referenceImages.length,15);
 assert.equal(new Set(registry.referenceImages.map(x=>x.id)).size,15);
 for(const x of registry.referenceImages){assert.match(x.png.sha256,/^[0-9a-f]{64}$/);assert.ok(x.png.width>0&&x.png.height>0&&x.png.byteSize>0);assert.equal(x.role,'REFERENCE_ONLY');}
});
test('참고 이미지와 신규 게임 자산 혼합 금지',()=>{
 assert.equal(assets.newAssets.length,0);assert.equal(assets.approvedAssets.length,0);
 assert.ok(contract.nonnegotiables.allNewGraphics&&contract.nonnegotiables.oldImageReferenceOnly);
 assert.equal(contract.fileRules.newPngCountNow,0);
});
test('960×540 contain 비크롭 마스터',()=>{assert.equal(contract.stage.logicalWidth,960);assert.equal(contract.stage.logicalHeight,540);assert.equal(contract.stage.fit,'contain');assert.equal(contract.stage.stretchOrCrop,false);});
test('L0~L6 고유 7개 레이어',()=>{assert.deepEqual(contract.stage.layers.map(x=>x.id),['L0','L1','L2','L3','L4','L5','L6']);});
test('실문항 중앙 팝업 최대 820×440',()=>{assert.deepEqual(contract.stage.popupMax,{width:820,height:440});});
test('캐릭터64/128 및 23프레임',()=>{assert.equal(contract.sprite.baseWidth,64);assert.equal(contract.sprite.baseHeight,64);assert.equal(contract.sprite.largeVariantIfNecessary,128);assert.equal(Object.values(contract.sprite.animationFrames).reduce((a,b)=>a+b,0),23);});
test('사용자 선택된 캐릭터 뒷모습은 첫 번째뿐',()=>{assert.equal(contract.sceneIdentity.characterSelectedOption,1);assert.equal(contract.sceneIdentity.characterBackReference,'CHAR_FIVE_BACKS');});
test('6개 책장/세계 테마 정합성',()=>{assert.equal(contract.palette.themes.length,6);assert.deepEqual(contract.palette.themes.map(x=>x.name),world.themes.map(x=>x.name));assert.equal(world.themes.flatMap(x=>x.regions).length,30);});
test('PHASE 3 고정 16단계·3-1만 기술 기준 문서화',()=>{assert.equal(stages.stageCount,16);assert.deepEqual(stages.stages.map(x=>x.id),Array.from({length:16},(_,i)=>`3-${i+1}`));assert.ok(stages.stages.slice(1).every(x=>x.implementation==='NOT_STARTED'));assert.equal(stages.stages[0].implementation,'TECHNICAL_BASELINE_DOCUMENTED');});
test('브라우저/PDF/새 PNG 승인은 0건',()=>{assert.ok(stages.stages.every(x=>x.browserRenderQA==='NOT_RUN'&&x.userVisualApproval==='NOT_REQUESTED'));assert.equal(registry.userApprovedNewAssets,0);assert.equal(contract.stage.viewportTestStatus,'NOT_RUN');});
test('좌우 책장 원본은 RGB가 아니라 투명 RGBA 참고',()=>{for(const id of ['BOOK_BLUE','BOOK_PURPLE']){const x=registry.referenceImages.find(x=>x.id===id);assert.equal(x.png.mode,'RGBA');assert.equal(x.png.width,887);}});
test('HOME 원본 960×540은 참고 이미지임',()=>{for(const id of ['HOME_STEP10','HOME_REFERENCE','HOME_V2']){const a=registry.referenceImages.find(x=>x.id===id);assert.deepEqual([a.png.width,a.png.height],[960,540]);assert.equal(a.png.mode,'RGB');}});
test('과거 설정 배경 1672×941을 신규 960×540 자산이라고 오인하지 않음',()=>{const p=registry.referenceImages.find(x=>x.id==='SETUP_BG');assert.deepEqual([p.png.width,p.png.height],[1672,941]);});
test('색상 참고값은 별도 사용자 승인이 필요',()=>{assert.equal(contract.palette.approvedPalette,'NOT_YET_LOCKED');assert.ok(contract.palette.referenceSamplesNotFinalLock.length>=6);});
test('운영 병합/배포 차단과 외부 원격 호출 금지',()=>{assert.equal(contract.nonnegotiables.blockMainMergeBeforeFinalApproval,true);assert.equal(contract.nonnegotiables.blockRailwayDeploymentBeforeFinalApproval,true);assert.equal(contract.engineIntegration.externalCDNDisallowed,true);});
