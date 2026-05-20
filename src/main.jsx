import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUp, ExternalLink, Search, ShieldCheck, SlidersHorizontal, WifiOff } from "lucide-react";
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

  return (
    <main>
      <header className="site-header">
        <div className="brand-row">
          <a className="logo" href="/" aria-label="Best Supply home">Best Supply</a>
          <nav>
            <a href="#products">Products</a>
            <a href="#submit">Submit</a>
            <a href="#about">About</a>
          </nav>
        </div>

        <section className="hero">
          <p className="eyebrow">Community-ranked product directory</p>
          <h1>Best-in-class products, voted by people with taste.</h1>
          <p className="hero-copy">
            A minimal directory for discovering the most loved gear, tools, desk objects, bags, audio, and everyday essentials.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#products">Browse products</a>
            <a className="secondary-link" href="#submit">Suggest a product</a>
          </div>
        </section>
      </header>

      {voteError && (
        <section className="notice" role="status">
          <WifiOff size={17} />
          <span>{voteError}</span>
        </section>
      )}

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
        {filteredProducts.map((product) => {
          const id = productKey(product.id);
          const hasVoted = votedIds.includes(id);

          return (
            <article className="product-card" key={product.id}>
              <a className="image-wrap" href={product.affiliateUrl} target="_blank" rel="noreferrer sponsored noopener">
                <img src={product.image} alt={`${product.brand} ${product.name}`} />
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
                  <button className={hasVoted ? "vote-button voted" : "vote-button"} onClick={() => vote(product.id)} disabled={hasVoted || isLoadingVotes}>
                    <ArrowUp size={16} />
                    <span>{isLoadingVotes ? "..." : votes[id] || 0}</span>
                  </button>
                  <a className="buy-button" href={product.affiliateUrl} target="_blank" rel="noreferrer sponsored noopener">
                    Buy <ExternalLink size={15} />
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="info-grid" id="submit">
        <div className="info-card">
          <ShieldCheck size={22} />
          <h3>Affiliate-ready</h3>
          <p>Edit <code>src/products.js</code> and replace each <code>affiliateUrl</code> with your own tracking link.</p>
        </div>
        <div className="info-card" id="about">
          <ShieldCheck size={22} />
          <h3>Global voting</h3>
          <p>Votes are saved to Supabase and counted publicly across all visitors. Each browser gets one vote per product.</p>
        </div>
      </section>

      <footer>
        <p>Best Supply</p>
        <p>Minimal product discovery, ranked by the community.</p>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
