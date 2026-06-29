# 润六尺供需平台 — 每日巡检脚本
param([switch]$ReportOnly)

$Date = Get-Date -Format "yyyy-MM-dd"
$Time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "== Daily Inspection - $Time =="

# --- Paths with Chinese chars ---
$webRoot = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("RTpc572R6aG156uvXGFwcA=="))
$webRootDir = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("RTpc572R6aG156uv"))

# --- 1. Mini Program Git ---
$MiniChanges = @{ hasChanges = $false; modifiedCount = 0; untrackedCount = 0 }
$MiniGitDir = "E:\rlcgxpt"
if (Test-Path (Join-Path $MiniGitDir ".git")) {
  Push-Location $MiniGitDir
  $status = git status --porcelain 2>$null
  Pop-Location
  if ($status) {
    $mc = 0; $uc = 0
    foreach ($line in $status) {
      if ($line -match "^\?\?") { $uc++ } else { $mc++ }
    }
    $MiniChanges.hasChanges = $true
    $MiniChanges.modifiedCount = $mc
    $MiniChanges.untrackedCount = $uc
  }
}

# --- 2. Web Git ---
$WebChanges = @{ hasChanges = $false }
if (Test-Path (Join-Path $webRootDir ".git")) {
  Push-Location $webRootDir
  $webStatus = git status --porcelain 2>$null
  Pop-Location
  if ($webStatus) { $WebChanges.hasChanges = $true }
}

# --- 3. File check ---
$ServerMtime = (Get-Item (Join-Path $webRoot "server.js") -ErrorAction SilentlyContinue).LastWriteTime
$HtmlMtime = (Get-Item (Join-Path $webRoot "public\index.html") -ErrorAction SilentlyContinue).LastWriteTime
$DbFile = Join-Path $webRoot "data\db.json"
$DbMtime = (Get-Item $DbFile -ErrorAction SilentlyContinue).LastWriteTime
$DbSizeBytes = (Get-Item $DbFile -ErrorAction SilentlyContinue).Length
$DbSizeMB = if ($DbSizeBytes) { [math]::Round($DbSizeBytes / 1MB, 2) } else { 0 }

# --- 4. Site reachability ---
$SiteUp = $false; $SiteRT = -1; $ApiMeUp = $false
try {
  $req = [System.Net.WebRequest]::Create("https://rlcgxpt.com")
  $req.Method = "GET"; $req.Timeout = 10000
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $resp = $req.GetResponse(); $sw.Stop()
  $SiteUp = $resp.StatusCode -eq 200
  $SiteRT = $sw.ElapsedMilliseconds
  $resp.Close()
} catch { }
try {
  $req2 = [System.Net.WebRequest]::Create("https://rlcgxpt.com/api/me")
  $req2.Timeout = 10000
  $resp2 = $req2.GetResponse()
  $ApiMeUp = $resp2.StatusCode -eq 200
  $resp2.Close()
} catch { }

# --- 5. Security scan ---
$SecurityIssues = @()
$cloudApi = "E:\rlcgxpt\services\cloud-api.js"
if (Test-Path $cloudApi) {
  $content = Get-Content $cloudApi -Raw
  if ($content -match "LEGACY_COMPAT_TOKEN = ") {
    $SecurityIssues += "cloud-api.js: LEGACY_COMPAT_TOKEN hardcoded in source"
  }
}

# --- 6. Node process count ---
$NodeProcesses = (Get-Process node -ErrorAction SilentlyContinue).Count

# --- Output JSON ---
@{ date = $Date; time = $Time
  miniProgram = @{ hasUncommittedChanges = $MiniChanges.hasChanges; modifiedFiles = $MiniChanges.modifiedCount; untrackedFiles = $MiniChanges.untrackedCount }
  webServer = @{ hasUncommittedChanges = $WebChanges.hasChanges; serverLastModified = if ($ServerMtime) { $ServerMtime.ToString("yyyy-MM-dd HH:mm:ss") } else { "N/A" }; htmlLastModified = if ($HtmlMtime) { $HtmlMtime.ToString("yyyy-MM-dd HH:mm:ss") } else { "N/A" }; dataFileSizeMB = $DbSizeMB }
  site = @{ reachable = $SiteUp; responseTimeMs = $SiteRT; apiResponding = $ApiMeUp }
  security = @{ issues = $SecurityIssues }
  nodeProcessCount = $NodeProcesses
} | ConvertTo-Json -Depth 3