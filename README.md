# MWP · Matan Wild — website

A static site hosted free on **GitHub Pages**, with **Supabase** for the contact form,
the admin login, and Edit Mode (a visual editor with version history).

```
index.html          English page
he.html             Hebrew page
admin.html          admin sign-in, contact messages, change password
editor.js           Edit Mode (the visual editor)
mwp-loader.js       loads the latest published version of each page
blocks.css          styles for blocks added in Edit Mode
config.js           your Supabase URL + publishable key
vendor/supabase.js  Supabase's browser library (kept here so nothing else needs loading)
img/ logos/ video/  photos, logos, the Ladakh film
.nojekyll           tells GitHub Pages to serve files as they are
supabase-setup.txt  the SQL to run once in Supabase
```

## 1. Supabase setup (once)

1. **Create the admin login.** Supabase → **Authentication → Users → Add user → Create new user**
   - Email: `matan@matanwildphotography.com`
   - Password: `Matan123`
   - Tick **Auto Confirm User** → Create.
2. **Run the SQL.** **SQL Editor → New query**, paste everything from `supabase-setup.txt`, **Run**.
   The last result should show one row: `Matan | matan@matanwildphotography.com`.
   (Fine to run even if you ran the older contact-form version before.)
3. **Turn off public sign-ups.** **Authentication → Sign In / Providers** → switch off
   **Allow new users to sign up**. (Strangers couldn't edit anyway, but this keeps accounts tidy.)
4. **For "Forgot password" emails:** **Authentication → URL Configuration** → set **Site URL** to your live
   address, e.g. `https://YOUR-USERNAME.github.io/mwp-website/`, and add
   `https://YOUR-USERNAME.github.io/mwp-website/admin.html` under **Redirect URLs**.

`config.js` already has your project URL and publishable key.

## 2. Upload to GitHub

Upload **everything in this folder** (keep the folders) to your repository and commit.
If you uploaded the earlier version, upload these again so they're replaced: `index.html`, `he.html`, `config.js`,
and add the new ones: `admin.html`, `editor.js`, `mwp-loader.js`, `blocks.css`, the `vendor` folder.

GitHub → **Settings → Pages** → Branch `main`, folder `/ (root)` → Save.

## 3. Using Edit Mode

1. Go to `…/admin.html` and sign in: **Matan** / **Matan123**.
2. **Change the password straight away** (Change password, on the same page).
3. Click **English page** or **עמוד בעברית** to open the editor. When you're signed in, the live site also
   shows a small **✎ Edit this page** button in the corner (only on your browser).

In the editor:

| To… | Do this |
|---|---|
| Select anything | Click it. The **↖** button selects the box around it. |
| Change text | Double-click it and type. Select words for **Bold**, *Italic* or a link. Esc or ✓ Done to finish. |
| Replace a photo, video or icon | Select it → the image / star button, or double-click it. Upload, pick from the library, or paste a link. Photos are resized automatically. |
| Move something | Drag the ✥ handle to a new spot (a blue line shows where it lands). Hold **Shift** while dragging to place it freely. ↑ ↓ move it one step. |
| Add things | **+ Add** → elements (heading, text, button, image, video, icon, list, columns…) or whole sections. |
| Copy / delete | ⧉ duplicates, 🗑 deletes (Ctrl+D / Delete). |
| Style and layout | **Settings** panel: text size, weight, colour, alignment, background, spacing, columns, show on desktop/phone only, link address, photo details. |
| Reorder sections | **Sections** lists the whole page; use ↑ ↓. |
| Undo / Redo | The arrows, or Ctrl+Z / Ctrl+Shift+Z. |
| Check before publishing | **Preview** shows desktop, tablet and phone sizes. |
| Publish | **Save** (Ctrl+S). Add a short note about what changed. |
| Go back to an older version | **History** → Preview, Open in editor, or Restore. "Original design" is always there. |
| Google title and description | **Page**. |

Unpublished changes are kept as a draft in that browser, so closing the tab doesn't lose them.
Each language is edited separately.

## Good to know

- **Free Supabase projects pause after a week without visits.** While paused, the site shows the original
  design (from these files) instead of your edits, and the contact form and admin don't work.
  Open the Supabase dashboard and click **Restore project** to bring everything back, or use a paid plan to avoid pauses.
- Uploads are limited to **50 MB** per file (Supabase free plan). Compress long videos first.
- New messages from the contact form appear in `admin.html` (no email alert).
- Add another admin: create their login in Authentication → Users, then run the "Add another admin" query
  at the bottom of `supabase-setup.txt`.

## Custom domain (matanwildphotography.com) – optional

1. GitHub → **Settings → Pages → Custom domain** → `matanwildphotography.com` → Save.
2. At the domain registrar: `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
   `185.199.111.153`; `CNAME` for `www` → `YOUR-USERNAME.github.io`.
3. When it works, tick **Enforce HTTPS**, and update the Site URL in Supabase (step 1.4).
