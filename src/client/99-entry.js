function apply(ctx) {
  const options = tbReadPluginOptions();
  if (options.enabled === false) return;
  const disposers = [tbInstallStyles(ctx, THEME_BUNDLE)];
  let runtime;
  try {
    runtime = tbCreateThemeRuntime(ctx, THEME_BUNDLE, { storage:tbStorage(), options, themeService:ctx.get('theme') });
  } catch (error) {
    tbWarn('Using CSS fallback', error);
    runtime = tbCreateFallbackRuntime(ctx, THEME_BUNDLE, { storage:tbStorage(), options });
  }
  disposers.push(()=>runtime.dispose());
  disposers.push(tbRegisterPickerRow(ctx, runtime));
  disposers.push(tbInstallDecorations(ctx, options));
  ctx.effect(()=>()=> {
    for (const dispose of disposers.reverse()) if (typeof dispose === 'function') dispose();
  }, 'nahida-theme:lifecycle');
}
