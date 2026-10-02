# MWP · Matan Wild — website

A static site (English `index.html` + Hebrew `he.html`) hosted free on **GitHub Pages**.
The contact form saves each message to **Supabase**.

```
index.html          English page
he.html             Hebrew page
config.js           Supabase URL + publishable key (the only file you edit)
img/ logos/ video/  photos, partner logos, the Ladakh film
.nojekyll           tells GitHub Pages to serve files as they are
supabase-setup.txt  the SQL to run once in Supabase (not needed on GitHub, but harmless)
```

## 1. Supabase (5 minutes)

1. Go to https://supabase.com → **New project**. Pick a region near your visitors (e.g. Frankfurt for Israel), set a database password, create.
2. Open **SQL Editor → New query**, paste everything from `supabase-setup.txt`, click **Run**. You should see "Success. No rows returned".
3. Open **Project Settings → API Keys** (or **API**) and copy:
   - the **Project URL** – `https://xxxx.supabase.co`
   - the **Publishable key** (`sb_publishable_…`) – or the legacy **anon public** key.
   Never use the *secret* / *service_role* key on the website.
4. Paste both into `config.js`:

```js
window.MWP_SUPABASE = {
  url: 'https://xxxx.supabase.co',
  key: 'sb_publishable_xxxxxxxxxxxx'
};
```

## 2. GitHub Pages

1. On https://github.com → **New repository** (e.g. `mwp-website`), Public, create.
2. **Add file → Upload files**, drag in *everything in this folder* (keep the `img`, `logos` and `video` folders), **Commit changes**.
   - `.nojekyll` is hidden on Mac/Windows; if it doesn't upload, create it in GitHub with **Add file → Create new file**, name `.nojekyll`, leave it empty.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → **Save**.
4. After about a minute the site is live at `https://YOUR-USERNAME.github.io/mwp-website/`.

## 3. Test it

Open the live site, send a message from the contact form, then in Supabase open
**Table Editor → contact_messages** — the message should be there.
If the form says it didn't go through, open the browser console (F12) for the error;
usually the URL or key in `config.js` has a typo.

## 4. Custom domain (matanwildphotography.com) – optional

1. GitHub repo → **Settings → Pages → Custom domain** → enter `matanwildphotography.com` → Save (this adds a `CNAME` file).
2. At your domain registrar, add DNS records:
   - `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` for `www` → `YOUR-USERNAME.github.io`
3. Once DNS works (minutes to a few hours), tick **Enforce HTTPS**.

The page already points its canonical/social links at `https://matanwildphotography.com/`, so the domain is worth setting up.

## Reading messages

Supabase → **Table Editor → contact_messages**. Visitors can only *add* messages; nobody can read them
through the website. Change `status` to `replied` or `archived` to keep track.
Each email address can send at most 5 messages per hour (spam guard).

Supabase doesn't email you when a message arrives — check the table, or add a Database Webhook /
Edge Function later to forward new messages to your inbox.
