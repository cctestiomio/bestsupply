# Best Supply — Community Voted Product Directory

A minimal curated.supply-style product directory where users can vote for products and click buy buttons that use your affiliate links.

This version includes **real public/global votes** through Supabase.

## What is included

- Vite + React frontend
- Minimal product grid
- Category filters
- Search
- Sort by top voted, newest, or A–Z
- Supabase-backed global voting
- One vote per product per browser
- Affiliate-ready buy buttons
- Admin-editable product file at `src/products.js`
- Supabase SQL schema at `supabase/schema.sql`

## How global voting works

Each visitor gets a browser-generated `voter_id` saved in `localStorage`.

When they vote, the app inserts this row into Supabase:

```txt
product_id + voter_id
```

The database has a unique constraint on `(product_id, voter_id)`, so the same browser cannot vote twice for the same product.

This is good for a public MVP. It is not bot-proof. For stronger protection later, add login, CAPTCHA, rate limiting, or server-side vote validation.

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** in Supabase.
3. Paste and run the SQL from:

```txt
supabase/schema.sql
```

4. Go to **Project Settings → API**.
5. Copy:
   - Project URL
   - anon public key

## Local environment variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Fill it in:

```txt
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-public-key
```

## How to customize products and affiliate links

Open:

```txt
src/products.js
```

Edit or add products like this:

```js
{
  id: "unique-product-id",
  name: "Product Name",
  brand: "Brand",
  category: "Category",
  tag: "Best In Class Label",
  description: "Short product description.",
  image: "https://image-url.com/image.jpg",
  affiliateUrl: "https://your-affiliate-link.com",
  startingVotes: 0
}
```

Important: keep `id` stable. Supabase votes are attached to the product ID. If you change an ID later, that product's old votes will no longer match.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel through GitHub

1. Create a new GitHub repository.
2. Upload all files from this folder to the repository.
3. Go to Vercel.
4. Click **Add New Project**.
5. Import your GitHub repository.
6. Keep the defaults:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
7. Before deploying, add these Vercel environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
8. Click **Deploy**.

## Admin notes

For the MVP, products are managed by editing `src/products.js` and redeploying.

Good next upgrades:

- Admin dashboard to add/edit products without editing code
- Product submission queue
- Login-based voting
- Vote audit table with IP hash / user agent hash
- Daily rate limits
- Product pages with comments and reviews


## Troubleshooting vote insert errors

This patched build stores `product_id` and `voter_id` as text strings before inserting into Supabase. If voting fails, open the browser console to see the exact Supabase error shown in the site notice. Re-run `supabase/schema.sql` after replacing the database schema.
