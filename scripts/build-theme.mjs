import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const site=new URL('../site/',import.meta.url);
export function themePage(html,path){
  const kind=path==='index.html'?'home':path==='stocks.html'?'stocks':path==='primary.html'?'primary':'brief';
  const prefix=path.startsWith('briefs/')?'../':'';
  html=html.replace(/<link\b[^>]*href=["'][^"']*pop\.css(?:\?[^"']*)?["'][^>]*>/gi,'').replace(/<script\b[^>]*src=["'][^"']*pop\.js(?:\?[^"']*)?["'][^>]*><\/script>/gi,'');
  html=html.replace(/<body([^>]*)>/i,(_,attrs)=>{
    if(/\bclass=/.test(attrs))attrs=attrs.replace(/class=(["'])(.*?)\1/i,(_m,q,classes)=>'class='+q+[classes.replace(/\bpop-(?:home|stocks|primary|brief)\b/g,'').trim(),'pop-'+kind].filter(Boolean).join(' ')+q);
    else attrs+=' class="pop-'+kind+'"';
    return '<body'+attrs+'>';
  });
  return html.replace('</head>','<link rel="stylesheet" href="'+prefix+'pop.css?v=20261104"></head>').replace('</body>','<script src="'+prefix+'pop.js?v=20261104" defer></script></body>');
}
export async function themeAll(){
  const names=(await readdir(site)).filter(n=>n.endsWith('.html'));
  names.push(...(await readdir(new URL('briefs/',site))).filter(n=>n.endsWith('.html')).map(n=>'briefs/'+n));
  for(const name of names){const url=new URL(name,site);const html=await readFile(url,'utf8');const next=themePage(html,name);if(next!==html)await writeFile(url,next);}
  console.log('全站波普主题已同步：'+names.length+'个页面');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await themeAll();
