# Authoring the bundled examples

`../rebuild-demo-presets.py` rebuilds the catalog, project JSON and both locales.
It does not need a browser or an image-analysis dependency. It uses the reviewed
tracks stored beside the seeds. Always qualify the generated projects in the
studio after changing landmarks, timing, masks or algorithm settings.

The still cartoon coordinates are hand-picked on the original 1448 × 1086 images.
The two WebP copies in `images/` were encoded from those PNGs with libwebp quality
92; they are embedded in the standalone project files.

## Offline video analysis (macOS)

The analysis tools are authoring utilities, **not an automatic-tracking feature
of the studio**. No frames are uploaded. Apple Vision detects facial landmarks
and the officer's body pose. OpenCV tracks manually reviewed robot anchors using
bidirectional pyramidal Lucas–Kanade optical flow. Unreliable flow falls back to
interpolation between the neighboring manual anchors.

```sh
swiftc app/scripts/analyze-demo-video.swift -o /tmp/morpher-track
python3 -m venv /tmp/morpher-cv
/tmp/morpher-cv/bin/pip install opencv-python-headless==5.0.0.93 numpy==2.5.2
mkdir -p /tmp/morpher-tracking/frames
```

Run the extractor separately for each pair:

| Input in `app/public/demo/videos/` | Output basename |
| --- | --- |
| `claire_singing.mp4` | `claire` |
| `anna_singing.mp4` | `anna` |
| `cop_body_walk.mp4` | `cop` |
| `karl2000_body_walk.mp4` | `karl` |

For example:

```sh
/tmp/morpher-track app/public/demo/videos/claire_singing.mp4 /tmp/morpher-tracking/claire.json
ffmpeg -i app/public/demo/videos/claire_singing.mp4 -fps_mode passthrough /tmp/morpher-tracking/frames/claire-%03d.jpg
```

The photo-to-video example also requires Vision landmarks on the still photo:

```sh
ffmpeg -i app/public/demo/images/claire.png -frames:v 1 -pix_fmt yuv420p /tmp/morpher-tracking/claire-still.mp4
/tmp/morpher-track /tmp/morpher-tracking/claire-still.mp4 /tmp/morpher-tracking/claire-still.json
/tmp/morpher-cv/bin/python app/scripts/prepare-demo-tracking.py /tmp/morpher-tracking
python3 app/scripts/rebuild-demo-presets.py
```

`tracking/robot-anchors.json` contains 12 manually checked reference frames, in
300 × 525 reference-image pixels, at frame indices 0, 12, …, 120, 123. Left/right
names retain their initial image-side identity even when legs cross. The other
tracking JSON files use normalized top-left image coordinates and **source-media
presentation time**, including any trim offset. Face clips contain 166 frames,
body clips 124, all at 24 fps. Each face has 44 landmarks; each body has 16.

Changing a detector, anchor or flow threshold requires checking the resulting
track overlays throughout the clips, followed by the actual studio render.
The robot is reflective and stylized: raw human-pose detections are not reliable
enough to author this example automatically. Hair, fingers, toes and body
silhouettes are not fully described by the current landmarks.
