import { spawn } from 'node:child_process';
import { access, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareStateDirectory } from './state-directory.mjs';
import { ready, delay, setPaused } from './service-runtime.mjs';
const directory=dirname(fileURLToPath(import.meta.url)),origin='http://127.0.0.1:18741/';
function showBrowser(url=origin){if(!process.argv.includes('--open'))return;const browser=spawn('explorer.exe',[url],{windowsHide:true,detached:true,stdio:'ignore'});browser.on('error',()=>console.log(url));browser.unref();}
async function start(){
  try{await access(join(directory,'node_modules/jose/package.json'));}catch{
    const install=spawn(process.execPath,[join(directory,'install.mjs')],{windowsHide:true,stdio:'inherit'});
    const code=await new Promise((r,j)=>{install.once('error',j);install.once('exit',r);});if(code!==0)throw Error('安装登录组件失败。');
  }
  await setPaused(false);
  const state=await prepareStateDirectory();
  const log=await open(join(state.directory,'supervisor.log'),'a');
  try{const child=spawn(process.execPath,[join(directory,'supervisor.mjs')],{cwd:directory,detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]});child.on('error',()=>{});child.unref();}finally{await log.close();}
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){if(await ready()){console.log('知金台已就绪，后台自动恢复已启用：'+origin);showBrowser();return;}await delay(500);}
  throw Error('本机暂未启动成功。可先访问网页版：https://ssssupertopatrick.github.io/finance-daily-desk/');
}
start().catch(error=>{console.error(error.message);showBrowser('https://ssssupertopatrick.github.io/finance-daily-desk/');process.exitCode=1;});
