# Read-only connection attribution. Run on the server reported by the network team.
$ErrorActionPreference = 'Stop'
$connections = @(Get-NetTCPConnection -ErrorAction Stop | Where-Object { $_.RemotePort -eq 27017 })
$processes = @(Get-CimInstance Win32_Process)
Write-Host "Machine: $env:COMPUTERNAME; captured: $(Get-Date -Format s)"
if (-not $connections.Count) { Write-Host 'No database TCP connections visible at this instant.' }
$connections | ForEach-Object {
    $connection = $_
    $owner = $processes | Where-Object { $_.ProcessId -eq $connection.OwningProcess } | Select-Object -First 1
    [pscustomobject]@{
        LocalAddress = $connection.LocalAddress
        RemoteAddress = $connection.RemoteAddress
        RemotePort = $connection.RemotePort
        State = $connection.State
        ProcessId = $connection.OwningProcess
        ParentProcessId = $owner.ParentProcessId
        ProcessName = $owner.Name
        ExecutablePath = $owner.ExecutablePath
    }
} | Format-Table -AutoSize
