# Best Supply — Community Voted Product Directory

A minimal curated.supply-style product directory where users can vote for products and click buy buttons that use your affiliate links.

This version includes:

- Vite + React frontend
- Supabase-backed global voting
- One vote per product per browser
- Product detail pages
- Password-protected admin page at `/#admin`
- Permanent product edits saved to Supabase
- Product image URL fallbacks from approved/direct product pages

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** in Supabase.
3. Paste and run the SQL from:

```txt
supabase/schema.sql
```

This creates:

- `product_votes` for global votes
- `product_vote_counts` view for public vote counts
- `product_overrides` for admin-saved product edits

## Vercel environment variables

Add these in **Vercel → Project → Settings → Environment Variables**.

Client/public variables:

```txt
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Server-only admin variables:

```txt
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=69frozen420
```

Important:

- Do **not** make `SUPABASE_SERVICE_ROLE_KEY` public.
- Do **not** prefix it with `VITE_` or `NEXT_PUBLIC_`.
- The admin page will not be able to save permanently unless `SUPABASE_SERVICE_ROLE_KEY` is set.

After adding env vars, redeploy the Vercel project.

## Admin page

Open:

```txt
https://your-site.vercel.app/#admin
```

Password:

```txt
69frozen420
```

The admin page lets you edit:

- product name
- brand
- category
- badge/tag
- price
- card description
- detail page about text
- direct image URL
- buy/affiliate URL
- Amazon fallback URL
- eBay fallback URL

Saved changes are written to Supabase `product_overrides` and automatically appear on the normal public site.

## Product images

The safest setup is to use image URLs you are allowed to use:

- affiliate product-feed images
- official merchant/retailer product page metadata
- manufacturer press assets
- your own Cloudinary/Supabase Storage/S3 images
- your own photos

Image loading order:

1. `image` direct URL, if set in admin
2. `affiliateUrl` exact official/retailer product page
3. `amazonUrl` exact product page
4. `ebayUrl` exact product listing page

Search-result URLs are skipped because they often return generic SEO/banner/stock images.

## Local dev

```bash
npm install
npm run dev
```

## Deploy to Vercel through GitHub

1. Create a GitHub repo.
2. Upload all files from this folder.
3. Import the repo in Vercel.
4. Framework Preset: `Vite`.
5. Build Command: `npm run build`.
6. Output Directory: `dist`.
7. Add the env vars above.
8. Deploy.

## Notes

Keep product `id` values stable. Supabase votes and admin overrides are attached to product IDs. If you change an ID, the old votes/edits will no longer match that product.
