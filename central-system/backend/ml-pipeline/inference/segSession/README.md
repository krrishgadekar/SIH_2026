# The persistent segmentation worker

Holds M2–M5 in memory and segments images on request, instead of the backend
spawning a fresh `segInfer.py` for every case.

```powershell
.\manageSegWorker.ps1 start     # ~17 s to load, then it polls
.\manageSegWorker.ps1 status    # PID, heartbeat age, queue depth, last 15 log lines
.\manageSegWorker.ps1 stop
```

Nothing else needs configuring. The backend uses the worker when its heartbeat
is fresh and spawns a per-case process when it is not, so starting and stopping
it is safe at any time — including mid-case.

## Why

Segmentation was the largest remaining cost in grading a case, and almost none
of it was segmentation. Measured on the development machine:

| | |
|---|---|
| `import torch` + 4 model loads | **17.1 s** |
| actual work per image | **2.0 s** |

A per-case process paid the 17 s every time. This pays it once.

End to end, a case went from about 33 s to about 21 s.

This is also the answer to the puzzle in backend plan §S.4 — that serving
M2–M4 from the MATLAB session gave *no* speed-up at all (22.5 s against 21.4 s
over 20 images). It moved forward passes costing under a second each, and left
the seventeen seconds of process start exactly where they were. With the
process start gone, the same comparison finally means something, and it now
goes the other way: see "Which backend" below.

## What it does not change

The numbers. The worker calls `segInfer.run_one`, which is the same function
the command line calls — every preprocessing step, threshold, optic-disc mask,
component filter and quadrant assignment is untouched. The counts the ICDR
thresholds were calibrated against cannot drift because of this worker. A real
case run through both paths produced identical lesion counts, an identical
rule-engine grade and an identical NV score.

## Which backend the worker uses

`SEG_INFERENCE_BACKEND` is read **in the worker's own environment, at start**,
not in the backend's. To change it, stop the worker, set the variable, start it
again — `status` prints which backend loaded.

Measured per case, through the worker:

| `SEG_INFERENCE_BACKEND` | segmentation | whole case |
|---|---|---|
| `matlab` (default, plan §S) | 5.3 s | 22.6 s |
| `python` | 2.6 s | 20.6 s |

Identical outputs either way; tensor parity was established at 2e-6..4e-5 in
`diagnostics/out/parity_v1_report.txt`. The MATLAB backend now **costs** about
2.7 s a case rather than saving anything, because each forward pass is a
separate round trip to another process. The default is left on `matlab`
because §S asks for it; the number above is what the choice is worth.

## Protocol

Deliberately the same file protocol as the MATLAB session next door, and the
Node side speaks to both through one client (`services/sessionClient.js`).

```
requests/<id>.json    {"image": "...", "outdir": "...", "minArea": 10}
responses/<id>.json   segInfer's result dict, or {"error": "..."}
```

Both sides write temp-then-rename, so neither observes a partial file. A
request the backend has given up on is deleted by the backend, so a worker that
starts later does not run a case nobody is waiting for.

`worker.heartbeat` is rewritten every 5 s from inside the poll loop, and only
once the models are loaded. That is what the backend and `segWorkerSupervisor`
read: a process that is alive but wedged keeps its PID and stops refreshing it.

## When it is down

`segWorkerSupervisor.js` restarts it, at most 3 times in 30 minutes, and raises
a `seg_worker_down` alert on `GET /admin/system-health` if that does not help.
The cap matters: a missing checkpoint is not fixed by restarting, and a
supervisor that keeps trying turns one broken install into an endless
process-spawn loop.

Grading is never blocked by this worker being down — only slowed. That is
exactly why it is supervised: the failure is otherwise silent, and shows up as
every case quietly taking 17 s longer, which nobody chases down for weeks.
