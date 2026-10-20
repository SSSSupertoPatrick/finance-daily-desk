param([switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw '找不到 Node.js，请安装 Node.js 24 后重试。' }
$localService = Join-Path $PSScriptRoot 'server.mjs'
$localUrl = 'http://127.0.0.1:18741/'
function Test-LocalDesk {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $localUrl -TimeoutSec 2
    return ($response.StatusCode -eq 200 -and $response.Content.Contains('local-plus.js'))
  } catch { return $false }
}
if (Test-LocalDesk) {
  Write-Output "知金台已运行：$localUrl"
  if ($OpenBrowser) { Start-Process $localUrl }
  exit 0
}
$stateDirectory = & $nodePath (Join-Path $PSScriptRoot 'state-directory.mjs')
if ($LASTEXITCODE -ne 0 -or -not $stateDirectory) { throw '无法准备本机配置，请将上方报错发给我。' }
$stateDirectory = ([string]$stateDirectory).Trim()
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/jose/package.json'))) {
  & $nodePath (Join-Path $PSScriptRoot 'install.mjs')
  if ($LASTEXITCODE -ne 0) { throw '安装登录组件失败。' }
}
$errorLog = Join-Path $stateDirectory 'service-error.log'
$serviceProcess = Start-Process -FilePath $nodePath -ArgumentList @('"' + $localService + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDirectory 'service.log') -RedirectStandardError $errorLog -PassThru
$startupTimer = [Diagnostics.Stopwatch]::StartNew()
while ($startupTimer.Elapsed.TotalSeconds -lt 20) {
  if (Test-LocalDesk) {
    Write-Output "知金台已启动并确认可访问：$localUrl"
    if ($OpenBrowser) { Start-Process $localUrl }
    exit 0
  }
  $serviceProcess.Refresh()
  if ($serviceProcess.HasExited) {
    if (Test-Path -LiteralPath $errorLog) { Get-Content -LiteralPath $errorLog -Encoding UTF8 -Tail 12 | Write-Host }
    throw '知金台启动失败。请保留此窗口，将上方报错发给我。'
  }
  Start-Sleep -Milliseconds 250
}
throw '服务尚未就绪，没有打开网页。请将此窗口中的提示发给我。'
