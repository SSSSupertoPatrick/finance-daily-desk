import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const base=dirname(fileURLToPath(import.meta.url));
const profile=process.env.USERPROFILE;
if(!profile || process.platform!=='win32')throw Error('Windows user profile required');
const ps=s=>"'"+s.replaceAll("'","''")+"'";
const target=join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const start=join(base,'start-local.mjs');
const links=[
 {path:join(profile,'AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/知金台后台.lnk'),open:false},
 {path:join(profile,'Desktop/知金台.lnk'),open:true}
];
if(!process.argv.includes('--install')){console.log(JSON.stringify({target,node:process.execPath,start,links},null,2));process.exit(0);}
for(const link of links.filter(link=>!process.argv.includes('--desktop-only') || link.open)){
 const command='& '+ps(process.execPath)+' '+ps(start)+(link.open?' --open':'');
 const args='-NoProfile -NonInteractive -WindowStyle Hidden -Command "'+command+'"';
 const script="$s=New-Object -ComObject WScript.Shell; $l=$s.CreateShortcut("+ps(link.path)+"); $l.TargetPath="+ps(target)+"; $l.Arguments="+ps(args)+"; $l.WorkingDirectory="+ps(base)+"; $l.WindowStyle=7; $l.Description='知金台：启动后台守护并检查可用性'; $l.Save(); $v=$s.CreateShortcut("+ps(link.path)+"); if($v.Arguments -ne "+ps(args)+"){throw 'Shortcut verification failed'}";
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:'pipe'});
}
console.log(process.argv.includes('--desktop-only')?'已安装并核验桌面入口。':'已安装并核验登录自启与桌面入口。');
