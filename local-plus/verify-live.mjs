import { ChatGPTAuth } from './auth.mjs';
import { ProtectedStore } from './store.mjs';
import { readCompletedStream } from './inference.mjs';
import { setDefaultResultOrder } from 'node:dns';
import { fetchConnected } from './network.mjs';
import { prepareStateDirectory } from './state-directory.mjs';
setDefaultResultOrder('ipv4first');
const auth = new ChatGPTAuth({store:new ProtectedStore((await prepareStateDirectory()).directory)});
await auth.init();
const models=await auth.listModels();
const selected=models.find(m=>m.slug==='gpt-6.1-sol') || models[0];
const response=await fetchConnected('https://api.openai.com/v1/responses',{
  method:'POST',headers:{Authorization:`Bearer ${await auth.accessToken()}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),
  body:JSON.stringify({model:selected.slug,store:false,stream:true,input:[{role:'user',content:'请联网搜索上海证券交易所的ETF投资者教育原文，用200字解释ETF是什么，并引用来源。'}],instructions:'用中文回答金融学习问题。必须联网检索并引用官方原文。',tools:[{type:'web_search'}],tool_choice:'required',include:['web_search_call.action.sources']})
});
if(!response.ok){const d=await response.json().catch(()=>({}));console.log({status:response.status,code:d.error?.code});process.exitCode=1;}
else{
  const events={};const data=await readCompletedStream(response,event=>{events[event.type]=(events[event.type]||0)+1;});
  console.log({eventCounts:events});
  console.log(JSON.stringify({model:selected.slug,status:data.status,output:(data.output||[]).map(i=>({type:i.type,status:i.status,name:i.name,content:(i.content||[]).map(c=>({type:c.type,textLength:c.text?.length,annotations:(c.annotations||[]).map(a=>({type:a.type,domain:a.url?new URL(a.url).hostname:undefined}))})),actionType:i.action?.type,sourceCount:i.action?.sources?.length}))},null,2));
}
