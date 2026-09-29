# KMR Studio first-start setup for Windows. Downloads everything into the "runtime" folder.
# Nothing is installed system-wide and no admin rights are needed.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rt = Join-Path $root 'runtime'
New-Item -ItemType Directory -Force -Path $rt | Out-Null

function Step($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Yellow }
function Fetch($url, $out) { Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -Headers @{ 'User-Agent' = 'LumenStudio' } }

# 1. Node.js (latest v22, portable)
if (-not (Test-Path "$rt\node\node.exe")) {
  Step 'Downloading Node.js'
  $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
  $ver = ($index | Where-Object { $_.version -like 'v22.*' } | Select-Object -First 1).version
  Fetch "https://nodejs.org/dist/$ver/node-$ver-win-x64.zip" "$rt\node.zip"
  Expand-Archive "$rt\node.zip" $rt -Force
  if (Test-Path "$rt\node") { Remove-Item "$rt\node" -Recurse -Force }
  Rename-Item "$rt\node-$ver-win-x64" 'node'
  Remove-Item "$rt\node.zip"
}

# 2. FFmpeg (video engine)
if (-not (Test-Path "$rt\ffmpeg\bin\ffmpeg.exe")) {
  Step 'Downloading FFmpeg (about 150 MB, please wait)'
  try { Fetch 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' "$rt\ffmpeg.zip" }
  catch { Fetch 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' "$rt\ffmpeg.zip" }
  if (Test-Path "$rt\ff_tmp") { Remove-Item "$rt\ff_tmp" -Recurse -Force }
  Expand-Archive "$rt\ffmpeg.zip" "$rt\ff_tmp" -Force
  $inner = Get-ChildItem "$rt\ff_tmp" -Directory | Select-Object -First 1
  if (Test-Path "$rt\ffmpeg") { Remove-Item "$rt\ffmpeg" -Recurse -Force }
  Move-Item $inner.FullName "$rt\ffmpeg"
  Remove-Item "$rt\ff_tmp" -Recurse -Force
  Remove-Item "$rt\ffmpeg.zip"
}

# 3. Python + edge-tts (voice engine)
if (-not (Test-Path "$rt\python\python.exe")) {
  Step 'Downloading Python for the voice engine'
  Fetch 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-embed-amd64.zip' "$rt\python.zip"
  Expand-Archive "$rt\python.zip" "$rt\python" -Force
  Remove-Item "$rt\python.zip"
  $pth = Get-ChildItem "$rt\python" -Filter 'python*._pth' | Select-Object -First 1
  (Get-Content $pth.FullName) -replace '^#\s*import site', 'import site' | Set-Content $pth.FullName
  Fetch 'https://bootstrap.pypa.io/get-pip.py' "$rt\get-pip.py"
  & "$rt\python\python.exe" "$rt\get-pip.py" --no-warn-script-location -q
  Remove-Item "$rt\get-pip.py"
}
Step 'Installing the voice engine'
& "$rt\python\python.exe" -m pip install -q --upgrade --no-warn-script-location edge-tts kaggle
if ($LASTEXITCODE -ne 0) { throw 'Voice engine install failed' }

Set-Content "$rt\ready.txt" (Get-Date).ToString()
Step 'Setup finished'
