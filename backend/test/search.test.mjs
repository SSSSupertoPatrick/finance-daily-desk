import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, extractAnswer } from '../lib/search.mjs';
const env={OPENAI_API_KEY:'test-only-placeholder',SEARCH_ACCESS_CODE:'test-access-code-12345'};
function request(body={query:'降息如何影响债券'},extra={}) {
  return new Request('https://backend.example/api/search',{method:'POST',headers:{origin:'https://ssssupertopatrick.github.io','content-type':'application/json','x-search-code':env.SEARCH_ACCESS_CODE,...extra},body:typeof body==='string'?body:JSON.stringify(body)});
}
const result={status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',role:'assistant',content:[{type:'output_text',text:'相关事实[来源]。\n【顺手补齐的知识】利率是钱的价格。',annotations:[{type:'url_citation',url:'https://www.pbc.gov.cn/',title:'央行',start_index:4,end_index:8}]}]}]};
test('missing configuration and authentication never call paid API',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error();};
  assert.equal((await createHandler({env:{},fetchImpl})(request())).status,503);
  const handler=createHandler({env,fetchImpl});
  assert.equal((await handler(request({}, {'x-search-code':'wrong'}))).status,401);
  assert.equal((await handler(request({}, {origin:'https://evil.example'}))).status,403);
  assert.equal(calls,0);
});
test('allows CORS preflight only for configured origin',async()=>{
  const r=await createHandler({env})(new Request('https://api.example/',{method:'OPTIONS',headers:{origin:'https://ssssupertopatrick.github.io'}}));
  assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'https://ssssupertopatrick.github.io');
});
test('invalid and oversized input are rejected before upstream',async()=>{
  let calls=0;const h=createHandler({env,fetchImpl:()=>{calls++;}});
  for(const input of ['bad json',{query:''},{query:'a'.repeat(301)},null,'x'.repeat(5000)])assert.equal((await h(request(input))).status,400);
  assert.equal(calls,0);
});
test('successful request requires search and returns only safe answer data',async()=>{
  const h=createHandler({env,fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    const payload=JSON.parse(options.body);assert.equal(payload.store,false);assert.equal(payload.tool_choice,'required');
    assert.equal(payload.tools[0].type,'web_search');assert.match(payload.instructions,/生活类比/);
    return Response.json(result);
  }});
  const r=await h(request());assert.equal(r.status,200);const text=await r.text();assert.ok(!text.includes(env.OPENAI_API_KEY));assert.match(text,/pbc.gov.cn/);
});
test('rejects incomplete and ungrounded answers',async()=>{
  for(const data of [{...result,status:'incomplete'},{...result,output:result.output.slice(1)},{status:'completed',output:[]}]) {
    const h=createHandler({env,fetchImpl:async()=>Response.json(data)});assert.equal((await h(request())).status,502);
  }
});
test('removes unsafe citation URLs; does not treat HTML as trusted markup',()=>{
  const p=extractAnswer({output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'<img onerror=alert(1)>',annotations:[{type:'url_citation',url:'javascript:alert(1)'}]}]}]});
  assert.equal(p[0].citations.length,0);assert.equal(typeof p[0].text,'string');
});
test('redacts upstream errors and handles timeout and rate limit',async()=>{
  for(const [fetchImpl,status] of [[async()=>new Response('secret diagnostic',{status:401}),502],[async()=>new Response('quota',{status:429}),429],[async()=>{throw new DOMException('details','TimeoutError');},504]]) {
    const r=await createHandler({env,fetchImpl})(request());assert.equal(r.status,status);assert.ok(!(await r.text()).includes('secret diagnostic'));
  }
});
test('per-instance throttle prevents excessive repeated calls',async()=>{
  let calls=0;const h=createHandler({env,fetchImpl:async()=>{calls++;return Response.json(result);}});
  for(let i=0;i<30;i++)assert.equal((await h(request())).status,200);
  assert.equal((await h(request())).status,429);assert.equal(calls,30);
});
