#!/usr/bin/env node
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const registry=JSON.parse(readFileSync(new URL('../data/phase3-reference-registry.json',import.meta.url),'utf8'));
const root=process.argv[2];
if(!root){console.error('usage: node scripts/verify-phase3-reference-pngs.mjs <reference-only-directory>');process.exit(2);}
let ok=0;
for(const r of registry.referenceImages){
 const p=join(root,r.filename);
 if(!existsSync(p)){console.error('MISSING',r.id,p);process.exitCode=1;continue;}
 const bytes=readFileSync(p);
 const sha=createHash('sha256').update(bytes).digest('hex');
 const pngMagic=bytes.subarray(0,8).toString('hex');
 const size=[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 const mode=bytes[25]===6?'RGBA':bytes[25]===2?'RGB':null;
 const match=sha===r.png.sha256&&bytes.length===r.png.byteSize&&pngMagic==='89504e470d0a1a0a'&&size[0]===r.png.width&&size[1]===r.png.height&&mode===r.png.mode;
 console.log(`${match?'PASS':'FAIL'} ${r.id} ${size.join('x')} ${mode} ${sha.slice(0,14)}`);
 if(!match)process.exitCode=1;else ok++;
}
console.log(`actual reference PNGs verified ${ok}/${registry.referenceImages.length}; these are REFERENCE ONLY, not new assets.`);
