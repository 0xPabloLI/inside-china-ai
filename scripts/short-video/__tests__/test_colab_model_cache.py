"""#1537 — Colab model cache restore branches.

The cache logic lives in the Colab Python kernel, so these tests render the
template (same four placeholders `renderColabScript` fills) and import it from
a temp file. Nothing touches the network: the URL branch stops at the scheme
check, and install/fallback run against local fixture archives.
"""
import base64
import importlib.util
import json
import tarfile

from pathlib import Path

TEMPLATE = Path(__file__).resolve().parents[1] / "colab" / "cosyvoice3_tts_colab.py"


def load_kernel(tmp_path, url="", gdrive=""):
    script = (
        TEMPLATE.read_text()
        .replace("__MANIFEST_B64__", base64.b64encode(b"[]").decode())
        .replace("__REF_AUDIO_B64__", "")
        .replace("__MODEL_CACHE_URL__", json.dumps(url))
        .replace("__MODEL_CACHE_GDRIVE_ID__", json.dumps(gdrive))
    )
    path = tmp_path / "kernel.py"
    path.write_text(script)

    spec = importlib.util.spec_from_file_location(f"colab_kernel_{abs(hash(str(tmp_path)))}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.MODEL_DIR = str(tmp_path / "model")
    module.MODEL_CACHE_ARCHIVE = str(tmp_path / "cache.bin")
    module.MODEL_CACHE_EXTRACT = str(tmp_path / "extract")
    return module


def make_tar(tmp_path, entries):
    src = tmp_path / "src"
    src.mkdir()
    for name, body in entries.items():
        target = src / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body)
    archive = tmp_path / "cache.tar"
    roots = []
    for name in entries:
        root = name.split("/")[0]
        if root not in roots:
            roots.append(root)
    with tarfile.open(archive, "w") as tar:
        for root in roots:
            tar.add(src / root, arcname=root)
    return archive


def test_no_cache_source_keeps_the_huggingface_path(tmp_path):
    kernel = load_kernel(tmp_path)
    assert kernel.MODEL_CACHE_URL == ""
    assert kernel.model_ready() is False
    assert kernel.try_model_cache() is False


def test_non_http_url_is_a_miss_without_fetching(tmp_path):
    kernel = load_kernel(tmp_path, url="ftp://example.com/cache.tar")
    assert kernel.try_model_cache() is False


def test_installs_a_tar_whose_yaml_sits_in_a_subdirectory(tmp_path):
    archive = make_tar(tmp_path, {"nested/cosyvoice3.yaml": "model: {}\n"})
    kernel = load_kernel(tmp_path)

    kernel._install_model_cache(str(archive))

    assert kernel.model_ready() is True
    assert Path(kernel.MODEL_DIR).is_symlink()
    assert Path(kernel.MODEL_DIR).resolve() == (tmp_path / "extract" / "nested").resolve()


def test_rejects_an_archive_without_cosyvoice3_yaml(tmp_path):
    archive = make_tar(tmp_path, {"nested/weights.bin": "not a model"})
    kernel = load_kernel(tmp_path)

    try:
        kernel._install_model_cache(str(archive))
    except RuntimeError as exc:
        assert "no cosyvoice3.yaml" in str(exc)
    else:
        raise AssertionError("archive without cosyvoice3.yaml must not install")
