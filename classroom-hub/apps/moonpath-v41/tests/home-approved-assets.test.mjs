import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('data/asset-manifest.json',root)));
test('승인 로고 원본의 전체 SHA256·크기·RGBA·경로 보존',()=>{
 for(const asset of manifest.approvedDesignReferences){
  const b=readFileSync(new URL(asset.expectedPath,root));
  assert.equal(createHash('sha256').update(b).digest('hex'),asset.sha256);
  assert.equal(b.length,asset.bytes);
  assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.deepEqual([b.readUInt32BE(16),b.readUInt32BE(20)],asset.sourcePixels);
  assert.equal(b[25],6);
  assert.equal(asset.gitBinaryUploaded,true);
  assert.equal(asset.releaseReady,false);
  assert.equal(asset.browserQA,'NOT_RUN');
 }
});
test('원본 검증으로 잠정 좌표·화면 승인 변경 금지',()=>{
 assert.deepEqual(manifest.approvedDesignReferences.map(a=>a.display),[
  {x:122,y:9,width:244,height:153},{x:134,y:166,width:232,height:24}]);
 assert.equal(manifest.approvedAssets.length,0);
 assert.deepEqual(manifest.homeUiPolicy.mainMenu,['새로운 탐험','이어하기','탐험 일지','설정']);
 assert.match(manifest.approvedDesignReferences[1].notes,/never force anisotropic scaling/);
});
