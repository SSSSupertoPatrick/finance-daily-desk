(() => {
  const snapshot=JSON.parse(document.getElementById('primarySnapshot').textContent);
  const filters=[...document.querySelectorAll('[data-filter]')];
  const cards=[...document.querySelectorAll('[data-category]')];
  for(const button of filters) button.addEventListener('click',()=>{
    const selected=button.dataset.filter;
    for(const item of filters){const active=item===button;item.classList.toggle('is-active',active);item.setAttribute('aria-pressed',String(active));}
    let count=0;
    for(const card of cards){const visible=selected==='all'||card.dataset.category===selected;card.hidden=!visible;if(visible)count++;}
    document.getElementById('filterResult').textContent=`正在展示 ${count} 则已核验案例`;
    document.getElementById('emptyState').hidden=count!==0;
  });
  const dialog=document.getElementById('knowledgeDialog');
  let nextIndex=0,lastTrigger=null;
  function openBox(trigger){
    const card=snapshot.glossary[nextIndex%snapshot.glossary.length];nextIndex++;
    for(const [id,key] of [['blindTitle','title'],['blindLabel','label'],['blindOne','one'],['blindAnalogy','analogy'],['blindBoundary','boundary']])document.getElementById(id).textContent=card[key];
    dialog.dataset.color=card.color;
    if(!dialog.open){lastTrigger=trigger;dialog.showModal();}
  }
  for(const id of ['openBlindBox','anotherBlindBox','nextBlindBox'])document.getElementById(id).addEventListener('click',event=>openBox(event.currentTarget));
  dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>lastTrigger?.focus());
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(today>snapshot.updated)document.getElementById('primaryFreshness').textContent=`最近核验：${snapshot.updated} · 今日内容尚待核验，以下保留原事件日期`;
})();
