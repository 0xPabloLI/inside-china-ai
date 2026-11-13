# Focus detector model weights

| File | Purpose | Size | SHA256 |
| --- | --- | --- | --- |
| `face_detection_yunet_2023mar.onnx` | YuNet face detector for `lib/focus_detector.py` (#396) | 232,589 B | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` |

## Provenance

- Source: [opencv/opencv_zoo · models/face_detection_yunet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet), file `face_detection_yunet_2023mar.onnx`.
- License: MIT (opencv_zoo model zoo entry; the OpenCV YuNet detector itself is part of OpenCV, Apache-2.0).
- Storage: checked in as a plain file (232 KB). The repository has Git LFS disabled (#196), and a file this
  small does not need it.
- Verified: loaded by `cv2.FaceDetectorYN.create` and produced identical boxes on OpenCV 4.10.0
  (`~/.video-tts-env`) and OpenCV 5.0.0 (`~/.venvs/mlx-vlm`, the production interpreter). The 34-frame
  Haar-vs-YuNet evaluation behind this switch is archived in `.scratch/keyframe-bench/results/yunet_haar_compare.json`
  (#391).

## Override

`focus_detector.py` reads `FOCUS_FACE_MODEL` to point at a different ONNX file. `visual-analyzer.mjs` mirrors
the same default so the preflight probe checks the file the production path will actually load.
