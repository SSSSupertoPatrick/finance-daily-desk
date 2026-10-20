import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { ChatGPTAuth, makeAuthorization, validateCallback } from '../auth.mjs';
import { protect, ProtectedStore } from '../store.mjs';
import { mkdtemp, readFile, unlink, rmdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readCompletedStream, searchPlus, plusError } from '../inference.mjs';
import { fetchConnected } from '../network.mjs';

const hostId = 'urn:uuid:11111111-1111-4111-8111-111111111111';
test('only pre-connection timeouts retry, never HTTP errors or ambiguous failures',async()=>{
  let attempts=0;const error=new TypeError('connection not established',{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});
  const response=await fetchConnected('https://example.invalid',{},async()=>{attempts++;if(attempts<3)throw error;return new Response('ok');});
  assert.equal(response.status,200);assert.equal(attempts,3);
  attempts=0;await fetchConnected('https://example.invalid',{},async()=>{attempts++;return new Response('failed',{status:502});});assert.equal(attempts,1);
  attempts=0;await assert.rejects(fetchConnected('https://example.invalid',{},async()=>{attempts++;throw new TypeError('interrupted');}));assert.equal(attempts,1);
});
const callback = 'http://127.0.0.1:18741/auth/callback';
test('official login uses PKCE, nonce, exact loopback URI and plan scopes', () => {
  const first = makeAuthorization({ hostId, callback, session: 'session' }); const url = new URL(first.url);
  assert.equal(url.origin, 'https://auth.openai.com');assert.equal(url.pathname, '/api/accounts/authorize');
  assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(url.searchParams.get('redirect_uri'), callback);assert.equal(url.searchParams.get('resource'), 'https://api.openai.com/v1');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');assert.ok(url.searchParams.get('scope').includes('chatgpt.tokens.use.direct'));
  const second = makeAuthorization({ hostId, callback, clientId: 'oaiapp_saved', session: 'session' });
  assert.notEqual(first.pending.state, second.pending.state);assert.notEqual(first.pending.nonce, second.pending.nonce);
  assert.equal(new URL(second.url).searchParams.has('agent_name_hint'), false);
});
test('invalid callback state, expired attempts, session and changed registrations are rejected', () => {
  const { pending } = makeAuthorization({ hostId, callback, clientId: 'oaiapp_saved', session: 'same', now: 100 });
  const params = new URLSearchParams({ code: 'test_code', state: pending.state });
  assert.equal(validateCallback(params, pending, 'same', 101).clientId, 'oaiapp_saved');
  assert.throws(() => validateCallback(params, pending, 'other', 101));
  assert.throws(() => validateCallback(params, pending, 'same', 700000));
  params.set('client_id','oaiapp_changed');assert.throws(() => validateCallback(params, pending, 'same', 101));
  params.set('state','wrong');assert.throws(() => validateCallback(params, pending, 'same', 101));
});
test('verified callback stores issued client and validates nonce, signature and scopes', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256'); const jwk = await exportJWK(publicKey);jwk.kid='test';
  let saved, tokenNonce;
  const store={load:async()=>null,save:async value=>{saved=value;}};
  const auth=new ChatGPTAuth({store,hostId,callback,fetchImpl:async(url,options)=>{
    const form=new URLSearchParams(options.body);assert.equal(form.get('client_id'),'oaiapp_issued');assert.equal(form.get('redirect_uri'),callback);assert.equal(form.has('client_secret'),false);
    const id=await new SignJWT({nonce:tokenNonce}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://auth.openai.com').setAudience('oaiapp_issued').setSubject('test_user').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    return Response.json({id_token:id,access_token:'fake-access',refresh_token:'fake-refresh',expires_in:3600,scope:'openid resource.invoke chatgpt.tokens.use.direct'});
  }});
  auth.jwks=createLocalJWKSet({keys:[jwk]});auth.begin('session');tokenNonce=auth.pending.nonce;
  await auth.complete(new URLSearchParams({state:auth.pending.state,code:'fake-code',client_id:'oaiapp_issued'}),'session');
  assert.equal(saved.client_id,'oaiapp_issued');assert.equal(saved.subject,'test_user');assert.equal(auth.pending,null);
  auth.account=null;auth.begin('session');tokenNonce='wrong';
  await assert.rejects(auth.complete(new URLSearchParams({state:auth.pending.state,code:'fake-code',client_id:'oaiapp_issued'}),'session'));
});
test('refreshes are serialized and rotating refresh token is saved together',async()=>{
  let calls=0,saved;
  const auth=new ChatGPTAuth({store:{save:async v=>{saved=v;}},hostId,callback,fetchImpl:async()=>{calls++;await new Promise(r=>setTimeout(r,5));return Response.json({access_token:'new-access',refresh_token:'rotated',expires_in:3600});}});
  auth.account={client_id:'oaiapp_test',access_token:'old',refresh_token:'old-refresh',expires_at:0,scopes:['chatgpt.tokens.use.direct']};
  const values=await Promise.all([auth.accessToken(),auth.accessToken()]);assert.deepEqual(values,['new-access','new-access']);assert.equal(calls,1);assert.equal(saved.refresh_token,'rotated');
});
test('model picker only uses account catalog, never a pinned API-only model',async()=>{
  const auth=new ChatGPTAuth({store:{},hostId,callback,fetchImpl:async()=>Response.json({models:[{slug:'available',display_name:'可用模型',visibility:'list'},{slug:'hidden',visibility:'hide'}]})});
  auth.account={access_token:'fake-access',expires_at:Date.now()+3600000};
  assert.deepEqual(await auth.listModels(),[{slug:'available',display_name:'可用模型'}]);
});
test('Windows credential encryption roundtrips without storing plaintext', {skip:process.platform!=='win32'}, async()=>{
  const plaintext='fake-test-credential-123'; const encrypted=await protect(plaintext);assert.ok(!encrypted.includes(plaintext));assert.equal(await protect(encrypted,true),plaintext);
});
test('protected file store saves and loads atomically with private Windows ACL', {skip:process.platform!=='win32'},async()=>{
  const root=new URL('../.user-state/',import.meta.url);await mkdir(root,{recursive:true});
  const directory=await mkdtemp(fileURLToPath(new URL('test-',root)));const store=new ProtectedStore(directory);
  try{await store.save({access_token:'fake-store-only'});assert.equal((await store.load()).access_token,'fake-store-only');assert.ok(!(await readFile(directory+'/account.dpapi','utf8')).includes('fake-store-only'));}
  finally{await unlink(directory+'/account.dpapi').catch(()=>{});await rmdir(directory);}
});
const completed={status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',role:'assistant',content:[{type:'output_text',text:'官方定义[1]',annotations:[{type:'url_citation',url:'https://www.sse.com.cn/',title:'交易所',start_index:4,end_index:7}]}]}]};
function streamResponse(events,chunkSize=17){const text=events.map(e=>`data: ${JSON.stringify(e)}\r\n\r\n`).join('');const bytes=new TextEncoder().encode(text);return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=chunkSize)c.enqueue(bytes.slice(i,i+chunkSize));c.close();}}));}
test('stream parser handles split UTF8/CRLF and only accepts terminal completed response',async()=>{
  assert.deepEqual(await readCompletedStream(streamResponse([{type:'response.completed',response:completed}],1)),completed);
  await assert.rejects(readCompletedStream(streamResponse([{type:'response.output_text.delta',delta:'partial'}])));
  await assert.rejects(readCompletedStream(streamResponse([{type:'response.incomplete'}])));
  await assert.rejects(readCompletedStream(streamResponse([{type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}])));
});
test('plan streams preserve completed items when final envelope omits output',async()=>{
  const events=completed.output.map((item,output_index)=>({type:'response.output_item.done',output_index,item}));
  events.push({type:'response.completed',response:{status:'completed',output:[]}});
  assert.deepEqual((await readCompletedStream(streamResponse(events))).output,completed.output);
  const deltas=[{type:'response.output_item.added',output_index:0,item:{type:'message',role:'assistant',content:[]}},
    {type:'response.output_text.delta',output_index:0,content_index:0,delta:'完整'},
    {type:'response.output_text.delta',output_index:0,content_index:0,delta:'回答'},
    {type:'response.output_text.annotation.added',output_index:0,content_index:0,annotation:{type:'url_citation',url:'https://www.sse.com.cn/'}},
    {type:'response.completed',response:{status:'completed',output:[]}}];
  const data=await readCompletedStream(streamResponse(deltas));assert.equal(data.output[0].content[0].text,'完整回答');assert.equal(data.output[0].content[0].annotations.length,1);
});
test('Plus request contract streams without unsupported fields and no API key fallback',async()=>{
  const result=await searchPlus({query:'ETF是什么',model:'account-model',token:'fake-oauth-access',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');const payload=JSON.parse(options.body);
    assert.equal(payload.store,false);assert.equal(payload.stream,true);assert.ok(Array.isArray(payload.input));assert.equal(payload.model,'account-model');
    for(const key of ['max_output_tokens','temperature','previous_response_id','conversation','metadata'])assert.equal(key in payload,false);
    assert.equal(options.headers.Authorization,'Bearer fake-oauth-access');assert.match(payload.instructions,/标准差/);
    return streamResponse([{type:'response.completed',response:completed}]);
  }});
  assert.equal(result.billing,'chatgpt-plan');assert.equal(result.parts[0].citations[0].url,'https://www.sse.com.cn/');
});
test('plan limits and auth failures give actionable messages, ungrounded output fails',async()=>{
  assert.match(plusError({code:'subscription_sharing_usage_limit_exceeded'}),/管理|设置/);
  assert.match(plusError({status:401}),/重新登录/);
  const bad=structuredClone(completed);bad.output[1].content[0].annotations=[];
  await assert.rejects(searchPlus({query:'测试问题',model:'account-model',token:'fake',fetchImpl:async()=>streamResponse([{type:'response.completed',response:bad}])}));
});
