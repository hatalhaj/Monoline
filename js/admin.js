// Shop dashboard
// Reads js/products.js, lets you add / edit / delete products,
// then saves js/products.js and new photos straight into the site folder
// (Chrome or Edge), or downloads them if the browser can't write to folders.

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const qar = n => "QAR " + Number(n).toLocaleString("en-US");

let products = JSON.parse(JSON.stringify(window.PRODUCTS || []));
let categories = [...(window.CATEGORIES || ["T-Shirts", "Shirts", "Hoodies", "Pants"])];
let dirHandle = null;
let dirty = false;
const pending = new Map();   // product id -> { blob, url } for photos not yet saved
let editingId = null, formBlob = null, formUrl = null;
let filterCat = "All", q = "", confirmId = null;

const canWriteFolders = "showDirectoryPicker" in window;

/* ---------- helpers ---------- */
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2200); }
function notice(html) { const n = $("notice"); if (!html) { n.hidden = true; return; } n.innerHTML = html; n.hidden = false; }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "product"; }
function imgSrc(p) { return pending.has(p.id) ? pending.get(p.id).url : p.image; }

function setDirty(v) {
  dirty = v;
  $("saveBtn").disabled = !dirty;
  updateStatus();
}
function updateStatus() {
  const s = $("status");
  const where = gh ? "GitHub: " + gh.repo : dirHandle ? "folder " + dirHandle.name : "";
  s.classList.toggle("on", !!where && !dirty);
  s.classList.toggle("dirty", dirty);
  $("statusText").textContent = dirty ? "Unsaved changes" : where ? "Connected to " + where : "Not connected";
  $("connectBtn").textContent = dirHandle ? "Change folder" : "Connect site folder";
  $("ghBtn").textContent = gh ? "GitHub settings" : "Connect GitHub";
  $("saveBtn").textContent = gh ? "Save & publish" : "Save changes";
}

/* ---------- photo handling: resize big photos to keep the shop fast ---------- */
function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1400;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error("Could not read that image")), "image/jpeg", 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't an image the browser can open")); };
    img.src = url;
  });
}

async function useFile(file) {
  if (!file || !file.type.startsWith("image/")) { showError("Choose an image file (JPG, PNG or WebP)."); return; }
  try {
    formBlob = await prepareImage(file);
    if (formUrl) URL.revokeObjectURL(formUrl);
    formUrl = URL.createObjectURL(formBlob);
    showPreview(formUrl);
    showError("");
  } catch (e) { showError(e.message); }
}
function showPreview(src) {
  const p = $("preview");
  if (src) { p.src = src; p.hidden = false; $("drop").classList.add("has"); $("dropText").innerHTML = "<b>Change photo</b><br>Change photo"; }
  else { p.hidden = true; p.removeAttribute("src"); $("drop").classList.remove("has"); $("dropText").innerHTML = "<b>Upload photo</b><br>Click or drag an image here"; }
}
function showError(m) { $("formError").textContent = m; $("formError").hidden = !m; }

/* ---------- rendering ---------- */
const editIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';
const delIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

function render() {
  // summary
  const live = products.filter(p => !p.soldOut).length;
  $("summary").textContent = `${products.length} products · ${live} in stock · ${products.length - live} sold out`;

  // category filter with counts
  const cats = ["All", ...categories.filter(c => products.some(p => p.category === c)),
    ...[...new Set(products.map(p => p.category))].filter(c => c && !categories.includes(c))];
  if (!cats.includes(filterCat)) filterCat = "All";
  $("catFilter").innerHTML = cats.map(c => {
    const n = c === "All" ? products.length : products.filter(p => p.category === c).length;
    return `<button type="button" data-cat="${esc(c)}" aria-pressed="${c === filterCat}">${esc(c)}<small>${n}</small></button>`;
  }).join("");

  // category suggestions in the form
  const allCats = [...new Set([...categories, ...products.map(p => p.category)])].filter(Boolean);
  $("catList").innerHTML = allCats.map(c => `<option value="${esc(c)}"></option>`).join("");

  // rows
  const list = products.filter(p =>
    (filterCat === "All" || p.category === filterCat) &&
    (!q || (p.name + " " + p.category + " " + p.description).toLowerCase().includes(q)));
  $("rows").innerHTML = list.length ? list.map(p => {
    const status = [
      p.soldOut ? '<span class="pill sold">Sold out</span>' : '<span class="pill">In stock</span>',
      p.isNew && !p.soldOut ? '<span class="pill new">New</span>' : "",
      pending.has(p.id) ? '<span class="pill unsaved">Photo not saved</span>' : ""
    ].join(" ");
    const actions = confirmId === p.id
      ? `<div class="confirm">Delete? <button type="button" class="yes" data-act="yes" data-id="${p.id}">Delete</button><button type="button" data-act="no">Keep</button></div>`
      : `<div class="row-actions"><button type="button" class="icon" data-act="edit" data-id="${p.id}" aria-label="Edit ${esc(p.name)}">${editIcon}</button><button type="button" class="icon del" data-act="del" data-id="${p.id}" aria-label="Delete ${esc(p.name)}">${delIcon}</button></div>`;
    return `<tr class="${editingId === p.id ? "editing" : ""}">
      <td><div class="prod"><img class="thumb" src="${esc(imgSrc(p))}" alt=""><div style="min-width:0"><b>${esc(p.name)}</b><small>${esc(p.description)}</small></div></div></td>
      <td>${esc(p.category)}</td>
      <td class="num">${qar(p.price)}</td>
      <td>${status}</td>
      <td>${actions}</td></tr>`;
  }).join("") : `<tr class="empty"><td colspan="5">${products.length ? "No products match." : "No products yet. Add your first one with the form."}</td></tr>`;
}

/* ---------- form ---------- */
function resetForm() {
  editingId = null; formBlob = null;
  if (formUrl) { URL.revokeObjectURL(formUrl); formUrl = null; }
  $("form").reset(); showPreview(null); showError("");
  $("formTitle").textContent = "Add product"; $("submitBtn").textContent = "Add product"; $("cancelBtn").hidden = true;
  render();
}
function startEdit(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  resetForm();
  editingId = id;
  $("name").value = p.name; $("description").value = p.description || ""; $("price").value = p.price;
  $("category").value = p.category; $("isNew").checked = !!p.isNew; $("soldOut").checked = !!p.soldOut;
  showPreview(imgSrc(p));
  $("formTitle").textContent = "Edit product"; $("submitBtn").textContent = "Update product"; $("cancelBtn").hidden = false;
  render();
  if (window.innerWidth <= 900) $("form").scrollIntoView({ behavior: "smooth" });
  $("name").focus({ preventScroll: true });
}

$("form").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("name").value.trim();
  const price = $("price").value === "" ? NaN : Number($("price").value);
  const category = $("category").value.trim();
  if (!editingId && !formBlob) return showError("Add a photo for this product.");
  if (!name) return showError("Give the product a name.");
  if (!(price >= 0)) return showError("Enter a price in QAR, for example 99.");
  if (!category) return showError("Choose a category, for example T-Shirts.");

  const data = { name, description: $("description").value.trim(), price, category, isNew: $("isNew").checked, soldOut: $("soldOut").checked };
  let p;
  if (editingId) { p = products.find(x => x.id === editingId); Object.assign(p, data); }
  else { p = { id: "p" + Date.now().toString(36), ...data, image: "" }; products.unshift(p); }
  if (formBlob) {
    if (pending.has(p.id)) URL.revokeObjectURL(pending.get(p.id).url);
    pending.set(p.id, { blob: formBlob, url: URL.createObjectURL(formBlob) });
  }
  if (!categories.includes(category)) categories.push(category);
  const verb = editingId ? "Updated" : "Added";
  setDirty(true); resetForm();
  toast(`${verb} ${name}. Click Save changes to update the shop.`);
});
$("cancelBtn").addEventListener("click", resetForm);
$("newBtn").addEventListener("click", () => { resetForm(); $("name").focus(); if (window.innerWidth <= 900) $("form").scrollIntoView({ behavior: "smooth" }); });

// photo input + drag and drop
$("image").addEventListener("change", e => useFile(e.target.files[0]));
const drop = $("drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => useFile(e.dataTransfer.files[0]));

/* ---------- table actions ---------- */
$("rows").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.act === "edit") startEdit(id);
  if (b.dataset.act === "del") { confirmId = id; render(); }
  if (b.dataset.act === "no") { confirmId = null; render(); }
  if (b.dataset.act === "yes") {
    const p = products.find(x => x.id === id);
    products = products.filter(x => x.id !== id);
    if (pending.has(id)) { URL.revokeObjectURL(pending.get(id).url); pending.delete(id); }
    if (editingId === id) resetForm();
    confirmId = null; setDirty(true); render();
    toast(`Deleted ${p ? p.name : "product"}. Click Save changes to update the shop.`);
  }
});
$("catFilter").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; filterCat = b.dataset.cat; render(); });
$("search").addEventListener("input", e => { q = e.target.value.trim().toLowerCase(); render(); });

/* ---------- products.js read / write ---------- */
function buildProductsJs() {
  const clean = products.map(({ id, name, description, price, category, image, isNew, soldOut }) => ({ id, name, description, price, category, image, isNew: !!isNew, soldOut: !!soldOut }));
  return "// Product list. Edit with admin.html, or by hand.\n" +
    "window.CATEGORIES = " + JSON.stringify(categories) + ";\n" +
    "window.PRODUCTS = " + JSON.stringify(clean, null, 2) + ";\n";
}
function parseProductsJs(text) {
  const w = {};
  new Function("window", text)(w);
  if (!Array.isArray(w.PRODUCTS)) throw new Error("js/products.js doesn't contain a product list");
  return w;
}
function photoName(p) { return `${slug(p.name)}-${p.id}.jpg`; }

/* ---------- connect folder ---------- */
$("connectBtn").addEventListener("click", async () => {
  if (!canWriteFolders) {
    notice("This browser can't save into folders. Open <b>admin.html</b> in <b>Chrome</b> or <b>Edge</b> to save directly. In this browser, <b>Save changes</b> downloads the files instead.");
    return;
  }
  try {
    const h = await window.showDirectoryPicker({ id: "shop-site", mode: "readwrite" });
    let text;
    try {
      const js = await h.getDirectoryHandle("js");
      text = await (await (await js.getFileHandle("products.js")).getFile()).text();
    } catch {
      notice(`The folder <b>${esc(h.name)}</b> doesn't have <b>js/products.js</b>. Choose the site folder, the one that contains index.html and admin.html.`);
      return;
    }
    dirHandle = h; gh = null;
    if (!dirty) {
      const w = parseProductsJs(text);
      products = w.PRODUCTS; if (Array.isArray(w.CATEGORIES)) categories = w.CATEGORIES;
    }
    notice(""); updateStatus(); render();
    toast(`Connected to ${h.name}`);
  } catch (e) {
    if (e.name !== "AbortError") notice("Couldn't open that folder: " + esc(e.message));
  }
});

/* ---------- GitHub ---------- */
// Settings are kept in this browser only (localStorage).
const GH_KEY = "shopGitHub";
let gh = null;                 // { owner, repo, branch, token } once connected
let ghSha = null;              // sha of js/products.js on GitHub

function ghLoadSaved() { try { return JSON.parse(localStorage.getItem(GH_KEY) || "null"); } catch { return null; } }
function ghStore(v) { try { v ? localStorage.setItem(GH_KEY, JSON.stringify(v)) : localStorage.removeItem(GH_KEY); } catch {} }

async function ghApi(cfg, path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${path}`, {
    ...opts,
    headers: { "Authorization": "Bearer " + cfg.token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) }
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    let msg = res.statusText; try { msg = (await res.json()).message || msg; } catch {}
    if (res.status === 401) msg = "The token isn't valid. Check you copied all of it";
    if (res.status === 403) msg = "The token doesn't have write access. Give it Contents: Read and write for this repository";
    throw new Error(msg);
  }
  return res.status === 204 ? {} : res.json();
}
const b64ToText = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));
function bytesToB64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
const textToB64 = t => bytesToB64(new TextEncoder().encode(t));
const blobToB64 = async b => bytesToB64(new Uint8Array(await b.arrayBuffer()));

async function ghPut(cfg, path, b64, message) {
  const existing = await ghApi(cfg, `contents/${path}?ref=${encodeURIComponent(cfg.branch)}`);
  return ghApi(cfg, `contents/${path}`, { method: "PUT", body: JSON.stringify({ message, content: b64, branch: cfg.branch, ...(existing && existing.sha ? { sha: existing.sha } : {}) }) });
}

async function ghConnect(cfg, quiet) {
  const file = await ghApi(cfg, `contents/js/products.js?ref=${encodeURIComponent(cfg.branch)}`);
  if (!file) {
    const repo = await ghApi(cfg, "");
    throw new Error(repo ? `Couldn't find js/products.js on the "${cfg.branch}" branch. Upload the site files first` : `Couldn't find the repository ${cfg.owner}/${cfg.repo}. Check the username and name`);
  }
  gh = cfg; ghSha = file.sha; dirHandle = null;
  if (!dirty) {
    const w = parseProductsJs(b64ToText(file.content));
    products = w.PRODUCTS; if (Array.isArray(w.CATEGORIES)) categories = w.CATEGORIES;
  }
  ghStore(cfg); updateStatus(); render();
  if (!quiet) toast(`Connected to GitHub: ${cfg.repo}`);
}

function ghFillForm() {
  const saved = gh || ghLoadSaved() || {};
  const host = location.hostname.endsWith(".github.io") ? location.hostname.split(".")[0] : "";
  const repoFromPath = host ? location.pathname.split("/").filter(Boolean)[0] || "" : "";
  $("ghOwner").value = saved.owner || host;
  $("ghRepo").value = saved.repo || (repoFromPath.endsWith(".html") ? "" : repoFromPath);
  $("ghBranch").value = saved.branch || "main";
  $("ghToken").value = saved.token || "";
  $("ghError").hidden = true;
}
$("ghBtn").addEventListener("click", () => { ghFillForm(); $("ghPanel").hidden = false; $("ghOwner").focus(); });
$("ghClose").addEventListener("click", () => { $("ghPanel").hidden = true; });
$("ghForget").addEventListener("click", () => { gh = null; ghSha = null; ghStore(null); ghFillForm(); $("ghToken").value = ""; updateStatus(); toast("Disconnected from GitHub"); });
$("ghForm").addEventListener("submit", async e => {
  e.preventDefault();
  const cfg = { owner: $("ghOwner").value.trim(), repo: $("ghRepo").value.trim(), branch: $("ghBranch").value.trim() || "main", token: $("ghToken").value.trim() };
  const err = m => { $("ghError").textContent = m; $("ghError").hidden = !m; };
  if (!cfg.owner || !cfg.repo || !cfg.token) return err("Fill in your username, the repository name and the token.");
  const b = $("ghConnect"); b.disabled = true; b.textContent = "Connecting…"; err("");
  try { await ghConnect(cfg); $("ghPanel").hidden = true; notice(""); }
  catch (x) { err(x.message + "."); }
  finally { b.disabled = false; b.textContent = "Connect"; }
});

/* ---------- save ---------- */
async function writeFile(dir, name, data) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable(); await w.write(data); await w.close();
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

$("saveBtn").addEventListener("click", async () => {
  const btn = $("saveBtn"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    // give every new photo its final path first
    for (const [id] of pending) { const p = products.find(x => x.id === id); if (p) p.image = "images/" + photoName(p); }

    if (gh) {
      let n = 0;
      for (const [id, ph] of pending) {
        const p = products.find(x => x.id === id); if (!p) continue;
        btn.textContent = `Uploading photo ${++n} of ${pending.size}…`;
        await ghPut(gh, p.image, await blobToB64(ph.blob), `Photo for ${p.name}`);
      }
      btn.textContent = "Publishing…";
      await ghPut(gh, "js/products.js", textToB64(buildProductsJs()), "Update products");
      pending.forEach(ph => URL.revokeObjectURL(ph.url)); pending.clear();
      setDirty(false); render();
      toast("Published. The live shop updates within a few minutes.");
    } else if (dirHandle) {
      if ((await dirHandle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("Permission to write to the folder was not given");
      const imgDir = await dirHandle.getDirectoryHandle("images", { create: true });
      for (const [id, ph] of pending) { const p = products.find(x => x.id === id); if (p) await writeFile(imgDir, photoName(p), ph.blob); }
      await writeFile(await dirHandle.getDirectoryHandle("js"), "products.js", buildProductsJs());
      pending.forEach(ph => URL.revokeObjectURL(ph.url)); pending.clear();
      setDirty(false); render();
      toast("Saved. Refresh the shop page to see the changes.");
    } else {
      const photos = [...pending].map(([id, ph]) => ({ p: products.find(x => x.id === id), ph })).filter(x => x.p);
      downloadBlob(new Blob([buildProductsJs()], { type: "text/javascript" }), "products.js");
      photos.forEach(({ p, ph }, i) => setTimeout(() => downloadBlob(ph.blob, photoName(p)), 300 * (i + 1)));
      notice(`Downloaded <b>products.js</b>${photos.length ? ` and ${photos.length} photo${photos.length > 1 ? "s" : ""}` : ""}. Move <b>products.js</b> into the site's <b>js</b> folder${photos.length ? " and the photos into the <b>images</b> folder" : ""}, replacing the old file. ${canWriteFolders ? "Next time, click <b>Connect site folder</b> first and it saves for you." : "In Chrome or Edge this saves straight into the folder."}`);
      pending.forEach(ph => URL.revokeObjectURL(ph.url)); pending.clear();
      setDirty(false); render();
    }
  } catch (e) {
    notice("Couldn't save: " + esc(e.message) + ". Your changes are still here; try again.");
    btn.disabled = false;
  } finally {
    updateStatus(); if (dirty) btn.disabled = false;
  }
});

window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

if (!window.PRODUCTS) notice("Couldn't load <b>js/products.js</b>. Keep admin.html in the site folder next to index.html.");
updateStatus();
render();
{ const saved = ghLoadSaved(); if (saved && saved.token) ghConnect(saved, true).catch(e => notice("Couldn't reconnect to GitHub: " + esc(e.message) + ". Click <b>GitHub settings</b> to fix it.")); }
