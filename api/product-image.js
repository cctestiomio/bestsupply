const CACHE_SECONDS = 60 * 60 * 24;

function absoluteUrl(candidate, pageUrl) {
  if (!candidate) return "";
  const cleaned = String(candidate).replace(/&amp;/g, "&").trim();
  if (!cleaned || cleaned.startsWith("data:")) return "";
  try {
    return new URL(cleaned, pageUrl).toString();
  } catch {
    return "";
  }
}

function isLikelySearchPage(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host.includes("amazon.") && (parsed.searchParams.has("k") || path === "/s")) return true;
    if (host.includes("ebay.") && path.includes("/sch/i.html")) return true;
    if (parsed.searchParams.has("q") && !path.includes("/product") && !path.includes("/products")) return true;

    return false;
  } catch {
    return true;
  }
}

function looksLikeRealProductImage(imageUrl) {
  if (!imageUrl) return false;
  const lower = imageUrl.toLowerCase();

  const blocked = [
    "placeholder",
    "sprite",
    "logo",
    "favicon",
    "icon-",
    "tracking",
    "pixel",
    "blank.gif",
    "transparent",
    "avatar",
    "profile",
  ];

  if (blocked.some((word) => lower.includes(word))) return false;
  if (!/^https?:\/\//i.test(imageUrl)) return false;

  return true;
}

function normalizeJsonLd(raw) {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n/g, ' ')
    .trim();
}

function extractJsonLdImages(html, pageUrl) {
  const images = [];
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptPattern.exec(html)) !== null) {
    const raw = normalizeJsonLd(match[1] || "");
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const stack = [...items];

      while (stack.length) {
        const item = stack.shift();
        if (!item || typeof item !== "object") continue;

        if (item.image) {
          const imageField = item.image;
          const candidates = Array.isArray(imageField) ? imageField : [imageField];
          for (const candidate of candidates) {
            if (typeof candidate === "string") images.push(absoluteUrl(candidate, pageUrl));
            if (candidate && typeof candidate === "object" && candidate.url) images.push(absoluteUrl(candidate.url, pageUrl));
          }
        }

        for (const value of Object.values(item)) {
          if (value && typeof value === "object") {
            if (Array.isArray(value)) stack.push(...value);
            else stack.push(value);
          }
        }
      }
    } catch {
      // Some merchants include invalid JSON-LD. Ignore it and continue to meta tags.
    }
  }

  return images.filter(looksLikeRealProductImage);
}

function extractMetaImage(html, pageUrl) {
  const images = [];
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const image = absoluteUrl(match[1], pageUrl);
      if (looksLikeRealProductImage(image)) images.push(image);
    }
  }

  return images;
}

function extractProductImage(html, pageUrl) {
  const candidates = [
    ...extractJsonLdImages(html, pageUrl),
    ...extractMetaImage(html, pageUrl),
  ];

  // Do not fall back to the first random <img>. That was the source of generic lifestyle/stock images.
  return candidates.find(looksLikeRealProductImage) || "";
}

async function resolveImage(sourceUrl) {
  if (isLikelySearchPage(sourceUrl)) {
    throw new Error("Search-result pages are not valid image sources");
  }

  const response = await fetch(sourceUrl, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; BestSupplyImageResolver/2.0; +https://vercel.com)",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const finalUrl = response.url || sourceUrl;

  if (contentType.startsWith("image/") && looksLikeRealProductImage(finalUrl)) {
    return finalUrl;
  }

  const html = await response.text();
  const image = extractProductImage(html, finalUrl);

  if (!image) {
    throw new Error("No approved product image metadata found on page");
  }

  return image;
}

export default async function handler(req, res) {
  const sourceUrl = req.query.url;

  if (!sourceUrl || typeof sourceUrl !== "string") {
    res.status(400).send("Missing url");
    return;
  }

  try {
    const parsed = new URL(sourceUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      res.status(400).send("Invalid url");
      return;
    }

    const imageUrl = await resolveImage(parsed.toString());
    res.setHeader("Cache-Control", `s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`);
    res.redirect(302, imageUrl);
  } catch (error) {
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");
    res.status(404).send(error.message || "Image not found");
  }
}
