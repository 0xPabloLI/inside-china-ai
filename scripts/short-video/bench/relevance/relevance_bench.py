#!/usr/bin/env python3
"""#541 relevance bench — semi-automatic annotation, scoring and evaluation.

Bench-only (NOT production code, NOT imported by the pipeline). It answers the
three questions #541 asks about the image track, in the order a human can
actually answer them:

  1. `queue`  — build the accept/reject queue. Per image the focus detector
     (YuNet faces + saliency, #396) proposes a candidate subject box and the
     9:16 crop window production would use; per (image, claim) it shows the
     framing the VLM actually sees. The human only accepts or rejects.
     Proposals never become ground truth on their own: `labels.json` is only
     written by a human, and `eval` refuses to treat detector output as GT.
  2. `score`  — run the production analyzer (`vlm_analyzer.py`, same prompts,
     same parser, temperature 0.0) over every case, N repeats in one process
     plus M fresh-process repeats. Both cache layers are bypassed by
     construction: this calls the Python analyzer directly, never the Node
     cache, and reads frozen files instead of re-running a generator.
  3. `eval`   — confusion matrix at the production rule (first pass >= 60, or
     the #294 second pass `match` in the 40–59 band), FPR/FNR with Wilson
     intervals, repeat stability, and the tolerance sensitivity table whose
     threshold the user decides.

Landing decisions (why the shape is this and not another):
  - Repeats are NOT independent samples: production runs temperature 0.0, so a
    single-process repeat measures transport/decoding determinism, not model
    uncertainty. The `restart` arm exists because the one measured drift
    (relevance 50 -> 0 on `shanghai-skyline`, #334 comment) happened across
    processes.
  - `labelSource` on every GT label is `human`, `design` (pre-annotation
    scaffolding only, never reportable as accuracy) or `framing-auto` (the
    accepted subject box provably does not survive the crop — geometry, not a
    model vote).

Usage:
  BENCH_PY=~/.venvs/mlx-vlm/bin/python   # default; needs mlx-vlm + opencv + Pillow

  python relevance_bench.py queue  --assets-dir ../../assets --out ../../../.scratch/relevance-bench
  python relevance_bench.py score  --assets-dir ../../assets --out ../../../.scratch/relevance-bench \\
                                   --repeats 5 --restarts 2
  python relevance_bench.py eval   --out ../../../.scratch/relevance-bench --labels labels.json
"""

import argparse
import hashlib
import json
import os
import queue as queue_mod
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
DEFAULT_ASSETS_DIR = os.path.join(REPO_ROOT, "scripts", "short-video", "assets")
FOCUS_DETECTOR = os.path.join(REPO_ROOT, "scripts", "short-video", "lib", "focus_detector.py")
ANALYZER = os.path.join(REPO_ROOT, "scripts", "short-video", "lib", "vlm_analyzer.py")
VLM_MODEL_CONFIG = os.path.join(REPO_ROOT, "scripts", "short-video", "lib", "vlm-model.json")
DEFAULT_MANIFEST = os.path.join(HERE, "cases.json")

# Production rule, mirrored from lib/relevance-verdict.mjs. Read, never changed
# here: a bench that invents its own threshold measures nothing the pipeline does.
THRESHOLD = 60
BORDERLINE_FLOOR = 40
TARGET_ASPECT = 9 / 16

ANALYZE_TIMEOUT_S = float(os.environ.get("BENCH_ANALYZE_TIMEOUT", "900"))


# ─── small helpers ───


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path, payload):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp, path)


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_python(arg):
    candidate = os.path.expanduser(arg or "~/.venvs/mlx-vlm/bin/python")
    if os.path.isfile(candidate):
        return candidate
    if arg:
        raise SystemExit(f"bench python not found: {candidate}")
    return sys.executable


def load_manifest(path):
    manifest = read_json(path)
    asset_files = {key: spec["file"] for key, spec in manifest["assets"].items()}
    for case in manifest["cases"]:
        if case["asset"] not in asset_files:
            raise SystemExit(f"case {case['id']} references unknown asset {case['asset']}")
    return manifest


def asset_path(assets_dir, manifest, asset_key):
    return os.path.join(assets_dir, manifest["assets"][asset_key]["file"])


def require_assets(assets_dir, manifest):
    missing = [
        spec["file"]
        for spec in manifest["assets"].values()
        if not os.path.isfile(os.path.join(assets_dir, spec["file"]))
    ]
    if missing:
        raise SystemExit(
            "missing assets under "
            f"{assets_dir}: {', '.join(missing)}\n"
            "These files are gitignored (pexels-*), so a fresh worktree does not have them. "
            "Point --assets-dir at a checkout that does."
        )


# ─── crop geometry (mirror of lib/crop-decision.mjs) ───


def object_position(centroid, width, height):
    """Source-space focus -> CSS object-position ratio (#1040 contract).

    p = (f*r - 0.5) / (r - 1) on the cropped axis, 0.5 when no crop is needed.
    Kept identical to sourceFocusToObjectPosition() so the bench previews the
    crop production would actually use.
    """
    source_aspect = width / height

    def ratio_for(focus, r):
        return 0.5 if r <= 1.001 else max(0.0, min(1.0, (focus * r - 0.5) / (r - 1)))

    return {
        "x": round(ratio_for(centroid[0], source_aspect / TARGET_ASPECT), 3),
        "y": round(ratio_for(centroid[1], TARGET_ASPECT / source_aspect), 3),
    }


def crop_window(width, height, position_x):
    """Normalized [left, top, w, h] of the 9:16 window `simulate_crop` keeps.

    simulate_crop only crops the horizontal axis and keeps the full height, so
    a source that is already narrower than 9:16 is returned whole.
    """
    if width / height <= TARGET_ASPECT:
        return [0.0, 0.0, 1.0, 1.0]
    visible = TARGET_ASPECT / (width / height)
    left = (1.0 - visible) * max(0.0, min(1.0, position_x))
    return [round(left, 4), 0.0, round(visible, 4), 1.0]


def rect_inside_fraction(rect, window):
    """Fraction of `rect` (normalized) that survives the crop `window`."""
    left = max(rect[0], window[0])
    right = min(rect[0] + rect[2], window[0] + window[2])
    top = max(rect[1], window[1])
    bottom = min(rect[1] + rect[3], window[1] + window[3])
    if right <= left or bottom <= top:
        return 0.0
    return ((right - left) * (bottom - top)) / max(rect[2] * rect[3], 1e-9)


# ─── focus detection (one-shot IPC) ───


def run_focus(python, path):
    """One `analyze` request to focus_detector.py; returns its result dict."""
    request = json.dumps({"requestId": "bench", "action": "analyze", "path": path}) + "\n"
    proc = subprocess.run(
        [python, FOCUS_DETECTOR],
        input=request + json.dumps({"requestId": "bench", "action": "exit"}) + "\n",
        capture_output=True,
        text=True,
        timeout=180,
    )
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if payload.get("requestId") == "bench":
            return payload.get("result") or {}
    raise SystemExit(f"focus_detector returned no result for {path}:\n{proc.stderr[-800:]}")


def crop_preview(python, src, dest, position_x):
    """Write the 9:16 cover-crop production would feed the VLM."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    script = (
        "import sys\n"
        "from PIL import Image, ImageOps\n"
        "src, dest, px = sys.argv[1], sys.argv[2], float(sys.argv[3])\n"
        "img = ImageOps.exif_transpose(Image.open(src)).convert('RGB')\n"
        "w, h = img.size\n"
        "t = 9/16\n"
        "if w/h > t:\n"
        "    nw = int(h*t); left = int((w-nw)*max(0.0, min(1.0, px)))\n"
        "    img = img.crop((left, 0, left+nw, h))\n"
        "if img.width > 540:\n"
        "    img = img.resize((540, int(img.height*540/img.width)), Image.LANCZOS)\n"
        "img.save(dest, quality=88)\n"
    )
    subprocess.run([python, "-c", script, src, dest, str(position_x)], check=True)


def full_preview(python, src, dest, max_width=640):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    script = (
        "import sys\n"
        "from PIL import Image, ImageOps\n"
        "src, dest, mw = sys.argv[1], sys.argv[2], int(sys.argv[3])\n"
        "img = ImageOps.exif_transpose(Image.open(src)).convert('RGB')\n"
        "if img.width > mw:\n"
        "    img = img.resize((mw, int(img.height*mw/img.width)), Image.LANCZOS)\n"
        "img.save(dest, quality=86)\n"
    )
    subprocess.run([python, "-c", script, src, dest, str(max_width)], check=True)


# ─── analyzer IPC ───


class AnalyzerServer:
    """One `vlm_analyzer.py` process, line-delimited JSON both ways.

    stderr is drained in a thread and kept per request: with VLM_DEBUG_RAW=1 the
    analyzer emits the model's raw answer there (the JSON response carries only
    the parsed fields), which is the audit trail #541 asks every artifact to
    keep.
    """

    def __init__(self, python, engine="qwen3-vl-moe"):
        env = dict(os.environ)
        env["VLM_DEBUG_RAW"] = "1"
        env["PYTHONUNBUFFERED"] = "1"
        env.pop("VLM_CACHE_DISABLED", None)  # bench never touches the Node cache
        self.proc = subprocess.Popen(
            [python, ANALYZER, "--engine", engine],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=env,
        )
        self._lines = queue_mod.Queue()
        self._stderr = []
        self._lock = threading.Lock()
        threading.Thread(target=self._pump_stdout, daemon=True).start()
        threading.Thread(target=self._pump_stderr, daemon=True).start()
        self._request_id = 0

    def _pump_stdout(self):
        for line in self.proc.stdout:
            self._lines.put(line)
        self._lines.put(None)

    def _pump_stderr(self):
        for line in self.proc.stderr:
            with self._lock:
                self._stderr.append(line)

    def stderr_len(self):
        with self._lock:
            return len(self._stderr)

    def stderr_since(self, index):
        with self._lock:
            return list(self._stderr[index:])

    def request(self, payload, timeout=ANALYZE_TIMEOUT_S):
        self._request_id += 1
        payload = dict(payload)
        payload["requestId"] = f"bench-{self._request_id}"
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        try:
            line = self._lines.get(timeout=timeout)
        except queue_mod.Empty:
            self.close(force=True)
            raise RuntimeError(f"analyzer timed out after {timeout}s")
        if line is None:
            raise RuntimeError("analyzer process exited: " + "".join(self.stderr_since(0))[-1200:])
        return json.loads(line)

    def close(self, force=False):
        if self.proc.poll() is not None:
            return
        if not force:
            try:
                self.proc.stdin.write(json.dumps({"action": "exit"}) + "\n")
                self.proc.stdin.flush()
            except (BrokenPipeError, ValueError):
                pass
        try:
            self.proc.wait(timeout=60)
        except subprocess.TimeoutExpired:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                self.proc.kill()


def extract_raw(stderr_lines):
    """Pull the `[vlm_analyzer] raw response: ... [END RAW]` block, if any."""
    text = "".join(stderr_lines)
    marker = "[vlm_analyzer] raw response:\n"
    start = text.find(marker)
    if start < 0:
        return None
    body = text[start + len(marker):]
    end = body.find("[END RAW]")
    return (body if end < 0 else body[:end]).strip()


def score_one(server, case, path, crop_focus=None):
    """First pass, then the #294 second pass when the score is borderline.

    `crop_focus` reproduces the sourcing call shape: `asset-sourcer.mjs` passes
    `cropFocus` (the saliency hint) so the VLM judges the framing the viewer
    will see, not a centre crop. `b-roll/gate.mjs` omits it — that difference is
    recorded in the research doc, not silently averaged away here.
    """
    request = {"action": "analyze_semantics", "path": path, "claim": case["claim"]}
    if crop_focus:
        request["cropFocus"] = crop_focus
    before = server.stderr_len()
    started = time.monotonic()
    first = server.request(request)
    elapsed = time.monotonic() - started
    raw = extract_raw(server.stderr_since(before))
    record = {
        "firstPass": {
            "relevance": first.get("relevance"),
            "relevanceReason": first.get("relevanceReason"),
            "description": first.get("description"),
            "fit": first.get("fit"),
            "error": first.get("error"),
            "raw": raw,
            "ms": int(elapsed * 1000),
        },
        "secondPass": None,
    }
    score = record["firstPass"]["relevance"]
    if isinstance(score, (int, float)) and BORDERLINE_FLOOR <= score < THRESHOLD:
        before = server.stderr_len()
        started = time.monotonic()
        second = server.request({**request, "relevanceCheck": True})
        elapsed = time.monotonic() - started
        record["secondPass"] = {
            "verdict": second.get("subjectMatch"),
            "reason": second.get("subjectMatchReason"),
            "error": second.get("error"),
            "raw": extract_raw(server.stderr_since(before)),
            "ms": int(elapsed * 1000),
        }
    return record


# ─── eval math ───


def admitted(record):
    """Production admission rule (lib/relevance-verdict.mjs isRelevanceAdmitted)."""
    score = (record.get("firstPass") or {}).get("relevance")
    if not isinstance(score, (int, float)):
        return False
    if score >= THRESHOLD:
        return True
    second = record.get("secondPass") or {}
    return BORDERLINE_FLOOR <= score < THRESHOLD and second.get("verdict") == "match"


def wilson(k, n, z=1.96):
    """95% Wilson score interval for k/n."""
    if n == 0:
        return [None, None]
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / denom
    return [round(max(0.0, centre - half), 4), round(min(1.0, centre + half), 4)]


def rule_of_three(n):
    """Upper 95% bound when zero events were observed in n trials."""
    return round(3 / n, 4) if n else None


def confusion(pairs):
    """pairs: [(gt_usable, admitted, predictable)] -> counts + rates."""
    tp = fp = fn = tn = 0
    for gt_usable, is_admitted in pairs:
        if gt_usable and is_admitted:
            tp += 1
        elif gt_usable and not is_admitted:
            fn += 1
        elif not gt_usable and is_admitted:
            fp += 1
        else:
            tn += 1
    usable = tp + fn
    unusable = fp + tn
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "usable": usable,
        "unusable": unusable,
        "fpr": round(fp / unusable, 4) if unusable else None,
        "fprCi": wilson(fp, unusable),
        "fnr": round(fn / usable, 4) if usable else None,
        "fnrCi": wilson(fn, usable),
        "accuracy": round((tp + tn) / (usable + unusable), 4) if (usable + unusable) else None,
    }


def required_n(target, alpha=0.05, power=0.8):
    """Trials needed to separate `target` from 2x target (normal approximation).

    Two-sided alpha, one comparison. This is the sample size at which a
    tolerance below the duplicated rate is distinguishable from it at all.
    """
    z_alpha = 1.959964
    z_beta = 0.841621
    p1, p2 = target, min(2 * target, 0.999)
    pooled = (p1 + p2) / 2
    numerator = (z_alpha * (2 * pooled * (1 - pooled)) ** 0.5
                 + z_beta * (p1 * (1 - p1) + p2 * (1 - p2)) ** 0.5) ** 2
    return int(-(-numerator // ((p2 - p1) ** 2)))


def tolerance_table(n_usable, n_unusable):
    """What each candidate tolerance would demand at the current sample size."""
    rows = []
    for target in (0.05, 0.10, 0.15, 0.20):
        allowed_fp = int(target * n_unusable)
        allowed_fn = int(target * n_usable)
        rows.append(
            {
                "tolerance": target,
                "unusableErrorsAllowed": allowed_fp,
                "unusableObservedCeiling": round(allowed_fp / n_unusable, 4) if n_unusable else None,
                "unusableCiAtCeiling": wilson(allowed_fp, n_unusable),
                "usableErrorsAllowed": allowed_fn,
                "usableObservedCeiling": round(allowed_fn / n_usable, 4) if n_usable else None,
                "usableCiAtCeiling": wilson(allowed_fn, n_usable),
                "nForZeroEventBound": int(-(-3 // target)),
                "nToSeparateFromDouble": required_n(target),
            }
        )
    return rows


# ─── queue ───


def cmd_queue(args):
    manifest = load_manifest(args.manifest)
    require_assets(args.assets_dir, manifest)
    python = resolve_python(args.python)
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    images = [key for key, spec in manifest["assets"].items() if spec["type"] == "image"]
    assets = {}
    for key in images:
        path = asset_path(args.assets_dir, manifest, key)
        result = run_focus(python, path)
        frame = result.get("frame") or {}
        saliency = result.get("saliency") or {}
        width, height = frame.get("width"), frame.get("height")
        if not width or not height:
            raise SystemExit(f"focus detector returned no frame for {path}: {result}")
        position = object_position(saliency.get("centroid") or [0.5, 0.5], width, height)
        window = crop_window(width, height, position["x"])
        faces = result.get("protectedRegions") or []
        full_rel = os.path.join("previews", f"{key}-full.jpg")
        crop_rel = os.path.join("previews", f"{key}-crop.jpg")
        full_preview(python, path, os.path.join(out, full_rel))
        crop_preview(python, path, os.path.join(out, crop_rel), position["x"])
        in_crop = None
        if faces:
            main_face = max(faces, key=lambda f: f.get("confidence") or 0)
            in_crop = round(rect_inside_fraction(main_face["rect"], window), 3)
        assets[key] = {
            "file": manifest["assets"][key]["file"],
            "path": path,
            "sha256": file_sha256(path),
            "frame": {"width": width, "height": height},
            "status": result.get("status"),
            "candidate": {
                "kind": "saliency",
                "centroid": saliency.get("centroid"),
                "dispersion": saliency.get("dispersion"),
                "position": position,
                "window": window,
            },
            "faces": faces,
            "mainFaceInCropFraction": in_crop,
            "previews": {"full": full_rel, "crop": crop_rel},
        }

    claims = []
    for case in manifest["cases"]:
        asset = assets[case["asset"]]
        auto = None
        if asset["mainFaceInCropFraction"] == 0.0:
            auto = {
                "label": "unusable",
                "source": "framing-auto",
                "note": "检测到的主体框完全落在 9:16 裁切窗口外",
            }
        claims.append(
            {
                "caseId": case["id"],
                "asset": case["asset"],
                "claim": case["claim"],
                "design": case.get("design"),
                "autoLabel": auto,
            }
        )

    queue_path = os.path.join(out, "queue.json")
    write_json(
        queue_path,
        {
            "issue": "#541",
            "generatedAt": now_iso(),
            "manifest": os.path.abspath(args.manifest),
            "manifestSha256": file_sha256(args.manifest),
            "assetsDir": os.path.abspath(args.assets_dir),
            "assets": assets,
            "claims": claims,
        },
    )
    html_path = os.path.join(out, "queue.html")
    with open(html_path, "w", encoding="utf-8") as fh:
        fh.write(render_queue_html(assets, claims))
    print(f"queue: {queue_path}")
    print(f"page:  {html_path}")
    print(f"assets: {len(assets)}  claim pairs: {len(claims)}")


def render_queue_html(assets, claims):
    """Self-contained accept/reject page. 接受/拒绝/不确定, export -> labels.json."""
    def esc(value):
        return (
            str(value)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    focus_cards = []
    for key, asset in assets.items():
        win = asset["candidate"]["window"]
        face_marks = "".join(
            f'<div class="face" style="left:{f["rect"][0]*100:.2f}%;top:{f["rect"][1]*100:.2f}%;'
            f'width:{f["rect"][2]*100:.2f}%;height:{f["rect"][3]*100:.2f}%">'
            f'<span>face {f.get("confidence")}</span></div>'
            for f in asset["faces"]
        )
        focus_cards.append(
            f"""
<article class="card" data-kind="focus" data-key="{esc(key)}">
  <header><b>{esc(key)}</b> {esc(asset['file'])} · {asset['frame']['width']}×{asset['frame']['height']}
    · detector={esc(asset['status'])}</header>
  <div class="pair">
    <figure>
      <div class="frame">
        <img src="{esc(asset['previews']['full'])}" alt="">
        {face_marks}
        <div class="window" style="left:{win[0]*100:.2f}%;width:{win[2]*100:.2f}%"></div>
      </div>
      <figcaption>原图：黄框 = 生产 9:16 裁切窗口，红框 = YuNet 人脸（带置信度）</figcaption>
    </figure>
    <figure>
      <img class="crop" src="{esc(asset['previews']['crop'])}" alt="">
      <figcaption>VLM 实际看到的裁切（saliency 锚点 x={asset['candidate']['position']['x']}）</figcaption>
    </figure>
  </div>
  <p class="q">这张图的**主体**（观众会指认的那个东西）是否落在上面这个裁切窗口里？</p>
  <div class="btns" data-target="focus">
    <button data-v="accept">接受</button>
    <button data-v="reject">拒绝</button>
  </div>
</article>"""
        )

    claim_cards = []
    for item in claims:
        asset = assets[item["asset"]]
        auto = item["autoLabel"]
        auto_note = (
            f'<p class="auto">自动预判：{esc(auto["label"])}（{esc(auto["source"])}）— {esc(auto["note"])}</p>'
            if auto
            else ""
        )
        claim_cards.append(
            f"""
<article class="card" data-kind="claim" data-key="{esc(item['caseId'])}">
  <header><b>{esc(item['caseId'])}</b> · 素材 {esc(item['asset'])}（{esc(asset['file'])}）</header>
  <div class="pair">
    <figure><img class="crop" src="{esc(asset['previews']['crop'])}" alt=""></figure>
    <div class="text">
      <p class="label">场景旁白（voiceover）</p><p>{esc(item['claim']['voiceover'])}</p>
      <p class="label">想要的画面（assetNeed）</p><p>{esc(item['claim']['assetNeed'])}</p>
      <p class="label">设计稿标注（非 GT）</p>
      <p>{esc((item.get('design') or {}).get('label'))} · {esc((item.get('design') or {}).get('bucket'))}
         — {esc((item.get('design') or {}).get('note'))}</p>
      {auto_note}
    </div>
  </div>
  <p class="q">这张图**直接支撑**这句旁白吗？（看的是主体，不是它是否拍到融资这类抽象事件）</p>
  <div class="btns" data-target="claim">
    <button data-v="usable">可用</button>
    <button data-v="unusable">不可用</button>
    <button data-v="unsure">不确定</button>
  </div>
</article>"""
        )

    return f"""<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>#541 relevance 半自动标注队列</title>
<style>
 body{{font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;margin:0;background:#111;color:#eee}}
 main{{max-width:1040px;margin:0 auto;padding:24px 20px 120px}}
 h1{{font-size:18px}}
 h2{{font-size:15px;margin:32px 0 12px;color:#9ad}}
 .note{{color:#aaa;font-size:13px}}
 .card{{background:#1b1b1b;border:1px solid #2c2c2c;border-radius:10px;padding:14px;margin:14px 0}}
 .card.done{{border-color:#2e6b3f}}
 header{{font-size:13px;color:#bbb;margin-bottom:10px}}
 .pair{{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}}
 figure{{margin:0;flex:0 0 auto}}
 img{{max-width:340px;border-radius:6px;display:block}}
 img.crop{{max-height:420px;width:auto}}
 figcaption{{font-size:12px;color:#888;margin-top:6px;max-width:340px}}
 .frame{{position:relative;display:inline-block}}
 .window{{position:absolute;top:0;height:100%;border:2px solid #fc3;box-sizing:border-box}}
 .face{{position:absolute;border:2px solid #f55;box-sizing:border-box}}
 .face span{{position:absolute;top:-16px;left:0;font-size:10px;color:#f88;white-space:nowrap}}
 .text{{flex:1;min-width:260px}}
 .label{{color:#888;font-size:12px;margin:8px 0 0}}
 .text p{{margin:2px 0}}
 .q{{margin:12px 0 8px;font-weight:600}}
 .auto{{color:#fc3;font-size:13px}}
 .btns button{{background:#262626;color:#ddd;border:1px solid #3a3a3a;border-radius:8px;padding:8px 18px;margin-right:8px;cursor:pointer;font-size:14px}}
 .btns button.sel{{background:#2d5;color:#052;border-color:#2d5;font-weight:700}}
 .bar{{position:fixed;bottom:0;left:0;right:0;background:#181818;border-top:1px solid #2c2c2c;padding:10px 20px;display:flex;gap:16px;align-items:center;font-size:13px}}
 .bar button{{background:#2d5;color:#052;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}}
</style></head><body><main>
<h1>#541 · 图片 relevance 半自动标注队列</h1>
<p class="note">判断权在你手上：检测器只给候选（YuNet 人脸框 + saliency 裁切窗口）。接受/拒绝后点右下角导出，把 labels.json 放回 <code>scripts/short-video/bench/relevance/</code> 或 bench 输出目录。本页不联网、不写入文件。</p>
<h2>一 · 焦点框（每张图 1 个，共 {len(assets)} 个）</h2>
<p class="note">这一节决定「主体在哪、裁切是否丢掉主体」；拒绝会在评测里把该素材的焦点候选标为不可信，而不是伪造一个替代框。</p>
{''.join(focus_cards)}
<h2>二 · 图 × claim（每条 1 个，共 {len(claims)} 个）</h2>
<p class="note">这一节就是 relevance 的 GT。只看图能否直接支撑这句旁白；不确定就选不确定，评测会把它排除而不是当可用/不可用。</p>
{''.join(claim_cards)}
</main>
<div class="bar">
  <span id="progress">0 / {len(assets) + len(claims)}</span>
  <button id="export">导出 labels.json</button>
  <span class="note" id="hint"></span>
</div>
<script>
const STORAGE = "relevance-bench-541";
const state = JSON.parse(localStorage.getItem(STORAGE) || '{{"focus":{{}},"claims":{{}}}}');
function paint() {{
  document.querySelectorAll(".card").forEach(card => {{
    const kind = card.dataset.kind, key = card.dataset.key;
    const chosen = (kind === "focus" ? state.focus : state.claims)[key];
    card.classList.toggle("done", Boolean(chosen));
    card.querySelectorAll("button").forEach(b => b.classList.toggle("sel", chosen === b.dataset.v));
  }});
  const total = {len(assets) + len(claims)};
  const done = Object.keys(state.focus).length + Object.keys(state.claims).length;
  document.getElementById("progress").textContent = done + " / " + total;
}}
document.querySelectorAll(".btns").forEach(group => {{
  group.addEventListener("click", event => {{
    const button = event.target.closest("button");
    if (!button) return;
    const card = group.closest(".card");
    const bucket = card.dataset.kind === "focus" ? state.focus : state.claims;
    bucket[card.dataset.key] = button.dataset.v;
    localStorage.setItem(STORAGE, JSON.stringify(state));
    paint();
  }});
}});
document.getElementById("export").addEventListener("click", () => {{
  const payload = {{
    issue: "#541",
    annotator: "0xPabloLI",
    exportedAt: new Date().toISOString(),
    focus: Object.fromEntries(Object.entries(state.focus).map(([k, v]) => [k, {{ accepted: v === "accept" }}])),
    claims: Object.fromEntries(Object.entries(state.claims).map(([k, v]) => [k, {{ verdict: v }}]))
  }};
  const blob = new Blob([JSON.stringify(payload, null, 2)], {{ type: "application/json" }});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "labels.json";
  link.click();
  document.getElementById("hint").textContent = "已导出；放回 bench 目录后跑 eval";
}});
paint();
</script></body></html>
"""


# ─── score ───


def load_crop_focus(out):
    """asset -> cropFocus, read from `queue.json`.

    `score` must judge the same pixels the previews show and the sourcing path
    feeds the VLM; without the queue it falls back to the centre crop and says
    so in `meta.framing`.
    """
    path = os.path.join(out, "queue.json")
    if not os.path.isfile(path):
        return {}
    payload = read_json(path)
    return {
        key: asset["candidate"]["position"]
        for key, asset in (payload.get("assets") or {}).items()
        if (asset.get("candidate") or {}).get("position")
    }


def cmd_score(args):
    manifest = load_manifest(args.manifest)
    require_assets(args.assets_dir, manifest)
    python = resolve_python(args.python)
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    scores_path = os.path.join(out, "scores.json")

    cases = manifest["cases"][: args.max_cases] if args.max_cases else manifest["cases"]
    scores = read_json(scores_path) if (args.resume and os.path.isfile(scores_path)) else {}
    focus = load_crop_focus(out)
    meta = {
        "issue": "#541",
        "engine": args.engine,
        "analyzer": os.path.relpath(ANALYZER, REPO_ROOT),
        "analyzerSha256": file_sha256(ANALYZER),
        "modelConfigSha256": file_sha256(VLM_MODEL_CONFIG),
        "manifestSha256": file_sha256(args.manifest),
        "assetsDir": os.path.abspath(args.assets_dir),
        "threshold": THRESHOLD,
        "borderlineFloor": BORDERLINE_FLOOR,
        "temperature": 0.0,
        "framing": "saliency-crop" if focus else "center-crop",
        "repeats": args.repeats,
        "restarts": args.restarts,
        "startedAt": now_iso(),
    }
    scores["meta"] = meta
    write_json(scores_path, scores)

    def record(arm, repeat, case, payload):
        scores.setdefault("runs", []).append(
            {
                "arm": arm,
                "repeat": repeat,
                "caseId": case["id"],
                "asset": case["asset"],
                **payload,
            }
        )
        write_json(scores_path, scores)

    def done(arm, repeat, case_id):
        return any(
            run["arm"] == arm and run["repeat"] == repeat and run["caseId"] == case_id
            for run in scores.get("runs", [])
        )

    # intra: one process, N passes — measures decoding/transport determinism.
    # restart: N fresh processes, one pass each — measures the cross-process
    # drift the #334 comment actually observed (50 -> 0 on the same input).
    if any(not done("intra", repeat, case["id"]) for repeat in range(args.repeats) for case in cases):
        server = AnalyzerServer(python, args.engine)
        try:
            for repeat in range(args.repeats):
                for case in cases:
                    if done("intra", repeat, case["id"]):
                        continue
                    path = asset_path(args.assets_dir, manifest, case["asset"])
                    record("intra", repeat, case, score_one(server, case, path, focus.get(case["asset"])))
                    print(f"  intra#{repeat} {case['id']} ok", file=sys.stderr)
        finally:
            server.close()

    for repeat in range(args.restarts):
        pending = [case for case in cases if not done("restart", repeat, case["id"])]
        if not pending:
            continue
        server = AnalyzerServer(python, args.engine)
        try:
            for case in pending:
                path = asset_path(args.assets_dir, manifest, case["asset"])
                record("restart", repeat, case, score_one(server, case, path, focus.get(case["asset"])))
                print(f"  restart#{repeat} {case['id']} ok", file=sys.stderr)
        finally:
            server.close()
    scores["meta"]["finishedAt"] = now_iso()
    write_json(scores_path, scores)
    print(f"scores: {scores_path}  runs={len(scores.get('runs', []))}")


# ─── eval ───


def load_labels(path, manifest):
    """Return ({caseId: (usable|None, source)}, {asset: accepted}) — the GT."""
    if not path:
        labels = {
            "labels": [
                {"caseId": case["id"], "label": (case.get("design") or {}).get("label"), "source": "design"}
                for case in manifest["cases"]
            ],
            "focus": {},
        }
        return labels, True
    payload = read_json(path)
    claims = {}
    for case_id, value in (payload.get("claims") or {}).items():
        verdict = value.get("verdict")
        claims[case_id] = {
            "label": verdict if verdict in ("usable", "unusable") else None,
            "source": "human",
        }
    return {"labels": [
        {"caseId": case_id, **info} for case_id, info in claims.items()
    ], "focus": payload.get("focus") or {}}, False


def cmd_eval(args):
    manifest = load_manifest(args.manifest)
    out = os.path.abspath(args.out)
    scores = read_json(os.path.join(out, "scores.json"))
    labels_payload, using_design = load_labels(args.labels, manifest)
    label_map = {item["caseId"]: item for item in labels_payload["labels"]}
    focus = labels_payload["focus"]
    queue_path = os.path.join(out, "queue.json")
    queue_data = read_json(queue_path) if os.path.isfile(queue_path) else {"assets": {}}

    # framing-auto: a human-accepted subject box (or the detector's, when the
    # human accepted the candidate) that does not survive the crop is a
    # geometric fact, not a model vote — it may override a missing label.
    auto = {}
    for item in (queue_data.get("claims") or []):
        if item.get("autoLabel") and item["asset"] in focus and focus[item["asset"]].get("accepted") is True:
            auto[item["caseId"]] = item["autoLabel"]["label"]

    runs = {}
    for run in scores.get("runs", []):
        runs.setdefault((run["arm"], run["repeat"]), []).append(run)

    arms = {}
    for (arm, repeat), entries in sorted(runs.items()):
        pairs_first = []
        pairs_prod = []
        for entry in entries:
            info = label_map.get(entry["caseId"]) or {}
            label = info.get("label") or auto.get(entry["caseId"])
            if label is None:
                continue
            gt = label == "usable"
            score = (entry.get("firstPass") or {}).get("relevance")
            pairs_first.append((gt, isinstance(score, (int, float)) and score >= THRESHOLD))
            pairs_prod.append((gt, admitted(entry)))
        arms.setdefault(arm, []).append(
            {"repeat": repeat, "firstPassOnly": confusion(pairs_first), "production": confusion(pairs_prod)}
        )

    pooled = {}
    for arm, repeats in arms.items():
        pooled_first = [r["firstPassOnly"] for r in repeats]
        pooled_prod = [r["production"] for r in repeats]
        pooled[arm] = {
            "repeats": len(repeats),
            "production": {
                key: round(sum(r[key] for r in pooled_prod) / len(pooled_prod), 4)
                for key in ("tp", "fp", "fn", "tn", "fpr", "fnr", "accuracy")
                if all(isinstance(r[key], (int, float)) for r in pooled_prod)
            },
            "firstPassOnly": {
                key: round(sum(r[key] for r in pooled_first) / len(pooled_first), 4)
                for key in ("tp", "fp", "fn", "tn", "fpr", "fnr", "accuracy")
                if all(isinstance(r[key], (int, float)) for r in pooled_first)
            },
        }

    stability = stability_report(scores.get("runs", []))
    gt_counts = {"usable": 0, "unusable": 0, "unsure": 0, "missing": 0}
    for case in manifest["cases"]:
        info = label_map.get(case["id"]) or {}
        label = info.get("label") or auto.get(case["id"])
        if label in ("usable", "unusable"):
            gt_counts[label] += 1
        elif label is None and case["id"] in label_map:
            gt_counts["unsure"] += 1
        else:
            gt_counts["missing"] += 1

    metrics = {
        "meta": scores.get("meta", {}),
        "generatedAt": now_iso(),
        "usingDesignLabels": using_design,
        "labelsPath": os.path.abspath(args.labels) if args.labels else None,
        "gtCounts": gt_counts,
        "arms": arms,
        "pooled": pooled,
        "stability": stability,
        "tolerance": tolerance_table(gt_counts["usable"], gt_counts["unusable"]),
    }
    write_json(os.path.join(out, "metrics.json"), metrics)
    report = render_report(metrics, using_design)
    with open(os.path.join(out, "report.md"), "w", encoding="utf-8") as fh:
        fh.write(report)
    print(report)


def stability_report(runs):
    """Per-case score spread and threshold flips, split by arm."""
    by_case = {}
    for run in runs:
        key = (run["arm"], run["caseId"])
        score = (run.get("firstPass") or {}).get("relevance")
        by_case.setdefault(key, []).append(score)

    per_case = []
    for (arm, case_id), scores in sorted(by_case.items()):
        numeric = [s for s in scores if isinstance(s, (int, float))]
        distinct = sorted(set(numeric))
        flips = 0
        if len(numeric) > 1:
            flips = len({s >= THRESHOLD for s in numeric}) - 1
        per_case.append(
            {
                "arm": arm,
                "caseId": case_id,
                "n": len(scores),
                "distinct": distinct,
                "range": (distinct[-1] - distinct[0]) if len(distinct) > 1 else 0,
                "nullScores": len(scores) - len(numeric),
                "thresholdFlips": max(flips, 0),
            }
        )
    summary = {}
    for arm in sorted({item["arm"] for item in per_case}):
        items = [item for item in per_case if item["arm"] == arm]
        ranges = [item["range"] for item in items]
        summary[arm] = {
            "cases": len(items),
            "casesWithDrift": sum(1 for r in ranges if r > 0),
            "maxRange": max(ranges) if ranges else 0,
            "meanRange": round(sum(ranges) / len(ranges), 3) if ranges else 0,
            "casesFlippingThreshold": sum(1 for item in items if item["thresholdFlips"] > 0),
            "parseFailures": sum(item["nullScores"] for item in items),
            "perCase": items,
        }
    return summary


def render_report(metrics, using_design):
    meta = metrics["meta"]
    lines = ["# #541 relevance bench — 自动生成报告", ""]
    if using_design:
        lines += [
            "> ⚠️ **本次用 `design` 标签（脚手架自检），不是人工 GT。** 这里的一切准确率数字",
            "> 只能证明链路跑通，不得当作模型准确性结论。人工 accept/reject 后重跑 `eval --labels`。",
            "",
        ]
    lines += [
        f"- 生成时间：{metrics['generatedAt']}",
        f"- 引擎：`{meta.get('engine')}` · 温度 {meta.get('temperature')} · 阈值 {meta.get('threshold')}"
        f"（40–59 走 #294 二阶段）",
        f"- analyzer sha256：`{(meta.get('analyzerSha256') or '')[:12]}` · 模型配置 sha256："
        f"`{(meta.get('modelConfigSha256') or '')[:12]}`",
        f"- 重复：intra {meta.get('repeats')} 次/例 · restart {meta.get('restarts')} 次/例",
        f"- GT：可用 {metrics['gtCounts']['usable']} · 不可用 {metrics['gtCounts']['unusable']}"
        f" · 不确定 {metrics['gtCounts']['unsure']} · 缺失 {metrics['gtCounts']['missing']}",
        "",
        "## 混淆矩阵（生产规则：首轮 ≥60，或 40–59 二阶段 match）",
        "",
        "| 臂 | TP | FP | FN | TN | FPR | FNR | accuracy |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for arm, pooled in metrics["pooled"].items():
        row = pooled["production"]
        lines.append(
            f"| {arm} | {row['tp']:.2f} | {row['fp']:.2f} | {row['fn']:.2f} | {row['tn']:.2f} "
            f"| {row['fpr']:.3f} | {row['fnr']:.3f} | {row['accuracy']:.3f} |"
        )
    lines += ["", "逐重复明细：", "", "| 臂 | 重复 | FPR | FNR | accuracy |", "| --- | --- | --- | --- | --- |"]
    for arm, repeats in metrics["arms"].items():
        for entry in repeats:
            row = entry["production"]
            lines.append(
                f"| {arm} | #{entry['repeat']} | {row['fpr']} | {row['fnr']} | {row['accuracy']} |"
            )
    lines += ["", "## 稳定性（同输入多次打分）", ""]
    for arm, summary in metrics["stability"].items():
        lines.append(
            f"- **{arm}**：{summary['cases']} 例，漂移 {summary['casesWithDrift']} 例"
            f"（最大分差 {summary['maxRange']}，平均 {summary['meanRange']}）："
            f"跨 60 翻转 {summary['casesFlippingThreshold']} 例，解析失败 {summary['parseFailures']} 次"
        )
    drift_cases = [
        item
        for summary in metrics["stability"].values()
        for item in summary["perCase"]
        if item["range"] > 0 or item["nullScores"] > 0
    ]
    if drift_cases:
        lines += ["", "| 臂 | case | n | 分数集合 | 分差 | 跨 60 翻转 |", "| --- | --- | --- | --- | --- | --- |"]
        for item in drift_cases:
            lines.append(
                f"| {item['arm']} | {item['caseId']} | {item['n']} | {item['distinct']} "
                f"| {item['range']} | {item['thresholdFlips']} |"
            )
    lines += [
        "",
        "## 容忍度敏感性（当前 n 下每个目标值意味着什么）",
        "",
        "| 目标 | 不可用侧允许错误 | 该值下实测上限 | 95% CI | 可用侧允许错误 | 零错误所需 n | 区分 2×目标所需 n |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in metrics["tolerance"]:
        lines.append(
            f"| {row['tolerance']:.0%} | {row['unusableErrorsAllowed']} | {row['unusableObservedCeiling']} "
            f"| {row['unusableCiAtCeiling']} | {row['usableErrorsAllowed']} "
            f"| {row['nForZeroEventBound']} | {row['nToSeparateFromDouble']} |"
        )
    lines += [
        "",
        "> 容忍度是产品决策，本报告只给数据与选项：FPR 管「坏素材进成片」，FNR 管「好素材被浪费」。",
        "",
    ]
    return "\n".join(lines)


# ─── CLI ───


def main():
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--manifest", default=DEFAULT_MANIFEST)
    common.add_argument("--assets-dir", default=DEFAULT_ASSETS_DIR)
    common.add_argument(
        "--python",
        default=None,
        help="interpreter with mlx-vlm + opencv (default ~/.venvs/mlx-vlm/bin/python)",
    )
    parser = argparse.ArgumentParser(
        description="#541 relevance bench (semi-automatic annotation + scoring)"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    queue_parser = sub.add_parser(
        "queue", parents=[common], help="build the accept/reject queue (focus detector + crop previews)"
    )
    queue_parser.add_argument("--out", required=True)

    score_parser = sub.add_parser(
        "score", parents=[common], help="score every case with the production analyzer"
    )
    score_parser.add_argument("--out", required=True)
    score_parser.add_argument("--engine", default="qwen3-vl-moe")
    score_parser.add_argument("--repeats", type=int, default=5, help="in-process repeats per case")
    score_parser.add_argument("--restarts", type=int, default=2, help="fresh-process repeats per case")
    score_parser.add_argument("--max-cases", type=int, default=0, help="smoke: only the first N cases")
    score_parser.add_argument("--resume", action="store_true")

    eval_parser = sub.add_parser(
        "eval", parents=[common], help="confusion matrix, stability and tolerance sensitivity"
    )
    eval_parser.add_argument("--out", required=True)
    eval_parser.add_argument(
        "--labels", default=None, help="labels.json exported by the human; omitted = design labels"
    )

    args = parser.parse_args()
    {"queue": cmd_queue, "score": cmd_score, "eval": cmd_eval}[args.command](args)


if __name__ == "__main__":
    main()
