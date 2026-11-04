(() => {
  const toy = () => {
    const el=document.createElement('div');el.className='pop-toy';el.setAttribute('aria-hidden','true');
    for(const name of ['box','ribbon']){const part=document.createElement('span');part.className='pop-toy-'+name;el.append(part);}
    return el;
  };
  if(document.body.classList.contains('pop-home')||document.body.classList.contains('pop-stocks')){
    const hero=document.querySelector('.hero');if(hero&&!hero.querySelector('.pop-toy'))hero.append(toy());
  }
  if(document.body.classList.contains('pop-home')){
    const kinds={today:'box',hot:'chart',learn:'book',saved:'star',settings:'gear'};
    for(const el of document.querySelectorAll('body>aside nav button,body>aside nav>a')){
      if(el.querySelector('.pop-icon'))continue;
      const icon=document.createElement('span');
      const kind=el.id==='openSearch'?'search':kinds[el.dataset.view]||(el.getAttribute('href')?.includes('stocks')?'chart':'box');
      icon.className='pop-icon pop-icon-'+kind;icon.setAttribute('aria-hidden','true');
      for(const child of el.childNodes)if(child.nodeType===3)child.textContent=child.textContent.replace(/^[\s⌕◫◈▥↗◎◇⚙]+/u,'');
      el.prepend(icon);
    }
  }
})();
