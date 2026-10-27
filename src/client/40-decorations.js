function NahidaCompanion() {
  return React.createElement('div',{className:'nahida-companion-wrap','aria-hidden':true},[
    React.createElement('span',{key:'art',className:'nahida-companion'}),
    React.createElement('span',{key:'caption',className:'nahida-companion-caption'},'NAHIDA · PHYSIC OF PURITY'),
  ]);
}
function tbInstallDecorations(ctx, options) {
  if (options.decorations === false) return;
  return ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({
    name:'sidebar.footer.action',id:'nahida-companion',order:-100,
  },NahidaCompanion));
}
