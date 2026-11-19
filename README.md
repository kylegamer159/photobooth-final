# Snap & Style – cute photo booth & collage maker

Plain HTML + CSS + JavaScript. Files: `index.html`, `styles.css`, `engine.js` (canvas renderer, 40 layouts x 14 backgrounds), `app.js` (UI, camera, Supabase), `supabase-setup.sql`.

## Run it
Serve the folder over localhost or https (the camera needs a secure origin):
    cd snap-and-style && python3 -m http.server 5500
Open http://localhost:5500. "Continue as Guest" works with no setup.

## Supabase (already wired to your project URL + publishable key in app.js)
1. Dashboard -> SQL Editor: paste and run `supabase-setup.sql` (creates the private `booth` bucket + per-user policies).
2. Authentication -> Providers: Email is on by default; for Google add your Google OAuth client ID/secret.
3. Authentication -> URL Configuration: add your site URL and redirect URLs (e.g. http://localhost:5500/ and your live https URL).
4. Never put a `service_role` / secret key in front-end code. The publishable key is safe because storage is protected by the policies above.

## Notes
- Stickers are emoji or your own uploads. Frames are recreated in canvas, not copies of your reference images.
- Signed-in users get a saved gallery and a custom watermark; guests can still download.

## Upload your own frame (auto-detect + edit)
Click "Upload my frame (auto-detect)". The app finds photo spots (transparent holes, green/magenta boxes, or plain white/black/coloured windows, rotated ones too) and shows them numbered.
- Tap a box to select it: "Use / Don't use", angle slider, nudge arrows, Delete (and "Restore deleted").
- Drag a box to move it, drag a square handle to resize, drag the round handle to rotate.
- Tap a missed spot to detect it from its colour, or drag on empty space to draw a box. "＋ Add spot" adds a blank one.
- Your design stays on top of the photos (clothespins, stickers, borders). After building, use "Edit photo spots" to adjust again.
Custom frames are saved in your browser (IndexedDB) and come back after a refresh; use "Delete this frame" to remove one.
When you are signed in, frames are also saved to your account (private `frames` bucket – run `supabase-frames.sql` once) and load on any device after you sign in. Frames made as a guest stay on that device only.

## Notes on filters
Browsers without `ctx.filter` (iOS Safari) use a per-pixel fallback in `engine.js` (`pixelFiltered`), so filters also show in exports there.
