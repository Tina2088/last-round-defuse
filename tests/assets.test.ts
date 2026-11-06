import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const name of ['rifle_fp','pistol','c4']) test(`${name} GLB embeds textures, respects budget and retains animation nodes`, () => {
  const b = readFileSync(new URL(`../public/models/${name}.glb`,import.meta.url));
  assert.equal(b.toString('ascii',0,4),'glTF'); assert.equal(b.readUInt32LE(4),2);
  const jsonLength=b.readUInt32LE(12); const gltf=JSON.parse(b.toString('utf8',20,20+jsonLength));
  const binStart=28+jsonLength;
  assert.ok(gltf.buffers.every((v: {uri?:string})=>!v.uri));
  const tris=gltf.meshes.flatMap((m: any)=>m.primitives).reduce((n:number,p:any)=>n+gltf.accessors[p.indices].count/3,0);
  if(name==='rifle_fp') assert.ok(tris<=8000,`rifle + arms: ${tris} triangles`);
  if(name!=='c4') for(const part of ['body','magazine','leftHand','rightHand']) assert.ok(gltf.nodes.some((n:any)=>n.name===part),`${name}: missing ${part}`);
  assert.ok(gltf.images.length>0);
  for(const image of gltf.images) {
    assert.equal(image.mimeType,'image/jpeg'); assert.equal(image.uri,undefined);
    const v=gltf.bufferViews[image.bufferView]; const img=b.subarray(binStart+(v.byteOffset??0),binStart+(v.byteOffset??0)+v.byteLength);
    assert.equal(img.readUInt16BE(0),0xffd8); let offset=2, dimensions;
    while(offset<img.length) { const marker=img[offset+1], length=img.readUInt16BE(offset+2); if([0xc0,0xc1,0xc2].includes(marker)) { dimensions=[img.readUInt16BE(offset+5),img.readUInt16BE(offset+7)]; break; } offset+=length+2; }
    assert.ok(dimensions && dimensions.every(n=>n>0 && n<=1024),'embedded texture <=1024');
  }
});
