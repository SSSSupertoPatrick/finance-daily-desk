import net from 'node:net';
import { spawn } from 'node:child_process';
import { open, mkdir, writeFile, stat, truncate } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prepareStateDirectory } from './state-directory.mjs';
import { ready, delay, isPaused, serviceDirectory } from './service-runtime.mjs';
const directory=dirname(fileURLToPath(import.meta.url));
const lock=net.createServer(socket=>socket.end());
try{await new Promise((resolve,reject)=>{lock.once('error',reject);lock.listen(18742,'127.0.0.1',resolve);});}
catch(error){if(error.code==='EADDRINUSE')process.exit(0);throw error;}
const state=await prepareStateDirectory();
await mkdir(serviceDirectory,{recursive:true});
let child=null, failed=0, nextLaunch=0, failures=0;
while(!await isPaused()){
  const healthy=await ready();
  if(healthy){failed=0;failures=0;}
  else if(++failed>=3 && child && child.exitCode===null && !child.killed){
    child.kill();nextLaunch=Date.now()+2000;failed=0;
  }
  if(!healthy && (!child || child.exitCode!==null || child.killed) && Date.now()>=nextLaunch){
    const paths=['service.log','service-error.log'].map(n=>join(state.directory,n));
    for(const p of paths){if((await stat(p).catch(()=>({size:0}))).size>1048576)await truncate(p,0);}
    const logs=await Promise.all(paths.map(p=>open(p,'a')));
    try{child=spawn(process.execPath,[join(directory,'server.mjs')],{cwd:directory,windowsHide:true,stdio:['ignore',logs[0].fd,logs[1].fd]});
      child.on('error',()=>{child=null;nextLaunch=Date.now()+30000;});
      child.on('exit',()=>{nextLaunch=Date.now()+Math.min(30000,2000*2**Math.min(failures++,4));});
    }finally{await Promise.all(logs.map(f=>f.close()));}
    nextLaunch=Date.now()+30000;failed=0;
  }
  await writeFile(join(serviceDirectory,'monitor.json'),JSON.stringify({checkedAt:new Date().toISOString(),supervisorPid:process.pid,servicePid:child?.pid||null,healthy})).catch(()=>{});
  await delay(5000);
}
lock.close();
