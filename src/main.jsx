import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowUp, ExternalLink, Search, SlidersHorizontal, WifiOff } from "lucide-react";
import { products as productData } from "./products";
import { isSupabaseConfigured, supabase } from "./supabase";
import "./styles.css";

const categories = ["All", ...Array.from(new Set(productData.map((product) => product.category)))];

function productKey(productId) {
  return String(productId);
}

function startingVoteMap() {
  return productData.reduce((acc, product) => {
    acc[productKey(product.id)] = product.startingVotes || 0;
    return acc;
  }, {});
}

function getOrCreateVoterId() {
  const key = "best-supply-voter-id";
  const saved = localStorage.getItem(key);
  if (saved) return saved;

  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function getHashRoute() {
  const hash = window.location.hash || "";
  const match = hash.match(/^#product\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function productPath(product) {
  return `#product/${encodeURIComponent(product.id)}`;
}

function isSearchPageUrl(source) {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    const isAmazonSearch = host.includes("amazon.") && (url.searchParams.has("k") || path === "/s");
    const isEbaySearch = host.includes("ebay.") && path.includes("/sch/i.html");
    const isGenericSearch = url.searchParams.has("q") && !path.includes("/product") && !path.includes("/products");

    return isAmazonSearch || isEbaySearch || isGenericSearch;
  } catch {
    return true;
  }
}

function getProductImageSources(product) {
  // Only use exact product/detail pages or direct image URLs.
  // Amazon/eBay search result pages caused generic stock/placeholder images, so they are skipped.
  return [product.image, product.affiliateUrl, product.amazonUrl, product.ebayUrl]
    .filter(Boolean)
    .map((source) => String(source).trim())
    .filter(Boolean)
    .filter((source) => !isSearchPageUrl(source));
}

function imageResolverUrl(source, product) {
  const params = new URLSearchParams({
    url: source,
    name: `${product.brand} ${product.name}`,
    productId: product.id,
    // cache buster so old Vercel edge-cache results from search-page fallbacks do not survive deploys
    v: "5",
  });

  return `/api/product-image?${params.toString()}`;
}

function ProductImage({ product, large = false }) {
  const sources = getProductImageSources(product);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
  }, [product.id]);

  const source = sources[sourceIndex];

  function handleImageError() {
    if (sourceIndex < sources.length - 1) {
      setSourceIndex((index) => index + 1);
      return;
    }

    setFailed(true);
  }

  return (
    <div className={large ? "product-image product-image-large" : "product-image"}>
      {source && !failed ? (
        <img
          src={imageResolverUrl(source, product)}
          alt={`${product.brand} ${product.name}`}
          loading={large ? "eager" : "lazy"}
          onError={handleImageError}
        />
      ) : (
        <div className="image-unavailable image-empty" aria-label={`${product.name} image unavailable`} />
      )}
    </div>
  );
}

function App() {
  const [votes, setVotes] = useState(startingVoteMap);
  const [votedIds, setVotedIds] = useState(() => {
    const saved = JSON.parse(localStorage.getItem("best-supply-voted-ids") || "[]");
    return saved.map(String);
  });
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("top");
  const [query, setQuery] = useState("");
  const [isLoadingVotes, setIsLoadingVotes] = useState(true);
  const [voteError, setVoteError] = useState("");
  const [routeProductId, setRouteProductId] = useState(getHashRoute());

  useEffect(() => {
    const onHashChange = () => setRouteProductId(getHashRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    async function loadGlobalVotes() {
      if (!isSupabaseConfigured) {
        setVoteError("Supabase is not configured yet. Add your Vercel environment variables to enable global votes.");
        setIsLoadingVotes(false);
        return;
      }

      const voterId = getOrCreateVoterId();
      const startingVotes = startingVoteMap();

      const [countsResult, voterResult] = await Promise.all([
        supabase.from("product_vote_counts").select("product_id,votes"),
        supabase.from("product_votes").select("product_id").eq("voter_id", voterId),
      ]);

      if (countsResult.error || voterResult.error) {
        setVoteError("Could not load global votes. Check your Supabase SQL schema and env variables.");
        setIsLoadingVotes(false);
        return;
      }

      const nextVotes = { ...startingVotes };
      for (const row of countsResult.data || []) {
        nextVotes[productKey(row.product_id)] = (startingVotes[productKey(row.product_id)] || 0) + Number(row.votes || 0);
      }

      const alreadyVoted = (voterResult.data || []).map((row) => productKey(row.product_id));
      setVotes(nextVotes);
      setVotedIds(alreadyVoted);
      localStorage.setItem("best-supply-voted-ids", JSON.stringify(alreadyVoted));
      setIsLoadingVotes(false);
    }

    loadGlobalVotes();
  }, []);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    let list = productData.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const matchesQuery =
        !normalized ||
        product.name.toLowerCase().includes(normalized) ||
        product.brand.toLowerCase().includes(normalized) ||
        product.category.toLowerCase().includes(normalized) ||
        product.description.toLowerCase().includes(normalized);

      return matchesCategory && matchesQuery;
    });

    if (sort === "top") list.sort((a, b) => (votes[productKey(b.id)] || 0) - (votes[productKey(a.id)] || 0));
    if (sort === "new") list.sort((a, b) => productData.indexOf(b) - productData.indexOf(a));
    if (sort === "az") list.sort((a, b) => a.name.localeCompare(b.name));

    return list;
  }, [category, query, sort, votes]);

  async function vote(productId) {
    const id = productKey(productId);
    if (!isSupabaseConfigured) {
      setVoteError("Supabase is not configured yet, so this vote cannot be saved globally.");
      return;
    }

    if (votedIds.includes(id)) return;

    const voterId = getOrCreateVoterId();
    const previousVotes = votes;
    const previousVotedIds = votedIds;
    const nextVotedIds = [...votedIds, id];

    setVotes({ ...votes, [id]: (votes[id] || 0) + 1 });
    setVotedIds(nextVotedIds);
    localStorage.setItem("best-supply-voted-ids", JSON.stringify(nextVotedIds));
    setVoteError("");

    const { error } = await supabase.from("product_votes").insert({ product_id: id, voter_id: voterId });

    if (error) {
      setVotes(previousVotes);
      setVotedIds(previousVotedIds);
      localStorage.setItem("best-supply-voted-ids", JSON.stringify(previousVotedIds));

      if (error.code === "23505") {
        setVoteError("You already voted for that product from this browser.");
      } else {
        setVoteError(`Vote failed: ${error.message || "Check your Supabase policies and network connection."}`);
      }
    }
  }

  const currentProduct = routeProductId ? productData.find((product) => product.id === routeProductId) : null;

  return (
    <main>
      <header className="site-header">
        <div className="brand-row">
          <a className="logo" href="#" aria-label="Best Supply home">Best Supply</a>
          <nav>
            <a href="#products">Products</a>
            <a href="#about">About</a>
          </nav>
        </div>

        {!currentProduct && (
          <section className="hero">
            <p className="eyebrow">Community-ranked product directory</p>
            <h1>Best-in-class products, voted by people with taste.</h1>
            <p className="hero-copy">
              A minimal directory for discovering the most loved gear, tools, desk objects, bags, audio, and everyday essentials.
            </p>
            <div className="hero-actions">
              <a className="primary-link" href="#products">Browse products</a>
            </div>
          </section>
        )}
      </header>

      {voteError && (
        <section className="notice" role="status">
          <WifiOff size={17} />
          <span>{voteError}</span>
        </section>
      )}

      {currentProduct ? (
        <ProductDetail product={currentProduct} votes={votes} votedIds={votedIds} isLoadingVotes={isLoadingVotes} vote={vote} />
      ) : (
        <>
          <section className="controls" id="products">
            <div className="search-box">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products, brands, categories..." />
            </div>
            <div className="select-box">
              <SlidersHorizontal size={17} />
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="top">Top voted</option>
                <option value="new">Newest</option>
                <option value="az">A–Z</option>
              </select>
            </div>
          </section>

          <section className="category-row" aria-label="Product categories">
            {categories.map((item) => (
              <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
          </section>

          <section className="product-grid">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                votes={votes}
                votedIds={votedIds}
                isLoadingVotes={isLoadingVotes}
                vote={vote}
              />
            ))}
          </section>
        </>
      )}

      <footer id="about">
        <p>Best Supply</p>
        <p>Minimal product discovery, ranked by the community.</p>
      </footer>
    </main>
  );
}

function ProductCard({ product, votes, votedIds, isLoadingVotes, vote }) {
  const id = productKey(product.id);
  const hasVoted = votedIds.includes(id);

  return (
    <article className="product-card" onClick={() => { window.location.hash = productPath(product); }}>
      <a className="image-wrap" href={productPath(product)} onClick={(event) => event.stopPropagation()}>
        <ProductImage product={product} />
        <span>{product.tag}</span>
      </a>
      <div className="product-content">
        <div>
          <p className="category-label">{product.category}</p>
          <h2>{product.name}</h2>
          <p className="brand">{product.brand}</p>
          <p className="description">{product.description}</p>
        </div>
        <div className="card-actions">
          <button className={hasVoted ? "vote-button voted" : "vote-button"} onClick={(event) => { event.stopPropagation(); vote(product.id); }} disabled={hasVoted || isLoadingVotes}>
            <ArrowUp size={16} />
            <span>{isLoadingVotes ? "..." : votes[id] || 0}</span>
          </button>
          <div className="purchase-actions">
            {product.price && <span className="product-price">{product.price}</span>}
            <a className="buy-button" href={product.affiliateUrl} onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer sponsored noopener">
              Buy <ExternalLink size={15} />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

function ProductDetail({ product, votes, votedIds, isLoadingVotes, vote }) {
  const id = productKey(product.id);
  const hasVoted = votedIds.includes(id);
  const related = productData
    .filter((item) => item.id !== product.id && item.category === product.category)
    .slice(0, 3);
  const featured = productData.filter((item) => item.id !== product.id).slice(0, 3);

  return (
    <section className="detail-page">
      <a className="back-link" href="#products"><ArrowLeft size={16} /> Back to products</a>

      <section className="detail-hero">
        <ProductImage product={product} large />
        <div className="detail-summary">
          <p className="category-label">{product.brand} · {product.category}</p>
          <h1>{product.name}</h1>
          <p className="detail-description">{product.description}</p>
          <div className="detail-actions">
            <button className={hasVoted ? "vote-button voted" : "vote-button"} onClick={() => vote(product.id)} disabled={hasVoted || isLoadingVotes}>
              <ArrowUp size={16} />
              <span>{isLoadingVotes ? "..." : votes[id] || 0}</span>
            </button>
            {product.price && <span className="detail-price">{product.price}</span>}
            <a className="buy-button" href={product.affiliateUrl} target="_blank" rel="noreferrer sponsored noopener">
              Buy <ExternalLink size={15} />
            </a>
          </div>
        </div>
      </section>

      <section className="detail-about">
        <h2>About</h2>
        <p>{product.about || `${product.name} by ${product.brand} is listed as a community pick in ${product.category}. Add a richer product write-up in products.js when you publish your final affiliate page.`}</p>
        <p className="image-note">Images are resolved from exact product/detail pages only. Search-result pages are ignored because they can return generic stock images. For best reliability, paste approved merchant, affiliate-feed, or official image URLs in products.js.</p>
      </section>

      {related.length > 0 && (
        <ProductRail title={`More in ${product.category}`} products={related} />
      )}
      <ProductRail title="Featured in" products={featured} />
    </section>
  );
}

function ProductRail({ title, products }) {
  return (
    <section className="product-rail">
      <div className="rail-heading">
        <h2>{title}</h2>
        <a href="#products">See all</a>
      </div>
      <div className="rail-grid">
        {products.map((product) => (
          <a className="rail-card" href={productPath(product)} key={product.id}>
            <ProductImage product={product} />
            <div className="rail-meta">
              <p>{product.brand} · {product.category}</p>
              <strong>{product.name}</strong>
              {product.price && <span>{product.price}</span>}
            </div>
            <span className="rail-arrow"><ExternalLink size={16} /></span>
          </a>
        ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
