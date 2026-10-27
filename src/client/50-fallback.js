/* ==== src/client/50-fallback.js ====
 * 非 ctx.theme 兜底路径（lead 裁决 v1 硬要求）：
 * 若 ctx.theme 缺失或 register 抛错，则不注册主题，改为「注入同一份派生 CSS + 自行写
 * body[data-ds-theme] 与 body[data-ds-dark-theme]」，保证主题观感不丢。
 * 兜底模式下本插件成为这两个属性的唯一写者；正常模式下 data-ds-dark-theme 归 ui-layout presenter。
 */

function tbCreateFallbackRuntime(ctx, bundle, options) {
  const storage = options && options.storage ? options.storage : null;
  const state = { selection: '', mode: 'css-only' };
  let media = null;
  let onMedia = null;

  function themeService() {
    try {
      return typeof ctx.get === 'function' ? ctx.get('theme') : undefined;
    } catch (error) {
      return undefined;
    }
  }

  function currentScheme() {
    const theme = themeService();
    if (theme && typeof theme.getTheme === 'function') {
      try {
        return tbSchemeOf(theme.getTheme());
      } catch (error) {
        /* fall through */
      }
    }
    // 兜底模式下本插件即 data-ds-dark-theme 的写者：读它会自锁（暗→亮无法撤销），
    // 因此优先用 matchMedia 判断系统/当前外观，body 属性只作为最后兜底。
    try {
      if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches === true) return 'dark';
    } catch (error) {
      /* ignore */
    }
    try {
      const body = document && document.body ? document.body : undefined;
      if (body && body.hasAttribute && body.hasAttribute('data-ds-dark-theme')) return 'dark';
    } catch (error) {
      /* ignore */
    }
    return 'light';
  }

  function applyBodyAttributes() {
    try {
      const body = document && document.body ? document.body : undefined;
      if (!body || !body.dataset) return;
      if (state.selection === '') {
        delete body.dataset.dsTheme;
        if (body.removeAttribute) body.removeAttribute('data-ds-dark-theme');
        return;
      }
      body.dataset.dsTheme = state.selection;
      const dark = currentScheme() === 'dark';
      if (body.toggleAttribute) body.toggleAttribute('data-ds-dark-theme', dark);
      else if (body.setAttribute) dark ? body.setAttribute('data-ds-dark-theme', '') : body.removeAttribute('data-ds-dark-theme');
    } catch (error) {
      /* 非 DOM 环境忽略 */
    }
  }

  function select(key) {
    if (tbFindVariant(bundle, key) === undefined) {
      tbWarn('fallback select ignored: unknown variant "' + key + '"');
      return false;
    }
    state.selection = key;
    applyBodyAttributes();
    tbWriteStoredSelection(storage, key);
    return true;
  }

  function selectOriginal() {
    state.selection = '';
    applyBodyAttributes();
    tbWriteStoredSelection(storage, '');
    try {
      const theme = themeService();
      if (theme && typeof theme.setTheme === 'function') theme.setTheme('system');
    } catch (error) {
      tbWarn('fallback restore original failed', error);
    }
  }

  function watchMedia() {
    try {
      if (typeof matchMedia !== 'function') return;
      media = matchMedia('(prefers-color-scheme: dark)');
      onMedia = function onSchemeChange() {
        if (state.selection !== '') applyBodyAttributes();
      };
      if (media && typeof media.addEventListener === 'function') media.addEventListener('change', onMedia);
    } catch (error) {
      media = null;
      onMedia = null;
    }
  }

  function dispose() {
    try {
      if (media && onMedia && typeof media.removeEventListener === 'function') media.removeEventListener('change', onMedia);
    } catch (error) {
      /* ignore */
    }
    media = null;
    onMedia = null;
    state.selection = '';
    applyBodyAttributes();
  }

  watchMedia();
  const api = {
    mode: 'css-only',
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
  if (initial !== '') select(initial);
  return api;
}
