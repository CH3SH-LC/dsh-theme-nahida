import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const manifest=JSON.parse(readFileSync(resolve(root,'dist/manifest.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(readFileSync(resolve(root,'dist/client.js'))),manifest.clientSha256);
for(const asset of manifest.assets) assert.equal(hash(readFileSync(resolve(root,asset.path))),asset.sha256,asset.path);
const before=readFileSync(resolve(root,'dist/client.js'));
const built=spawnSync(process.execPath,['build.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(built.status,0,built.stderr);
assert.deepEqual(readFileSync(resolve(root,'dist/client.js')),before,'Build must be deterministic');
assert.equal(pkg.dsh.bundle.patch,'./cordis.patch.yml');
assert.ok(pkg.exports['./client']);
assert.equal(pkg.scripts.prepare,undefined,'Release installation must not require build scripts');
for(const file of ['LICENSE','ARTWORK.md','README.md','README.en.md','locale/en.json','locale/zh.json']) assert.ok(existsSync(resolve(root,file)),file);
const files=[];
function walk(dir) {
  for(const entry of readdirSync(dir,{withFileTypes:true})) {
    if(['.git','node_modules','out'].includes(entry.name))continue;
    const file=resolve(dir,entry.name);
    if(entry.isDirectory())walk(file);else files.push(relative(root,file).replaceAll('\\','/'));
  }
}
walk(root);
for(const file of files) {
  assert.ok(!/(?:^|\/)(?:\.credentials|\.env|desktop-install|desktop-readback)/i.test(file),'Private file: '+file);
  if(!/\.(?:js|mjs|json|md|yml|css)$/.test(file))continue;
  const text=readFileSync(resolve(root,file),'utf8');
  assert.ok(!/[A-Z]:[\\/](?:Users|CH3SH)[\\/]/i.test(text),'Local machine path in '+file);
  assert.ok(!/gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}/.test(text),'Possible credential in '+file);
}
console.log(`Package OK: ${manifest.assets.length} assets, deterministic client, standalone source and license notices.`);
