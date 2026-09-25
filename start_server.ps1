[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$backendDir = Join-Path $projectRoot 'backend'
$frontendDir = Join-Path $projectRoot 'frontend'
$runtimeDir = Join-Path $projectRoot '.runtime'
$backendPort = 8001
$frontendPort = 3001

function Get-RtgProcesses {
    $processes = @(Get-CimInstance Win32_Process)
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -in @($backendPort, $frontendPort) })
    $selected = @{}
    foreach ($process in $processes) {
        $command = [string]$process.CommandLine
        $isBackend = $process.Name -match '^python(w)?(\d+(\.\d+)?)?\.exe$' -and $command -match 'uvicorn\s+main:app'
        if (-not $isBackend -and $process.Name -match '^python') {
            $ancestor = $processes | Where-Object { $_.ProcessId -eq $process.ParentProcessId } | Select-Object -First 1
            if ($ancestor -and $ancestor.Name -match '^python' -and $ancestor.CommandLine -match 'uvicorn\s+main:app') {
                $isBackend = $true
            }
        }
        $isFrontend = $process.Name -eq 'node.exe' -and $command -match 'server\.cjs|vite' -and $command -notmatch '\sbuild(?:\s|$)'
        $ownsPort = @($listeners | Where-Object { $_.OwningProcess -eq $process.ProcessId }).Count -gt 0
        $fromProject = $command.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
        if ($ownsPort -and -not ($isBackend -or $isFrontend)) {
            throw "Port 8001 or 3001 is owned by an unrecognized process (PID $($process.ProcessId)). Stop that service explicitly before retrying."
        }
        if (($isBackend -or $isFrontend) -and ($ownsPort -or $fromProject)) {
            $selected[[int]$process.ProcessId] = $process
            # Older launchers used a reload supervisor; stop it as well as its worker.
            $parent = $processes | Where-Object { $_.ProcessId -eq $process.ParentProcessId } | Select-Object -First 1
            while ($parent -and $parent.Name -match '^python' -and $parent.CommandLine -match 'uvicorn\s+main:app') {
                $selected[[int]$parent.ProcessId] = $parent
                $parent = $processes | Where-Object { $_.ProcessId -eq $parent.ParentProcessId } | Select-Object -First 1
            }
        }
    }
    return @($selected.Values)
}

function Wait-LocalServer([string]$Url, $Process, [string]$LogFile) {
    $deadline = (Get-Date).AddSeconds(60)
    do {
        $Process.Refresh()
        if ($Process.HasExited) { throw "Server exited. See $LogFile" }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    throw "Server did not become ready within 60 seconds. See $LogFile"
}

try {
    Write-Host "Project folder: $projectRoot"
    if (Get-Command git -ErrorAction SilentlyContinue) {
        & git -C $projectRoot log -1 '--format=Local commit: %h %s'
    }
    Write-Host 'Uses local files only. No repository pull or dependency download is performed.'
    $previous = @(Get-RtgProcesses)
    if ($CheckOnly) {
        Write-Host "Existing project/port processes to replace: $($previous.Count)"
        $previous | Select-Object ProcessId, ParentProcessId, Name | Format-Table
        exit 0
    }
    $pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $pythonExe)) { $pythonExe = (Get-Command python.exe -ErrorAction Stop).Source }
    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $npmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath (Join-Path $frontendDir 'node_modules'))) {
        throw 'Frontend dependencies are missing. Supply the approved dependencies before starting.'
    }
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    Push-Location $backendDir
    try {
        & $pythonExe (Join-Path $backendDir 'scripts\check_database_config.py')
        if ($LASTEXITCODE -ne 0) { throw 'Database configuration validation failed.' }
    } finally { Pop-Location }
    # Build before replacing a working instance; npm is forced offline.
    $env:npm_config_offline = 'true'
    Push-Location $frontendDir
    try {
        & $npmExe run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed; existing servers were not stopped.' }
    } finally { Pop-Location }
    foreach ($process in @(Get-RtgProcesses | Sort-Object CreationDate)) {
        if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) {
            Write-Host "Stopping previous server tree: PID $($process.ProcessId)"
            & taskkill.exe /PID $process.ProcessId /T /F | Out-Host
            if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) {
                throw 'Could not stop the previous server. Retry with the service account or administrator privileges.'
            }
        }
    }
    $remaining = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -in @($backendPort, $frontendPort) })
    if ($remaining.Count) { throw 'A previous listener is still active. New servers were not started.' }
    # Clear only backend bytecode, with each deletion constrained to this project.
    $backendFullPath = [IO.Path]::GetFullPath($backendDir).TrimEnd('\') + '\'
    Get-ChildItem -LiteralPath $backendDir -Directory -Filter '__pycache__' -Recurse | ForEach-Object {
        $cachePath = [IO.Path]::GetFullPath($_.FullName)
        if (-not $cachePath.StartsWith($backendFullPath, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Refusing to clear a cache outside the backend directory.'
        }
        Remove-Item -LiteralPath $cachePath -Recurse -Force
    }
    $backendError = Join-Path $runtimeDir 'backend.err.log'
    $frontendError = Join-Path $runtimeDir 'frontend.err.log'
    $backendProcess = Start-Process -FilePath $pythonExe -ArgumentList @('-B', '-m', 'uvicorn', 'main:app', '--app-dir', "`"$backendDir`"", '--host', '0.0.0.0', '--port', "$backendPort") -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'backend.out.log') -RedirectStandardError $backendError
    Wait-LocalServer "http://127.0.0.1:$backendPort/" $backendProcess $backendError
    $env:PORT = "$frontendPort"
    $frontendProcess = Start-Process -FilePath $nodeExe -ArgumentList "`"$(Join-Path $frontendDir 'server.cjs')`"" -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'frontend.out.log') -RedirectStandardError $frontendError
    Wait-LocalServer "http://127.0.0.1:$frontendPort/" $frontendProcess $frontendError
    Write-Host "Ready: http://localhost:$frontendPort (LAN: http://<server-LAN-IP>:$frontendPort)"
    Write-Host "Backend PID: $($backendProcess.Id); frontend PID: $($frontendProcess.Id)"
    Write-Host "Logs: $runtimeDir"
    Write-Host 'Run start_server.bat again to refresh both servers from this folder.'
    Start-Process "http://127.0.0.1:$frontendPort/"
} catch {
    foreach ($started in @($frontendProcess, $backendProcess)) {
        if ($started -and -not $started.HasExited) { Stop-Process -Id $started.Id -Force -ErrorAction SilentlyContinue }
    }
    Write-Error $_ -ErrorAction Continue
    exit 1
}
