/* ==== src/client/00-shared.js ====
 * 纯函数与安全小工具。片段会被 build.mjs 直接拼进 factory 作用域（无 import/export）。
 * 命名统一 tb 前缀，避免与同 factory 内其它片段冲突。
 */

const THEME_PLUGIN_ID = '@local/dsh-theme-nahida';
const THEME_STORAGE_KEY = 'dsh-theme-nahida:selection';
const THEME_SETTINGS_NS = 'settings.nahida';
const THEME_ORIGINAL = 'original';

function tbWarn(message, error) {
  try {
    const detail = error && error.message ? ' :: ' + String(error.message) : '';
    console.warn('[nahida] ' + message + detail);
  } catch (ignored) {
    /* console 不可用时保持静默 */
  }
}

/** 读取 Host 投影的启动选项（可能不存在：非 profile 安装 / index 注入失败）。 */
function tbReadPluginOptions() {
  try {
    const raw = window.__DSH_NAHIDA_OPTIONS__;
    return raw !== null && typeof raw === 'object' ? raw : {};
  } catch (error) {
    return {};
  }
}

/** localStorage 不可用（隐私模式 / 非浏览器）时返回 null，不抛错。 */
function tbStorage() {
  try {
    const candidate = window.localStorage;
    if (candidate === null || candidate === undefined) return null;
    if (typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') return null;
    return candidate;
  } catch (error) {
    return null;
  }
}

function tbReadStoredSelection(storage) {
  if (!storage) return '';
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return typeof value === 'string' ? value : '';
  } catch (error) {
    return '';
  }
}

function tbWriteStoredSelection(storage, value) {
  if (!storage) return;
  try {
    if (typeof value === 'string' && value !== '') storage.setItem(THEME_STORAGE_KEY, value);
    else storage.setItem(THEME_STORAGE_KEY, THEME_ORIGINAL);
  } catch (error) {
    tbWarn('persist selection failed', error);
  }
}

/** 变体唯一键：优先 manifest 的 variantKey，其次 id，最后按 themeId+'-'+variantId 拼。 */
function tbVariantKey(variant) {
  if (variant === null || typeof variant !== 'object') return '';
  if (typeof variant.variantKey === 'string' && variant.variantKey !== '') return variant.variantKey;
  if (typeof variant.id === 'string' && variant.id !== '') return variant.id;
  const themeId = typeof variant.themeId === 'string' ? variant.themeId : '';
  const variantId = typeof variant.variantId === 'string' ? variant.variantId : '';
  return themeId !== '' && variantId !== '' ? themeId + '-' + variantId : '';
}

function tbAllVariants(bundle) {
  const out = [];
  const themes = bundle && Array.isArray(bundle.themes) ? bundle.themes : [];
  for (const theme of themes) {
    const variants = theme && Array.isArray(theme.variants) ? theme.variants : [];
    for (const variant of variants) out.push(variant);
  }
  return out;
}

function tbFindVariant(bundle, key) {
  if (typeof key !== 'string' || key === '') return undefined;
  const variants = tbAllVariants(bundle);
  for (const variant of variants) if (tbVariantKey(variant) === key) return variant;
  return undefined;
}

/** 快照 colorScheme → 'light' | 'dark'；未知按 light。 */
function tbSchemeOf(snapshot) {
  const active = snapshot && typeof snapshot === 'object' ? snapshot.active : undefined;
  return active && active.colorScheme === 'dark' ? 'dark' : 'light';
}

/** ctx.theme 注册 id：变体键 + '-' + scheme（INTERFACE §3.1）。 */
function tbThemeIdFor(key, scheme) {
  return String(key) + (scheme === 'dark' ? '-dark' : '-light');
}

/** 判断某个 ctx.theme id 是否属于本插件（用于 theme/change 时区分归属）。 */
function tbIsOwnThemeId(bundle, id) {
  if (typeof id !== 'string') return false;
  if (!id.endsWith('-light') && !id.endsWith('-dark')) return false;
  const key = id.slice(0, id.lastIndexOf('-'));
  return tbFindVariant(bundle, key) !== undefined;
}

/** 由 id 取变体键（`nahida-maya-light` → `nahida-maya`）。 */
function tbVariantKeyOfThemeId(id) {
  if (typeof id !== 'string') return '';
  if (id.endsWith('-light')) return id.slice(0, -'-light'.length);
  if (id.endsWith('-dark')) return id.slice(0, -'-dark'.length);
  return '';
}

/** 设置行 / 装饰共享的选项清单：原版 + 每个主题的变体。 */
function tbOptionGroups(bundle) {
  const themes = bundle && Array.isArray(bundle.themes) ? bundle.themes : [];
  return themes.map((theme) => ({
    id: typeof theme.id === 'string' ? theme.id : '',
    name: typeof theme.name === 'string' ? theme.name : theme.id,
    variants: (Array.isArray(theme.variants) ? theme.variants : []).map((variant) => ({
      key: tbVariantKey(variant),
      name: typeof variant.name === 'string' ? variant.name : tbVariantKey(variant),
      tagline: typeof variant.tagline === 'string' ? variant.tagline : '',
      recommended: variant.recommended === true,
    })),
  }));
}

/** Remember an explicit opt-out; use the install default only on first use. */
function tbResolveInitialSelection(bundle, options, storage) {
  const stored = tbReadStoredSelection(storage);
  if (stored === THEME_ORIGINAL) return '';
  const candidates = [stored, options && options.defaultThemeId, bundle && bundle.defaultThemeId];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '' && tbFindVariant(bundle, candidate) !== undefined) return candidate;
  }
  return '';
}
