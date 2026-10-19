(() => {
  const node = id => document.getElementById(id);
  const box = node('smartSearch');
  let endpoint = '', controller, generation = 0, localPlus = false;
  const groups = [
    ['利率','降息','加息','房贷','存款','借钱','贷款','央行','宽松'],
    ['债券','收益率','借条','久期','债基','利率','降息'],
    ['通胀','通货膨胀','物价','cpi','消费','鸡蛋','涨价','购买力'],
    ['市盈率','pe','估值','利润','盈利','股票','财报'],
    ['etf','基金','指数','篮子','跟踪误差','溢价'],
    ['汇率','美元','人民币','换汇','升值','贬值','跨境','全球']
  ];
  function element(tag, text, cls) {
    const el = document.createElement(tag); if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls; return el;
  }
  function safeURL(url) { try { const u = new URL(url); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
  function link(text, url) { const a = element('a', text); a.href = safeURL(url); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
  function terms(q) { const words = new Set([q.toLowerCase()]); for (const group of groups) if (group.some(w => q.toLowerCase().includes(w))) group.forEach(w => words.add(w)); return [...words]; }
  function localSearch(q) {
    const words = terms(q), hits = node('localResults'), related = node('relatedResults');
    hits.replaceChildren(); related.replaceChildren();
    const ranked = concepts.map((c,i) => ({c,i,score:words.reduce((n,w) => n + (c.title.toLowerCase().includes(w)?4:JSON.stringify(c).toLowerCase().includes(w)?1:0),0)})).filter(x => x.score).sort((a,b)=>b.score-a.score).slice(0,3);
    for (const {c,i} of ranked) {
      const card = element('article',undefined,'search-hit');
      card.append(element('span','知识库 · 基础概念','pill'),element('h3',c.title),element('p',c.short));
      const button = element('button','查看完整解读 →'); button.type='button'; button.onclick=()=>openConcept(i); card.append(button); hits.append(card);
      const more = element('article',undefined,'search-hit'); more.append(element('h3',c.title+'，顺手弄懂'),element('p',c.analogy));
      const details = element('details'); details.append(element('summary','看原理、生活影响与误区'));
      for (const [title,text] of [['背后原理',c.why],['和你的关系',c.life],['类比边界与误区',c.limit]]) details.append(element('h4',title),element('p',text));
      more.append(details); related.append(more);
    }
    const article = node('latest-brief');
    if (article && words.some(w=>article.textContent.toLowerCase().includes(w))) {
      const hit = element('article',undefined,'search-hit'); hit.append(element('span','站内简报 · 历史内容','pill'),element('h3',article.querySelector('h1')?.textContent || '最新简报'));
      const p = [...article.querySelectorAll('p')].find(p=>words.some(w=>p.textContent.toLowerCase().includes(w)));
      hit.append(element('p',(p?.textContent || article.textContent).slice(0,200)+'…'));
      const articleLink = [...article.querySelectorAll('a')].find(a=>a.getAttribute('href')?.startsWith('briefs/'));
      if (articleLink) hit.append(link('阅读原文 →',articleLink.href)); hits.prepend(hit);
    }
    if (!hits.children.length) hits.append(element('p','站内暂未收录这个主题。可以换个关键词，或在 GPT 接通后联网搜索。','small'));
    if (!related.children.length) related.append(element('p','还没有匹配的基础知识卡。GPT 接通后，会根据你的问题补充相关概念。','small'));
    node('searchResults').hidden=false; node('resultHeading').textContent='关于「'+q+'」';
  }
  function showAnswer(data) {
    const answer = node('aiAnswer'); answer.replaceChildren(element('span','GPT 联网搜索与知识补充','pill'));
    const sourceMap = new Map();
    for (const part of data.parts || []) {
      if (typeof part.text !== 'string') continue;
      const text = element('div',undefined,'ai-text'); let cursor=0;
      const citations = (part.citations || []).filter(c=>safeURL(c.url)).sort((a,b)=>a.start-b.start);
      for (const c of citations) {
        sourceMap.set(c.url,c.title || c.url);
        if (!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<cursor||c.end<=c.start||c.end>part.text.length) continue;
        text.append(document.createTextNode(part.text.slice(cursor,c.start)),link(part.text.slice(c.start,c.end) || '查看来源',c.url)); cursor=c.end;
      }
      text.append(document.createTextNode(part.text.slice(cursor))); answer.append(text);
    }
    if (sourceMap.size) { const list=element('div',undefined,'search-sources'); list.append(element('h4','核对原文')); for (const [url,title] of sourceMap) list.append(link(title,url)); answer.append(list); }
    answer.append(element('p','AI 整理可能有误，请结合原文核对。知识解释用于学习。','small')); answer.hidden=false;
  }
  async function search(event) {
    event.preventDefault();
    const query = node('smartQuery').value.trim(); if (query.length<2 || query.length>300) { node('searchStatus').textContent='请输入 2–300 个字符。'; return; }
    controller?.abort(); const current=++generation;
    node('searchSubmit').disabled=false; node('cancelSearch').hidden=true; box.setAttribute('aria-busy','false');
    localSearch(query); node('aiAnswer').hidden=true; node('aiAnswer').replaceChildren();
    if (!node('useAI').checked || !endpoint) { node('searchStatus').textContent=endpoint?'已展示站内内容与相关知识。':'已展示站内内容与相关知识；GPT 尚未接通，当前没有联网搜索。'; return; }
    const code=node('searchCode').value.trim();
    if (!localPlus && !code) { node('searchStatus').textContent='站内结果已就绪。请填写搜索访问码，再获取 GPT 补充。'; node('searchCode').focus(); return; }
    controller=new AbortController(); const activeController=controller; const timer=setTimeout(()=>activeController.abort(),localPlus?130000:55000);
    node('searchStatus').textContent='正在联网查找来源，并整理相关知识，通常需要几十秒…'; node('searchSubmit').disabled=true; node('cancelSearch').hidden=false; box.setAttribute('aria-busy','true');
    try {
      const requestBody={query}; if(localPlus)requestBody.model=node('plusModel')?.value;
      const requestHeaders={'Content-Type':'application/json'}; if(!localPlus)requestHeaders['X-Search-Code']=code;
      const response=await fetch(endpoint,{method:'POST',headers:requestHeaders,body:JSON.stringify(requestBody),signal:controller.signal,credentials:localPlus?'same-origin':'omit'});
      const data=await response.json(); if(current!==generation)return;
      if (!response.ok) throw new Error(data.error || '搜索暂不可用，请稍后重试。');
      if (!Array.isArray(data.parts)||!data.parts.some(p=>typeof p.text==='string'&&p.text.trim())) throw new Error('本次没有生成回答，请重试。');
      showAnswer(data); node('searchStatus').textContent='已完成联网搜索与知识补充；下方同时保留站内资料。';
    } catch(error) { if(current===generation)node('searchStatus').textContent=error.name==='AbortError'?'搜索已取消或超时，站内结果仍可阅读。':error instanceof TypeError?'暂时无法连接 GPT 搜索服务，站内结果仍可阅读。':error.message; }
    finally {clearTimeout(timer);if(current===generation){node('searchSubmit').disabled=false;node('cancelSearch').hidden=true;box.setAttribute('aria-busy','false');}}
  }
  node('smartSearchForm').addEventListener('submit',search);
  node('cancelSearch').onclick=()=>controller?.abort();
  box.querySelectorAll('[data-query]').forEach(button=>button.onclick=()=>{node('smartQuery').value=button.dataset.query;node('smartSearchForm').requestSubmit();});
  node('openSearch').onclick=()=>{box.scrollIntoView({behavior:'smooth'});node('smartQuery').focus({preventScroll:true});};
  fetch('./search-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(config=>{
    if(config.mode==='local-plus' && location.hostname==='127.0.0.1') {localPlus=true;endpoint='/api/search';node('searchAccess').hidden=true;return;}
    if(config.mode==='local-launch') {
      node('aiState').textContent='GPT 使用你的 Plus · 在本机版中搜索';node('searchAccess').hidden=true;node('useAI').disabled=true;
      const launch=link('打开本机 Plus 版 ↗','http://127.0.0.1:18741/');launch.className='primary';launch.style.cssText='display:inline-block;padding:10px 14px;border-radius:8px;text-decoration:none';
      box.querySelector('.search-tools').append(launch);
      node('searchStatus').textContent='这里可搜索站内资料。使用 GPT 时先运行电脑里的“启动知金台”，再打开本机 Plus 版并登录。';return;
    }
    if (config.endpoint) { const url=new URL(config.endpoint); if(url.protocol!=='https:'||url.username||url.password)throw Error(); endpoint=url.href;node('useAI').disabled=false;node('useAI').checked=true;node('searchAccess').hidden=false;node('aiState').textContent='GPT 已配置 · 搜索时补齐知识';node('searchStatus').textContent='输入问题，站内资料会先展示，GPT 随后补充联网解读。'; }
  }).catch(()=>{node('aiState').textContent='GPT 暂未连接 · 站内搜索可用';});
})();
