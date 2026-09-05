#!/usr/bin/env python3
"""Fake ASR subprocess for asr-analyzer tests (stdlib only).

Controlled via env:
  FAKE_ASR_LOG          append START/END/CRASH lines to this file
  FAKE_ASR_DELAY_MS     per-request delay in ms (default 50)
  FAKE_ASR_SEGMENTS     JSON array of [{startMs, endMs, text}] to return
  FAKE_ASR_ERROR        if set, respond with this error string
  FAKE_ASR_NO_REQUEST_ID  if set, do NOT echo requestId
"""

import sys
import json
import os
import time
from os.path import exists

LOG = os.environ.get("FAKE_ASR_LOG", "")
DELAY_MS = int(os.environ.get("FAKE_ASR_DELAY_MS", "50"))
SLOW_FIRST = os.environ.get("FAKE_ASR_SLOW_FIRST", "") == "1"
# Cross-process "slow only once" marker: the first worker process (slow
# request → timeout → kill) creates it; respawned workers see it and go fast.
MARKER = os.environ.get("FAKE_ASR_MARKER", "")
HANDLED = 0
SEGMENTS = json.loads(os.environ.get("FAKE_ASR_SEGMENTS", "[]"))
ERROR = os.environ.get("FAKE_ASR_ERROR", "")
NO_REQUEST_ID = os.environ.get("FAKE_ASR_NO_REQUEST_ID", "") == "1"


def log(line):
    if LOG:
        with open(LOG, "a") as f:
            f.write(line + "\n")


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = json.loads(line)
    action = req.get("action", "")
    if action == "exit":
        sys.exit(0)

    rid = req.get("requestId", "")
    log(f"START:{int(time.time() * 1000)}:{rid}")
    if SLOW_FIRST:
        if MARKER and exists(MARKER):
            delay = 50
        else:
            delay = DELAY_MS
            if MARKER:
                with open(MARKER, "w") as f:
                    f.write("slow")
    else:
        delay = DELAY_MS
    time.sleep(delay / 1000.0)
    HANDLED += 1
    log(f"END:{int(time.time() * 1000)}:{rid}")

    if ERROR:
        resp = {"requestId": rid, "error": ERROR} if not NO_REQUEST_ID else {"error": ERROR}
    else:
        resp = {
            "segments": SEGMENTS,
            "language": req.get("languageHint") or "zh",
            "meta": {"backend": "fake", "model": "fake-base"},
            "error": None,
        }
        if not NO_REQUEST_ID and rid:
            resp["requestId"] = rid
    sys.stdout.write(json.dumps(resp) + "\n")
    sys.stdout.flush()

log("EOF")
