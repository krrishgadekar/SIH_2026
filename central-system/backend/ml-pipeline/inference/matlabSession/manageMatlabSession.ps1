<#
.SYNOPSIS
  Start / stop / check the persistent MATLAB inference session (Part 2 of
  the MATLAB-backend latency fix). See README.md in this folder for the
  full operational picture -- this script is the documented interface to
  it; do not launch runMatlabInferenceSession.m by hand for real use.

.USAGE
  .\manageMatlabSession.ps1 start
  .\manageMatlabSession.ps1 stop
  .\manageMatlabSession.ps1 status
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("start", "stop", "status")]
    [string]$Command
)

$ErrorActionPreference = "Stop"
$here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile  = Join-Path $here "session.pid"
$logFile  = Join-Path $here "session.log"
$stopFlag = Join-Path $here "stop.flag"
$matlabExe = if ($env:MATLAB_EXECUTABLE) { $env:MATLAB_EXECUTABLE } else { "matlab" }

function Get-RunningPid {
    if (-not (Test-Path $pidFile)) { return $null }
    $storedPid = Get-Content $pidFile -Raw -ErrorAction SilentlyContinue
    if (-not $storedPid) { return $null }
    $storedPid = $storedPid.Trim()
    $proc = Get-Process -Id $storedPid -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -like "*MATLAB*") { return $proc }
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

        # addpath, not cd: runMatlabInferenceSession.m finds its own directory
        # via mfilename('fullpath') and never relies on pwd. (cd() turned out
        # not to be the actual problem below -- see the ArgumentList note --
        # but there is no reason for this process to change MATLAB's current
        # folder at all, so it doesn't.)
        $expr = "addpath('$($here.Replace('\','/'))'); runMatlabInferenceSession()"
        Write-Output "Starting persistent MATLAB session (log: $logFile)..."
        # -batch, not -r: -batch runs non-interactively, no splash/desktop, and
        # exits the process when the function returns (i.e. on stop.flag) --
        # exactly the lifecycle this script wants to track by PID.
        #
        # ArgumentList MUST be a single quoted string here, NOT an array
        # (`@("-batch", $expr)`). The array form silently truncates $expr at
        # its first statement separator -- reproduced directly: `disp('a');
        # disp('b')` via the array form printed only "a"; the exact same
        # expression via `"-batch `"$expr`""` as one string printed both. This
        # cost real debugging time (the process looked like it was crashing --
        # empty stdout/stderr, exit code 0 -- when it was actually running a
        # truncated one-statement command every time). Do not change this back
        # to the array form.
        $argString = "-batch `"$expr`""
        $proc = Start-Process -FilePath $matlabExe `
            -ArgumentList $argString `
            -RedirectStandardOutput (Join-Path $here "session.stdout.log") `
            -RedirectStandardError  (Join-Path $here "session.stderr.log") `
            -PassThru -WindowStyle Hidden
        Set-Content -Path $pidFile -Value $proc.Id -NoNewline
        Write-Output "Started, PID $($proc.Id)."
        Write-Output "Networks take a few seconds to load -- check status/log before sending requests:"
        Write-Output "  .\manageMatlabSession.ps1 status"
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
    }

    "status" {
        $existing = Get-RunningPid
        if ($existing) {
            Write-Output "RUNNING -- PID $($existing.Id), started $($existing.StartTime)"
        } else {
            Write-Output "NOT RUNNING"
        }
        if (Test-Path $logFile) {
            Write-Output ""
            Write-Output "-- last 15 lines of session.log --"
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
