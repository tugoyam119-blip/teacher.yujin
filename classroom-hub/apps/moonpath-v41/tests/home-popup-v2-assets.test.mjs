import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('data/home-popup-v2-assets.json',root),'utf8').replace(/^\uFEFF/,''));
test('popup-v2 runtime PNGs are complete and match their registered bytes and dimensions',()=>{
 for(const a of manifest.assets){
  const b=readFileSync(new URL(a.path,root));
  assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(b.length,a.bytes,a.path);
  assert.equal(createHash('sha256').update(b).digest('hex'),a.sha256,a.path);
  assert.deepEqual([b.readUInt32BE(16),b.readUInt32BE(20)],[a.width,a.height],a.path);
 }
});
test('the visually approved STEP03 master remains byte-identical beside runtime derivatives',()=>{
 const b=readFileSync(new URL('assets/home/popup-v2/frame-approved-master.png',root));
 assert.equal(createHash('sha256').update(b).digest('hex'),'8bbdd9b4af5859cef7a24b935c35c404583d302166eca796befcee5476c902ee');
});
