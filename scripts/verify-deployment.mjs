import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base = 'https://tina2088.github.io/last-round-defuse/';
const files = [];
async function scan(dir) { for(const e of await readdir(dir,{withFileTypes:true})) { const path=`${dir}/${e.name}`; if(e.isDirectory()) await scan(path); else files.push(path); } }
await scan('dist'); const checks=[];
for(const path of files) {
 const local=await readFile(path); const url=base+path.slice(5); const r=await fetch(url+'?verify='+Date.now()); assert.equal(r.status,200,url); const remote=Buffer.from(await r.arrayBuffer()); assert.ok(local.equals(remote),`stale deployment: ${url}`);
 checks.push({url,bytes:remote.length,sha256:createHash('sha256').update(remote).digest('hex'),contentEncoding:r.headers.get('content-encoding')});
}
const result={testedAt:new Date().toISOString(),checks}; await writeFile(`docs/qa/deployment-${process.argv[2]??'weapons'}.json`,JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
