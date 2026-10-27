import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
const site = fileURLToPath(new URL('../site/', import.meta.url));
const plain = s => s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export async function collectKnowledge() {
  const cards = [];
  for (const name of (await readdir(join(site,'briefs'))).filter(n=>/^\d{4}-\d{2}-\d{2}\.html$/.test(n)).sort()) {
    const html = await readFile(join(site,'briefs',name),'utf8');
    const heading = /<h2[^>]*>[^<]*降维卡[：:]\s*([^<]+)<\/h2>/i.exec(html);
    if (!heading) continue;
    const section = html.slice(heading.index + heading[0].length).split(/<hr\s*\/?\s*>/i)[0];
    const parts = [...section.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>[plain(m[1]),plain(m[2])]);
    const get = pattern => parts.filter(([h])=>pattern.test(h)).map(([,v])=>v).join(' ');
    const card = { id:'daily:'+name.slice(0,10), date:name.slice(0,10), title:plain(heading[1]), sub:'每日知识 · '+name.slice(0,10),
      short:get(/一句话/), analogy:get(/生活类比/), why:get(/原理/), life:get(/现实意义/), limit:get(/边界|误区/),
      source:'briefs/'+name };
    if (['short','analogy','why','life','limit'].some(k=>!card[k])) throw Error('知识卡结构不完整：'+name);
    cards.push(card);
  }
  return cards;
}
export async function knowledgeScript() {
  return 'window.dailyKnowledge = '+JSON.stringify(await collectKnowledge()).replace(/</g,'\\u003c')+';\n';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeFile(join(site,'daily-knowledge.js'),await knowledgeScript());
  console.log('每日知识卡已同步');
}
