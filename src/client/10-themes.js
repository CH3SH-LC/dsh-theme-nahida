/* ==== src/client/10-themes.js ====
 * ctx.theme 主题运行时：按 lead 裁决 v1——
 * - 每个变体注册两个 id：<variantKey>-light / -dark（真实 register 一个 id 只能一种 colorScheme）；
 * - 切换变体 = 先 dispose 旧的两个注册、再注册新的两个，幂等；
 * - 卸载后 overlay 必须回到原版（dispose 全部注册 + 移除 body 属性）；
 * - 正常路径只写 body[data-ds-theme]，body[data-ds-dark-theme] 归 ui-layout presenter。
 * 注册失败/ctx.theme 缺失时抛错，由 50-fallback 接管（CSS-only 兜底）。
 */

function tbCreateThemeRuntime(ctx, bundle, options) {
  const storage = options && options.storage ? options.storage : null;
  const theme = options && options.themeService ? options.themeService : undefined;
  if (!theme || typeof theme.register !== 'function') throw new Error('ctx.theme service is unavailable (no register)');

  const registered = [];
  const state = { selection: '', mode: 'theme' };
  let off = undefined;
  let changing = false;
  let followSystem = snapshot() && snapshot().preference === 'system';
  let systemMedia;
  function onSystemSchemeChange(event) {
    if (!followSystem || state.selection === '' || changing) return;
    const id = tbThemeIdFor(state.selection, event.matches ? 'dark' : 'light');
    if (typeof theme.setTheme === 'function') theme.setTheme(id);
  }
  try {
    if (typeof matchMedia === 'function') {
      systemMedia = matchMedia('(prefers-color-scheme: dark)');
      if (typeof systemMedia.addEventListener === 'function') systemMedia.addEventListener('change', onSystemSchemeChange);
    }
  } catch (error) { /* Theme selection still works without media queries. */ }

  function snapshot() {
    try {
      return typeof theme.getTheme === 'function' ? theme.getTheme() : undefined;
    } catch (error) {
      return undefined;
    }
  }

  function currentScheme() {
    return tbSchemeOf(snapshot());
  }

  function disposeRegistered() {
    while (registered.length > 0) {
      const entry = registered.pop();
      try {
        if (typeof entry.dispose === 'function') entry.dispose();
      } catch (error) {
        tbWarn('dispose theme ' + entry.id + ' failed', error);
      }
    }
  }

  function registerVariant(variant, scheme) {
    const id = tbThemeIdFor(tbVariantKey(variant), scheme);
    const tokens = scheme === 'dark' ? variant.dark : variant.light;
    if (tokens === null || typeof tokens !== 'object' || Object.keys(tokens).length === 0) {
      throw new Error('variant "' + tbVariantKey(variant) + '" has no ' + scheme + ' tokens');
    }
    const dispose = theme.register({ id, colorScheme: scheme, tokens });
    registered.push({ id, dispose });
    return id;
  }

  function applyBodyAttribute() {
    try {
      const body = document && document.body ? document.body : undefined;
      if (!body || !body.dataset) return;
      if (state.selection !== '') body.dataset.dsTheme = state.selection;
      else delete body.dataset.dsTheme;
    } catch (error) {
      /* 非 DOM 环境（离线自检）忽略 */
    }
  }

  /** 让 ctx.theme 的活动 id 与当前 colorScheme 对齐（同变体另一个 scheme 的 id）。 */
  function syncScheme() {
    if (state.selection === '') return;
    const scheme = currentScheme();
    const id = tbThemeIdFor(state.selection, scheme);
    if (snapshot() && snapshot().active && snapshot().active.id === id) return;
    try {
      if (typeof theme.setTheme === 'function') theme.setTheme(id);
    } catch (error) {
      tbWarn('setTheme(' + id + ') failed', error);
    }
  }

  function select(key) {
    const variant = tbFindVariant(bundle, key);
    if (variant === undefined) {
      tbWarn('select ignored: unknown variant "' + key + '"');
      return false;
    }
    if (state.selection === key && registered.length === 2) {
      syncScheme();
      return false;
    }
    const scheme = currentScheme();
    changing = true;
    try {
      disposeRegistered();
      registerVariant(variant, 'light');
      registerVariant(variant, 'dark');
      state.selection = key;
      applyBodyAttribute();
      if (typeof theme.setTheme === 'function') theme.setTheme(tbThemeIdFor(key, scheme));
    } finally { changing = false; }
    tbWriteStoredSelection(storage, key);
    return true;
  }

  function selectOriginal(preference) {
    state.selection = '';
    disposeRegistered();
    applyBodyAttribute();
    tbWriteStoredSelection(storage, '');
    try {
      if (typeof theme.setTheme === 'function') theme.setTheme(typeof preference === 'string' && preference !== '' ? preference : 'system');
    } catch (error) {
      tbWarn('setTheme(original) failed', error);
    }
  }

  function onChange(nextSnapshot) {
    if (changing) return;
    if (state.selection === '') return;
    const active = nextSnapshot && typeof nextSnapshot === 'object' ? nextSnapshot.active : undefined;
    const activeId = active && typeof active.id === 'string' ? active.id : '';
    if (activeId !== '' && tbIsOwnThemeId(bundle, activeId) === false) {
      if (!['light', 'dark', 'system'].includes(nextSnapshot.preference)) {
        // A different theme owns the selection. Release ours without stealing it back.
        state.selection = '';
        disposeRegistered();
        applyBodyAttribute();
        tbWriteStoredSelection(storage, '');
        return;
      }
      followSystem = nextSnapshot.preference === 'system';
      // 用户切到内置 light/dark/system：把本插件变体的 arm 到新 scheme（跟随 appearance）。
      syncScheme();
      return;
    }
    syncScheme();
  }

  if (typeof ctx.on === 'function') {
    off = ctx.on('theme/change', onChange);
  }

  function dispose() {
    if (systemMedia && typeof systemMedia.removeEventListener === 'function') systemMedia.removeEventListener('change', onSystemSchemeChange);
    try {
      if (typeof off === 'function') off();
    } catch (error) {
      /* ignore */
    }
    state.selection = '';
    disposeRegistered();
    applyBodyAttribute();
  }

  const api = {
    mode: 'theme',
    getSelection() {
      return state.selection;
    },
    select,
    selectOriginal,
    dispose,
    groups() {
      return tbOptionGroups(bundle);
    },
  };

  const initial = tbResolveInitialSelection(bundle, options && options.options ? options.options : {}, storage);
  if (initial !== '') {
    try {
      select(initial);
    } catch (error) {
      tbWarn('initial selection failed; falling back to CSS-only', error);
      dispose();
      throw error;
    }
  }
  return api;
}
