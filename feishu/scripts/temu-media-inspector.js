(() => {
  const PANEL_ID = "temu-media-inspector-panel";
  const existing = document.getElementById(PANEL_ID);
  if (existing) existing.remove();

  const items = collectUsefulMedia();
  const state = { page: { title: document.title, url: location.href, collectedAt: new Date().toISOString() }, items };
  window.__TEMU_MEDIA_INSPECTOR__ = state;
  render(state);

  function collectUsefulMedia() {
    const media = [];
    const seen = new Set();

    for (const img of Array.from(document.images)) {
      const url = normalizeUrl(img.currentSrc || img.src || img.getAttribute("src") || "");
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const item = buildImageItem(img, url);
      if (!item) continue;
      media.push(item);
    }

    for (const video of Array.from(document.querySelectorAll("video, video source"))) {
      const url = normalizeUrl(video.currentSrc || video.src || video.getAttribute("src") || "");
      if (!url || seen.has(url)) continue;
      seen.add(url);
      media.push({
        kind: "video-candidate",
        type: "video",
        label: "",
        url,
        domPath: elementPath(video),
        text: nearbyText(video),
        visible: isVisible(video),
        width: 0,
        height: 0,
        attrs: pickAttrs(video, ["poster", "aria-label", "class", "id"])
      });
    }

    return media.sort(compareMedia);
  }

  function buildImageItem(img, url) {
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    const visible = isVisible(img);
    const alt = img.getAttribute("alt") || "";
    const aria = img.getAttribute("aria-label") || "";
    const path = elementPath(img);
    const text = nearbyText(img);
    const context = `${url} ${path} ${alt} ${aria} ${text}`.toLowerCase();

    if (/^data:/i.test(url)) return null;
    if (!/^https?:\/\//i.test(url)) return null;
    if (width <= 1 || height <= 1) return null;
    if (!visible && width < 500 && height < 500) return null;
    if (/avatar|logo|icon|sprite|placeholder|payment|paypal|visa|mastercard|applepay|googlepay|privacy|secure|discover|affirm|venmo|cashapp|klarna|jcb|maestro|safekey|apwg/i.test(context)) return null;
    if (/upload_aimg_b\/web\/pc|static\.kwcdn\.com|commimg\.kwcdn\.com|avatar\.us\.kwcdn\.com/i.test(url)) return null;
    if (!/kwcdn\.com\/product\//i.test(url) && !/kwcdn\.com\/product\/fancy/i.test(url) && !/kwcdn\.com\/product\/open/i.test(url) && !/kwcdn\.com\/product\/fancyalgo/i.test(url)) return null;

    let kind = "other-candidate";
    if (/goodsdetail|product details|details/i.test(context)) kind = "detail-candidate";
    else if (/ol\._2r2avmpl|goods image|thumb|swiper|carousel|gallery|sp-?\d+/i.test(context) && width >= 500 && height >= 500) kind = "main-candidate";
    else if (/sku|spec|variant|color|size|swatch/i.test(context)) kind = "sku-candidate";
    else if (width >= 700 && height >= 700) kind = "main-candidate";

    return {
      kind,
      type: "image",
      label: "",
      url,
      domPath: path,
      text,
      visible,
      width,
      height,
      attrs: pickAttrs(img, ["alt", "aria-label", "class", "id", "data-testid"])
    };
  }

  function render(state) {
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "top:16px",
      "right:16px",
      "z-index:2147483647",
      "width:520px",
      "max-height:84vh",
      "background:#fff",
      "border:1px solid #d9dde5",
      "border-radius:10px",
      "box-shadow:0 18px 48px rgba(31,35,41,.2)",
      "font:12px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "color:#1f2329",
      "overflow:hidden",
      "display:grid",
      "grid-template-rows:auto auto 1fr"
    ].join(";");

    const counts = countKinds(state.items);
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#1664ff;color:#fff;">
        <strong>Temu Media Inspector</strong>
        <div style="display:flex;gap:6px;">
          <button data-action="download" style="${topBtn()}">Download</button>
          <button data-action="close" style="${topBtn()}">Close</button>
        </div>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid #eff1f5;background:#fafbfc;">
        <div>只保留了更像商品媒体的候选。main ${counts["main-candidate"] || 0} | detail ${counts["detail-candidate"] || 0} | sku ${counts["sku-candidate"] || 0} | video ${counts["video-candidate"] || 0} | other ${counts["other-candidate"] || 0}</div>
      </div>
      <div data-role="body" style="overflow:auto;padding:10px 12px;display:grid;gap:14px;"></div>
    `;

    const body = panel.querySelector("[data-role='body']");
    for (const kind of ["main-candidate", "detail-candidate", "sku-candidate", "video-candidate", "other-candidate"]) {
      const subset = state.items.filter((item) => item.kind === kind);
      if (!subset.length) continue;
      body.appendChild(renderSection(kind, subset));
    }

    panel.querySelector("[data-action='close']").addEventListener("click", () => panel.remove());
    panel.querySelector("[data-action='download']").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(exportLabeled(state), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `temu-media-labeled-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    document.body.appendChild(panel);
  }

  function renderSection(kind, items) {
    const section = document.createElement("section");
    section.style.cssText = "display:grid;gap:8px;";
    section.innerHTML = `
      <div style="display:flex;align-items:end;justify-content:space-between;">
        <div>
          <div style="font-weight:700;">${titleOf(kind)}</div>
          <div style="color:#8f959e;font-size:11px;">${hintOf(kind)}</div>
        </div>
        <div style="display:flex;gap:6px;" data-role="bulk"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;" data-role="grid"></div>
    `;

    const bulk = section.querySelector("[data-role='bulk']");
    for (const [value, text] of [["main", "整组主图"], ["detail", "整组详情"], ["sku", "整组SKU"], ["video", "整组视频"], ["ignore", "整组忽略"], ["", "清空"]]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.style.cssText = miniBtn();
      btn.addEventListener("click", () => {
        for (const item of items) item.label = value;
        section.querySelectorAll("[data-item-url]").forEach((node) => {
          const item = items.find((x) => x.url === node.getAttribute("data-item-url"));
          if (item) paintTile(node, item.label);
        });
      });
      bulk.appendChild(btn);
    }

    const grid = section.querySelector("[data-role='grid']");
    for (const item of items) grid.appendChild(renderTile(item));
    return section;
  }

  function renderTile(item) {
    const tile = document.createElement("article");
    tile.setAttribute("data-item-url", item.url);
    tile.style.cssText = "display:grid;gap:4px;padding:6px;border:1px solid #eff1f5;border-radius:8px;background:#fff;";

    const media = document.createElement(item.type === "video" ? "video" : "img");
    media.src = item.url;
    if (item.type === "video") media.controls = true;
    media.style.cssText = "width:100%;aspect-ratio:1;border:1px solid #eff1f5;border-radius:6px;object-fit:cover;background:#f6f7f9;";

    const meta = document.createElement("div");
    meta.style.cssText = "font-size:10px;color:#8f959e;line-height:1.25;";
    meta.textContent = `${item.width}x${item.height} ${item.visible === false ? "hidden" : ""}`.trim();

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
    for (const [value, text] of [["main", "主"], ["detail", "详"], ["sku", "SKU"], ["video", "视"], ["ignore", "忽"]]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.style.cssText = labelBtn(value, false);
      btn.addEventListener("click", () => {
        item.label = value;
        paintTile(tile, value);
        actions.querySelectorAll("button").forEach((node) => node.style.cssText = labelBtn(node.dataset.value, node.dataset.value === value));
      });
      btn.dataset.value = value;
      actions.appendChild(btn);
    }

    const path = document.createElement("div");
    path.style.cssText = "font-size:10px;color:#8f959e;word-break:break-all;";
    path.textContent = shortPath(item.domPath);

    tile.append(media, meta, actions, path);
    paintTile(tile, item.label);
    return tile;
  }

  function exportLabeled(state) {
    const items = state.items.filter((item) => item.label);
    return {
      page: state.page,
      summary: {
        total_labeled: items.length,
        main: items.filter((x) => x.label === "main").length,
        detail: items.filter((x) => x.label === "detail").length,
        sku: items.filter((x) => x.label === "sku").length,
        video: items.filter((x) => x.label === "video").length,
        ignore: items.filter((x) => x.label === "ignore").length
      },
      items
    };
  }

  function countKinds(items) {
    return items.reduce((acc, item) => ((acc[item.kind] = (acc[item.kind] || 0) + 1), acc), {});
  }

  function compareMedia(a, b) {
    const order = { "main-candidate": 0, "detail-candidate": 1, "sku-candidate": 2, "video-candidate": 3, "other-candidate": 4 };
    const diff = (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
    if (diff) return diff;
    return (b.width * b.height) - (a.width * a.height);
  }

  function titleOf(kind) {
    return {
      "main-candidate": "主图候选",
      "detail-candidate": "详情候选",
      "sku-candidate": "SKU候选",
      "video-candidate": "视频候选",
      "other-candidate": "其他候选"
    }[kind] || kind;
  }

  function hintOf(kind) {
    return {
      "main-candidate": "优先看轮播缩略图和 800x800 的 Goods Image",
      "detail-candidate": "优先看 goodsDetail / Product details",
      "sku-candidate": "优先看规格、颜色、variant 区域",
      "video-candidate": "有一条就够",
      "other-candidate": "剩余少量候选，必要时再看"
    }[kind] || "";
  }

  function paintTile(tile, label) {
    const map = {
      main: "#0958d9",
      detail: "#d46b08",
      sku: "#389e0d",
      video: "#722ed1",
      ignore: "#cf1322",
      "": "#eff1f5"
    };
    tile.style.outline = label ? `2px solid ${map[label]}` : "";
    tile.style.outlineOffset = label ? "1px" : "";
  }

  function shortPath(path) {
    return String(path || "").split(" < ").slice(0, 4).join(" < ");
  }

  function elementPath(node) {
    if (!node || !node.tagName) return "";
    const parts = [];
    let current = node;
    while (current && current !== document.body && parts.length < 6) {
      const chunk = [
        current.tagName.toLowerCase(),
        current.id ? `#${current.id}` : "",
        current.className && typeof current.className === "string" ? `.${current.className.trim().replace(/\s+/g, ".")}` : ""
      ].filter(Boolean).join("");
      parts.push(chunk);
      current = current.parentElement;
    }
    return parts.join(" < ");
  }

  function nearbyText(node) {
    const parent = node?.closest?.("li, div, section, button, a") || node?.parentElement;
    return String(parent?.innerText || parent?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function pickAttrs(node, names) {
    const out = {};
    for (const name of names) {
      const value = node.getAttribute?.(name);
      if (value) out[name] = value;
    }
    return out;
  }

  function isVisible(node) {
    if (!node || !node.getBoundingClientRect) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function normalizeUrl(url) {
    if (!url) return "";
    let value = String(url).trim().replaceAll("\\/", "/").replaceAll("\\u002F", "/").replace(/&amp;/g, "&");
    if (value.startsWith("//")) value = `${location.protocol}${value}`;
    if (value.startsWith("/")) value = `${location.origin}${value}`;
    return value;
  }

  function topBtn() {
    return "height:24px;border:1px solid rgba(255,255,255,.45);border-radius:4px;background:rgba(255,255,255,.14);color:#fff;font-size:12px;cursor:pointer;";
  }

  function miniBtn() {
    return "height:22px;padding:0 8px;border:1px solid #d9dde5;border-radius:999px;background:#fff;color:#1f2329;font-size:11px;cursor:pointer;";
  }

  function labelBtn(value, active) {
    const colors = {
      main: ["#e6f4ff", "#0958d9", "#91caff"],
      detail: ["#fff7e6", "#d46b08", "#ffd591"],
      sku: ["#f6ffed", "#389e0d", "#b7eb8f"],
      video: ["#f9f0ff", "#722ed1", "#d3adf7"],
      ignore: ["#fff1f0", "#cf1322", "#ffa39e"]
    };
    const [bg, fg, border] = colors[value];
    return `height:20px;padding:0 6px;border:1px solid ${active ? fg : border};border-radius:999px;background:${active ? bg : "#fff"};color:${fg};font-size:10px;cursor:pointer;`;
  }
})();
