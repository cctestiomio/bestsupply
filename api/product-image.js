const CACHE_SECONDS = 60 * 60 * 24;

function absoluteUrl(candidate, pageUrl) {
  if (!candidate) return "";
  const cleaned = candidate.replace(/&amp;/g, "&").trim();
  try {
    return new URL(cleaned, pageUrl).toString();
  } catch {
    return "";
  }
}

function extractMetaImage(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<img[^>]+(?:id|class|alt)=["'][^"']*(?:product|main|hero|image)[^"']*["'][^>]+src=["']([^"']+)["'][^>]*>/i,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const image = absoluteUrl(match?.[1], pageUrl);
    if (image && !image.startsWith('data:')) return image;
  }

  return "";
}

async function resolveImage(sourceUrl) {
  const response = await fetch(sourceUrl, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; BestSupplyImageResolver/1.0; +https://vercel.com)",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const finalUrl = response.url || sourceUrl;

  if (contentType.startsWith("image/")) {
    return finalUrl;
  }

  const html = await response.text();
  const image = extractMetaImage(html, finalUrl);

  if (!image) {
    throw new Error("No product image found on page");
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
