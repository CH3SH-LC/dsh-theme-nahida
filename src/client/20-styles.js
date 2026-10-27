function tbInstallStyles(ctx, bundle) {
  const tag = document.createElement('style');
  tag.dataset.plugin = THEME_PLUGIN_ID;
  tag.dataset.pluginCss = THEME_PLUGIN_ID + '/theme.css';
  tag.textContent = '.nahida-companion-wrap{display:none}\n' + tbAllVariants(bundle).map(v => v.css).join('\n');
  document.head.appendChild(tag);
  return () => tag.remove();
}
