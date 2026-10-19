param([switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw '找不到 Node.js，请安装 Node.js 24 后重试。' }
$localService = Join-Path $PSScriptRoot 'server.mjs'
$stateDirectory = Join-Path $PSScriptRoot '.local-state'
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
try {
  $response = Invoke-WebRequest -Uri 'http://127.0.0.1:18741/' -TimeoutSec 2
  if ($response.StatusCode -eq 200 -and $response.Content.Contains('本机 Plus')) { Write-Output '知金台已运行：http://127.0.0.1:18741/'; if ($OpenBrowser) { Start-Process 'http://127.0.0.1:18741/' }; exit 0 }
} catch { }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/jose/package.json'))) {
  & $nodePath (Join-Path $PSScriptRoot 'install.mjs')
  if ($LASTEXITCODE -ne 0) { throw '安装登录组件失败。' }
}
Start-Process -FilePath $nodePath -ArgumentList @('"' + $localService + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDirectory 'service.log') -RedirectStandardError (Join-Path $stateDirectory 'service-error.log') | Out-Null
Write-Output '知金台已启动：http://127.0.0.1:18741/'
if ($OpenBrowser) { Start-Process 'http://127.0.0.1:18741/' }
