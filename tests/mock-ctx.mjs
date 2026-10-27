/* ==== tests/mock-ctx.mjs ====
 * 运行期冒烟测试用的最小 mock 宿主：纯 node: 内建，不装 DSH、不联网、不读 ~/.dsh。
 *
 * 被 mock 的浏览器/框架全局（用 new Function 的参数注入，等价于「受控全局作用域」）：
 *   window（含 __ModuleLoader__ / __DSH_NAHIDA_OPTIONS__ / localStorage）、document、matchMedia。
 * 被 mock 的服务：ctx = { get, on, effect, slots: {inject, register}, locale: {register}, emit }。
 *
 * 建模依据（本机真实源码，只读、不改）：
 * - dist/client.js 形状：`(function (registry) { registry.load({ id, factory(require) {...} }); })(window.__ModuleLoader__)`
 *   → load() 截获 {id, factory}，再用 mock require 调 factory，拿到 { inject, apply }。
 * - ctx.theme 语义按 @deepseek-ai/dsh-client-ui-theme/lib/client.js:1409-1519 建模：
 *     setTheme(id)  未注册 id 抛错；同值重复调用直接 return（不 publish，插件也就不会自我递归）；
 *     register(def) 重复 id 抛错，注册成功即同步 publish；
 *     publish()     revision+1 + 同步 emit('theme/change', snapshot)；
 *     getTheme()    snapshot.active 由当前 preference 解析（= 对应主题定义本身），
 *                   dispose 掉「正在生效」的主题会把 preference 复位成 system。
 *   验收条件里说的「register 合并 tokens」在本 mock 的等价可观测结果：选中变体后
 *   getTheme().active.tokens 深等于该变体 manifest palette，卸载后回到基线 tokens。
 * - ctx.slots.register 在 @deepseek-ai/dsh-client-ui-slots/lib/index.js:237-242 返回「函数型 disposer」
 *   （不是 {dispose(){}}），所以这里也返回函数——插件把行 disposer 收进 disposers 的行为才可断言。
 * - ctx.slots.inject(slot, register) 在 mock 里立即执行 register 并返回其结果（与插件用法一致）。
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = '@local/dsh-theme-nahida';
export const STORAGE_KEY = 'dsh-theme-nahida:selection';
export const SETTINGS_SLOT = 'settings.general.item';
export const ORNAMENT_SLOT = 'sidebar.footer.action';
export const SETTINGS_NS = 'settings.nahida';

export const testsDir = dirname(fileURLToPath(import.meta.url));
export const pluginRoot = resolve(testsDir, '..');
export const clientPath = resolve(pluginRoot, 'dist', 'client.js');
export const manifestPath = resolve(pluginRoot, 'dist', 'manifest.json');

let cachedDist;

/** 只读加载 dist/client.js 文本 + dist/manifest.json（进程内缓存，避免每次 harness 重读 350KB）。 */
export function readDist() {
  if (cachedDist === undefined) {
    cachedDist = {
      clientPath,
      manifestPath,
      clientText: readFileSync(clientPath, 'utf8'),
      manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
    };
  }
  return cachedDist;
}

/** manifest 里全部变体（按 manifest 顺序 = 构建时的 order 顺序）。 */
export function allVariants(manifest) {
  const out = [];
  for (const theme of manifest.themes || []) {
    for (const variant of theme.variants || []) out.push(variant);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 浏览器全局 mock
 * ------------------------------------------------------------------ */

/** localStorage mock：Map 支撑，并对 setItem 做 String()（真实 Storage 语义）。 */
export function createStorage(seed) {
  const map = new Map();
  for (const [key, value] of Object.entries(seed || {})) map.set(key, String(value));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
    key(index) { return [...map.keys()][index] ?? null; },
    get length() { return map.size; },
    dump() { return Object.fromEntries(map); },
  };
}

/**
 * matchMedia mock：同一份 MediaQueryList，matches 可翻转并派发 change（模拟 OS 亮暗切换）。
 * @returns 函数（直接当全局 matchMedia 用），其 `.media` 是查询对象（测试用 setMatches 翻转）。
 */
export function createMatchMedia(options = {}) {
  const listeners = [];
  const media = {
    media: '(prefers-color-scheme: dark)',
    matches: options.matches === true,
    addEventListener(type, callback) { if (type === 'change') listeners.push(callback); },
    removeEventListener(type, callback) {
      const index = listeners.indexOf(callback);
      if (index !== -1) listeners.splice(index, 1);
    },
    listenerCount() { return listeners.length; },
    setMatches(matches) {
      media.matches = matches === true;
      for (const callback of listeners.slice()) callback({ matches: media.matches, media: media.media });
    },
  };
  function matchMedia(query) { media.query = String(query); return media; }
  matchMedia.media = media;
  return matchMedia;
}

/** data 属性名 ⇄ dataset camelCase。 */
function datasetName(property) {
  return 'data-' + String(property).replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
}

/**
 * body mock：
 * - dataset 是 Proxy，读写直接落到 attributes（Map）上，所以 body.dataset.dsTheme 与
 *   body.hasAttribute('data-ds-theme') 始终一致（真实 DOMStringMap 语义；delete = 移除属性）。
 * - toggleAttribute(name, force) 是真实 Boolean 语义（on: 置空值，off: 移除），
 *   用于断言兜底路径对 body[data-ds-dark-theme] 的写入/移除。
 */
function createBody() {
  const attributes = new Map();
  const dataset = new Proxy({}, {
    get(target, property) {
      if (typeof property !== 'string') return target[property];
      return attributes.get(datasetName(property));
    },
    set(target, property, value) {
      if (typeof property !== 'string') return Reflect.set(target, property, value);
      attributes.set(datasetName(property), String(value));
      return true;
    },
    deleteProperty(target, property) {
      if (typeof property === 'string') attributes.delete(datasetName(property));
      return true;
    },
    has(target, property) {
      if (typeof property !== 'string') return Reflect.has(target, property);
      return attributes.has(datasetName(property));
    },
  });
  return {
    tagName: 'body',
    dataset,
    hasAttribute(name) { return attributes.has(String(name)); },
    setAttribute(name, value) { attributes.set(String(name), String(value)); },
    removeAttribute(name) { attributes.delete(String(name)); },
    toggleAttribute(name, force) {
      const key = String(name);
      const present = attributes.has(key);
      const next = force === undefined ? !present : Boolean(force);
      if (next) attributes.set(key, '');
      else attributes.delete(key);
      return next;
    },
    attributeSnapshot() { return new Map(attributes); },
  };
}

function createContainerNode(tagName) {
  return {
    tagName,
    children: [],
    appendChild(node) {
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      this.children.push(node);
      return node;
    },
    removeChild(node) {
      const index = this.children.indexOf(node);
      if (index !== -1) this.children.splice(index, 1);
      node.parentNode = null;
      return node;
    },
  };
}

function createElementNode(tagName) {
  const node = {
    tagName: String(tagName),
    dataset: {},
    textContent: '',
    parentNode: null,
    remove() {
      if (node.parentNode) node.parentNode.removeChild(node);
    },
  };
  return node;
}

/** document mock：head/body/createElement/querySelector（querySelector 默认返回 null = 首次注入）。 */
export function createDocument(options = {}) {
  const head = createContainerNode('head');
  const body = createBody();
  const document = {
    head,
    body,
    querySelectorCalls: [],
    querySelector(selector) {
      document.querySelectorCalls.push(String(selector));
      const answer = options.querySelector;
      return typeof answer === 'function' ? answer(selector) : null;
    },
    createElement(tagName) { return createElementNode(tagName); },
  };
  return document;
}

/* ------------------------------------------------------------------ *
 * react / require mock（插件只能 require 平台 seed）
 * ------------------------------------------------------------------ */

export function createReactMock() {
  const stateSlots = [];
  function createElement(type, props, ...children) {
    const merged = Object.assign({}, props === null || props === undefined ? {} : props);
    const flat = [];
    for (const child of children) {
      if (Array.isArray(child)) for (const item of child) flat.push(item);
      else flat.push(child);
    }
    if (children.length > 0) merged.children = flat;
    return { type, props: merged, children: flat };
  }
  function useState(initialValue) {
    const slot = { value: initialValue };
    const setValue = (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; };
    stateSlots.push(slot);
    return [slot.value, setValue];
  }
  const Fragment = 'Fragment';
  const jsxRuntime = {
    Fragment,
    jsx: createElement,
    jsxs: createElement,
    jsxDEV: createElement,
  };
  return { react: { createElement, Fragment, useState, version: 'mock-react' }, jsxRuntime, stateSlots };
}

export function createRequireMock(reactMock) {
  const calls = [];
  function requireModule(name) {
    calls.push(String(name));
    if (name === 'react') return reactMock.react;
    if (name === 'react/jsx-runtime' || name === 'react/jsx-dev-runtime') return reactMock.jsxRuntime;
    throw new Error('dist/client.js require("' + name + '") 未在 mock 中提供（只允许平台 seed react / react/jsx-runtime）');
  }
  requireModule.calls = calls;
  return requireModule;
}

/** 展开 mock React 元素树（数组/元素都能遍历，纯文本节点忽略）。 */
export function collectElements(tree) {
  const out = [];
  const stack = Array.isArray(tree) ? [...tree] : [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || node === undefined || typeof node !== 'object') continue;
    if (Array.isArray(node)) { stack.push(...node); continue; }
    out.push(node);
    if (Array.isArray(node.children)) for (const child of node.children) stack.push(child);
  }
  return out;
}

/** 元素树的可读文本（递归拼接字符串子节点）。 */
export function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && Array.isArray(node.children)) return node.children.map(textOf).join('');
  return '';
}

/** 在 mock React 元素树里找第一个匹配的 <button>。 */
export function findButton(tree, matcher) {
  for (const node of collectElements(tree)) {
    if (node.type !== 'button') continue;
    if (matcher(textOf(node), node)) return node;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * ctx.theme mock（按真实 ThemeRuntime 语义）
 * ------------------------------------------------------------------ */

/**
 * @param options.registerThrows 为 true 时 register 一律抛错（模拟「服务版本差异 / id 冲突」）。
 */
export function createThemeService(options = {}) {
  const registerThrows = options.registerThrows === true;
  /** 基线 tokens：owner 任务包给定 {}（内置 light/dark 不带别名覆盖）。 */
  const baselineTokens = Object.assign({}, options.baselineTokens || {});
  const calls = {
    register: [],          // {id, colorScheme, tokens}（记录每次注册调用，含抛错的那次）
    dispose: [],           // id（记录每次 disposer 调用）
    setTheme: [],          // id（记录每次 setTheme 调用，含同值 no-op）
    setThemeFailures: [],  // {id, message}（未注册 id 被真实实现拒绝）
    sequence: [],          // 'register:<id>' | 'dispose:<id>' | 'setTheme:<id>'（真实调用顺序）
    publishes: 0,
  };

  let themes = [
    { id: 'light', colorScheme: 'light', tokens: Object.assign({}, baselineTokens) },
    { id: 'dark', colorScheme: 'dark', tokens: Object.assign({}, baselineTokens) },
  ];
  const state = { preference: 'system', fontSize: 14, revision: 1 };
  let emitter = null;
  let snapshot = buildSnapshot();

  function buildSnapshot() {
    const resolvedId = state.preference === 'system' ? 'light' : state.preference;
    const active = themes.find((theme) => theme.id === resolvedId);
    if (active === undefined) throw new Error('mock theme registry lost "' + resolvedId + '"');
    return {
      preference: state.preference,
      fontSize: state.fontSize,
      active: { id: active.id, colorScheme: active.colorScheme, tokens: Object.assign({}, active.tokens) },
      themes: themes.map((theme) => ({ id: theme.id, colorScheme: theme.colorScheme, tokens: Object.assign({}, theme.tokens) })),
      revision: state.revision,
    };
  }

  function publish() {
    state.revision += 1;
    snapshot = buildSnapshot();
    calls.publishes += 1;
    if (typeof emitter === 'function') emitter(snapshot);
  }

  const service = {
    getTheme() { return snapshot; },
    register(definition) {
      if (definition === null || typeof definition !== 'object') throw new Error('mock theme.register requires a definition');
      const entry = {
        id: definition.id,
        colorScheme: definition.colorScheme,
        tokens: Object.assign({}, definition.tokens || {}),
      };
      calls.register.push({ id: entry.id, colorScheme: entry.colorScheme, tokens: Object.assign({}, entry.tokens) });
      calls.sequence.push('register:' + entry.id);
      if (registerThrows) throw new Error('mock theme.register is configured to throw (id=' + entry.id + ')');
      if (entry.id === 'system') throw new Error('"system" is a preference, not a registrable theme id');
      if (themes.some((theme) => theme.id === entry.id)) throw new Error('theme "' + entry.id + '" is already registered');
      themes = [...themes, entry];
      publish();
      let disposed = false;
      return function disposeTheme() {
        calls.dispose.push(entry.id);
        calls.sequence.push('dispose:' + entry.id);
        if (disposed) return;
        disposed = true;
        if (!themes.some((theme) => theme.id === entry.id)) return;
        themes = themes.filter((theme) => theme.id !== entry.id);
        // 真实实现：dispose 掉「正在生效」的主题必须把 preference 复位，避免残留该主题 tokens。
        if (state.preference === entry.id) state.preference = 'system';
        publish();
      };
    },
    setTheme(id) {
      calls.setTheme.push(id);
      calls.sequence.push('setTheme:' + id);
      if (id !== 'system' && !themes.some((theme) => theme.id === id)) {
        const error = new Error('theme "' + id + '" is not registered');
        calls.setThemeFailures.push({ id, message: error.message });
        throw error;
      }
      if (state.preference === id) return; // 真实实现同值直接 return（不 emit）
      state.preference = id;
      publish();
    },
    /** 测试用的「外部」外观切换入口（等价用户在「外观」里点 light/dark/system）。 */
    setPreference(preference) { service.setTheme(preference); },
    setEmitter(next) { emitter = typeof next === 'function' ? next : null; },
    calls,
    themeIds() { return themes.map((theme) => theme.id); },
    preference() { return state.preference; },
  };
  return service;
}

/* ------------------------------------------------------------------ *
 * ctx mock（cordis 最小面：get/on/effect/slots/locale/emit）
 * ------------------------------------------------------------------ */

export function createMockCtx() {
  const services = new Map();
  const listeners = new Map();
  const effects = [];              // {label, dispose, called}
  const slotInjectCalls = [];      // 槽位注入调用顺序
  const registrations = [];        // 仍存活的注册
  const registrationHistory = [];  // 全部注册（含已 dispose，用于断言「全部 unregister」）
  const localeRegistrations = [];

  const slots = {
    /** mock 约定：立即执行注册回调并返回其结果（插件用法 = 立即注册并拿 disposer）。 */
    inject(slotName, register) {
      slotInjectCalls.push(slotName);
      return register();
    },
    register(options, Component) {
      if (options === null || typeof options !== 'object') throw new Error('slots.register requires an options object');
      if (typeof options.name !== 'string' || options.name === '') throw new Error('slots.register requires options.name');
      const entry = { options, Component, disposed: false };
      registrations.push(entry);
      registrationHistory.push(entry);
      // 真实 ui-slots 返回函数型 disposer。
      return function disposeSlotRegistration() {
        if (entry.disposed) return;
        entry.disposed = true;
        const index = registrations.indexOf(entry);
        if (index !== -1) registrations.splice(index, 1);
      };
    },
  };

  const locale = {
    register(namespace, dictionaries) {
      const entry = { namespace, dictionaries, disposed: false };
      localeRegistrations.push(entry);
      return function disposeLocale() { entry.disposed = true; };
    },
  };

  const ctx = {
    get(name) { return services.get(name); },
    on(event, callback) {
      const list = listeners.get(event) || [];
      list.push(callback);
      listeners.set(event, list);
      let active = true;
      return function off() {
        if (!active) return;
        active = false;
        const current = listeners.get(event) || [];
        const index = current.indexOf(callback);
        if (index !== -1) current.splice(index, 1);
      };
    },
    effect(callback, label) {
      const dispose = callback();
      effects.push({ label, dispose, called: false });
      return dispose;
    },
    slots,
    locale,
    emit(event, payload) {
      for (const callback of (listeners.get(event) || []).slice()) callback(payload);
    },
    listenerCount(event) { return (listeners.get(event) || []).length; },
  };

  return {
    ctx,
    setService(name, service) { services.set(name, service); },
    services,
    listeners,
    effects,
    slotInjectCalls,
    registrations,
    registrationHistory,
    localeRegistrations,
  };
}

/** 捕获 console.warn（插件 tbWarn 走这里），返回收集到的消息数组。 */
export function captureConsoleWarnings(callback, sink) {
  const messages = [];
  const original = console.warn;
  console.warn = (...args) => {
    messages.push(args.map((value) => (typeof value === 'string' ? value : String(value))).join(' '));
  };
  try {
    callback();
  } finally {
    console.warn = original;
    if (Array.isArray(sink)) sink.push(...messages);
  }
  return messages;
}

/* ------------------------------------------------------------------ *
 * harness：把全局/服务/文档/存储组装成一个可 apply/unmount 的场景
 * ------------------------------------------------------------------ */

/**
 * @param rawOptions.theme          'service' | 'missing' | 'register-throws'
 * @param rawOptions.document       是否提供 document（false = 非浏览器环境）
 * @param rawOptions.localStorage   是否提供 window.localStorage
 * @param rawOptions.matchMedia     是否提供全局 matchMedia
 * @param rawOptions.matchMediaMatches 初始 prefers-color-scheme: dark
 * @param rawOptions.pluginOptions  window.__DSH_NAHIDA_OPTIONS__（Host 注入的行配置投影）
 * @param rawOptions.storageSeed    localStorage 预置值
 * @param rawOptions.querySelector   document.querySelector 的返回值工厂
 * @param rawOptions.clientText     覆盖 dist/client.js 文本（仅用于「测试的测试」变异自检）
 */
export function createHarness(rawOptions = {}) {
  const options = Object.assign({
    theme: 'service',
    document: true,
    localStorage: true,
    matchMedia: true,
    matchMediaMatches: false,
    pluginOptions: undefined,
    storageSeed: {},
    querySelector: null,
    clientText: undefined,
  }, rawOptions);
  if (['service', 'missing', 'register-throws'].indexOf(options.theme) === -1) {
    throw new Error('createHarness: theme 必须是 service|missing|register-throws，收到 ' + String(options.theme));
  }

  const dist = readDist();
  const reactMock = createReactMock();
  const requireMock = createRequireMock(reactMock);
  const mockCtx = createMockCtx();

  const storage = options.localStorage ? createStorage(options.storageSeed) : undefined;
  const matchMedia = options.matchMedia
    ? createMatchMedia({ matches: options.matchMediaMatches })
    : undefined;
  const doc = options.document ? createDocument({ querySelector: options.querySelector }) : undefined;
  const themeService = options.theme === 'missing'
    ? undefined
    : createThemeService({ registerThrows: options.theme === 'register-throws' });

  mockCtx.setService('slots', mockCtx.ctx.slots);
  mockCtx.setService('locale', mockCtx.ctx.locale);
  if (themeService !== undefined) {
    mockCtx.setService('theme', themeService);
    themeService.setEmitter((snapshot) => mockCtx.ctx.emit('theme/change', snapshot));
  }

  const windowMock = {};
  if (storage !== undefined) windowMock.localStorage = storage;
  if (options.pluginOptions !== undefined) windowMock.__DSH_NAHIDA_OPTIONS__ = options.pluginOptions;

  // 只注入真实存在的东西：缺席的 document / matchMedia 让插件走到「非浏览器」分支
  // （bare 访问抛 ReferenceError 由实现的 try/catch / typeof 守卫吞掉）。
  const globals = { window: windowMock };
  if (doc !== undefined) globals.document = doc;
  if (matchMedia !== undefined) globals.matchMedia = matchMedia;

  const warnings = [];
  let loaded = null;

  function load() {
    if (loaded !== null) return loaded;
    const captured = [];
    windowMock.__ModuleLoader__ = {
      load(entry) { captured.push(entry); },
    };
    const names = Object.keys(globals);
    const values = names.map((name) => globals[name]);
    const source = typeof options.clientText === 'string' ? options.clientText : dist.clientText;
    // eslint-disable-next-line no-new-func
    const run = new Function(...names, source);
    run(...values);
    if (captured.length !== 1) {
      throw new Error('window.__ModuleLoader__.load 应被调用恰好 1 次，实际 ' + captured.length + ' 次');
    }
    const entry = captured[0];
    if (entry === null || typeof entry !== 'object') throw new Error('__ModuleLoader__.load 收到的不是对象');
    if (typeof entry.factory !== 'function') throw new Error('entry.factory 不是函数');
    const plugin = entry.factory(requireMock);
    if (plugin === null || typeof plugin !== 'object' || typeof plugin.apply !== 'function') {
      throw new Error('factory 没有返回 { apply(ctx) }');
    }
    loaded = { entry, plugin };
    return loaded;
  }

  function apply() {
    const current = load();
    captureConsoleWarnings(() => current.plugin.apply(mockCtx.ctx), warnings);
    return current;
  }

  function unmount() {
    for (let index = mockCtx.effects.length - 1; index >= 0; index -= 1) {
      const record = mockCtx.effects[index];
      if (record.called) continue;
      record.called = true;
      if (typeof record.dispose === 'function') record.dispose();
    }
  }

  function styles() {
    if (doc === undefined) return [];
    return doc.head.children.filter((node) => node.tagName === 'style');
  }

  function pluginStyles() {
    return styles().filter((node) => node.dataset.plugin === PLUGIN_ID);
  }

  /** 内容非空的插件样式（icon-skin 在无 CSS.supports 的 node 环境里是空标签）。 */
  function nonEmptyStyles() {
    return pluginStyles().filter((node) => String(node.textContent).trim() !== '');
  }

  /** 主题变体样式：优先按 pluginCss 标记定位，否则退回第一张非空插件样式。 */
  function themesStyle() {
    const marked = pluginStyles().find((node) => node.dataset.pluginCss === PLUGIN_ID + '/themes.css');
    if (marked !== undefined) return marked;
    const nonEmpty = nonEmptyStyles();
    return nonEmpty.length > 0 ? nonEmpty[0] : undefined;
  }

  function iconSkinStyle() {
    return pluginStyles().find((node) => node.dataset.pluginCss === PLUGIN_ID + '/icon-skin.css');
  }

  function styleText() {
    const node = themesStyle();
    return node === undefined ? '' : String(node.textContent);
  }

  function settingsRegistration() {
    return mockCtx.registrationHistory.find((entry) => entry.options && entry.options.name === SETTINGS_SLOT);
  }

  function renderSettingsRow() {
    const registration = settingsRegistration();
    if (registration === undefined) throw new Error('设置行未注册（ctx.slots.register 没收到 name=' + SETTINGS_SLOT + '）');
    const injected = typeof registration.options.inject === 'function' ? registration.options.inject() : {};
    const api = injected === null || typeof injected !== 'object' ? undefined : injected.api;
    const tree = registration.Component({ api, t: (key) => String(key) });
    return { tree, api, registration };
  }

  const harness = {
    options,
    dist,
    manifest: dist.manifest,
    window: windowMock,
    document: doc,
    head: doc === undefined ? undefined : doc.head,
    body: doc === undefined ? undefined : doc.body,
    storage,
    matchMedia,
    media: matchMedia === undefined ? undefined : matchMedia.media,
    ctx: mockCtx.ctx,
    theme: themeService,
    calls: themeService === undefined ? null : themeService.calls,
    requireCalls: requireMock.calls,
    react: reactMock,
    bundle: mockCtx,
    warnings,
    load,
    apply,
    unmount,
    capture: (callback) => captureConsoleWarnings(callback, warnings),
    styles,
    pluginStyles,
    nonEmptyStyles,
    themesStyle,
    iconSkinStyle,
    styleText,
    settingsRegistration,
    renderSettingsRow,
    slotInjectCalls: mockCtx.slotInjectCalls,
    registrations: mockCtx.registrations,
    registrationHistory: mockCtx.registrationHistory,
    localeRegistrations: mockCtx.localeRegistrations,
    effectStatus: () => ({
      total: mockCtx.effects.length,
      called: mockCtx.effects.filter((record) => record.called).length,
    }),
    /** body.dataset.dsTheme（属性缺席时为 undefined；真实 DOMStringMap 同语义）。 */
    dsTheme: () => (doc === undefined ? undefined : doc.body.dataset.dsTheme),
    hasBodyAttribute: (name) => (doc === undefined ? false : doc.body.hasAttribute(name)),
    bodyAttributes: () => (doc === undefined ? new Map() : doc.body.attributeSnapshot()),
  };
  return harness;
}
