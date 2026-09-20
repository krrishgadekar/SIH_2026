<#
.SYNOPSIS
  Start / stop / check the persistent segmentation worker. See README.md in
  this folder -- this script is the documented interface; do not launch
  runSegWorker.py by hand for real use.

.USAGE
  .\manageSegWorker.ps1 start
  .\manageSegWorker.ps1 stop
  .\manageSegWorker.ps1 status
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("start", "stop", "status")]
    [string]$Command
)

$ErrorActionPreference = "Stop"
$here      = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile   = Join-Path $here "worker.pid"
$logFile   = Join-Path $here "worker.log"
$stopFlag  = Join-Path $here "stop.flag"
$heartbeat = Join-Path $here "worker.heartbeat"
$pythonExe = if ($env:PYTHON_EXECUTABLE) { $env:PYTHON_EXECUTABLE } else { "python" }

function Get-RunningPid {
    if (-not (Test-Path $pidFile)) { return $null }
    $storedPid = Get-Content $pidFile -Raw -ErrorAction SilentlyContinue
    if (-not $storedPid) { return $null }
    $storedPid = $storedPid.Trim()
    $proc = Get-Process -Id $storedPid -ErrorAction SilentlyContinue
    # Name-checked like the MATLAB script's: a bare PID can have been recycled
    # by an unrelated process, and signalling THAT would be worse than
    # reporting the worker as down.
    if ($proc -and $proc.ProcessName -like "*python*") { return $proc }
    return $null
}

switch ($Command) {
    "start" {
        $existing = Get-RunningPid
        if ($existing) {
            Write-Output "Already running (PID $($existing.Id)). Use 'stop' first to restart."
            exit 0
        }
        if (Test-Path $stopFlag) { Remove-Item $stopFlag -Force }

        $script = Join-Path $here "runSegWorker.py"
        Write-Output "Starting segmentation worker (log: $logFile)..."
        # -u: unbuffered, so worker.log and the redirected stdout stay useful
        # while the process is alive rather than only after it exits.
        $proc = Start-Process -FilePath $pythonExe `
            -ArgumentList "-u `"$script`"" `
            -RedirectStandardOutput (Join-Path $here "worker.stdout.log") `
            -RedirectStandardError  (Join-Path $here "worker.stderr.log") `
            -PassThru -WindowStyle Hidden
        Set-Content -Path $pidFile -Value $proc.Id -NoNewline
        Write-Output "Started, PID $($proc.Id)."
        Write-Output "The four models take about 17s to load. Nothing should send"
        Write-Output "requests until status shows a heartbeat:"
        Write-Output "  .\manageSegWorker.ps1 status"
    }

    "stop" {
        $existing = Get-RunningPid
        if (-not $existing) {
            Write-Output "Not running (no live PID on file)."
            if (Test-Path $pidFile) { Remove-Item $pidFile -Force }
            exit 0
        }
        Write-Output "Signalling stop (PID $($existing.Id))..."
        New-Item -Path $stopFlag -ItemType File -Force | Out-Null

        $waited = 0
        while ((Get-Process -Id $existing.Id -ErrorAction SilentlyContinue) -and $waited -lt 15) {
            Start-Sleep -Seconds 1
            $waited += 1
        }
        if (Get-Process -Id $existing.Id -ErrorAction SilentlyContinue) {
            Write-Output "Did not exit within 15s of stop.flag -- forcing termination."
            Stop-Process -Id $existing.Id -Force
        } else {
            Write-Output "Stopped cleanly."
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        Remove-Item $stopFlag -Force -ErrorAction SilentlyContinue
        Remove-Item $heartbeat -Force -ErrorAction SilentlyContinue
    }

    "status" {
        $existing = Get-RunningPid
        if ($existing) {
            Write-Output "RUNNING -- PID $($existing.Id), started $($existing.StartTime)"
        } else {
            Write-Output "NOT RUNNING"
        }
        # The heartbeat, not the PID, is what the backend believes. A process
        # that is up but wedged keeps its PID and stops refreshing this.
        if (Test-Path $heartbeat) {
            $age = [int]((Get-Date) - (Get-Item $heartbeat).LastWriteTime).TotalSeconds
            $verdict = if ($age -lt 30) { "fresh -- the backend will use the worker" }
                       else { "STALE -- the backend will spawn per-case processes instead" }
            Write-Output "heartbeat: ${age}s old ($verdict)"
        } else {
            Write-Output "heartbeat: absent (still loading, or not running)"
        }
        if (Test-Path $logFile) {
            Write-Output ""
            Write-Output "-- last 15 lines of worker.log --"
            Get-Content $logFile -Tail 15
        }
        $reqDir = Join-Path $here "requests"
        $respDir = Join-Path $here "responses"
        $pending = if (Test-Path $reqDir) { (Get-ChildItem $reqDir -Filter "*.json" -ErrorAction SilentlyContinue).Count } else { 0 }
        $unclaimed = if (Test-Path $respDir) { (Get-ChildItem $respDir -Filter "*.json" -ErrorAction SilentlyContinue).Count } else { 0 }
        Write-Output ""
        Write-Output "pending requests: $pending   unclaimed responses: $unclaimed"
    }
}
