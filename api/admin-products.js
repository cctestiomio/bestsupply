import { createClient } from "@supabase/supabase-js";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "69frozen420";
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function toDbProduct(product) {
  return {
    product_id: clean(product.id),
    name: clean(product.name),
    brand: clean(product.brand),
    category: clean(product.category),
    tag: clean(product.tag),
    description: clean(product.description),
    about: clean(product.about),
    image: clean(product.image),
    affiliate_url: clean(product.affiliateUrl),
    amazon_url: clean(product.amazonUrl),
    ebay_url: clean(product.ebayUrl),
    price: clean(product.price),
    updated_at: new Date().toISOString(),
  };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({
      error: "Missing server env vars. Add SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL or VITE_SUPABASE_URL in Vercel.",
    });
    return;
  }

  const body = parseBody(req);
  if (body.password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Wrong admin password" });
    return;
  }

  if (!body.product || !body.product.id) {
    res.status(400).json({ error: "Missing product payload" });
    return;
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const payload = toDbProduct(body.product);
  const { data, error } = await adminSupabase
    .from("product_overrides")
    .upsert(payload, { onConflict: "product_id" })
    .select("*")
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ ok: true, product: data });
}
