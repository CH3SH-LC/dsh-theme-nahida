export const name = 'dsh-theme-nahida';
export const inject = [];

export function apply(ctx, config = {}) {
  const options = {
    pluginId: '@local/dsh-theme-nahida',
    enabled: config.enabled !== false,
    decorations: config.decorations !== false,
  };
  // The client also has its own default, so first installation works through HMR.
  if (typeof ctx.on === 'function') ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'script', placement: 'body', text: `window.__DSH_NAHIDA_OPTIONS__ = ${JSON.stringify(options)};` });
  }, { prepend: true });
}
