# FrameForge Studio: General Guidelines

One document, three audiences. Jump to what you need:
**[A. Using FrameForge](#a-using-frameforge)** · **[B. Content and acceptable use](#b-content-and-acceptable-use)** · **[C. Building FrameForge](#c-building-frameforge)**

> Section B is a working policy, **not legal advice**. Have a lawyer review it before you publish it as terms of service.

## Principles

1. **Your work stays yours.** Projects and media stay on your device. Nothing is uploaded, and nothing is tracked, unless you turn on the optional cloud backend.
2. **Works on modest devices.** Editing runs on phones and tablets. Rendering is CPU-only and runs on a computer.
3. **Safe by default.** Imported files are treated as untrusted. Scenes cannot run scripts or reach the network.
4. **Tell the truth.** Progress, estimates and errors reflect what really happened. We do not claim what we have not tested.

---

## A. Using FrameForge

### A1. The workflow

1. **Start** from a template or a blank project. Pick the shape first: 16:9 (YouTube), 9:16 (Stories/Reels/Shorts), 1:1 (feeds).
2. **Build** scenes: one idea per scene, 2–6 seconds each is a good rhythm.
3. **Add media** (images, audio). Check you have the right to use each file (see B2).
4. **Add audio and captions.**
5. **Preview** the whole timeline, not just one scene.
6. **Export** to MP4 on a computer (desktop app or command-line renderer). On a phone or in a browser, download the project archive (`.ffproj`) and render it on a computer.
7. **Back up** the `.ffproj` archive.

### A2. Making videos that read well

| Topic            | Guideline                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text size        | Headlines at least 7% of the video height, body text at least 4%. Phone viewers see small screens.                                                              |
| Contrast         | Light text on dark (or the reverse); avoid mid-tone on mid-tone. Add a caption background if text sits on busy images.                                          |
| Words per scene  | At most about 12 words on screen; give people about 0.3 s per word to read.                                                                                     |
| Motion           | One animation idea per element. Use easing; avoid everything moving at once. Keep exits short (0.3–0.5 s).                                                      |
| Transitions      | Use sparingly. Match transition length to the pace (0.3–0.6 s).                                                                                                 |
| Frame rate       | 30 fps is the default and fine for almost everything. Use 24 for a film look; use 60 only for very fast motion (it doubles the work).                           |
| Resolution       | 720p is the default and is enough for phones. Use 1080p for large screens. Higher costs time and memory.                                                        |
| Safe area (9:16) | Keep important text away from the top and bottom ~10%, where apps place their own controls.                                                                     |
| Captions         | Add them. Many people watch muted. Keep lines short (about 42 characters), 1–2 lines, 1.5–5 s on screen.                                                        |
| Audio levels     | Keep music under speech (around 20–40% volume). Use fade in/out (0.3–1 s) so audio does not start or stop abruptly.                                             |
| Accessibility    | Do not rely on colour alone. Avoid flashing content (more than 3 flashes per second can trigger seizures). Provide captions or a transcript for spoken content. |

### A3. Low-power devices

- Use **low-resource mode** (Settings; it turns on automatically on weak devices).
- Lower the **render scale** (0.5–0.75) for drafts, then export at 1.0.
- Keep 720p / 30 fps for long videos; render one video at a time.
- Close other heavy apps while exporting. Rendering is limited by CPU, so a 5-minute 30 fps video is 9,000 frames and takes real time. The progress bar shows real frames, and the time left is an estimate from your current speed.
- A phone cannot export an MP4. That is by design (memory and heat limits). Send the archive to a computer.

### A4. Your data

- **Storage:** projects live in your browser's storage (or the desktop app's). Browsers can clear it, and iOS can do so under storage pressure. **Download a `.ffproj` backup regularly.**
- **Autosave:** the status shows "Saving…" until your latest edit is stored. Wait for "Saved on this device" before closing, especially on phones.
- **Recovery:** a damaged project opens as a repaired copy, or you can restore one of the last 5 automatic backups.
- **Privacy:** no accounts, no telemetry, no automatic uploads. Cloud backup is off unless an administrator deploys and you sign in to it. It never uploads media.
- **Deleting:** deleting a project removes it from this device only; archives you downloaded are not touched.

### A5. When something goes wrong

Start with the README troubleshooting table. Common ones: FFmpeg or Chrome/Edge not found (`npm run check` tells you what to install), "export not available in this browser" (use the desktop app), "damaged project" (open the repaired copy or a backup).

---

## B. Content and acceptable use

### B1. You are responsible for what you make

FrameForge is a tool. You decide what to create, and you are responsible for it and for how you share it. FrameForge does not review, host or publish your videos.

### B2. Rights to media

- Only use images, audio, music, fonts, logos and footage that you **own or have permission to use** (licence, purchase, public domain, or a licence that allows your use).
- Music and sound are the most common problem. A song you bought or streamed is usually **not** licensed for use in your video.
- Check that licences allow **commercial** use if you sell or monetise the video, and note any **attribution** requirement. Put attribution in a caption or in the description where you publish.
- Templates in FrameForge are original and may be used freely in your projects. Fonts are system fonts on the rendering computer.
- Take care with other people's faces, voices, private information and children's images. Get consent where the law or common decency requires it.

### B3. Do not use FrameForge to create

- Content that is illegal where you or your audience live.
- Harassment, hate, threats, or sexual content involving minors.
- Fraud, impersonation or misleading content presented as real (for example fake news clips, fake endorsements, or fake quotes attributed to real people).
- Material that infringes copyright, trademark or privacy rights.
- Anything that tries to attack software (for example scene HTML designed to break out of the sandbox). Security reports are welcome via SECURITY.md.

### B4. Operators of a hosted copy

If you host FrameForge for others: publish your own terms and privacy notice, say where data is stored, provide a way to report abuse, comply with the licences of FFmpeg and other components you bundle, and check your hosting provider's terms (GitHub Pages restricts some commercial uses; verify the current terms).

### B5. Enforcement

FrameForge has no central authority over a local install. Operators of hosted or cloud-enabled deployments may remove access for misuse according to their own terms.

---

## C. Building FrameForge

### C1. Non-negotiables

1. **Never run project data.** No `eval`, no shell built from project values, no scripts in scenes. FFmpeg is called with an argument array.
2. **No generic bridges.** The Electron preload exposes only named methods. No raw filesystem, process, shell or IPC access. Output locations are opaque tokens from a native dialog.
3. **Validate at every boundary:** schema for projects, content sniffing for media, limits for sizes/counts, sender checks for IPC, allowlists for cloud actions.
4. **No secrets in the repo or the browser bundle.** Placeholders only in `.env.example`; CI scans for secrets.
5. **No silent network.** Nothing is uploaded or phoned home without an explicit user action.
6. **Core features work offline and without an account.** Cloud is always optional.
7. **Do not claim what is not verified** (speed, memory, compatibility, security). Measure it or say it is untested.

### C2. Code standards

- TypeScript strict; no disabled type checks. Pure logic lives in `packages/*`; UI stays thin.
- One implementation per piece of business logic (for example the scene compiler serves both preview and renderer).
- Dependencies: justify each one, pin exact versions, keep the lockfile, run `npm audit`.
- Small, reviewable pull requests; commit messages say _why_.

### C3. Product and UI standards

- **Responsive first:** works at 360 px wide and up, with no horizontal page scroll; touch targets at least 40–48 px; works with mouse, touch and keyboard.
- **Accessible:** semantic controls, labels, visible focus, sufficient contrast, reduced-motion respected for the interface only (exported videos always keep their animation).
- **Honest feedback:** save state, real progress, clear errors that say what happened and what to do next. No placeholder buttons.
- **Degrade gracefully:** detect capabilities (not device names); explain what a device cannot do and offer the next best path.
- **Fast and light:** debounce autosave, lazy-load heavy panels, stream frames (never hold a whole video in memory), bound every cache.
- **Copy:** plain language, active voice, no jargon in user-facing text.

### C4. Testing and "done"

A change is done when: `npm run ci` passes; behaviour changes have tests (unit, security or rendering as appropriate); UI changes pass the Playwright e2e at phone, tablet and desktop sizes; rendering changes produce a real MP4 that the tests verify; docs are updated; no new secret or unreviewed dependency; known gaps are written down in `docs/RELEASE_REPORT.md`. Tests that cannot run are marked as blocked with the reason, never skipped silently.

### C5. Release checklist

1. CI green on `main` (verify, dependency security, Windows and macOS package checks).
2. Update version and `docs/RELEASE_REPORT.md` (what is done, partial, not done, blocked).
3. Build, sign and notarise desktop installers on the target OS; smoke-test them on real machines.
4. Deploy the web build; open the live URL on a phone and a desktop.
5. Re-run `npm audit`; update `SECURITY.md` if anything changed.
6. Tag the release; keep a changelog.

### C6. Decisions and change control

Record significant decisions in `docs/ARCHITECTURE.md` (what, why, trade-off). Changes to the project file format need a schema version bump and a migration with tests. Changes to the IPC bridge, HTML sanitizer, archive reader or cloud endpoint need a security review in the pull request.
