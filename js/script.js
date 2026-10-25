// Storefront: reads window.PRODUCTS and window.CATEGORIES from js/products.js
const products = (window.PRODUCTS || []).map(p => ({ ...p }));
const categories = window.CATEGORIES || [];

const rp = n => "QAR " + Number(n).toLocaleString("en-US");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let cart = 0, activeCat = "All", q = "";

const heart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.5s-8-4.6-8-11A4.5 4.5 0 0 1 12 6.6a4.5 4.5 0 0 1 8 2.9c0 6.4-8 11-8 11Z"/></svg>';
const bag = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12.5H6L5 8Z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/></svg>';

// Category chips: "All" plus every category that has at least one product
function renderChips() {
  const used = new Set(products.map(p => p.category));
  const list = [...categories.filter(c => used.has(c)), ...[...used].filter(c => c && !categories.includes(c))];
  const special = [];
  if (products.some(p => p.isNew)) special.push(["New", "New Drop 🔥"]);
  special.push(["All", "Shop All 😍"]);
  document.getElementById("chips").innerHTML = [...special, ...list.map(c => [c, c])].map(([key, label]) =>
    `<button class="chip" data-cat="${esc(key)}" aria-pressed="${key === activeCat}">${esc(label)}</button>`).join("");
}

function render() {
  const g = document.getElementById("grid");
  const list = products.filter(p =>
    (activeCat === "All" || (activeCat === "New" ? p.isNew : p.category === activeCat)) &&
    (!q || (p.name + " " + p.category).toLowerCase().includes(q)));
  g.innerHTML = list.length ? list.map(p => {
    const i = products.indexOf(p);
    return `<article class="card${p.soldOut ? " sold" : ""}">
      <div class="photo">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
        ${p.soldOut ? '<span class="tag tag-sold">Sold out</span>' : p.isNew ? '<span class="tag">New</span>' : ""}
      </div>
      <div class="body">
        <h2>${esc(p.name)}</h2>
        <p class="desc">${esc(p.description)}</p>
        <div class="row">
          <span class="price">${rp(p.price)}</span>
          <div class="actions">
            <button class="act fav" data-i="${i}" aria-pressed="${!!p.fav}" aria-label="Save ${esc(p.name)}">${heart}</button>
            <button class="act bag" data-i="${i}" aria-label="Add ${esc(p.name)} to cart"${p.soldOut ? " disabled" : ""}>${bag}</button>
          </div>
        </div>
      </div></article>`;
  }).join("") : '<p class="empty">No items match these filters.</p>';
}
renderChips();
render();

const toast = document.getElementById("toast"); let tt;
function say(m) { toast.textContent = m; toast.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove("show"), 1800); }

document.getElementById("grid").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  const p = products[b.dataset.i];
  if (b.classList.contains("fav")) { p.fav = !p.fav; b.setAttribute("aria-pressed", p.fav); say(p.fav ? "Saved to wishlist" : "Removed from wishlist"); }
  else { cart++; const c = document.getElementById("cartCount"); c.textContent = cart; c.hidden = false; b.classList.add("added"); say(p.name + " added to cart"); }
});
document.getElementById("chips").addEventListener("click", e => {
  const c = e.target.closest(".chip"); if (!c) return;
  activeCat = c.dataset.cat; renderChips(); render();
});
document.getElementById("q").addEventListener("input", e => { q = e.target.value.trim().toLowerCase(); render(); });
