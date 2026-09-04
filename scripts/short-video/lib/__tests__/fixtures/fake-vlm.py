#!/usr/bin/env python3
"""Fake VLM subprocess for visual-analyzer pool tests (stdlib only).

Controlled via env:
  FAKE_VLM_LOG         append START/END/CRASH/EXIT lines to this file
  FAKE_VLM_DELAY_MS    per-request delay in ms (default 100)
  FAKE_VLM_RANDOM_DELAY  if set, delay is random in [50, DELAY_MS]
  FAKE_VLM_NO_REQUEST_ID if set, do NOT echo requestId (legacy FIFO mode)
  FAKE_VLM_EXIT_AFTER  crash (exit 1) after handling N requests (0 = never)
"""

import sys
import json
import os
import time
import random

LOG = os.environ.get("FAKE_VLM_LOG", "")
DELAY_MS = int(os.environ.get("FAKE_VLM_DELAY_MS", "100"))
RANDOM_DELAY = os.environ.get("FAKE_VLM_RANDOM_DELAY") == "1"
NO_REQUEST_ID = os.environ.get("FAKE_VLM_NO_REQUEST_ID") == "1"
EXIT_AFTER = int(os.environ.get("FAKE_VLM_EXIT_AFTER", "0"))
HANDLED = 0


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
        log("EXIT")
        sys.exit(0)

    rid = req.get("requestId", "")
    log(f"START:{int(time.time() * 1000)}:{rid}:{req.get('path', '')}")
    delay = random.randint(50, DELAY_MS) if RANDOM_DELAY else DELAY_MS
    time.sleep(delay / 1000.0)
    log(f"END:{int(time.time() * 1000)}:{rid}")
    HANDLED += 1

    resp = {
        "description": f"fake analysis of {os.path.basename(req.get('path', ''))}",
        "subjects": ["fake"],
        "contentKind": "other",
        "fit": "cover",
        "criticalEdgeText": None,
        "reason": "fake",
        "relevance": None,
        "relevanceReason": None,
        "error": None,
    }
    if not NO_REQUEST_ID and rid:
        resp["requestId"] = rid
    sys.stdout.write(json.dumps(resp) + "\n")
    sys.stdout.flush()

    if EXIT_AFTER and HANDLED >= EXIT_AFTER:
        log("CRASH")
        sys.exit(1)

log("EOF")