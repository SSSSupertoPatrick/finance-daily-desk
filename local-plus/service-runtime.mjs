import { mkdir, access, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
export const serviceDirectory=fileURLToPath(new URL('./.service-state/',import.meta.url));
export const pausePath=join(serviceDirectory,'paused');
export async function setPaused(paused){await mkdir(serviceDirectory,{recursive:true});if(paused)await writeFile(pausePath,'Stopped by user\n');else await unlink(pausePath).catch(e=>{if(e.code!=='ENOENT')throw e;});}
export async function isPaused(){try{await access(pausePath);return true;}catch{return false;}}
export async function ready(origin='http://127.0.0.1:18741/'){try{const r=await fetch(origin,{signal:AbortSignal.timeout(1800)});return r.ok&&(await r.text()).includes('local-plus.js');}catch{return false;}}
export const delay=ms=>new Promise(r=>setTimeout(r,ms));
