import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),manifest=JSON.parse(readFileSync(new URL('data/journey-pixel-v1-assets.json',root),'utf8'));
test('all four generated journey originals match registered complete PNG bytes and sizes',()=>{
 assert.equal(manifest.assets.length,4);
 for(const a of manifest.assets){const b=readFileSync(new URL(a.path,root));assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(b.length,a.bytes,a.id);assert.equal(createHash('sha256').update(b).digest('hex'),a.sha256,a.id);assert.deepEqual([b.readUInt32BE(16),b.readUInt32BE(20)],[a.width,a.height]);assert.ok(a.prompt.length>100);}
});
test('book and rear-view mage retain real alpha; final user design approval is not inferred from generation',()=>{
 for(const id of ['book','mage']){const a=manifest.assets.find(a=>a.id===id);assert.equal(a.pngColorType,6);assert.ok(a.alpha.transparentPixels>1000);assert.ok(a.alpha.partialPixels>1000);}
 assert.equal(manifest.visualApproval,'PENDING_USER_REVIEW');
});
