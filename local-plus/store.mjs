import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

// DPAPI encrypts credentials; an owner-only ACL prevents other Windows users
// reading the file, including when an un-loaded profile needs machine scope.
// Secrets travel through stdin/stdout only, never command arguments or logs.
export async function protect(value, decrypt = false) {
  if (process.platform !== 'win32') throw Error('This credential store requires Windows.');
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); ${decrypt
    ? "$pieces=$v.Split(':',2); if($pieces.Length -ne 2){throw 'Invalid protected data'}; $scope=if($pieces[0] -eq 'user'){[Security.Cryptography.DataProtectionScope]::CurrentUser}elseif($pieces[0] -eq 'machine'){[Security.Cryptography.DataProtectionScope]::LocalMachine}else{throw 'Invalid scope'}; $out=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($pieces[1]),$null,$scope); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($out))"
    : "$b=[Text.Encoding]::UTF8.GetBytes($v); $scope='user'; try{$out=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)}catch{$scope='machine'; $out=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)}; [Console]::Out.Write($scope+':'+[Convert]::ToBase64String($out))"}`;
  return runProtected(script, value);
}
function runProtected(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; child.stdout.on('data', c => chunks.push(c));
    child.stderr.resume(); child.on('error', () => reject(Error('Credential protection unavailable.')));
    child.on('close', code => code === 0 ? resolve(Buffer.concat(chunks).toString('utf8')) : reject(Error('Credential protection failed.')));
    child.stdin.end(input);
  });
}
export async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true });
  const script = "$ErrorActionPreference='Stop'; $path=[Console]::In.ReadToEnd(); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=[System.Security.AccessControl.DirectorySecurity]::new(); $acl.SetAccessRuleProtection($true,$false); $rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule); [System.IO.Directory]::SetAccessControl($path,$acl)";
  await runProtected(script, directory);
}

export class ProtectedStore {
  constructor(directory) { this.directory = directory; }
  async load() {
    try { return JSON.parse(await protect(await readFile(join(this.directory, 'account.dpapi'), 'utf8'), true)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw Error('无法解密本机登录，请重新登录。'); }
  }
  async save(account) {
    await privateDirectory(this.directory);
    const temp = join(this.directory, 'account.dpapi.tmp');
    await writeFile(temp, await protect(JSON.stringify(account)), { mode: 0o600 });
    await rename(temp, join(this.directory, 'account.dpapi'));
  }
}
