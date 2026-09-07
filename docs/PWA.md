# Morpher91 PWA and build version

The app uses the supplied fox/bunny artwork in the top bar, credits, favicons
and installation icons. The source PNG is kept in `app/src/assets/`.

## Build and version

`cd app && pnpm build` increments the patch version in `package.json`, runs
TypeScript and Vite, then generates `dist/sw.js` for that version. The About
dialog reads the same package version. The version bump happens before
compilation, including when a later build step fails. There are no automatic
commits, tags or pushes. `pnpm typecheck` validates without changing the version.

## Installation and offline operation

Serve `app/dist/` at the origin root over HTTPS (localhost also works). The
16 localized manifests share a stable application ID and use standalone
display. Chrome/Edge expose installation through their browser UI; on iPad use
Safari's Add to Home Screen. The existing device-support gate still applies.

After the first successful online installation of the service worker, the
entire application shell is cached, including lazy modules, native-language-name fonts and icons. Full script fonts
are cached on demand after their first use.
The studio can reopen offline and import local files. Bundled demo media is
not part of this cache and requires a connection. User projects and media are
never placed in the application cache; save projects explicitly and reconnect
local video files as usual.

The service worker is registered only in production. An update waits until
all existing app windows/tabs close, then activates on the next opening. It
does not reload a live studio session or interrupt an unsaved edit. Cache
cleanup is restricted to `morpher91-*`; unrelated applications are untouched.
Keep old hashed assets available during deployment for already-open clients.

Cache and serve the shell HTML at `/`, never `/index.html`. Cloudflare's default
HTML handling redirects `/index.html` to `/`. Precaching follows that redirect;
returning the resulting cached response for a navigation is rejected by browsers
(Safari: "Response served by service worker has redirections"; Chrome:
`ERR_FAILED`). Navigation uses the non-redirected `/` response from the installed
build, including when offline. Each origin has its own service worker and cache,
so the custom domain and workers.dev can exhibit different symptoms.

Verify with `pnpm preview --host 127.0.0.1`: load once online, wait for service
worker activation, switch the browser offline and reload. Vite's development
server does not enable the worker.

## Branding assets

`pnpm pwa:assets` regenerates the PNG/ICO assets and all localized manifests from the
source logo and localized description. This authoring utility uses macOS
`sips`; normal builds use the checked-in assets and need only Node.js. The
maskable icon has extra padding to preserve the entire artwork within the
central safe circle.

Apple touch icons are declared at 152 px (iPad), 167 px (iPad Pro) and 180 px
(iPhone). The conventional `/apple-touch-icon.png` fallback remains available.
All three are opaque PNGs and are included in the offline shell.

## iPad layout and local HTTPS checks

The Apple status bar uses `black`, so the installed studio starts below it.
Avoid `black-translucent`: it overlays the controls and WebKit has reported
bottom-positioning issues in that mode. The root content box applies all four
physical `safe-area-inset-*` values once, including on tablets using the desktop
layout. Both shells fill that box; they must not add another viewport height
or a second set of safe-area padding. Portaled mobile sheets keep their own
bottom inset. Assistant anchors are unchanged and measured from their live
screen rectangles, so the guide follows the inset layout.

The timeline height follows its actual 20 px rows and 4 px gaps, with an 8 px
internal bottom margin. Additional bottom space is the system safe-area inset;
do not remove it to move controls into the Home gesture area.

The document scroll guard excludes active pen pointers (and legacy stylus
touches) and waits for 8 CSS px of finger movement before cancelling a drag.
Cancelling the first tiny `touchmove` can suppress the native click used by
buttons and guided-assistant controls. Native clicks remain the single source
of activation; no synthetic Pencil clicks are added. Check button taps with
slight Pencil jitter, finger scrolling at panel edges and native sliders on a
real iPad. These event tests do not replace device validation.

All six Radix modal surfaces (Demo, Export, About, Language, Help and project
confirmations) use `ModalBackdrop` inside their Radix portal. Do not replace it
with `Dialog.Overlay` / `AlertDialog.Overlay`: those install a second
`react-remove-scroll` listener, which independently cancels tiny Pencil
touchmoves on non-scrollable controls. Radix Content retains its focus trap,
outside-pointer isolation and dismissal policy. Native document scrolling is
already blocked by the fixed root and the shared viewport guard.

The Demo regression test runs with the real modal and the global scroll guard:
it checks uncancelled pen touchmoves and activation of Assets, Presets, All,
Images and Videos. About, Language, Export, confirmations and assistant tests
cover their existing focus, keyboard and action behavior. The canvas and
timeline use Pointer Events without excluding `pen`; this code audit does not
certify pressure behavior, simultaneous palm/finger input or every gesture on
hardware. In particular the shared canvas gesture recognizer currently treats
any two pointers as a pinch; Pencil plus palm needs separate device testing.

Timeline scrubbing uses `usePointerScrub` for finger and pen input on both ruler variants and
the mobile transport. Pointer-down seeks from the contact's horizontal position
and captures that pointer, so vertical drift outside the ruler does not end the
drag. Move/up update the same timeline transport; cancel/lost capture end the
gesture. Values clamp to the timeline endpoints. The scrub controls use `touch-action: none` and are excluded from the document
touchmove guard, so Safari cannot take over a drag when the finger drifts vertically.
Mouse, keyboard and assistive technology retain the native range behavior.
The scrub guide includes the finger and stylus gesture in all 16 locales; its existing ruler anchor is unchanged.

For tablet development over local HTTPS, use a trusted certificate and a reverse
proxy to the Vite server. Set Vite's allowed hosts explicitly for your own hostname.
Development mode does not test production service-worker or offline behavior.
A manually installed CA must also be trusted for TLS on the device; see
[Apple's certificate trust documentation](https://support.apple.com/en-us/102390).

Device verification after saving any open project:

- Open Safari on the current URL and check the icon in Add to Home Screen.
- Check a fresh Home Screen installation as well as an existing one: iPadOS
  can retain installation metadata such as the icon and status-bar style.
- In portrait and landscape, check that the header clears the time/battery,
  the timeline reaches the bottom safe area, and there is no document scrolling.
- Check Help, About, the guided assistant, and the phone layout for clipped
  controls or doubled insets. Repeat in a Safari tab and iPad Split View.

References: [Apple status-bar metadata](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html),
[WebKit safe-area guidance](https://webkit.org/blog/7929/designing-websites-for-iphone-x/),
[WebKit translucent-status-bar report](https://bugs.webkit.org/show_bug.cgi?id=236445#c9).

The manifest, icon set and small native service worker follow the approach
used by [Lorenz Clash](https://github.com/AndreFrelicot/lorenzclash). Morpher91
precaches all application chunks and lets updates wait for open editors.

## Cloudflare Workers Builds

The existing deployment is a Worker serving static assets, not a Pages project.
`app/wrangler.jsonc` targets `morpher91`, serves `app/dist/`, and retains the
existing `morpher91.andrefrelicot.dev` custom domain and workers.dev endpoint.
Version preview URLs remain disabled, matching the existing Worker configuration.

To connect the existing Worker to GitHub, use Settings → Builds → Connect:

- Repository: `AndreFrelicot/morpher91`; production branch: `main`.
- Root directory: `app`.
- Build command: `pnpm build`.
- Deploy command: `npx wrangler deploy` (or `npx wrangler@4.129.0 deploy` to pin the tested version).
- Disable preview builds while version preview URLs are disabled.
- Pin the build environment to Node.js 22.20.0 and pnpm 11.25.0.

The build command must finish before deploying. A local configuration check is
`wrangler deploy --dry-run` from `app/` after building; this does not upload or
activate a deployment. No API tokens belong in the repository.

See [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
and [build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
