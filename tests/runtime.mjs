import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHarness } from './mock-ctx.mjs';

const root = resolve(import.meta.dirname, '..');
const clientText = readFileSync(resolve(root, 'dist/client.js'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'dist/manifest.json'), 'utf8'));
const key = 'dsh-theme-nahida:selection';
const make = options => createHarness({ clientText, ...options });
const checks = [];
function check(name, run) { run(); checks.push(name); }
check('standalone bundle contains only Nahida and seven local assets', () => {
  assert.deepEqual(manifest.themes, ['nahida-maya']);
  assert.equal(manifest.assets.length, 7);
  assert.equal(/deepseek-fish|大肥鱼|BLUEBERRY|dsh-theme-engine/.test(clientText), false);
  assert.equal(/url\(["']?(?:\.\.?\/|https?:)/.test(clientText), false);
});
check('first installation automatically selects Nahida', () => {
  const h = make(); h.apply();
  assert.equal(h.load().entry.id, '@local/dsh-theme-nahida');
  assert.equal(h.dsTheme(), 'nahida-maya');
  assert.equal(h.theme.getTheme().active.id, 'nahida-maya-light');
  assert.equal(h.warnings.length, 0);
  h.unmount(); assert.equal(h.dsTheme(), undefined); assert.equal(h.head.children.length, 0);
});
check('native appearance and another theme remain usable', () => {
  const h=make(); h.apply();
  h.theme.setTheme('dark');
  assert.equal(h.theme.getTheme().active.id,'nahida-maya-dark');
  h.theme.setTheme('light');
  assert.equal(h.theme.getTheme().active.id,'nahida-maya-light');
  const dispose=h.theme.register({id:'another-theme',colorScheme:'light',tokens:{}});
  h.theme.setTheme('another-theme');
  assert.equal(h.theme.getTheme().active.id,'another-theme');
  assert.equal(h.dsTheme(),undefined);
  h.unmount(); dispose();
});
check('restore original survives reload and can be re-enabled', () => {
  const h=make(); h.apply();
  h.renderSettingsRow().api.selectOriginal();
  assert.equal(h.storage.getItem(key),'original');
  h.unmount();
  const next=make({storageSeed:{[key]:'original'}}); next.apply();
  assert.equal(next.dsTheme(),undefined);
  next.renderSettingsRow().api.select('nahida-maya');
  assert.equal(next.storage.getItem(key),'nahida-maya');
  next.unmount();
});
check('HMR disposal removes theme styles and slots', () => {
  const h=make(); h.apply();
  assert.equal(h.registrations.length,2);
  h.unmount();
  assert.equal(h.registrations.length,0);
  assert.equal(h.head.children.length,0);
  assert.equal(h.theme.getTheme().active.id,'light');
});
check('missing theme service retains CSS and remembered opt-out', () => {
  const h=make({theme:'missing'}); h.apply();
  assert.equal(h.dsTheme(),'nahida-maya');
  h.renderSettingsRow().api.selectOriginal();
  assert.equal(h.storage.getItem(key),'original');
  h.unmount();
});
console.log(JSON.stringify({ok:true,checks},null,2));
