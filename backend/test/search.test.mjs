import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, extractAnswer, collectSources, renderAnswer } from '../lib/search.mjs';
const env={OPENAI_API_KEY:'test-only-placeholder',SEARCH_ACCESS_CODE:'test-access-code-12345'};
function request(body={query:'降息如何影响债券'},extra={}) {
  return new Request('https://backend.example/api/search',{method:'POST',headers:{origin:'https://ssssupertopatrick.github.io','content-type':'application/json','x-search-code':env.SEARCH_ACCESS_CODE,...extra},body:typeof body==='string'?body:JSON.stringify(body)});
}
const result={status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',role:'assistant',content:[{type:'output_text',text:'相关事实[来源]。\n【顺手补齐的知识】利率是钱的价格。',annotations:[{type:'url_citation',url:'https://www.pbc.gov.cn/',title:'央行',start_index:4,end_index:8}]}]}]};
const concept={name:'利率',sentence:'钱的价格。',analogy:'像租金。',mechanism:'供求影响。',relevance:'影响借款成本。',limits:'类比不包含信用风险。',sources:['S1']};
const answer={answer:'利率影响债券价格。',answer_sources:['S1'],concepts:[concept,{...concept,name:'债券'}],limitations:'其他条件不变时。',followups:['票息是什么？','久期是什么？']};
const synthesis=value=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const success=async(url,options)=>Response.json(JSON.parse(options.body).tools?result:synthesis(answer));
test('unsupported domain filtering retries only the rejected request and keeps source validation',async()=>{
  let calls=0;
  const h=createHandler({env,fetchImpl:async(url,options)=>{
    const p=JSON.parse(options.body);calls++;
    if(calls===1)return Response.json({error:{message:'filters not supported',param:'tools[0].filters'}},{status:400});
    if(calls===2){assert.equal(p.tools[0].filters,undefined);assert.match(p.instructions,/sse.com.cn/);}
    return success(url,options);
  }});
  assert.equal((await h(request())).status,200);assert.equal(calls,3);
});
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
  const signals=[];
  const h=createHandler({env,fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    const payload=JSON.parse(options.body);assert.equal(payload.store,false);signals.push(options.signal);
    if(payload.tools){
      assert.equal(payload.tool_choice,'required');assert.equal(payload.tools[0].type,'web_search');
      assert.ok(payload.tools[0].filters.allowed_domains.includes('sse.com.cn'));
      assert.deepEqual(payload.include,['web_search_call.action.sources']);
      return Response.json(result);
    }
    assert.equal(payload.text.format.strict,true);assert.match(payload.instructions,/生活类比/);
    assert.match(payload.instructions,/标准差/);assert.match(payload.instructions,/不能以场内/);
    return Response.json(synthesis(answer));
  }});
  const r=await h(request());assert.equal(r.status,200);const text=await r.text();assert.ok(!text.includes(env.OPENAI_API_KEY));assert.match(text,/pbc.gov.cn/);
  assert.equal(signals.length,2);assert.equal(signals[0],signals[1]);
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
test('distinguishes exhausted balance from temporary rate limits',async()=>{
  for(const [code,expected] of [['credit_balance_exhausted','API_BALANCE_EMPTY'],['insufficient_quota','API_QUOTA_EXCEEDED'],['rate_limit_exceeded','API_RATE_LIMITED']]){
    const h=createHandler({env,fetchImpl:async()=>Response.json({error:{code,message:'private provider message'}},{status:429})});
    const data=await (await h(request())).json();assert.equal(data.code,expected);assert.ok(!JSON.stringify(data).includes('private provider message'));
  }
});
test('per-instance throttle prevents excessive repeated calls',async()=>{
  let calls=0;const h=createHandler({env,fetchImpl:async(...args)=>{calls++;return success(...args);}});
  for(let i=0;i<30;i++)assert.equal((await h(request())).status,200);
  assert.equal((await h(request())).status,429);assert.equal(calls,60);
});
test('consulted sources recover missing inline annotations without inventing URLs',async()=>{
  const noAnnotations=structuredClone(result);
  noAnnotations.output[1].content[0].annotations=[];
  noAnnotations.output[0].action={sources:[{type:'url',url:'https://www.pbc.gov.cn/'}]};
  const h=createHandler({env,fetchImpl:async(_,options)=>Response.json(JSON.parse(options.body).tools?noAnnotations:synthesis(answer))});
  assert.equal((await h(request())).status,200);
  noAnnotations.output[0].action.sources=[];
  assert.equal((await h(request())).status,502);
});
test('rejects fabricated source IDs, incomplete cards and lookalike domains',()=>{
  const sources=collectSources(result);
  assert.throws(()=>renderAnswer({...answer,answer_sources:['S999']},sources));
  assert.throws(()=>renderAnswer({...answer,answer_sources:[]},sources));
  assert.throws(()=>renderAnswer({...answer,concepts:[concept]},sources));
  assert.throws(()=>renderAnswer({...answer,concepts:[{...concept,limits:''},concept]},sources));
  const bad=structuredClone(result);
  bad.output[1].content[0].annotations[0].url='https://pbc.gov.cn.evil.example/page';
  assert.deepEqual(collectSources(bad),[]);
});
test('rendered citation offsets match linked markers and all concept dimensions survive',()=>{
  const parts=renderAnswer(answer,collectSources(result));
  for(const part of parts)for(const citation of part.citations)assert.equal(part.text.slice(citation.start,citation.end),' [1]');
  assert.match(parts[1].text,/一句话/);assert.match(parts[1].text,/生活类比/);assert.match(parts[1].text,/边界与误区/);
});
test('second-stage failure is redacted and releases concurrency slots',async()=>{
  const h=createHandler({env,fetchImpl:async(_,options)=>JSON.parse(options.body).tools?Response.json(result):new Response('private diagnostics',{status:500})});
  for(let i=0;i<3;i++){
    const response=await h(request());assert.equal(response.status,502);assert.ok(!(await response.text()).includes('private'));
  }
});
