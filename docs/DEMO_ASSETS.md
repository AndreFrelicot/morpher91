# Demo media and artwork

The application includes 14 source assets and 22 teaching presets (46.36 MiB under `app/public/demo/`). Presets demonstrate features and are automatically generated; they are not a guarantee of artistic quality.

## Provenance

André Frélicot supplied the media and reported the following generation sources on 6 September 2026:

- Still images: generated with ChatGPT. The exact image model and generation dates were not recorded.
- Videos: generated through fal.ai. The owner identified the exact model endpoints:
  - Singing clips (foxy, bunny, claire and anna): `bytedance/seedance-2.0/image-to-video`.
  - Walking clips (Karl2000 and the police officer): `fal-ai/minimax-h3-turbo/max-turbo/image-to-video`.

The owner requested that the demo library remain in the public application and that the README show only the devlog cover. This record identifies the generation services; it does not assert that their output is public domain or independently establish redistribution terms. The selected MIT license covers the original application code and documentation. No separate media license has been specified.

| Source asset | File | Generation source (owner-reported) |
| --- | --- | --- |
| red-sport-car | `app/public/demo/images/red_sport_car.png` | ChatGPT |
| red-city-car | `app/public/demo/images/red_city_car.png` | ChatGPT |
| foxy | `app/public/demo/images/foxy.png` | ChatGPT |
| bunny | `app/public/demo/images/bunny.png` | ChatGPT |
| claire | `app/public/demo/images/claire.png` | ChatGPT |
| anna | `app/public/demo/images/anna.png` | ChatGPT |
| foxy-singing | `app/public/demo/videos/foxy_singing.mp4` | fal.ai; `bytedance/seedance-2.0/image-to-video` |
| bunny-singing | `app/public/demo/videos/bunny_singing.mp4` | fal.ai; `bytedance/seedance-2.0/image-to-video` |
| claire-singing | `app/public/demo/videos/claire_singing.mp4` | fal.ai; `bytedance/seedance-2.0/image-to-video` |
| anna-singing | `app/public/demo/videos/anna_singing.mp4` | fal.ai; `bytedance/seedance-2.0/image-to-video` |
| cop-body-walk | `app/public/demo/videos/cop_body_walk.mp4` | fal.ai; `fal-ai/minimax-h3-turbo/max-turbo/image-to-video` |
| karl2000-body-walk | `app/public/demo/videos/karl2000_body_walk.mp4` | fal.ai; `fal-ai/minimax-h3-turbo/max-turbo/image-to-video` |
| banana | `app/public/demo/images/banana.png` | ChatGPT |
| pineapple | `app/public/demo/images/pineapple.png` | ChatGPT |

Thumbnails and images embedded inside `.morph.json` presets derive from these sources and share their licensing status. `app/dev-fixtures/default-project.morph.json` also embeds demo images. The authoring seeds under `app/scripts/demo-authoring/` include derivatives and coordinate tracks.

The supplied fox/bunny artwork is used in `app/src/assets/morpher91-logo.png` and the generated favicons and installation icons. `docs/images/cover.webp` is the supplied devlog cover, used here at the owner's request. The WebGPU mark visible in the cover identifies that technology; its inclusion does not imply endorsement or ownership of that mark.

The video model endpoints above were supplied by the owner after checking the models used. Generation dates and applicable output terms have not been recorded here. The general image-generation statement above is not a separate provenance record for every component of the logo or composed cover.

## Maintenance

Run `python3 app/scripts/rebuild-demo-presets.py` from the repository root to rebuild the teaching catalogue using the checked-in seeds, images and tracks. This script currently rewrites the English/French preset copy only; synchronize any changed keys and meanings across all 16 locale catalogues before shipping its output. Keep landmark labels in English.

The [authoring notes](../app/scripts/demo-authoring/README.md) describe optional Vision/OpenCV analysis and manual anchor review. These utilities are not required to build or run the studio and do not implement automatic tracking in the app. Use `app/scripts/demo-thumbs.sh` with ffmpeg to regenerate thumbnails.

Validate presets visually after changing coordinates, timing, algorithms or masks. Run the demo-manifest, preset-content, project-validation and locale-parity tests before release.
