function NahidaSettings({ api }) {
  const [, refresh] = React.useState(0);
  const selected = api.getSelection() === 'nahida-maya';
  function choose(key) {
    if (key) api.select(key); else api.selectOriginal();
    refresh(value => value + 1);
  }
  const variant = tbFindVariant(THEME_BUNDLE, 'nahida-maya');
  const asset = name => new RegExp('--nh-' + name + ':\\s*(url\\("[^"]*"\\));').exec(variant.css)?.[1];
  const ink = 'var(--dsw-alias-label-primary)', muted = 'var(--dsw-alias-label-secondary)';
  return React.createElement('section', {
    'aria-label': '纳西妲主题',
    style: { padding: '20px 0', display: 'grid', gap: 12, borderBottom: '1px solid var(--dsw-alias-border-l2)' },
  }, [
    React.createElement('div', {key:'heading',style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}, [
      React.createElement('strong',{key:'title',style:{fontSize:14,color:ink}},'纳西妲主题'),
      React.createElement('button',{key:'restore',type:'button',onClick:()=>choose(''),'aria-pressed':!selected,
        style:{border:0,background:'transparent',color:muted,padding:6,cursor:'pointer'}},'恢复原版'),
    ]),
    React.createElement('button',{
      key:'card',type:'button','aria-label':'启用纳西妲 · 摩耶之殿','aria-pressed':selected,onClick:()=>choose('nahida-maya'),
      style:{position:'relative',minHeight:150,textAlign:'left',overflow:'hidden',borderRadius:16,padding:'20px 18px',cursor:'pointer',
        border:'2px solid '+(selected?'var(--dsw-alias-brand-primary)':'var(--dsw-alias-border-l2)'),color:'#2C4039',backgroundColor:'#F0F3E7',
        backgroundImage:'linear-gradient(90deg,#F0F3E7 12%,#F0F3E7BB 60%,#F0F3E730),'+asset('namecard'),backgroundSize:'cover'},
    },[
      React.createElement('span',{key:'art','aria-hidden':true,style:{position:'absolute',right:0,top:0,bottom:0,width:'55%',backgroundImage:asset('character'),backgroundRepeat:'no-repeat',backgroundSize:'auto 130%',backgroundPosition:'67% top',maskImage:'linear-gradient(90deg,transparent,#000 24%)'}}),
      React.createElement('span',{key:'text',style:{position:'relative',display:'grid',gap:8}},[
        React.createElement('span',{key:'sub',style:{fontSize:10,letterSpacing:'.12em',opacity:.65}},'GENSHIN IMPACT'),
        React.createElement('strong',{key:'title',style:{fontSize:18}},'纳西妲 · 摩耶之殿'),
        React.createElement('span',{key:'status',style:{fontSize:12}},selected?'✓ 已启用':'点击启用'),
      ]),
    ]),
    React.createElement('p',{key:'hint',style:{fontSize:12,lineHeight:'20px',color:muted,margin:0}},'浅色与深色跟随上方「外观」设置。恢复原版后，下次打开仍会保留你的选择。'),
  ]);
}
function tbRegisterPickerRow(ctx, runtime) {
  return ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name:'settings.general.item', id:'nahida-theme', order:12, inject:()=>({api:runtime}),
  }, NahidaSettings));
}
