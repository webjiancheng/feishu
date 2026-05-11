// ============================================================
// 飞书电商采集插件 - content script 主脚本
// 功能: 在网页中注入采集面板，自动识别商品数据
// ============================================================

const SERVER_URL = "http://127.0.0.1:17321"; // 后端同步服务地址

/**
 * 监听 Chrome 扩展消息
 * 接收来自 popup 的采集请求
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "COLLECT_PRODUCT") return;

  try {
    sendResponse({ ok: true, product: collectProduct(message.options || {}) });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
});

// 页面加载时初始化浮窗采集面板
initFloatingCollector();

/**
 * 初始化浮窗采集面板
 * 1. 创建固定位置的采集面板 DOM
 * 2. 绑定所有按钮事件
 * 3. 初始化拖拽功能
 * 4. 自动刷新显示商品数据
 */
function initFloatingCollector() {
  if (window.top !== window) return;
  if (document.getElementById("feishu-product-sync-panel")) return;

  const panel = document.createElement("section");
  panel.id = "feishu-product-sync-panel";
  panel.style.cssText = [
    "position:fixed",
    "right:18px",
    "bottom:86px",
    "z-index:2147483647",
    "width:320px",
    "max-height:72vh",
    "border:1px solid #d9dde5",
    "border-radius:8px",
    "background:#fff",
    "box-shadow:0 16px 48px rgba(31,35,41,.22)",
    "color:#1f2329",
    "font:13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "overflow:hidden"
  ].join(";");

  panel.innerHTML = `
    <div data-role="drag" style="display:flex;align-items:center;justify-content:space-between;height:38px;padding:0 10px;background:#1664ff;color:#fff;cursor:move;user-select:none;">
      <strong style="font-size:14px;">商品同步助手</strong>
      <div style="display:flex;gap:6px;">
        <button data-action="refresh" style="${panelIconButtonStyle()}">刷新</button>
        <button data-action="collapse" style="${panelIconButtonStyle()}">收起</button>
      </div>
    </div>
    <div data-role="body" style="display:grid;gap:10px;padding:10px;max-height:calc(72vh - 38px);overflow:auto;">
      <div data-role="status" style="padding:8px;border-radius:6px;background:#f6f7f9;color:#646a73;">正在读取当前商品页...</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
        <div style="${panelStatStyle()}"><span>平台</span><b data-role="platform">-</b></div>
        <div style="${panelStatStyle()}"><span>价格</span><b data-role="price">-</b></div>
        <div style="${panelStatStyle()}"><span>图片</span><b data-role="image-count">-</b></div>
        <div style="${panelStatStyle()}"><span>SKU</span><b data-role="sku-count">-</b></div>
      </div>
      <div>
        <div style="margin-bottom:4px;color:#646a73;font-size:12px;">商品标题</div>
        <div data-role="title" style="max-height:40px;overflow:hidden;font-weight:600;">-</div>
      </div>
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="color:#646a73;font-size:12px;">SKU 选择</span>
          <span>
            <button data-action="select-all" style="${panelSmallButtonStyle()}">全选</button>
            <button data-action="clear" style="${panelSmallButtonStyle()}">清空</button>
          </span>
        </div>
        <div data-role="sku-list" style="display:grid;gap:6px;max-height:160px;overflow:auto;padding:8px;border:1px solid #eff1f5;border-radius:6px;background:#fafbfc;">
          <span style="color:#8f959e;font-size:12px;">等待识别 SKU...</span>
        </div>
      </div>
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="color:#646a73;font-size:12px;">图片预览</span>
          <span>
            <button data-action="download-main" style="${panelSmallButtonStyle()}">下主图</button>
            <button data-action="download-sku" style="${panelSmallButtonStyle()}">下SKU图</button>
            <button data-action="screenshot" style="${panelSmallButtonStyle()}">截网页</button>
          </span>
        </div>
        <div style="display:grid;gap:8px;">
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;color:#646a73;font-size:12px;">
              <span>主图预览</span>
              <span data-role="main-image-count">0 张</span>
            </div>
            <div data-role="main-image-preview" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;"></div>
          </div>
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;color:#646a73;font-size:12px;">
              <span>SKU图预览</span>
              <span data-role="sku-image-count">0 张</span>
            </div>
            <div data-role="sku-image-preview" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;"></div>
          </div>
        </div>
      </div>
      <div data-role="service-tip" style="display:none;padding:8px;border-radius:6px;background:#fff7e6;color:#ad6800;font-size:12px;">
        本地服务未启动：在项目目录运行 npm run sync-server 后点刷新。
      </div>
      <button data-action="sync" style="height:38px;border:0;border-radius:6px;background:#1664ff;color:#fff;font-weight:600;cursor:pointer;">同步选中 SKU 到飞书</button>
    </div>
  `;

  panel.querySelector("[data-action='refresh']").addEventListener("click", () => refreshFloatingPanel(panel));
  panel.querySelector("[data-action='sync']").addEventListener("click", () => syncFromFloatingPanel(panel));
  panel.querySelector("[data-action='download-main']").addEventListener("click", () => downloadFloatingImages(panel, "main"));
  panel.querySelector("[data-action='download-sku']").addEventListener("click", () => downloadFloatingImages(panel, "sku"));
  panel.querySelector("[data-action='screenshot']").addEventListener("click", () => captureScreenshotForPanel(panel));
  panel.querySelector("[data-action='select-all']").addEventListener("click", () => setFloatingSkuChecked(panel, true));
  panel.querySelector("[data-action='clear']").addEventListener("click", () => setFloatingSkuChecked(panel, false));
  panel.querySelector("[data-action='collapse']").addEventListener("click", () => toggleFloatingPanel(panel));
  makePanelDraggable(panel, panel.querySelector("[data-role='drag']"));

  const mount = () => {
    document.body?.appendChild(panel);
    refreshFloatingPanel(panel);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}

/**
 * 从浮窗同步商品数据到飞书
 * 流程: 检查服务 → 收集数据 → 同步/缓存 → 显示结果
 * @param {HTMLElement} panel - 采集浮窗面板元素
 */
async function syncFromFloatingPanel(panel) {
  try {
    const serviceReady = await checkFloatingService(panel);
    const product = prepareProductForSubmit(collectProduct({ selectedSkus: getFloatingSelectedSkus(panel) }));
    assertCollectable(product);
    if (!serviceReady) {
      setPanelStatus(panel, "本地服务未启动，未同步。请先运行 npm run sync-server", true);
      return;
    }

    setPanelStatus(panel, "正在同步选中的 SKU...");
    try {
      product["网页截图"] = await captureAndUploadScreenshot(product["*产品主编号"] || product["货源ID"] || product["平台SKU"]);
    } catch (error) {
      setPanelStatus(panel, `${error.message}。截图失败，但继续同步商品数据。`, true);
      product["网页截图"] = "";
    }
    const response = await fetch(`${SERVER_URL}/sync/product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product)
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "同步失败");
    renderFloatingPanel(panel, product);
    setPanelStatus(panel, "已同步到飞书");
  } catch (error) {
    setPanelStatus(panel, error.message, true);
  }
}

/**
 * 刷新浮窗显示
 * 重新采集商品数据并更新浮窗UI
 * 
 * @param {HTMLElement} panel - 采集浮窗面板
 */
async function refreshFloatingPanel(panel) {
  try {
    const product = collectProduct();
    renderFloatingPanel(panel, product);
    const serviceReady = await checkFloatingService(panel);
    setPanelStatus(panel, serviceReady ? "已读取当前商品，可选择 SKU 后同步" : "已读取当前商品，但本地服务未启动", !serviceReady);
  } catch (error) {
    setPanelStatus(panel, `读取失败：${error.message}`, true);
  }
}

/**
 * 检查后端服务是否可用
 * 发送Health Check请求，根据结果更新浮窗按钮状态
 * - 服务可用: 按钮蓝色, 可直接同步
 * - 服务不可用: 按钮灰色, 提醒启动本地服务
 * 
 * @param {HTMLElement} panel - 采集浮窗面板
 * @returns {boolean} 服务是否可用
 */
async function checkFloatingService(panel) {
  const syncButton = panel.querySelector("[data-action='sync']");
  const tip = panel.querySelector("[data-role='service-tip']");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(`${SERVER_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await response.json();
    if (!data.ok) throw new Error("service not ready");
    panel.__serviceReady = true;
    syncButton.disabled = false;
    syncButton.textContent = "同步选中 SKU 到飞书";
    syncButton.style.background = "#1664ff";
    syncButton.style.cursor = "pointer";
    tip.style.display = "none";
    return true;
  } catch {
    panel.__serviceReady = false;
    syncButton.disabled = true;
    syncButton.textContent = "请先启动本地服务";
    syncButton.style.background = "#a6a6a6";
    syncButton.style.cursor = "not-allowed";
    tip.style.display = "block";
    return false;
  }
}

function renderFloatingPanel(panel, product) {
  const debug = product._debug || {};
  panel.__lastProduct = product;
  panel.querySelector("[data-role='platform']").textContent = product["货源平台"] || "-";
  panel.querySelector("[data-role='price']").textContent = product["*SKU售价"] || "-";
  panel.querySelector("[data-role='image-count']").textContent = countProductImages(product);
  const selectedCount = Array.isArray(debug.selectedSkuLabels) ? debug.selectedSkuLabels.length : (debug.skuCount || 0);
  panel.querySelector("[data-role='sku-count']").textContent = `${selectedCount}/${debug.skuCount || 0}`;
  panel.querySelector("[data-role='title']").textContent = product["*产品名称"] || "-";
  renderFloatingSkuList(panel, debug.skuOptions || [], debug.selectedSkuLabels || []);
  renderFloatingImages(panel, "main-image-preview", debug.mainImages || [], 10);
  renderFloatingImages(panel, "sku-image-preview", debug.skuImages || [], 10);
  panel.querySelector("[data-role='main-image-count']").textContent = `${(debug.mainImages || []).length} 张`;
  panel.querySelector("[data-role='sku-image-count']").textContent = `${(debug.skuImages || []).length} 张`;
}

function renderFloatingSkuList(panel, skuOptions, selectedLabels) {
  const list = panel.querySelector("[data-role='sku-list']");
  list.textContent = "";
  if (!skuOptions.length) {
    const empty = document.createElement("span");
    empty.textContent = "当前页面没有识别到可选择 SKU";
    empty.style.cssText = "color:#8f959e;font-size:12px;";
    list.appendChild(empty);
    return;
  }
  const selected = new Set(Array.isArray(selectedLabels) ? selectedLabels : skuOptions.map((sku) => sku.label));
  for (const sku of skuOptions) {
    const item = document.createElement("label");
    item.style.cssText = "display:grid;grid-template-columns:16px 32px 1fr;gap:8px;align-items:center;min-height:32px;margin:0;cursor:pointer;";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = sku.label;
    checkbox.checked = selected.has(sku.label);
    checkbox.style.cssText = "width:16px;height:16px;margin:0;";
    checkbox.addEventListener("change", () => updateFloatingSkuCount(panel));

    const image = document.createElement("img");
    image.alt = "";
    image.src = sku.image || "";
    image.style.cssText = "width:32px;height:32px;border:1px solid #eff1f5;border-radius:4px;object-fit:cover;background:#f6f7f9;";

    const name = document.createElement("span");
    name.textContent = sku.label;
    name.title = sku.label;
    name.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;";

    item.append(checkbox, image, name);
    list.appendChild(item);
  }
  updateFloatingSkuCount(panel);
}

function renderFloatingImages(panel, role, images, limit = 8) {
  const box = panel.querySelector(`[data-role='${role}']`);
  box.textContent = "";
  for (const url of images.filter(Boolean).slice(0, limit)) {
    const wrapper = document.createElement("button");
    wrapper.type = "button";
    wrapper.title = "下载这张图片";
    wrapper.style.cssText = "width:100%;padding:0;border:0;background:transparent;cursor:pointer;";
    wrapper.addEventListener("click", () => downloadImages([url], "single"));

    const image = document.createElement("img");
    image.src = url;
    image.alt = "";
    image.style.cssText = "width:100%;aspect-ratio:1;border:1px solid #eff1f5;border-radius:4px;object-fit:cover;background:#f6f7f9;";
    wrapper.appendChild(image);
    box.appendChild(wrapper);
  }
}

async function captureScreenshotForPanel(panel) {
  try {
    const product = panel.__lastProduct || collectProduct();
    const url = await captureAndUploadScreenshot(product["*产品主编号"] || product["货源ID"] || product["平台SKU"]);
    panel.__lastScreenshot = url;
    setPanelStatus(panel, "已截取当前网页画面，同步时会写入表格");
  } catch (error) {
    setPanelStatus(panel, `截图失败：${error.message}`, true);
  }
}

async function captureAndUploadScreenshot(productId) {
  const dataUrl = await captureCurrentPageScreenshot();
  const response = await fetch(`${SERVER_URL}/sync/screenshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, dataUrl })
  });
  const data = await response.json();
  if (!data.ok || !data.url) throw new Error(data.error || "截图保存失败");
  return data.url;
}

function captureCurrentPageScreenshot() {
  return new Promise((resolve, reject) => {
    const panel = document.getElementById("feishu-product-sync-panel");
    const previousDisplay = panel?.style.display;
    if (panel) panel.style.display = "none";
    requestAnimationFrame(() => {
      chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" }, (response) => {
        if (panel) panel.style.display = previousDisplay || "";
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok || !response.dataUrl) {
          reject(new Error(response?.error || "无法截取当前网页"));
          return;
        }
        resolve(response.dataUrl);
      });
    });
  });
}

function downloadFloatingImages(panel, type) {
  const debug = panel.__lastProduct?._debug || {};
  const map = {
    main: debug.mainImages || splitImageLinks(panel.__lastProduct?.["产品主图"]),
    sku: debug.skuImages || splitImageLinks(panel.__lastProduct?.["SKU图片"])
  };
  const urls = uniqueImageUrls(map[type] || []);
  if (!urls.length) {
    setPanelStatus(panel, "当前分类没有可下载图片", true);
    return;
  }
  downloadImages(urls, type);
  setPanelStatus(panel, `已发送 ${urls.length} 张图片到浏览器下载`);
}

function downloadImages(urls, type) {
  chrome.runtime.sendMessage({
    type: "DOWNLOAD_IMAGES",
    urls,
    folder: `商品同步助手/${type}-${Date.now()}`
  });
}

function getFloatingSelectedSkus(panel) {
  return Array.from(panel.querySelectorAll("[data-role='sku-list'] input:checked")).map((input) => input.value);
}

function setFloatingSkuChecked(panel, checked) {
  panel.querySelectorAll("[data-role='sku-list'] input").forEach((input) => {
    input.checked = checked;
  });
  updateFloatingSkuCount(panel);
}

function updateFloatingSkuCount(panel) {
  const total = panel.querySelectorAll("[data-role='sku-list'] input").length;
  const checked = panel.querySelectorAll("[data-role='sku-list'] input:checked").length;
  panel.querySelector("[data-role='sku-count']").textContent = total ? `${checked}/${total}` : "-";
}

function setPanelStatus(panel, text, isError = false) {
  const status = panel.querySelector("[data-role='status']");
  status.textContent = text;
  status.style.background = isError ? "#fff1f0" : "#f6f7f9";
  status.style.color = isError ? "#d93026" : "#646a73";
}

function toggleFloatingPanel(panel) {
  const body = panel.querySelector("[data-role='body']");
  const button = panel.querySelector("[data-action='collapse']");
  const collapsed = body.style.display === "none";
  body.style.display = collapsed ? "grid" : "none";
  panel.style.width = collapsed ? "320px" : "180px";
  button.textContent = collapsed ? "收起" : "展开";
}

function makePanelDraggable(panel, handle) {
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener("mousedown", (event) => {
    if (event.target.closest("button")) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp, { once: true });
  });

  function onMove(event) {
    const nextLeft = Math.min(window.innerWidth - 80, Math.max(0, startLeft + event.clientX - startX));
    const nextTop = Math.min(window.innerHeight - 38, Math.max(0, startTop + event.clientY - startY));
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
  }

  function onUp() {
    document.removeEventListener("mousemove", onMove);
  }
}

function countProductImages(product) {
  return [
    ...splitImageLinks(product["产品主图"]),
    ...splitImageLinks(product["详情图"]),
    ...splitImageLinks(product["SKU图片"])
  ].length;
}

function splitImageLinks(value) {
  return clean(value).split(/[，,]/).map((item) => item.trim()).filter(Boolean);
}

function panelIconButtonStyle() {
  return "height:24px;border:1px solid rgba(255,255,255,.45);border-radius:4px;background:rgba(255,255,255,.12);color:#fff;font-size:12px;cursor:pointer;";
}

function panelSmallButtonStyle() {
  return "height:26px;padding:0 8px;border:1px solid #d9dde5;border-radius:4px;background:#fff;color:#1f2329;font-size:12px;cursor:pointer;";
}

function panelStatStyle() {
  return "min-width:0;padding:6px;border:1px solid #eff1f5;border-radius:6px;background:#fafbfc;";
}

/**
 * 主采集函数 - 获取页面商品所有信息
 * 
 * 流程:
 * 1. detectPlatform() - 识别电商平台
 * 2. runPlatformAdapter() - 调用对应平台采集器
 * 3. 规范化数据 (标题、价格、URL)
 * 4. buildSkuOptions() - 生成所有SKU组合
 * 5. 返回飞书Base格式的标准商品对象
 * 
 * @param {Object} options - 采集选项
 *   - selectedSkus: string[] - 用户选择的SKU标签数组
 *   - skuLimit: number - SKU数量限制
 * @returns {Object} 标准商品数据对象
 */
function collectProduct(options = {}) {
  const platform = detectPlatform();
  const adapterData = runPlatformAdapter(platform);
  const url = location.href;
  const productId = adapterData.productId || extractSourceId(url) || "";
  const productCode = productId ? `${platformCode(platform)}-${productId}` : makeProductCode(url);
  const title = normalizeTitle(adapterData.title || fallbackTitle());
  const mainImages = uniqueImageUrls(adapterData.mainImages).slice(0, 20);
  const detectedSkuImages = excludeDuplicateImages(uniqueImageUrls(adapterData.skuImages), mainImages).slice(0, 120);
  const detailImages = excludeDuplicateImages(uniqueImageUrls(adapterData.detailImages), [...mainImages, ...detectedSkuImages]).slice(0, 60);
  const carouselImages = excludeDuplicateImages(
    uniqueImageUrls(adapterData.carouselImages || []),
    mainImages
  ).slice(0, 8);
  const price = normalizePrice(adapterData.price || fallbackPrice());
  const allSkuSpecs = adapterData.skuSpecs || fallbackSkuText();
  const adapterSkuOptions = normalizeAdapterSkuOptions(adapterData.skuOptions, detectedSkuImages);
  const skuOptions = adapterSkuOptions.length ? adapterSkuOptions : buildSkuOptions(allSkuSpecs, detectedSkuImages);
  const selectedSkuOptions = selectSkuOptions(skuOptions, options);
  const skuCount = skuOptions.length;
  const hasSkuSelection = Array.isArray(options.selectedSkus);
  const skuSpecs = selectedSkuOptions.map((sku) => sku.label).join(" | ") || (hasSkuSelection ? "" : allSkuSpecs);
  const selectedSkuImages = selectedSkuOptions.map((sku) => sku.image).filter(Boolean);
  const skuImages = selectedSkuImages.length
    ? selectedSkuImages
    : detectedSkuImages.slice(0, hasSkuSelection ? selectedSkuOptions.length : (selectedSkuOptions.length || detectedSkuImages.length));
  const skuImageValue = hasSkuSelection && !selectedSkuOptions.length
    ? ""
    : joinLinks(skuImages);
  const attributes = adapterData.attributes || fallbackAttributesText();

  return {
    "*产品主编号": productCode,
    "*产品名称": title,
    "货币类型": adapterData.currency || defaultCurrency(platform),
    "产品主图": joinLinks(mainImages),
    "轮播图": joinLinks(carouselImages),
    "货源平台": platform,
    "货源ID": productId || productCode,
    "详情描述": adapterData.description || attributes || title,
    "详情图": joinLinks(detailImages),
    "货源类目": adapterData.categoryPath || fallbackCategoryPath(),
    "自定义属性": attributes,
    "产品视频": adapterData.videoUrl || fallbackVideoUrl(),
    "产品证书": "",
    "尺寸图表": adapterData.sizeChart || "",
    "SKU规格1": normalizeSkuText(skuSpecs),
    "SKU规格2": "",
    "平台SKU": productCode,
    "*SKU售价": price,
    "SKU图片": skuImageValue,
    "SKU库存": adapterData.stock || "100",
    "SKU重量(KG)": "",
    "SKU尺寸(CM)": "",
    "_debug": {
      mode: "adapter-v2",
      platform,
      productId,
      skuCount,
      skuLimit: selectedSkuOptions.length || skuCount,
      skuOptions,
      selectedSkuLabels: selectedSkuOptions.map((sku) => sku.label),
      mainImageCount: mainImages.length,
      carouselImageCount: carouselImages.length,
      skuImageCount: skuImages.length,
      detailImageCount: detailImages.length,
      skuSpecs,
      mainImages,
      carouselImages: carouselImages.slice(0, 8),
      skuImages: skuImages.slice(0, 12),
      detailImages: detailImages.slice(0, 12),
      videoUrl: adapterData.videoUrl || "",
      source: adapterData.source || "fallback"
    },
    collectedAt: new Date().toISOString()
  };
}

function normalizeAdapterSkuOptions(skuOptions, fallbackImages) {
  if (!Array.isArray(skuOptions) || !skuOptions.length) return [];
  const normalized = [];
  const usedImages = new Set();

  for (const [index, option] of skuOptions.entries()) {
    const label = clean(option?.label || option?.name || option?.text || option?.value);
    if (!label) continue;
    let image = normalizeImageUrl(option?.image || option?.img || option?.mainImage || option?.skuImage || "");
    if (!image || usedImages.has(canonicalImageUrl(image))) {
      image = fallbackImages.find((url) => !usedImages.has(canonicalImageUrl(url))) || image;
    }
    if (image) usedImages.add(canonicalImageUrl(image));
    normalized.push({
      id: clean(option?.id || option?.asin || `sku-${index + 1}`),
      label,
      image
    });
  }

  return normalized;
}

function prepareProductForSubmit(product) {
  const copy = { ...product };
  const debug = product._debug || {};
  copy._debug = {
    mode: debug.mode,
    platform: debug.platform,
    productId: debug.productId,
    skuCount: debug.skuCount,
    skuLimit: debug.selectedSkuLabels?.length || 0,
    selectedSkuLabels: debug.selectedSkuLabels || [],
    mainImageCount: debug.mainImageCount,
    skuImageCount: debug.skuImageCount,
    detailImageCount: debug.detailImageCount,
    source: debug.source
  };
  if (Array.isArray(debug.selectedSkuLabels) && debug.selectedSkuLabels.length === 0) {
    copy["SKU规格1"] = "";
    copy["SKU规格2"] = "";
    copy["SKU图片"] = "";
    copy["SKU库存"] = "";
  }
  return copy;
}

function selectSkuOptions(skuOptions, options) {
  if (!skuOptions.length) return [];
  const selected = Array.isArray(options.selectedSkus) ? new Set(options.selectedSkus.map(clean)) : null;
  if (selected) return skuOptions.filter((sku) => selected.has(sku.label));
  const limit = normalizeSkuLimit(options.skuLimit, skuOptions.length);
  return skuOptions.slice(0, limit || skuOptions.length);
}

function normalizeSkuLimit(limit, skuCount) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return skuCount;
  if (!skuCount) return Math.floor(parsed);
  return Math.min(Math.floor(parsed), skuCount);
}

/**
 * 生成SKU选项列表
 * 
 * 处理两种情况:
 * 1. 有结构化规格 → 笛卡尔积生成所有组合 (最多200个)
 * 2. 无规格但有图片 → 每张图生成一个SKU
 * 
 * 例: "颜色:红|蓝 | 尺码:M|L" → 
 *   [
 *     { id: "sku-1", label: "颜色:红 / 尺码:M", image: "..." },
 *     { id: "sku-2", label: "颜色:红 / 尺码:L", image: "..." },
 *     ...
 *   ]
 * 
 * @param {string} skuSpecs - SKU规格字符串 (用 | 或 | 分隔)
 * @param {string[]} skuImages - SKU对应的图片URL数组
 * @returns {Object[]} SKU选项对象数组
 */
function buildSkuOptions(skuSpecs, skuImages) {
  const groups = splitSkuGroups(skuSpecs);
  if (!groups.length) {
    return skuImages.map((image, index) => ({
      id: `sku-${index + 1}`,
      label: `SKU ${index + 1}`,
      image
    }));
  }

  const optionGroups = groups
    .map((group) => ({
      name: group.name || "规格",
      options: group.options.length ? group.options : [group.raw]
    }))
    .filter((group) => group.options.length);

  return cartesianSkuOptions(optionGroups)
    .slice(0, 200)
    .map((label, index) => ({
      id: `sku-${index + 1}`,
      label,
      image: skuImages[index] || ""
    }));
}

/**
 * SKU笛卡尔积递归生成
 * 
 * 原理: 逐个规格组遍历, 每个选项与后续组合递归
 * 
 * 例: groups = [
 *   { name: "颜色", options: ["红", "蓝"] },
 *   { name: "尺码", options: ["M", "L"] }
 * ]
 * 
 * 递归过程:
 * index=0, options=["红","蓝"] → 
 *   "颜色:红" + cartesian(1, ["颜色:红"]) →
 *     "颜色:红 / 尺码:M"
 *     "颜色:红 / 尺码:L"
 *   "颜色:蓝" + cartesian(1, ["颜色:蓝"]) →
 *     "颜色:蓝 / 尺码:M"
 *     "颜色:蓝 / 尺码:L"
 * 
 * @param {Array} groups - 规格组数组
 * @param {number} index - 当前处理的组索引
 * @param {string[]} prefix - 已生成的标签数组
 * @returns {string[]} 所有组合标签
 */
function cartesianSkuOptions(groups, index = 0, prefix = []) {
  if (index >= groups.length) return [prefix.join(" / ")];
  const group = groups[index];
  return group.options.flatMap((option) => {
    const label = option.includes(":") || option.includes("：") ? option : `${group.name}:${option}`;
    return cartesianSkuOptions(groups, index + 1, [...prefix, label]);
  });
}

function splitSkuGroups(skuSpecs) {
  return clean(skuSpecs)
    .split(/\s*[|｜;；\n]\s*/)
    .map((raw) => {
      const [name, ...rest] = raw.split(/[:：]/);
      const value = rest.join(":").trim();
      const options = value ? value.split(/[，,\/]/).map((item) => clean(item)).filter(Boolean) : [];
      return { raw, name: clean(name), options };
    })
    .filter((group) => group.raw);
}

/**
 * 选择平台对应的采集适配器
 * 
 * 支持平台:
 * - Temu: 从URL参数和DOM提取
 * - SHEIN: 从结构化JSON数据提取
 * - 1688: 递归扫描script标签JSON
 * - 淘宝/天猫/拼多多: 通用DOM选择器
 * 
 * @param {string} platform - 平台名称
 * @returns {Object} 采集到的商品原始数据
 */
function runPlatformAdapter(platform) {
  if (platform === "Temu") return temuAdapter();
  if (platform === "SHEIN") return sheinAdapter();
  if (platform === "1688") return source1688Adapter();
  if (platform === "Amazon") return amazonAdapter();
  if (["淘宝", "天猫", "拼多多"].includes(platform)) return marketplaceAdapter(platform);
  return genericAdapter();
}

function temuAdapter() {
  const structured = collectStructuredProductData("temu");
  const temuStructured = collectTemuStructuredData();
  const urlMainImages = collectTemuUrlImages();
  const dom = collectTemuDomImages();
  
  // 主图: URL参数 > DOM主区 > 结构化数据 > 通用结构化
  const mainImages = dedupeTemuMainImages(urlMainImages, dom.mainImages, temuStructured.mainImages).slice(0, 10);
  
  // 轮播图: DOM轮播区 > 结构化数据
  const carouselImages = excludeDuplicateImages(
    normalizeTemuImageList(dom.carouselImages || []),
    mainImages
  ).slice(0, 8);
  // 如果轮播图还是空的，从主图里把第2张开始的当作轮播图
  let finalCarousel = carouselImages.length >= 3 
    ? carouselImages 
    : [...normalizeTemuImageList(dom.mainImages || []), ...normalizeTemuImageList(structured.mainImages || [])].slice(1, 9);
  finalCarousel = excludeDuplicateImages(finalCarousel, mainImages).slice(0, 8);
  
  // SKU图: DOM右侧SKU区 > 结构化数据
  const skuCandidates = dom.skuImages.length >= 2 
    ? dom.skuImages 
    : mergeImages(temuStructured.skuImages, structured.skuImages);
  const skuImages = excludeDuplicateImages(normalizeTemuImageList(skuCandidates), [...mainImages, ...finalCarousel]).slice(0, 80);
  
  // 详情图: DOM详情区 > 结构化数据
  let detailImages = dom.detailImages.length >= 2
    ? normalizeTemuImageList(dom.detailImages)
    : excludeDuplicateImages(
        normalizeTemuImageList(mergeImages(temuStructured.detailImages, structured.detailImages)),
        [...mainImages, ...finalCarousel, ...skuImages]
      );
  detailImages = detailImages.slice(0, 50);
  
  // 标题: 优先中文标题或结构化数据中的商品名，URL解码英文标题最后
  const title = temuStructured.title 
    || structured.title 
    || temuTitleFromDom() 
    || temuTitleFromUrl();
  
  // 价格
  const price = normalizeTemuPrice(
    temuStructured.price 
    || temuPriceFromDom() 
    || structured.price
  );

  return {
    ...structured,
    title,
    price,
    attributes: temuAttributesFromDom() || temuStructured.attributes || structured.attributes,
    categoryPath: temuCategoryFromDom() || temuStructured.categoryPath || structured.categoryPath,
    skuSpecs: cleanTemuSkuSpecs(
      temuStructured.skuSpecs 
      || temuSkuTextFromDom() 
      || platformSkuTextFromDom() 
      || structured.skuSpecs
    ),
    mainImages,
    skuImages,
    detailImages,
    carouselImages: finalCarousel,  // 新字段
    videoUrl: dom.videoUrl || temuStructured.videoUrl || structured.videoUrl || fallbackVideoUrl(),
    source: temuStructured.source || structured.source || "temu-adapter",
    productId: temuStructured.productId || structured.productId || extractSourceId(location.href)
  };
}

function dedupeTemuMainImages(...lists) {
  return normalizeTemuImageList(lists.flat())
    .filter(isTemuProductImage)
    .filter((url) => !isTemuUiImage(url))
    .filter((url) => !/detail|desc|description|recommend|similar|review|avatar|icon|spec|variant/i.test(url));
}

function collectTemuStructuredData() {
  const result = emptyProductData();
  const scripts = Array.from(document.scripts).map((script) => script.textContent || "").filter(Boolean);

  for (const scriptText of scripts) {
    for (const jsonText of extractJsonCandidates(scriptText)) {
      try {
        scanTemuJson(JSON.parse(jsonText), "", result);
      } catch {
        // Ignore non-product fragments.
      }
    }
    scanTemuScriptText(scriptText, result);
  }

  try {
    if (window.__NEXT_DATA__ && typeof window.__NEXT_DATA__ === "object") {
      scanTemuJson(window.__NEXT_DATA__, "__NEXT_DATA__", result);
    }
  } catch {
    // Ignore inaccessible window state.
  }

  try {
    if (window.__INITIAL_STATE__ && typeof window.__INITIAL_STATE__ === "object") {
      scanTemuJson(window.__INITIAL_STATE__, "__INITIAL_STATE__", result);
    }
  } catch {
    // Ignore inaccessible window state.
  }

  result.mainImages = filterTemuProductImages(result.mainImages);
  result.skuImages = excludeDuplicateImages(filterTemuProductImages(result.skuImages), result.mainImages);
  result.detailImages = excludeDuplicateImages(filterTemuDetailImages(result.detailImages), [...result.mainImages, ...result.skuImages]);
  result.skuSpecs = cleanTemuSkuSpecs(result.skuSpecs);
  result.source = "temu-structured";
  return result;
}

function scanTemuScriptText(scriptText, result) {
  pickFirstRegex(scriptText, result, "title", [
    /"(?:goodsName|productName|productTitle|title|goods_title)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i
  ]);
  pickFirstRegex(scriptText, result, "productId", [
    /"(?:goodsId|goods_id|productId|product_id|mallGoodsId)"\s*:\s*"?(\d{5,})"?/i
  ]);
  pickFirstRegex(scriptText, result, "price", [
    /"(?:minPrice|maxPrice|salePrice|price|amount)"\s*:\s*"?([\d,.]+)"?/i
  ]);
}

function scanTemuJson(value, path, result) {
  if (value == null) return;

  if (typeof value === "string" || typeof value === "number") {
    const text = decodeText(String(value));
    pickTemuScalar(path, text, result);
    for (const url of extractImageUrls(text)) pushTemuImageByPath(result, url, path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanTemuJson(item, `${path}[${index}]`, result));
    return;
  }

  if (typeof value === "object") {
    parseTemuKnownObject(path, value, result);
    for (const [key, nested] of Object.entries(value)) {
      scanTemuJson(nested, path ? `${path}.${key}` : key, result);
    }
  }
}

function pickTemuScalar(path, value, result) {
  const key = path.split(".").pop() || path;
  if (!result.title && /^(goodsName|productName|productTitle|title|goods_title)$/i.test(key) && value.length > 5 && value.length < 260) result.title = value;
  if (!result.productId && /^(goodsId|goods_id|productId|product_id|mallGoodsId)$/i.test(key) && /^\d{5,}$/.test(value)) result.productId = value;
  if (!result.price && /^(minPrice|maxPrice|salePrice|price|amount)$/i.test(key) && /\d/.test(value)) result.price = value;
  if (!result.categoryPath && /breadcrumb|category|catName|cateName/i.test(path) && value.length < 120) result.categoryPath = appendText(result.categoryPath, value, "/");
  if (!result.videoUrl && /video|videoUrl|video_url/i.test(key) && /^https?:/.test(value)) result.videoUrl = normalizeImageUrl(value);
}

function parseTemuKnownObject(path, object, result) {
  const title = object.goodsName || object.productName || object.productTitle || object.title || object.goods_title;
  if (title && !result.title) result.title = clean(title);

  const productId = object.goodsId || object.goods_id || object.productId || object.product_id || object.mallGoodsId;
  if (productId && !result.productId) result.productId = String(productId);

  const price = object.minPrice || object.maxPrice || object.salePrice || object.price || object.amount;
  if (price && !result.price) result.price = String(price);

  const imageKeys = ["mainImages", "topGallery", "gallery", "galleryImages", "images", "goodsImages", "bannerImages"];
  for (const key of imageKeys) {
    if (Array.isArray(object[key])) result.mainImages = mergeImages(result.mainImages, object[key]);
  }

  const skuImageKeys = ["skuImages", "specGallery", "specImages", "colorImages", "variantImages"];
  for (const key of skuImageKeys) {
    if (Array.isArray(object[key])) result.skuImages = mergeImages(result.skuImages, object[key]);
  }

  const detailKeys = ["detailImages", "descImages", "descriptionImages", "longImages", "detailGallery"];
  for (const key of detailKeys) {
    if (Array.isArray(object[key])) result.detailImages = mergeImages(result.detailImages, object[key]);
  }

  if (object.videoUrl && !result.videoUrl) result.videoUrl = normalizeImageUrl(object.videoUrl);

  const skuText = compactSkuObjectText(object);
  if (skuText && /sku|spec|variant|color|size/i.test(path)) result.skuSpecs = appendText(result.skuSpecs, skuText, " | ");
  const attrText = compactAttributeObjectText(object);
  if (attrText && /attr|property|spec|feature/i.test(path)) result.attributes = appendText(result.attributes, attrText, " | ");
}

function pushTemuImageByPath(result, url, path) {
  if (/sku|spec|variant|color/i.test(path)) result.skuImages.push(url);
  else if (/detail|desc|description|longImage/i.test(path)) result.detailImages.push(url);
  else if (/main|topGallery|gallery|banner|goodsImages|mainImages|carousel|swiper|thumb/i.test(path)) result.mainImages.push(url);
}

function sheinAdapter() {
  const structured = collectStructuredProductData("shein");
  const shein = collectSheinProductData();
  const mainImages = filterSheinProductImages(mergeImages(shein.mainImages, structured.mainImages));
  const skuImages = filterSheinProductImages(mergeImages(shein.skuImages, structured.skuImages));
  const detailImages = filterSheinProductImages(mergeImages(shein.detailImages, structured.detailImages));

  return {
    ...structured,
    mainImages,
    skuImages,
    detailImages,
    source: shein.source || structured.source || "shein-adapter",
    title: shein.title || structured.title || sheinTitleFromDom(),
    price: shein.price || structured.price || sheinPriceFromDom(),
    productId: shein.productId || structured.productId || extractSourceId(location.href),
    skuSpecs: shein.skuSpecs || platformSkuTextFromDom() || structured.skuSpecs,
    attributes: shein.attributes || sheinAttributesFromDom() || structured.attributes,
    categoryPath: shein.categoryPath || structured.categoryPath || fallbackCategoryPath()
  };
}

function collectSheinProductData() {
  const result = emptyProductData();
  const scripts = Array.from(document.scripts).map((script) => script.textContent || "").filter(Boolean);
  for (const scriptText of scripts) {
    for (const jsonText of extractJsonCandidates(scriptText)) {
      try {
        scanSheinJson(JSON.parse(jsonText), "", result);
      } catch {
        // Ignore script fragments that are not product JSON.
      }
    }
    scanSheinScriptText(scriptText, result);
  }
  result.source = "shein-fields";
  return result;
}

function scanSheinScriptText(scriptText, result) {
  pickFirstRegex(scriptText, result, "title", [
    /"(?:goods_name|goodsName|productName|product_name)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i
  ]);
  pickFirstRegex(scriptText, result, "productId", [
    /"(?:goods_id|goodsId|product_id|productId)"\s*:\s*"?(\d{5,})"?/i
  ]);
  pickFirstRegex(scriptText, result, "price", [
    /"(?:salePrice|retailPrice|price|amount|usdAmount)"\s*:\s*"?([\d,.]+)"?/i
  ]);
}

function scanSheinJson(value, path, result) {
  if (value == null) return;
  if (typeof value === "string" || typeof value === "number") {
    const text = decodeText(String(value));
    pickSheinScalar(path, text, result);
    for (const url of extractImageUrls(text)) pushSheinImageByPath(result, url, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSheinJson(item, `${path}[${index}]`, result));
    return;
  }
  if (typeof value === "object") {
    parseSheinKnownObject(path, value, result);
    for (const [key, nested] of Object.entries(value)) scanSheinJson(nested, path ? `${path}.${key}` : key, result);
  }
}

function pickSheinScalar(path, value, result) {
  const key = path.split(".").pop() || path;
  if (!result.title && /^(goods_name|goodsName|productName|product_name|title)$/.test(key) && value.length > 5 && value.length < 220) result.title = value;
  if (!result.productId && /^(goods_id|goodsId|product_id|productId)$/.test(key) && /^\d{5,}$/.test(value)) result.productId = value;
  if (!result.price && /^(salePrice|retailPrice|price|amount|usdAmount)$/.test(key) && /\d/.test(value)) result.price = value;
  if (!result.categoryPath && /cat_name|categoryName|cate_name|breadcrumb/i.test(key) && value.length < 80) result.categoryPath = appendText(result.categoryPath, value, "/");
}

function parseSheinKnownObject(path, object, result) {
  const title = object.goods_name || object.goodsName || object.productName || object.product_name;
  if (title && !result.title) result.title = clean(title);
  if ((object.goods_id || object.goodsId || object.product_id || object.productId) && !result.productId) {
    result.productId = String(object.goods_id || object.goodsId || object.product_id || object.productId);
  }
  if ((object.salePrice || object.retailPrice || object.price || object.amount) && !result.price) {
    result.price = String(object.salePrice || object.retailPrice || object.price || object.amount);
  }
  for (const key of ["goods_img", "goodsImg", "original_img", "originalImg", "main_image", "mainImage"]) {
    if (object[key]) result.mainImages = mergeImages(result.mainImages, [object[key]]);
  }
  for (const key of ["detail_image", "detailImage", "detail_img", "detailImg", "description_image"]) {
    if (object[key]) result.detailImages = mergeImages(result.detailImages, [object[key]]);
  }
  for (const key of ["color_image", "colorImage", "sku_image", "skuImage", "attr_image", "attrImage"]) {
    if (object[key]) result.skuImages = mergeImages(result.skuImages, [object[key]]);
  }

  const skuText = compactSkuObjectText(object);
  if (skuText && /sku|attr|size|color|sale|goods|product/i.test(path)) result.skuSpecs = appendText(result.skuSpecs, skuText, " | ");
  const attrText = compactAttributeObjectText(object);
  if (attrText) result.attributes = appendText(result.attributes, attrText, " | ");
}

function pushSheinImageByPath(result, url, path) {
  if (/detail|desc|description/i.test(path)) result.detailImages.push(url);
  else if (/sku|color|attr|size|variant/i.test(path)) result.skuImages.push(url);
  else if (/goods_img|original_img|main|product|image|thumb/i.test(path)) result.mainImages.push(url);
}

function filterSheinProductImages(urls) {
  return uniqueImageUrls(urls)
    .filter((url) => /(?:ltwebstatic|shein|sheincdn|shein\.com).*\/images/i.test(url) || /img\.ltwebstatic\.com/i.test(url))
    .filter((url) => !/logo|avatar|icon|sprite|placeholder|loading/i.test(url));
}

function sheinTitleFromDom() {
  return textBySelectors(["h1", ".product-intro__head-name", "[class*='product-intro'][class*='name']", "[class*='goods-title']"]);
}

function sheinPriceFromDom() {
  return textBySelectors([".from", ".sale-price", ".product-intro__head-price", "[class*='price']"]);
}

function sheinAttributesFromDom() {
  return fallbackAttributesText();
}

/**
 * 1688平台专用采集器
 * 
 * 采集流程:
 * 1. collect1688OfferData() - 扫描所有<script>标签中的JSON
 * 2. collectStructuredProductData() - 扫描script和DOM数据
 * 3. 合并、过滤、去重图片
 * 4. 多重降级提取标题、价格 (JSON→DOM→通用)
 * 
 * @returns {Object} 采集到的商品数据
 */
function source1688Adapter() {
  const structured = collectStructuredProductData("1688");
  const offer = collect1688OfferData();
  const dom = collect1688DomImages();
  const mainImages = filter1688ProductImages(mergeImages(offer.mainImages, dom.mainImages)).slice(0, 8);
  const skuImages = filter1688ProductImages(mergeImages(offer.skuImages, dom.skuImages, structured.skuImages));
  const detailImages = filter1688ProductImages(mergeImages(offer.detailImages, dom.detailImages, structured.detailImages));

  return {
    ...structured,
    mainImages,
    skuImages,
    detailImages,
    attributes: offer.attributes || source1688AttributesFromDom() || structured.attributes,
    categoryPath: offer.categoryPath || source1688CategoryFromDom() || structured.categoryPath,
    skuSpecs: clean1688SkuSpecs(offer.skuSpecs) || source1688SkuTextFromDom() || clean1688SkuSpecs(structured.skuSpecs),
    videoUrl: offer.videoUrl || structured.videoUrl,
    stock: offer.stock || structured.stock,
    source: offer.source || structured.source || "1688-adapter",
    title: offer.title || source1688TitleFromDom() || structured.title,
    price: offer.price || source1688PriceFromDom() || structured.price,
    productId: offer.productId || structured.productId || extractSourceId(location.href)
  };
}

function marketplaceAdapter(platform) {
  const structured = collectStructuredProductData(platform);
  return {
    ...structured,
    source: structured.source || `${platform}-adapter`,
    title: structured.title || fallbackTitle(),
    price: structured.price || fallbackPrice(),
    productId: structured.productId || extractSourceId(location.href)
  };
}

/**
 * 采集1688商品原始数据 - 第一层入口
 * 扫描页面所有 <script> 标签提取JSON
 * 
 * 步骤:
 * 1. collect1688FromScriptText() - 用正则匹配常见字段
 * 2. extractJsonCandidates() - 提取可能是JSON的字符串
 * 3. scan1688Json() - 递归扫描JSON对象
 * 
 * @returns {Object} 1688平台的原始采集数据
 */
function collect1688OfferData() {
  const result = emptyProductData();
  result.productId = extractSourceId(location.href);
  const scripts = Array.from(document.scripts).map((script) => script.textContent || "").filter(Boolean);

  for (const scriptText of scripts) {
    collect1688FromScriptText(scriptText, result);
    for (const jsonText of extractJsonCandidates(scriptText)) {
      try {
        scan1688Json(JSON.parse(jsonText), "", result);
      } catch {
        // Ignore partial script fragments that are not valid JSON.
      }
    }
  }

  result.source = "1688-offer-fields";
  return result;
}

function collect1688FromScriptText(scriptText, result) {
  pickFirstRegex(scriptText, result, "title", [
    /"offerTitle"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"subject"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i
  ]);
  pickFirstRegex(scriptText, result, "productId", [
    /"offerId"\s*:\s*"?(\d{5,})"?/i,
    /"offerID"\s*:\s*"?(\d{5,})"?/i
  ]);
  pickFirstRegex(scriptText, result, "price", [
    /"skuPriceScale"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"price"\s*:\s*"?([\d.]+)"?/i,
    /"discountPrice"\s*:\s*"?([\d.]+)"?/i
  ]);

  for (const url of collectArrayUrls(scriptText, "offerImgList")) result.mainImages.push(url);
  for (const url of collectArrayUrls(scriptText, "descImages")) result.detailImages.push(url);
  for (const url of collectContextImageUrls(scriptText, /desc|detail|description|offerDetail|详情/i)) result.detailImages.push(url);
  for (const url of collectArrayUrls(scriptText, "imageUrl")) result.skuImages.push(url);
}

function extractJsonCandidates(scriptText) {
  const candidates = [];
  const trimmed = scriptText.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) candidates.push(trimmed);

  const assignmentPattern = /(?:window\.[\w$]+|var\s+[\w$]+|let\s+[\w$]+|const\s+[\w$]+)\s*=\s*({[\s\S]*?});?\s*(?:<\/script>|$)/g;
  for (const match of scriptText.matchAll(assignmentPattern)) {
    if (match[1] && match[1].length < 2_000_000) candidates.push(match[1]);
  }
  return candidates;
}

/**
 * 深度扫描1688商品JSON数据
 * 
 * 算法: 递归遍历所有JSON值, 根据类型和字段路径智能提取:
 * - 字符串/数字: 用pick1688Scalar()匹配已知字段名
 * - 数组: 根据字段名特征分类 (offerImgList→主图, descImages→详情图)
 * - 对象: 检查已知字段, 然后递归遍历所有键值对
 * 
 * 示例: 可以识别 "offerImgList", "descImages", "skuProps", "propsList" 等字段
 * 
 * @param {*} value - 要扫描的值
 * @param {string} path - 当前路径 (如 "data.skuProps[0].value")
 * @param {Object} result - 结果对象 (会被修改)
 */
function scan1688Json(value, path, result) {
  if (value == null) return;

  if (typeof value === "string" || typeof value === "number") {
    const text = decodeText(String(value));
    pick1688Scalar(path, text, result);
    for (const url of extractImageUrls(text)) push1688ImageByPath(result, url, path);
    // 从富文本中提取 HTML 图片标签
    for (const url of extractHtmlImages(text)) push1688ImageByPath(result, url, path);
    return;
  }

  if (Array.isArray(value)) {
    if (/offerImgList|imageList|mainImages|album|images/i.test(path)) {
      for (const item of value) {
        if (typeof item === "string") result.mainImages.push(item);
        else if (item && typeof item === "object") scan1688Json(item, `${path}.main`, result);
      }
      return;
    }
    if (/descImages|detailImages|descriptionImages/i.test(path)) {
      for (const item of value) {
        if (typeof item === "string") result.detailImages.push(item);
        else if (item && typeof item === "object") scan1688Json(item, `${path}.detail`, result);
      }
      return;
    }
    // 支持新旧版本: skuProps (旧) + saleProperties/variants/skuList (新)
    if (/skuProps|saleProperties|variants|skuList|skuInfo|skuInfoMap/i.test(path)) parse1688SkuArray(value, result);
    if (/propsList|attributes|properties/i.test(path)) parse1688PropsArray(value, result);
    value.forEach((item, index) => scan1688Json(item, `${path}[${index}]`, result));
    return;
  }

  if (typeof value === "object") {
    parse1688KnownObject(path, value, result);
    for (const [key, nested] of Object.entries(value)) {
      scan1688Json(nested, path ? `${path}.${key}` : key, result);
    }
  }
}

function pick1688Scalar(path, value, result) {
  const key = path.split(".").pop() || path;
  if (!result.title && /^(offerTitle|subject|title)$/.test(key) && isValid1688Title(value)) result.title = value;
  if (!result.productId && /^(offerId|offerID|itemId)$/.test(key) && /^\d{5,}$/.test(value)) result.productId = value;
  if (!result.price && /^(skuPriceScale|price|discountPrice)$/.test(key) && /\d/.test(value)) result.price = value;
  if (!result.videoUrl && /videoUrl|video/i.test(key) && /^https?:/.test(value)) result.videoUrl = value;
  if (!result.categoryPath && /categoryName|postCategoryName|catName/i.test(key) && value.length < 80) result.categoryPath = appendText(result.categoryPath, value, "/");
  // 添加对 description 字段的识别，支持多种字段名变体
  if (!result.description && /^(description|desc|descText|descriptionText|productDescription|richText|content)$/i.test(key) && value.length > 10) result.description = value;
}

function parse1688KnownObject(path, object, result) {
  if (object.offerTitle && isValid1688Title(object.offerTitle)) result.title ||= clean(object.offerTitle);
  if (object.offerId) result.productId ||= String(object.offerId);
  if (object.price) result.price ||= String(object.price);
  if (object.skuPriceScale) result.price ||= String(object.skuPriceScale);
  if (object.videoUrl) result.videoUrl ||= normalizeImageUrl(object.videoUrl);
  if (Array.isArray(object.offerImgList)) result.mainImages = mergeImages(result.mainImages, object.offerImgList);
  if (Array.isArray(object.descImages)) result.detailImages = mergeImages(result.detailImages, object.descImages);
  if (Array.isArray(object.propsList)) parse1688PropsArray(object.propsList, result);
  if (Array.isArray(object.skuProps)) parse1688SkuArray(object.skuProps, result);
  if (object.skuInfoMap && typeof object.skuInfoMap === "object") parse1688SkuInfoMap(object.skuInfoMap, result);

  const compact = compactObjectText(object);
  if (compact && /propsList|attributes|property|参数|属性/i.test(path)) {
    result.attributes = appendText(result.attributes, compact, " | ");
  }
}

/**
 * 解析1688 SKU属性数组
 * 从 skuProps 数组中提取规格和图片
 * 
 * 数据结构例:
 * {
 *   prop: "颜色",
 *   value: [
 *     { name: "红色", imageUrl: "https://...", price: 99 },
 *     { name: "蓝色", imageUrl: "https://..." }
 *   ]
 * }
 * 
 * @param {Array} items - SKU属性数组
 * @param {Object} result - 结果对象 (会被修改)
 */
function parse1688SkuArray(items, result) {
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    // 支持1688新旧两版: skuProps (旧) 和 saleProperties/variants (新)
    const prop = item.prop || item.propName || item.name || item.specName || item.attributeName || item.propertyName || item.skuPropName || item.salePropertyName || item.variantName || "";
    const values = firstArray(item.value, item.values, item.children, item.options, item.skuPropertyValues, item.propertyValues, item.valueList, item.salePropertyValues, item.variantValues);
    if (values.length) {
      const names = values.map((entry) => {
        if (entry?.imageUrl) result.skuImages.push(entry.imageUrl);
        if (entry?.image) result.skuImages.push(entry.image);
        if (entry?.imageURI) result.skuImages.push(entry.imageURI);
        return entry?.name || entry?.value || entry?.label || entry?.text || entry?.valueName || entry?.propValue || entry?.propertyValueName || "";
      }).map(clean).filter(Boolean);
      if (prop && names.length) result.skuSpecs = appendText(result.skuSpecs, `${prop}:${names.join(",")}`, " | ");
    }
    if (item.imageUrl) result.skuImages.push(item.imageUrl);
    if (item.image) result.skuImages.push(item.image);
    if (item.imageURI) result.skuImages.push(item.imageURI);
    if (item.specAttrs) result.skuSpecs = appendText(result.skuSpecs, item.specAttrs, " | ");
    if (!values.length) {
      const compact = compactSkuObjectText(item);
      if (compact) result.skuSpecs = appendText(result.skuSpecs, compact, " | ");
    }
    if (item.discountPrice && !result.price) result.price = String(item.discountPrice);
    if (item.canBookCount && !result.stock) result.stock = String(item.canBookCount);
  }
}

function firstArray(...values) {
  return values.find(Array.isArray) || [];
}

function parse1688SkuInfoMap(map, result) {
  for (const [spec, info] of Object.entries(map)) {
    if (isMeaningfulSkuPart(spec)) result.skuSpecs = appendText(result.skuSpecs, spec, " | ");
    if (info?.discountPrice && !result.price) result.price = String(info.discountPrice);
    if (info?.canBookCount && !result.stock) result.stock = String(info.canBookCount);
    if (info?.imageUrl) result.skuImages.push(info.imageUrl);
  }
}

function parse1688PropsArray(items, result) {
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const name = item.name || item.key || item.attrName || item.prop;
    const value = item.value || item.val || item.attrValue;
    if (name && value) result.attributes = appendText(result.attributes, `${clean(name)}:${clean(value)}`, " | ");
  }
}

function push1688ImageByPath(result, url, path) {
  if (/skuProps|skuList|skuInfo|skuInfoMap|imageUrl/i.test(path)) result.skuImages.push(url);
  else if (/descImages|detailImages|description|detail|desc/i.test(path)) result.detailImages.push(url);
  else if (/offerImgList|main|album|imageList|pic/i.test(path)) result.mainImages.push(url);
}

function collectArrayUrls(scriptText, fieldName) {
  const urls = [];
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, "i");
  const matched = scriptText.match(pattern);
  if (!matched) return urls;
  for (const url of extractImageUrls(matched[1])) urls.push(url);
  return urls;
}

function collectContextImageUrls(scriptText, contextPattern) {
  const urls = [];
  for (const { url, index, length } of extractMediaUrlMatches(scriptText)) {
    const context = scriptText.slice(Math.max(0, index - 260), index + length + 260);
    if (!contextPattern.test(context)) continue;
    urls.push(url);
  }
  return urls;
}

function collect1688DomImages() {
  const mainImages = collectImagesFromSelectors([
    "[class*='gallery'] img",
    "[class*='Gallery'] img",
    "[class*='album'] img",
    "[class*='Album'] img",
    "[class*='thumb'] img",
    "[class*='Thumb'] img",
    "[class*='carousel'] img",
    "[class*='swiper'] img",
    "[class*='main-img'] img",
    "[class*='mainImage'] img"
  ]);
  const skuImages = collectImagesFromSelectors([
    "[class*='sku'] img",
    "[class*='Sku'] img",
    "[class*='sale-prop'] img",
    "[class*='SaleProp'] img",
    "[class*='spec'] img",
    "[class*='Spec'] img"
  ]);
  const detailImages = collectImagesFromSelectors([
    "#desc-lazyload-container img",
    "#description img",
    "[class*='detail'] img",
    "[class*='Detail'] img",
    "[class*='desc'] img",
    "[class*='Desc'] img",
    "[class*='richtext'] img",
    "[class*='richText'] img"
  ]);

  return {
    mainImages: excludeDuplicateImages(mainImages, detailImages),
    skuImages,
    detailImages: excludeDuplicateImages(detailImages, mainImages)
  };
}

function collectImagesFromSelectors(selectors) {
  const images = [];
  for (const element of document.querySelectorAll(selectors.join(","))) {
    if (element instanceof HTMLImageElement) {
      images.push(...extractUrlsFromImageElement(element));
      continue;
    }
    for (const image of element.querySelectorAll?.("img") || []) {
      images.push(...extractUrlsFromImageElement(image));
    }
  }
  return uniqueImageUrls(images);
}

function filter1688ProductImages(urls) {
  return uniqueImageUrls(urls)
    .filter(is1688ProductImage)
    .filter((url) => !/logo|avatar|shop|wangpu|decoration|icon|background|search|loading/i.test(url));
}

function is1688ProductImage(url) {
  return /(?:cbu01|cbu02|cbu03|cbu04|img)\.alicdn\.com\/img\/ibank\//i.test(url)
    || /alicdn\.com\/bao\/uploaded/i.test(url)
    || /alicdn\.com\/kf\//i.test(url);
}

function source1688TitleFromDom() {
  const title = textBySelectors([
    "h1",
    ".title-text",
    ".product-title",
    ".d-title",
    "[class*='titleText']",
    "[class*='product-title']"
  ]);
  if (isValid1688Title(title)) return title;

  const metaTitle = meta("og:title") || document.title;
  const cleaned = clean(metaTitle)
    .replace(/[-_].*(1688|阿里巴巴|Alibaba).*$/i, "")
    .replace(/厂家直销|批发|供应商|公司|旺铺/g, "")
    .trim();
  if (isValid1688Title(cleaned)) return cleaned;

  return "";
}

function source1688PriceFromDom() {
  const candidates = Array.from(document.querySelectorAll("[class*='price'], [class*='Price'], [class*='offer-price'], [class*='PriceRange']"))
    .map((node) => clean(node.innerText || node.textContent))
    .map((text) => text.match(/(?:¥|￥)?\s*\d+(?:\.\d{1,2})?/)?.[0] || "")
    .filter(Boolean)
    .filter((text) => {
      const n = Number(normalizePrice(text));
      return n > 0 && n < 100000;
    });
  return candidates[0] || "";
}

function source1688AttributesFromDom() {
  const selectors = [
    "[class*='attribute']",
    "[class*='attributes']",
    "[class*='param']",
    "[class*='property']",
    "[class*='props']",
    "table"
  ];
  const values = Array.from(document.querySelectorAll(selectors.join(",")))
    .map((node) => clean(node.innerText || node.textContent))
    .filter((text) => text.length >= 4 && text.length <= 500)
    .filter((text) => !/登录|注册|客服|供应商|店铺|收藏|分享|举报/.test(text))
    .slice(0, 12);
  return unique(values).join(" | ");
}

function source1688SkuTextFromDom() {
  const optionGroups = source1688SkuOptionGroupsFromDom();
  if (optionGroups) return optionGroups;

  const values = Array.from(document.querySelectorAll("[class*='sku'], [class*='Sku'], [class*='spec'], [class*='Spec'], [class*='sale-prop'], [class*='SaleProp'], [class*='prop-item']"))
    .map((node) => clean(node.innerText || node.textContent))
    .filter((text) => text.length >= 1 && text.length <= 300)
    .filter(isMeaningfulSkuPart)
    .slice(0, 10);
  return clean1688SkuSpecs(unique(values).join(" | "));
}

function source1688SkuOptionGroupsFromDom() {
  const containers = Array.from(document.querySelectorAll("[class*='sku'], [class*='Sku'], [class*='spec'], [class*='Spec'], [class*='sale-prop'], [class*='SaleProp']"))
    .filter(isVisibleElement)
    .slice(0, 20);
  const groups = [];

  for (const container of containers) {
    const options = Array.from(container.querySelectorAll("button, li, a, span, div, [role='button'], [class*='item'], [class*='value'], [class*='prop']"))
      .filter(isVisibleElement)
      .filter((node) => node.children.length <= 2)
      .map((node) => clean(node.innerText || node.textContent || node.getAttribute("title") || node.getAttribute("aria-label")))
      .map(cleanSkuOptionText)
      .filter(isMeaningfulSkuPart)
      .filter((text) => text.length <= 60);
    const uniqueOptions = unique(options).filter((text) => !/^(请选择|选择|全部|更多)$/.test(text));
    if (!uniqueOptions.length || uniqueOptions.length > 80) continue;
    const groupName = inferSkuGroupName(container);
    const groupText = `${groupName}:${uniqueOptions.join(",")}`;
    if (!groups.includes(groupText)) groups.push(groupText);
  }

  return groups.slice(0, 4).join(" | ");
}

function inferSkuGroupName(container) {
  const text = clean(container.innerText || container.textContent);
  const matched = text.match(/(颜色|规格|尺码|尺寸|款式|型号|分类|口味|容量|套餐)/);
  if (matched) return matched[1];
  const previous = clean(container.previousElementSibling?.innerText || container.previousElementSibling?.textContent);
  const previousMatched = previous.match(/(颜色|规格|尺码|尺寸|款式|型号|分类|口味|容量|套餐)/);
  return previousMatched?.[1] || "规格";
}

function cleanSkuOptionText(text) {
  return clean(text)
    .replace(/^(已选|可选|选中|禁用|不可选)\s*/, "")
    .replace(/\s*(库存|有货|无货)\s*\d*.*$/i, "")
    .replace(/\s*(¥|￥)\s*\d+(?:\.\d+)?\s*.*$/i, "")
    .trim();
}

function isVisibleElement(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function clean1688SkuSpecs(value) {
  const parts = clean(value)
    .split(/\s*[|｜;；\n]\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(isMeaningfulSkuPart)
    .map((part) => part.replace(/^(规格|颜色|尺码|尺寸|款式)\s+/, "$1:"));
  return unique(parts).slice(0, 8).join(" | ");
}

function isMeaningfulSkuPart(text) {
  const value = clean(text);
  if (!value || value.length > 180) return false;
  if (/复制sku|购买数量|采购量|库存|价格|起批|物流|运费|加入进货单|立即订购|去下单|配送|服务|保障|退货|客服/i.test(value)) return false;
  if (/^[>\d\s:;,\-_.]+$/.test(value)) return false;
  if (/^[￥¥$]?\d+(\.\d+)?$/.test(value)) return false;
  return /[\u4e00-\u9fa5A-Za-z]/.test(value);
}

function isValid1688Title(title) {
  const value = clean(title);
  if (value.length < 6 || value.length > 180) return false;
  if (/有限公司|公司$|供应商|店铺|旺铺|登录|注册|TEMPLATED|复制sku|购买数量/.test(value)) return false;
  return true;
}

function source1688CategoryFromDom() {
  const values = Array.from(document.querySelectorAll("[class*='breadcrumb'] a, [class*='crumb'] a, nav a"))
    .map((node) => clean(node.innerText || node.textContent))
    .filter((text) => text && text.length <= 40)
    .filter((text) => !/首页|登录|注册|店铺/.test(text));
  return unique(values).join("/");
}

function collectTemuUrlImages() {
  const urls = [];
  
  // 方案1: 从URL参数提取
  const params = new URLSearchParams(location.search);
  const urlParams = [
    params.get("top_gallery_url"),
    params.get("spec_gallery_url"),
    params.get("goods_img"),
    params.get("image")
  ].filter(Boolean).map((value) => {
    try { return decodeURIComponent(value); } catch { return value; }
  });
  urls.push(...urlParams);
  
  // 方案2: 从 __NEXT_DATA__ 按Temu实际JSON结构提取
  try {
    const nextData = window.__NEXT_DATA__;
    if (nextData && typeof nextData === "object") {
      const mainImages = [];
      const scanTemuNextData = (obj, depth) => {
        if (depth > 10 || !obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          const strItems = obj.filter(i => typeof i === 'string');
          for (const s of strItems) {
            if (/^https?:\/\/.*(?:kwcdn|upload_aimg|temu).*\.(?:jpg|jpeg|png|webp)/i.test(s)) {
              mainImages.push(s);
            }
          }
          obj.forEach((item, i) => scanTemuNextData(item, depth + 1));
          return;
        }
        // 检查已知的Temu图片字段
        if (Array.isArray(obj.galleryUrlList || obj.goodsGalleryUrl || obj.goodsGallery || obj.galleryList)) {
          const list = obj.galleryUrlList || obj.goodsGalleryUrl || obj.goodsGallery || obj.galleryList;
          for (const item of list) {
            if (typeof item === 'string') mainImages.push(item);
            else if (item?.url) mainImages.push(item.url);
            else if (item?.imgUrl) mainImages.push(item.imgUrl);
            else if (item?.imageUrl) mainImages.push(item.imageUrl);
          }
        }
        // 图片对象字段
        if (typeof obj.mainImageUrl === 'string' && /kwcdn/.test(obj.mainImageUrl)) mainImages.push(obj.mainImageUrl);
        if (typeof obj.imageUrl === 'string' && /kwcdn/.test(obj.imageUrl)) mainImages.push(obj.imageUrl);
        if (Array.isArray(obj.images)) {
          for (const img of obj.images) {
            if (typeof img === 'string') mainImages.push(img);
            else if (img?.url || img?.imageUrl) mainImages.push(img.url || img.imageUrl);
          }
        }
        for (const [key, val] of Object.entries(obj)) {
          if (!val || typeof val === 'string' && val.length < 20) continue;
          scanTemuNextData(val, depth + 1);
        }
      };
      scanTemuNextData(nextData, 0);
      urls.push(...mainImages);
    }
  } catch (e) { /* 忽略 */ }
  
  // 方案3: 从 __INITIAL_STATE__
  try {
    const initialState = window.__INITIAL_STATE__;
    if (initialState && typeof initialState === "string") {
      const stateJson = JSON.parse(initialState);
      urls.push(...stateJson.goods?.images || []);
      urls.push(...stateJson.product?.images || []);
      // 尝试提取商品信息下的图片
      if (stateJson.goods?.goodsGalleryUrlList) {
        for (const item of stateJson.goods.goodsGalleryUrlList) {
          if (typeof item === 'string') urls.push(item);
          else if (item?.url) urls.push(item.url);
        }
      }
    }
  } catch (e) { /* 忽略 */ }
  
  // 方案4: 扫描页面script标签中的JSON数据（不暴力展平所有字符串）
  try {
    const scripts = Array.from(document.scripts).map(s => s.textContent || '').filter(Boolean);
    for (const text of scripts) {
      // 匹配Temu商品数据关键字段
      const galleryMatch = text.match(/"(?:galleryUrlList|goodsGalleryUrl|goodsGallery)"\s*:\s*(\[[^\]]+\])/);
      if (galleryMatch) {
        try {
          const parsed = JSON.parse(galleryMatch[1]);
          for (const item of parsed) {
            if (typeof item === 'string') urls.push(item);
            else if (item?.url) urls.push(item.url);
          }
        } catch { /* 继续 */ }
      }
    }
  } catch (e) { /* 忽略 */ }
  
  return normalizeTemuImageList(urls);
}

function collectTemuDomImages() {
  // 全页扫描图片 → 按尺寸/位置/上下文分类（代替失效的CSS类名选择器）
  const allImages = scanAllPageImagesForTemu();
  
  // 主图区域: 左侧图库区（大尺寸、页面顶部、非透明）
  const mainSection = findTemuMainGallerySection();
  const mainImages = mainSection 
    ? extractNativeImageUrls(mainSection, { minSize: 400, maxCount: 20 })
    : classifyTemuImages(allImages, 'main');
  
  // 轮播图: 主图区同一容器但排序靠后的（第1张是主图，其余是轮播）
  let carouselImages = [];
  if (mainSection) {
    const allFromSection = extractNativeImageUrls(mainSection, { minSize: 100, maxCount: 30 });
    carouselImages = allFromSection.slice(1); // 第1张是主图，其余算轮播
  }
  
  // SKU图: 右侧规格区（小尺寸缩略图，通常在#rightContent区域）
  const skuSection = document.querySelector('#rightContent') || document.querySelector('[class*="right"]');
  let skuImages = [];
  if (skuSection) {
    const rightImgs = scanElementForProductImages(skuSection, { minSize: 30, maxSize: 200 });
    skuImages = rightImgs.filter(url => !mainImages.includes(url) && !carouselImages.includes(url));
  }
  if (skuImages.length < 2) {
    // 降级: 全页找小尺寸SKU图
    skuImages = classifyTemuImages(allImages, 'sku');
  }
  
  // 详情图: 详情区域
  const detailSection = findTemuDetailSection();
  let detailImages = [];
  if (detailSection) {
    detailImages = extractNativeImageUrls(detailSection, { minSize: 100, maxCount: 50 });
  }
  if (detailImages.length < 2) {
    detailImages = classifyTemuImages(allImages, 'detail');
  }
  
  const videoUrl = collectTemuDomVideoUrl();

  return {
    mainImages: normalizeTemuImageList(mainImages),
    carouselImages: normalizeTemuImageList(carouselImages),
    skuImages: normalizeTemuImageList(skuImages),
    detailImages: normalizeTemuImageList(detailImages),
    videoUrl
  };
}

/** 全页扫描所有图片，收集元数据 */
function scanAllPageImagesForTemu() {
  const results = [];
  const seen = new Set();
  
  for (const img of document.images) {
    const url = normalizeImageUrl(img.currentSrc || img.src || img.getAttribute('src') || '');
    if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) continue;
    seen.add(url);
    
    const rect = img.getBoundingClientRect();
    const width = img.naturalWidth || img.width || rect.width || 0;
    const height = img.naturalHeight || img.height || rect.height || 0;
    const visible = rect.width > 0 && rect.height > 0;
    const containerClass = findContainerClass(img);
    const isProductUrl = /kwcdn\.com|upload_aimg|temu/i.test(url);
    
    results.push({ url, width, height, visible, rect, containerClass, isProductUrl });
  }
  
  return results;
}

/** 寻找最近的带类名的父容器 */
function findContainerClass(el) {
  let cur = el.parentElement;
  let depth = 0;
  while (cur && depth < 8) {
    if (cur.className && typeof cur.className === 'string' && cur.className.trim()) {
      return cur.className.trim().split(/\s+/).filter(c => !c.startsWith('_'))[0] || cur.className.trim();
    }
    if (cur.id) return '#' + cur.id;
    cur = cur.parentElement;
    depth++;
  }
  return '';
}

/** 找到Temu左侧主图容器（不用CSS类名） */
function findTemuMainGallerySection() {
  // 策略: 找包含大图且位于页面左侧的容器
  const candidates = [];
  for (const img of document.images) {
    const rect = img.getBoundingClientRect();
    if (rect.width < 300 || rect.height < 300) continue;
    if (rect.left > window.innerWidth * 0.6) continue; // 偏左
    if (!/kwcdn\.com|upload_aimg/i.test(img.src || '')) continue;
    
    // 找包含这个img的容器div
    let cur = img.parentElement;
    while (cur) {
      if (cur.tagName === 'DIV' || cur.tagName === 'SECTION') {
        const cRect = cur.getBoundingClientRect();
        if (cRect.width > 300 && cRect.width < window.innerWidth * 0.7) {
          candidates.push({ container: cur, rect: cRect, area: cRect.width * cRect.height });
          break;
        }
      }
      cur = cur.parentElement;
    }
  }
  
  // 取面积最大的
  candidates.sort((a, b) => b.area - a.area);
  return candidates[0]?.container || null;
}

/** 找到详情区域 */
function findTemuDetailSection() {
  const candidates = [
    document.getElementById('goodsDetail'),
    document.querySelector('[data-testid*="detail"]'),
    document.querySelector('[class*="detail"]'),
    document.querySelector('[class*="Detail"]'),
    document.querySelector('[class*="description"]'),
    document.querySelector('[class*="Description"]'),
    // 降级: 页面底部包含多张大图的容器
    ...Array.from(document.querySelectorAll('div')).filter(div => {
      const rect = div.getBoundingClientRect();
      if (rect.top < 500) return false;
      const imgs = div.querySelectorAll('img');
      const productImgs = Array.from(imgs).filter(i => /kwcdn\.com|upload_aimg/i.test(i.src || ''));
      return productImgs.length >= 4;
    }).slice(0, 1)
  ].filter(Boolean);
  return candidates[0] || null;
}

/** 从DOM元素提取原生图片URL */
function extractNativeImageUrls(container, { minSize = 0, maxSize = 99999, maxCount = 50 } = {}) {
  const urls = [];
  const seen = new Set();
  const imgs = container.querySelectorAll('img');
  for (const img of imgs) {
    const url = normalizeImageUrl(img.currentSrc || img.src || img.getAttribute('src') || '');
    if (!url || seen.has(url) || !/^https?:/i.test(url)) continue;
    seen.add(url);
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w >= minSize && w <= maxSize && h >= minSize && h <= maxSize) {
      urls.push(url);
      if (urls.length >= maxCount) break;
    }
  }
  return urls;
}

/** 扫描元素内的产品图片 */
function scanElementForProductImages(container, { minSize = 0, maxSize = 99999 } = {}) {
  const urls = [];
  const seen = new Set();
  const imgs = container.querySelectorAll('img');
  for (const img of imgs) {
    const url = normalizeImageUrl(img.currentSrc || img.src || img.getAttribute('src') || '');
    if (!url || seen.has(url) || !/^https?:/i.test(url)) continue;
    if (!/kwcdn\.com|upload_aimg|temu/i.test(url)) continue;
    seen.add(url);
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if ((!minSize || w >= minSize) && (!maxSize || w <= maxSize)) {
      urls.push(url);
    }
  }
  return urls;
}

/** 按类别分类图片 */
function classifyTemuImages(images, kind) {
  const results = [];
  const seen = new Set();
  
  for (const img of images) {
    if (!img.visible || !img.isProductUrl) continue;
    if (seen.has(img.url)) continue;
    seen.add(img.url);
    
    const text = (img.containerClass || '').toLowerCase();
    const leftRatio = img.rect.left / (window.innerWidth || 1);
    
    if (kind === 'main') {
      if (img.width >= 400 && leftRatio < 0.5) results.push(img.url);
    } else if (kind === 'sku') {
      if (img.width < 300 && img.width >= 30 && leftRatio >= 0.4) results.push(img.url);
      else if (img.width < 300 && /sku|spec|color|size|variant|swatch/i.test(text)) results.push(img.url);
    } else if (kind === 'detail') {
      if (img.width >= 300 && (leftRatio > 0.1 || /detail|desc/i.test(text))) results.push(img.url);
    }
  }
  
  return results.slice(0, kind === 'main' ? 20 : kind === 'detail' ? 50 : 80);
}

function collectTemuDomVideoUrl() {
  const selectors = [
    "#leftContent video source[src]",
    "#leftContent video[src]",
    "#goodsDetail video source[src]",
    "#goodsDetail video[src]",
    "[class*='video'] video source[src]",
    "[class*='video'] video[src]",
    "[data-video-url]",
    "[data-video-src]"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const url = normalizeImageUrl(
      element?.src
      || element?.getAttribute?.("src")
      || element?.getAttribute?.("data-video-url")
      || element?.getAttribute?.("data-video-src")
      || ""
    );
    if (url) return url;
  }

  return fallbackVideoUrl();
}

function normalizeTemuImageList(urls) {
  return uniqueImageUrls(urls.map(normalizeTemuImageUrl));
}

function normalizeTemuImageUrl(url) {
  const normalized = normalizeImageUrl(url);
  if (!/(?:kwcdn|temu|upload_aimg|fancy|open|goods)/i.test(normalized)) return normalized;
  
  try {
    const parsed = new URL(normalized);
    // 去掉hash
    parsed.hash = "";
    
    // 1) 去掉路径中的尺寸后缀: _200x200, _200x200xq75 等
    parsed.pathname = parsed.pathname
      .replace(/_(?:\d+x\d+(?:xq\d+)?)(?=\.(?:jpg|jpeg|png|webp|avif)$)/i, "")
      .replace(/\.jpg_\.(?:webp|avif)$/i, ".jpg")
      .replace(/\.jpeg_\.(?:webp|avif)$/i, ".jpeg")
      .replace(/\.png_\.(?:webp|avif)$/i, ".png");
    
    // 2) 去掉所有 imageView2 系列参数 (这些都是图片处理指令)
    const paramsToRemove = ['imageView2', 'imageMogr2', 'imageMogr', 'imageResize', 'imageCrop'];
    for (const param of paramsToRemove) {
      parsed.searchParams.delete(param);
    }
    
    // 3) 去掉单独的控制参数: w/xxx, q/xxx, format/xxx
    const keepParams = [];
    for (const [key, val] of parsed.searchParams.entries()) {
      // imageView2/2/w/180/q/70/format/avif 是单条参数
      if (/^\d/.test(key) || /^(?:w|h|q|format)$/i.test(key) && /^\d/.test(val)) continue;
      keepParams.push([key, val]);
    }
    parsed.searchParams = new URLSearchParams();
    for (const [k, v] of keepParams) parsed.searchParams.set(k, v);
    
    return parsed.href;
  } catch {
    // 手动清理
    return normalized
      .replace(/_(?:\d+x\d+(?:xq\d+)?)(?=\.(?:jpg|jpeg|png|webp|avif))/ig, "")
      .replace(/\?[^#]*/g, (m) => {
        // 只保留非图片处理参数
        const clean = m.replace(/imageView2[^&]*/g, '').replace(/&+/g, '&').replace(/[?&]$/g, '');
        return clean || '';
      })
      .replace(/\.jpg_\.(?:webp|avif)$/i, ".jpg")
      .replace(/\.jpeg_\.(?:webp|avif)$/i, ".jpeg");
  }
}

function filterTemuProductImages(urls) {
  return uniqueImageUrls(urls)
    .filter(isTemuProductImage)
    .filter((url) => !isTemuUiImage(url));
}

function filterTemuDetailImages(urls) {
  return uniqueImageUrls(urls)
    .filter((url) => isTemuProductImage(url) || /\/product\/open\//i.test(url))
    .filter((url) => !isTemuUiImage(url));
}

function isTemuProductImage(url) {
  return /img\.kwcdn\.com\/product\//i.test(url)
    || /aimg\.kwcdn\.com\/product\//i.test(url)
    || /\/upload_aimg\/.*\/product\//i.test(url)
    || /\/product\/fancy\//i.test(url)
    || /\/product\/open\//i.test(url)
    || /\/product\/fancyalgo\//i.test(url)
    || /\/product\/fmket\//i.test(url)
    || /kwcdn\.com\/[^?#]+(?:goods|gallery|sku|spec|detail|open|fancy|fmket|fancyalgo)/i.test(url)
    || /\/product\/[a-f0-9\-]{10,}/i.test(url) // UUID格式的产品图片
    || /(?:format|image_format)=(?:avif|webp)/i.test(url) && /kwcdn\.com/i.test(url);
}

function isTemuUiImage(url) {
  return /tree-selector|upload_aimg_b\/web\/pc|upload_aimg\/pc\/|upload_aimg\/dawn\/|upload_aimg\/pho\/|\/web\/pc\/|\/nav\/|\/menu\/|\/icon\/|\/icons\/|\/badge\/|avatar|logo|sprite|placeholder|thumbnailoverlay|play-button|coupon|trustmark/i.test(url);
}

function temuTitleFromUrl() {
  const matched = location.pathname.match(/\/([^/?#]+?)-g-\d+\.html/i);
  if (!matched) return "";
  return matched[1]
    .split("-")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function temuTitleFromDom() {
  const candidates = [
    "h1",
    "[data-testid='goods-title']",
    "[data-testid*='goods'][data-testid*='title']",
    "[class*='goods'][class*='title']",
    "[class*='product'][class*='title']"
  ];
  const value = textBySelectors(candidates);
  if (!value || /^(Adjust|Share|Save|Home)$/i.test(value)) return "";
  return value;
}

function temuPriceFromDom() {
  const selectors = [
    "[data-testid='goods-price']",
    "[data-testid*='price']",
    "[class*='goods'][class*='price']",
    "[class*='product'][class*='price']",
    "[class*='sale'][class*='price']"
  ];
  const text = textBySelectors(selectors);
  if (text && /[$€£¥]\s*\d|\d+[.,]\d{2}/.test(text)) return text;
  const bodyMatch = document.body.innerText.match(/[$€£¥]\s*\d+(?:[.,]\d{2})?/);
  return bodyMatch?.[0] || "";
}

function normalizeTemuPrice(value) {
  const normalized = normalizePrice(value);
  if (!normalized) return "";
  const number = Number(normalized);
  if (number >= 100 && !String(value).includes(".") && !/[$€£¥]/.test(String(value))) {
    return (number / 100).toFixed(2);
  }
  return normalized;
}

function temuAttributesFromDom() {
  const containers = Array.from(document.querySelectorAll("[class*='spec'], [class*='attr'], [class*='property'], [class*='overview'], [class*='description']"));
  const values = containers
    .map((node) => clean(node.innerText || node.textContent))
    .filter((text) => text.length >= 4 && text.length <= 400)
    .filter((text) => !/Delivery guarantee|Free returns|About Temu|Privacy|Sitemap|How to order|Support center|Affiliate/i.test(text))
    .slice(0, 12);
  return unique(values).join(" | ");
}

function temuSkuTextFromDom() {
  return platformSkuTextFromDom();
}

function cleanTemuSkuSpecs(value) {
  return clean(value)
    .split(/\s*[|｜;；\n]\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(isMeaningfulGenericSkuPart)
    .filter((part) => !/delivery|shipping|return|adjustment|privacy|support|about temu/i.test(part))
    .slice(0, 12)
    .join(" | ");
}

function normalizeSkuText(value) {
  const parts = clean(value)
    .split(/\s*[|｜;；\n/]\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(isValidSkuPart);
  return [...new Set(parts)].slice(0, 20).join(" | ");
}

function isValidSkuPart(value) {
  if (!value || value.length > 180) return false;
  if (/复制sku|购买数量|采购量|库存|价格|起批|物流|运费|加入进货单|立即订购|去下单|配送|服务|保障|退货|客服/i.test(value)) return false;
  if (/price|stock|qty|quantity|shipping|delivery|return|add to|buy now|sold out|wishlist/i.test(value)) return false;
  if (/^[>\d\s:;,\-_.]+$/.test(value)) return false;
  if (/^[￥¥$]?\d+(\.\d+)?$/.test(value)) return false;
  return /[\u4e00-\u9fa5A-Za-z]/.test(value);
}

function temuCategoryFromDom() {
  const values = Array.from(document.querySelectorAll("nav a, [class*='breadcrumb'] a, [class*='crumb'] a"))
    .map((node) => clean(node.innerText || node.textContent))
    .filter((text) => text && text.length <= 60)
    .filter((text) => !/Recommended|Price adjustment|展开工具箱|Adjust/i.test(text));
  return unique(values).join("/");
}

function genericAdapter() {
  const structured = collectStructuredProductData("generic");
  return {
    ...structured,
    source: structured.source || "generic-adapter",
    title: structured.title || fallbackTitle(),
    price: structured.price || fallbackPrice(),
    productId: structured.productId || extractSourceId(location.href)
  };
}

function amazonAdapter() {
  const structured = collectStructuredProductData("Amazon");
  const amazon = collectAmazonProductData();
  const mainImages = filterAmazonProductImages(mergeImages(amazon.mainImages, structured.mainImages)).slice(0, 20);
  const skuImages = excludeDuplicateImages(filterAmazonProductImages(mergeImages(amazon.skuImages, structured.skuImages)), mainImages).slice(0, 120);
  const detailImages = excludeDuplicateImages(filterAmazonProductImages(mergeImages(amazon.detailImages, structured.detailImages)), [...mainImages, ...skuImages]).slice(0, 60);

  return {
    ...structured,
    mainImages,
    skuImages,
    detailImages,
    skuOptions: amazon.skuOptions,
    source: amazon.source || structured.source || "amazon-adapter",
    title: amazon.title || structured.title || amazonTitleFromDom() || fallbackTitle(),
    price: amazon.price || structured.price || amazonPriceFromDom() || fallbackPrice(),
    productId: amazon.productId || structured.productId || extractSourceId(location.href),
    skuSpecs: amazon.skuSpecs || platformSkuTextFromDom() || structured.skuSpecs,
    attributes: amazon.attributes || amazonAttributesFromDom() || structured.attributes,
    categoryPath: amazon.categoryPath || amazonCategoryFromDom() || structured.categoryPath,
    videoUrl: amazon.videoUrl || structured.videoUrl || fallbackVideoUrl(),
    currency: structured.currency || "USD"
  };
}

function collectAmazonProductData() {
  const result = emptyProductData();
  result.productId = amazonAsinFromUrl() || amazonAsinFromDom();
  result.title = amazonTitleFromDom();
  result.price = amazonPriceFromDom();
  result.attributes = amazonAttributesFromDom();
  result.categoryPath = amazonCategoryFromDom();

  for (const script of Array.from(document.scripts)) {
    const scriptText = script.textContent || "";
    if (!scriptText) continue;
    collectAmazonFromScriptText(scriptText, result);
  }

  const dom = collectAmazonDomMedia();
  result.mainImages = mergeImages(result.mainImages, dom.mainImages);
  result.skuImages = mergeImages(result.skuImages, dom.skuImages);
  result.detailImages = mergeImages(result.detailImages, dom.detailImages);
  if (!result.videoUrl) result.videoUrl = dom.videoUrl || fallbackVideoUrl();
  result.skuOptions = buildAmazonSkuOptionsFromDom();
  result.skuSpecs = result.skuSpecs || amazonSkuTextFromDom();
  result.source = "amazon-fields";
  return result;
}

function collectAmazonFromScriptText(scriptText, result) {
  pickFirstRegex(scriptText, result, "title", [
    /"productTitle"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
    /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i
  ]);
  pickFirstRegex(scriptText, result, "productId", [
    /"asin"\s*:\s*"([A-Z0-9]{10})"/i,
    /"ASIN"\s*:\s*"([A-Z0-9]{10})"/i
  ]);
  pickFirstRegex(scriptText, result, "price", [
    /"priceAmount"\s*:\s*"?(?:USD|US\$)?\s*([\d,.]+)"?/i,
    /"priceToPay"\s*:\s*"?(?:USD|US\$)?\s*([\d,.]+)"?/i,
    /"displayPrice"\s*:\s*"[^"]*?([\d,.]+)"/i
  ]);

  for (const url of collectAmazonVideoUrls(scriptText)) {
    if (!result.videoUrl) result.videoUrl = url;
  }
  for (const url of collectAmazonImageUrls(scriptText)) {
    pushAmazonImageByContext(result, url, scriptText);
  }

  const variantGroups = collectAmazonVariantGroupsFromScriptText(scriptText);
  if (variantGroups.length) {
    result.skuSpecs = appendText(result.skuSpecs, variantGroups.map((group) => `${group.name}:${group.options.map((item) => item.value).join(",")}`).join(" | "), " | ");
    if (!result.skuOptions?.length) result.skuOptions = cartesianSkuOptionsWithImages(variantGroups);
    for (const group of variantGroups) {
      for (const option of group.options) {
        if (option.image) result.skuImages.push(option.image);
      }
    }
  }
}

function collectAmazonImageUrls(scriptText) {
  const urls = [];
  for (const match of scriptText.matchAll(/https?:\\?\/\\?\/[^"'\\\s<>]+?(?:m\.media-amazon\.com|images-amazon\.com)[^"'\\\s<>]*?(?:jpg|jpeg|png|webp)(?:\?[^"'\\\s<>]*)?/gi)) {
    urls.push(normalizeImageUrl(match[0].replaceAll("\\/", "/")));
  }
  return uniqueImageUrls(urls);
}

function collectAmazonVideoUrls(scriptText) {
  return [...String(scriptText).matchAll(/https?:\\?\/\\?\/[^"'\\\s<>]+?\.(?:mp4|m3u8)(?:\?[^"'\\\s<>]*)?/gi)]
    .map((match) => normalizeImageUrl(match[0].replaceAll("\\/", "/")))
    .filter(Boolean);
}

function collectAmazonVariantGroupsFromScriptText(scriptText) {
  const groups = [];
  const patterns = [
    /"variationValues"\s*:\s*({[\s\S]*?})\s*,\s*"(?:dimensions|dimensionValuesDisplayData)"/i,
    /"dimensionsDisplay"\s*:\s*({[\s\S]*?})\s*,\s*"(?:dimensionValuesDisplayData|twisterUpdateURLInfo)"/i
  ];

  for (const pattern of patterns) {
    const matched = scriptText.match(pattern);
    if (!matched?.[1]) continue;
    try {
      const parsed = JSON.parse(matched[1]);
      for (const [name, options] of Object.entries(parsed)) {
        if (!Array.isArray(options) || !options.length) continue;
        groups.push({
          name: inferAmazonGroupName(name),
          options: options.map((value) => ({ value: clean(value), image: "" })).filter((option) => option.value)
        });
      }
    } catch {
      // Ignore invalid fragments.
    }
  }

  return groups;
}

function collectAmazonDomMedia() {
  const mainImages = collectImagesFromSelectors([
    "#main-image-container img",
    "#altImages img",
    "#imageBlock img",
    "#landingImage",
    "[data-csa-c-content-id='image-block'] img"
  ]);
  const skuImages = collectImagesFromSelectors([
    "#twister img",
    "#variation_color_name img",
    "#variation_style_name img",
    "#inline-twister-expander-content-size_name img"
  ]);
  const detailImages = collectImagesFromSelectors([
    "#aplus img",
    "#productDescription img",
    "#feature-bullets img",
    "#detailBullets_feature_div img"
  ]);
  const videoUrl = fallbackVideoUrl()
    || normalizeImageUrl(document.querySelector("#videoBlock video source[src], #videoBlock video[src], .a-dynamic-video-container video source[src], .a-dynamic-video-container video[src]")?.src || "");

  return {
    mainImages: filterAmazonProductImages(mainImages),
    skuImages: filterAmazonProductImages(skuImages),
    detailImages: filterAmazonProductImages(detailImages),
    videoUrl
  };
}

function buildAmazonSkuOptionsFromDom() {
  const groups = collectAmazonVariantGroupsFromDom();
  return groups.length ? cartesianSkuOptionsWithImages(groups) : [];
}

function collectAmazonVariantGroupsFromDom() {
  const selectors = [
    "#twister [id^='variation_']",
    "#twister-plus-inline-twister [id^='variation_']",
    "#inline-twister-expander-content-size_name",
    "#inline-twister-expander-content-color_name"
  ];
  const groups = [];

  for (const container of document.querySelectorAll(selectors.join(","))) {
    if (!isVisibleElement(container)) continue;
    const rawName = container.id || container.getAttribute("data-csa-c-content-id") || "";
    const name = inferAmazonGroupName(rawName || clean(container.getAttribute("aria-label")));
    const options = [];

    for (const node of container.querySelectorAll("li, button, span, a")) {
      if (!isVisibleElement(node)) continue;
      const value = cleanAmazonVariantText(
        node.getAttribute("title")
        || node.getAttribute("aria-label")
        || node.dataset.defaultasin
        || node.innerText
        || node.textContent
      );
      if (!value) continue;
      const image = normalizeImageUrl(node.querySelector("img")?.currentSrc || node.querySelector("img")?.src || "");
      options.push({ value, image });
    }

    const uniqueOptions = dedupeVariantOptions(options);
    if (uniqueOptions.length) groups.push({ name, options: uniqueOptions });
  }

  return groups;
}

function cartesianSkuOptionsWithImages(groups, index = 0, prefix = [], image = "") {
  if (index >= groups.length) {
    return [{
      id: `sku-${prefix.join("-") || "1"}`,
      label: prefix.join(" / "),
      image
    }];
  }

  const group = groups[index];
  return group.options.flatMap((option) => {
    const label = option.value.includes(":") || option.value.includes("：")
      ? option.value
      : `${group.name}:${option.value}`;
    return cartesianSkuOptionsWithImages(
      groups,
      index + 1,
      [...prefix, label],
      image || option.image || ""
    );
  });
}

function inferAmazonGroupName(raw) {
  const value = clean(raw).toLowerCase();
  if (/color|colour|farbe|couleur|colore|color_name/.test(value)) return "颜色";
  if (/size|taille|größe|taglia|tamanho|size_name/.test(value)) return "尺码";
  if (/style|style_name/.test(value)) return "款式";
  if (/pattern/.test(value)) return "图案";
  return "规格";
}

function cleanAmazonVariantText(value) {
  return clean(value)
    .replace(/^(click to select|选择|select)\s*/i, "")
    .replace(/\s*(currently unavailable|temporarily out of stock|out of stock).*$/i, "")
    .replace(/\s*\$?\d+(?:\.\d+)?\s*$/i, "")
    .trim();
}

function dedupeVariantOptions(options) {
  const seen = new Set();
  const result = [];
  for (const option of options) {
    const key = `${option.value}::${canonicalImageUrl(option.image || "")}`;
    if (!option.value || seen.has(key)) continue;
    seen.add(key);
    result.push(option);
  }
  return result;
}

function amazonTitleFromDom() {
  return textBySelectors([
    "#productTitle",
    "#title span",
    "h1 span"
  ]);
}

function amazonPriceFromDom() {
  const selectors = [
    ".apexPriceToPay .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-offscreen",
    "#corePrice_feature_div .a-offscreen",
    "#twister-plus-price-data-price",
    ".reinventPricePriceToPayMargin .a-offscreen"
  ];
  return textBySelectors(selectors);
}

function amazonAttributesFromDom() {
  const candidates = Array.from(document.querySelectorAll("#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, #detailBullets_feature_div li, #feature-bullets li"))
    .map((node) => clean(node.innerText || node.textContent))
    .filter((value) => value && value.length >= 3 && value.length <= 240);
  return unique(candidates).slice(0, 30).join(" | ");
}

function amazonCategoryFromDom() {
  const values = Array.from(document.querySelectorAll("#wayfinding-breadcrumbs_feature_div a, #wayfinding-breadcrumbs_container a"))
    .map((node) => clean(node.innerText || node.textContent))
    .filter((text) => text && text.length <= 60);
  return unique(values).join("/");
}

function amazonSkuTextFromDom() {
  const groups = collectAmazonVariantGroupsFromDom();
  return groups.map((group) => `${group.name}:${group.options.map((item) => item.value).join(",")}`).join(" | ");
}

function amazonAsinFromUrl() {
  const matched = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return matched?.[1] || "";
}

function amazonAsinFromDom() {
  const asinInput = document.querySelector("#ASIN, input[name='ASIN'], input[name='asin']");
  return clean(asinInput?.value || asinInput?.getAttribute("value"));
}

function filterAmazonProductImages(urls) {
  return uniqueImageUrls(urls)
    .filter((url) => /m\.media-amazon\.com|images-amazon\.com/i.test(url))
    .filter((url) => !/sprite|icon|logo|nav|play-button|thumbnailOverlay/i.test(url));
}

function pushAmazonImageByContext(result, url, context) {
  const text = String(context || "");
  if (/video|videos|videoUrl/i.test(text)) return;
  if (/twister|variation|colorImages|colorToAsin|swatch|dimensionValues/i.test(text)) {
    result.skuImages.push(url);
    return;
  }
  if (/aplus|detail|description|feature-bullets|bullets/i.test(text)) {
    result.detailImages.push(url);
    return;
  }
  result.mainImages.push(url);
}

/**
 * 从DOM中收集结构化商品数据
 * 扫描所有 <script> 标签的 JSON 和页面 <img> 元素
 * 
 * 两个数据来源:
 * 1. 页面embed的JSON (script内 goodsData, productData等)
 * 2. DOM中的图片元素 (<img>, 背景图等)
 * 
 * @param {string} platform - 平台标识 (用于平台特定的分类规则)
 * @returns {Object} 采集到的商品数据
 */
function collectStructuredProductData(platform) {
  const result = emptyProductData();
  const scripts = Array.from(document.scripts).map((script) => script.textContent || "").filter(Boolean);

  for (const scriptText of scripts) {
    parseKnownJsonScript(scriptText, result);
    scanScriptText(scriptText, result);
  }

  const domGroups = collectDomImageGroups(platform);
  result.mainImages = mergeImages(result.mainImages, domGroups.mainImages);
  result.skuImages = mergeImages(result.skuImages, domGroups.skuImages);
  result.detailImages = mergeImages(result.detailImages, domGroups.detailImages);
  if (!result.videoUrl) result.videoUrl = fallbackVideoUrl();
  result.source ||= "structured+dom";
  return result;
}

function emptyProductData() {
  return {
    title: "",
    productId: "",
    price: "",
    currency: "",
    categoryPath: "",
    attributes: "",
    description: "",
    videoUrl: "",
    sizeChart: "",
    stock: "",
    skuSpecs: "",
    mainImages: [],
    skuImages: [],
    detailImages: [],
    source: ""
  };
}

function parseKnownJsonScript(scriptText, result) {
  const trimmed = scriptText.trim();
  const jsonCandidates = [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) jsonCandidates.push(trimmed);

  for (const candidate of jsonCandidates) {
    try {
      scanJson(JSON.parse(candidate), "", result);
    } catch {
      // Ignore non-JSON script blocks.
    }
  }
}

function scanScriptText(scriptText, result) {
  for (const { url, index, length } of extractMediaUrlMatches(scriptText)) {
    if (!isUsableImage(url)) continue;
    const context = scriptText.slice(Math.max(0, index - 180), index + length + 180);
    pushImageByContext(result, url, context);
  }

  pickFirstRegex(scriptText, result, "title", [
    /"(?:goodsName|productName|productTitle|title|name)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i
  ]);
  pickFirstRegex(scriptText, result, "productId", [
    /"(?:goodsId|goods_id|productId|product_id|itemId|item_id)"\s*:\s*"?(\d{5,})"?/i
  ]);
  pickFirstRegex(scriptText, result, "price", [
    /"(?:salePrice|price|retailPrice|amount)"\s*:\s*"?([\d,.]+)"?/i
  ]);
}

function scanJson(value, path, result) {
  if (value == null) return;

  if (typeof value === "string") {
    const text = decodeText(value);
    for (const url of extractImageUrls(text)) pushImageByContext(result, url, path);
    pickScalar(path, text, result);
    return;
  }

  if (typeof value === "number") {
    pickScalar(path, String(value), result);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanJson(item, `${path}[${index}]`, result));
    return;
  }

  if (typeof value === "object") {
    const compact = compactObjectText(value);
    if (compact) pickStructuredObject(path, value, compact, result);
    for (const [key, nested] of Object.entries(value)) {
      scanJson(nested, path ? `${path}.${key}` : key, result);
    }
  }
}

function pickScalar(path, value, result) {
  const key = path.split(".").pop() || path;
  if (!result.title && /(^|\.)(goodsName|productName|productTitle|title|name)$/i.test(key) && value.length > 5 && value.length < 260) result.title = value;
  if (!result.productId && /(^|\.)(goodsId|goods_id|productId|product_id|itemId|item_id|mallGoodsId)$/i.test(key) && /^\d{5,}$/.test(value)) result.productId = value;
  if (!result.price && /(^|\.)(salePrice|price|retailPrice|amount|minPrice|maxPrice)$/i.test(key) && /\d/.test(value)) result.price = value;
  if (!result.currency && /(^|\.)(currency|currencyCode)$/i.test(key) && /^[A-Z]{3}$/.test(value)) result.currency = value;
  if (!result.categoryPath && /category|breadcrumb|catName|类目/i.test(path) && value.length > 1 && value.length < 120) result.categoryPath = appendText(result.categoryPath, value, "/");
}

function pickStructuredObject(path, object, compact, result) {
  if (/sku|saleAttr|sale_attr|variant|color|颜色|规格|attr/i.test(path)) {
    const skuText = clean1688SkuSpecs(compact);
    if (skuText) result.skuSpecs = appendText(result.skuSpecs, skuText, " | ");
  } else if (/attr|property|spec|参数|属性/i.test(path)) {
    result.attributes = appendText(result.attributes, compact, " | ");
  }
}

function pushImageByContext(result, url, context) {
  const target = classifyContext(context);
  result[target] = mergeImages(result[target], [url]);
}

function classifyContext(context) {
  const text = String(context || "");
  if (/sku|saleAttr|sale_attr|variant|color|颜色|规格|attrValue|goodsSku|skuImage|sku_img|skuMap|skuProps|saleProp/i.test(text)) return "skuImages";
  if (/detail|desc|description|richText|rich_text|详情|描述|longImage|detailImage|descImage|sizeChart|尺码|offerDetail|detailUrl|descUrl/i.test(text)) return "detailImages";
  return "mainImages";
}

/**
 * 从DOM中收集图片，并自动分类
 * 扫描所有<img>和有background-image的元素
 * 
 * 分类规则:
 * - SKU图: class/id含 "sku", "spec", "variant", "color"
 * - 详情图: class含 "detail", "desc", "description"
 * - 主图: gallery, swiper, carousel 或默认分类
 * 
 * @param {string} platform - 平台名 (某些平台有特殊分类规则)
 * @returns {Object} { mainImages: [], skuImages: [], detailImages: [] }
 */
function collectDomImageGroups(platform) {
  const groups = { mainImages: [], skuImages: [], detailImages: [] };
  const images = Array.from(document.images);

  for (const img of images) {
    for (const url of extractUrlsFromImageElement(img)) {
      if (!isUsableImage(url)) continue;
      const target = classifyDomElement(img, platform);
      groups[target] = mergeImages(groups[target], [url]);
    }
  }

  for (const element of Array.from(document.querySelectorAll("[style]"))) {
    for (const rawUrl of extractCssUrls(getComputedStyle(element).backgroundImage)) {
      const url = normalizeImageUrl(rawUrl);
      if (!isUsableImage(url)) continue;
      const target = classifyDomElement(element, platform);
      groups[target] = mergeImages(groups[target], [url]);
    }
  }

  groups.mainImages = rankDomImages(groups.mainImages, "main").slice(0, 12);
  groups.skuImages = rankDomImages(groups.skuImages, "sku").slice(0, 20);
  groups.detailImages = rankDomImages(groups.detailImages, "detail").slice(0, 30);
  return groups;
}

function classifyDomElement(element, platform) {
  const path = elementPathText(element);
  if (/sku|saleAttr|sale_attr|variant|color|颜色|规格|attr/i.test(path)) return "skuImages";
  if (/detail|desc|description|richtext|详情|描述/i.test(path)) return "detailImages";
  if (/gallery|swiper|carousel|slider|thumb|main.*image|product.*image|goods.*image|主图|轮播/i.test(path)) return "mainImages";
  if (platform === "Temu" && /goods|product|image|thumb/i.test(path)) return "mainImages";
  if (platform === "SHEIN" && /product-intro|goods|swiper|crop-image/i.test(path)) return "mainImages";
  return "mainImages";
}

function rankDomImages(urls) {
  return uniqueImageUrls(urls).filter((url) => !/logo|avatar|icon|sprite|placeholder/i.test(url));
}

function fallbackTitle() {
  return textBySelectors(["h1", ".title", ".product-title", ".tb-main-title", "[class*='title']"]) || meta("og:title") || document.title;
}

function fallbackPrice() {
  return textBySelectors(["[class*='price']", "[class*='Price']", ".tm-price", ".tb-rmb-num", "[data-price]"]);
}

function fallbackCategoryPath() {
  const crumbs = Array.from(document.querySelectorAll("nav a, [class*='breadcrumb'] a, [class*='crumb'] a, a, span"))
    .map((node) => clean(node.innerText || node.textContent))
    .filter((text) => text && text.length <= 24)
    .filter((text) => /首页|类目|分类|家居|服饰|饰品|工具|数码|收纳|厨房|配件|Women|Men|Home|Beauty/i.test(text))
    .slice(0, 8);
  return unique(crumbs).join("/");
}

function fallbackSkuText() {
  return platformSkuTextFromDom() || Array.from(document.querySelectorAll("[class*='sku'], [class*='spec'], [class*='Sku'], [class*='Spec'], [class*='variant'], [class*='color']"))
    .map((node) => clean(node.innerText || node.textContent))
    .filter((value) => value && value.length < 300)
    .slice(0, 8)
    .join(" | ");
}

function platformSkuTextFromDom() {
  const containers = Array.from(document.querySelectorAll("[class*='sku'], [class*='Sku'], [class*='spec'], [class*='Spec'], [class*='variant'], [class*='Variant'], [class*='color'], [class*='Color'], [class*='size'], [class*='Size']"))
    .filter(isVisibleElement)
    .slice(0, 30);
  const groups = [];

  for (const container of containers) {
    const text = clean(container.innerText || container.textContent);
    if (!text || /shipping|delivery|return|privacy|service|客服|物流|运费/i.test(text)) continue;
    const options = Array.from(container.querySelectorAll("button, li, a, span, div, [role='button'], [class*='item'], [class*='option'], [class*='value']"))
      .filter(isVisibleElement)
      .filter((node) => node.children.length <= 2)
      .map((node) => clean(node.innerText || node.textContent || node.getAttribute("title") || node.getAttribute("aria-label")))
      .map(cleanSkuOptionText)
      .filter(isMeaningfulGenericSkuPart)
      .filter((value) => value.length <= 80);
    const uniqueOptions = unique(options).filter((value) => !/^(select|selected|please select|size guide|guide|全部|更多|请选择|选择)$|^\+$|^-$/i.test(value));
    if (!uniqueOptions.length || uniqueOptions.length > 100) continue;
    const groupName = inferGenericSkuGroupName(container);
    const groupText = `${groupName}:${uniqueOptions.join(",")}`;
    if (!groups.includes(groupText)) groups.push(groupText);
  }

  return groups.slice(0, 4).join(" | ");
}

function inferGenericSkuGroupName(container) {
  const text = clean(container.innerText || container.textContent);
  if (/color|colour|颜色/i.test(text)) return "颜色";
  if (/size|尺码|尺寸/i.test(text)) return "尺码";
  if (/style|款式/i.test(text)) return "款式";
  if (/规格|spec/i.test(text)) return "规格";
  return "规格";
}

function isMeaningfulGenericSkuPart(text) {
  const value = clean(text);
  if (!value || value.length > 120) return false;
  if (/price|stock|qty|quantity|shipping|delivery|return|size guide|add to|buy now|sold out|wishlist|库存|购买|价格|运费|物流|加入|立即/i.test(value)) return false;
  if (/^[￥¥$]?\d+(\.\d+)?$/.test(value)) return false;
  return /[\u4e00-\u9fa5A-Za-z0-9]/.test(value);
}

function fallbackAttributesText() {
  const candidates = Array.from(document.querySelectorAll("li, tr, dl, [class*='attr'], [class*='param'], [class*='property']"))
    .map((node) => clean(node.innerText || node.textContent))
    .filter((value) => value && value.length >= 4 && value.length <= 180)
    .slice(0, 30);
  return unique(candidates).join(" | ");
}

function fallbackVideoUrl() {
  const video = document.querySelector("video source[src], video[src]");
  const url = normalizeImageUrl(video?.src || video?.getAttribute("src") || "");
  if (url) return url;
  const player = document.querySelector("[data-video-url], [data-video-src]");
  return normalizeImageUrl(player?.getAttribute("data-video-url") || player?.getAttribute("data-video-src") || "");
}

/**
 * 用CSS选择器列表查询文本
 * 逐个选择器尝试，返回第一个有值的结果
 * 
 * 优先级: innerText > textContent > content属性 > data-price属性
 * 
 * @param {string[]} selectors - CSS选择器数组
 * @returns {string} 查询到的文本
 */
function textBySelectors(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const text = element?.innerText || element?.textContent || element?.getAttribute("content") || element?.getAttribute("data-price");
    if (clean(text)) return clean(text);
  }
  return "";
}

/**
 * 检测电商平台
 * 根据URL hostname识别可支持的平台
 * 
 * 支持列表:
 * - 1688.com → "1688"
 * - taobao.com → "淘宝"
 * - tmall.com → "天猫"
 * - yangkeduo.com/pinduoduo.com → "拼多多"
 * - temu.com → "Temu"
 * - shein.com → "SHEIN"
 * - 其他 → hostname (去掉www)
 * 
 * @returns {string} 平台标识符
 */
function detectPlatform() {
  const host = location.hostname;
  if (host.includes("1688.com")) return "1688";
  if (host.includes("taobao.com")) return "淘宝";
  if (host.includes("tmall.com")) return "天猫";
  if (host.includes("yangkeduo.com") || host.includes("pinduoduo.com")) return "拼多多";
  if (host.includes("temu.com")) return "Temu";
  if (host.includes("shein.com")) return "SHEIN";
  if (host.includes("amazon.")) return "Amazon";
  return host.replace(/^www\./, "");
}

function defaultCurrency(platform) {
  return ["1688", "淘宝", "天猫", "拼多多"].includes(platform) ? "CNY" : "USD";
}

function platformCode(platform) {
  return { "1688": "A", "淘宝": "TB", "天猫": "TM", "拼多多": "PDD", "Temu": "TEMU", "SHEIN": "SHEIN", "Amazon": "AMZ" }[platform] || "P";
}

/**
 * 验证采集的商品数据是否完整
 * 必须满足:
 * - 有标题和链接
 * - 至少有一种图片 (主图/SKU图/详情图)
 * 
 * @param {Object} product - 采集的商品对象
 * @throws {Error} 数据不完整时抛出错误
 */
function assertCollectable(product) {
  if (!product["*产品名称"] || !product["货源链接"]) throw new Error("没有采集到商品标题或链接");
  if (!product["产品主图"] && !product["SKU图片"] && !product["详情图"]) throw new Error("没有采集到商品图片");
}

function meta(name) {
  return document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || "";
}

/**
 * 从<img>元素提取所有可能的图片URL
 * 尝试多个属性: currentSrc, src, data-src, data-lazyload, srcset等
 * 
 * @param {HTMLImageElement} img - 图片元素
 * @returns {string[]} 可能的图片URL数组
 */
function extractUrlsFromImageElement(img) {
  return [
    img.currentSrc,
    img.src,
    img.getAttribute("src"),
    img.getAttribute("data-src"),
    img.getAttribute("data-lazyload"),
    img.getAttribute("data-original"),
    img.getAttribute("data-image"),
    img.getAttribute("data-img"),
    bestSrcsetUrl(img.getAttribute("srcset")),
    bestSrcsetUrl(img.getAttribute("data-srcset"))
  ].map(normalizeImageUrl).filter(Boolean);
}

/**
 * 从文本中提取图片URL (正则匹配)
 * 匹配 https://...xxx.jpg/png/webp 格式的URL
 * 
 * @param {string} text - 文本内容
 * @returns {string[]} 提取到的URL数组
 */
/**
 * 从富文本HTML中提取 <img> 标签的src属性
 * 用于处理包含HTML标记的描述文本中的图片
 * 例: 
 *   "<img src='https://example.com/pic.jpg' />" 
 *   → ["https://example.com/pic.jpg"]
 * 
 * @param {string} htmlText - 包含HTML的文本
 * @returns {Array<string>} 提取到的图片URL数组
 */
function extractHtmlImages(text) {
  const htmlText = String(text);
  // 匹配 <img src="..." /> 和 <img src='...' /> 两种格式
  // 支持双引号、单引号和无引号的src值
  const imgTagPattern = /<img[^>]+src\s*=\s*["']?([^"'>\s]+)["']?[^>]*>/gi;
  const urls = [];
  
  for (const match of htmlText.matchAll(imgTagPattern)) {
    const url = match[1];
    if (url && (url.startsWith("http") || url.startsWith("/") || url.startsWith("."))) {
      urls.push(normalizeImageUrl(url));
    }
  }
  
  return urls.filter(isUsableImage);
}

function extractImageUrls(text) {
  return extractMediaUrlMatches(String(text)).map((item) => item.url).filter(isUsableImage);
}

function extractMediaUrlMatches(text) {
  const source = String(text || "");
  const patterns = [
    /https?:\\?\/\\?\/[^"'\\\s<>]+?(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\\\s<>]*)?/gi,
    /https?:\\?\/\\?\/[^"'\\\s<>]+?kwcdn\.com\/[^"'\\\s<>]+/gi,
    /https?:\\?\/\\?\/[^"'\\\s<>]+?(?:alicdn|tbcdn|shein|ltwebstatic|images-amazon|media-amazon)\.[^"'\\\s<>]+/gi
  ];
  const matches = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const url = normalizeImageUrl(match[0].replaceAll("\\/", "/").replaceAll("\\u002F", "/"));
      if (!url) continue;
      matches.push({ url, index: match.index || 0, length: match[0].length });
    }
  }
  const seen = new Set();
  return matches.filter((item) => {
    const key = canonicalImageUrl(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 规范化图片URL
 * 修复protocol、转义符，补全相对路径
 * 例:
 *   "\\/\\/img.com\/pic.jpg" → "https://img.com/pic.jpg"
 *   "/pic.jpg" → "https://example.com/pic.jpg"
 * 
 * @param {string} url - 原始URL
 * @returns {string} 规范后的URL
 */
function normalizeImageUrl(url) {
  if (!url) return "";
  let value = String(url).trim();
  value = value.replaceAll("\\/", "/").replaceAll("\\u002F", "/").replace(/&amp;/g, "&");
  if (value.startsWith("//")) value = `${location.protocol}${value}`;
  if (value.startsWith("/")) value = `${location.origin}${value}`;
  return value;
}

/**
 * 规范化图片URL路径
 * 移除图片处理参数，便于去重
 * 
 * 移除的参数: x-oss-process, imageMogr2, width, height, crop, thumbnail等
 * 例:
 *   "pic.jpg?x-oss-process=image/resize,w_100"
 *   → "pic.jpg"
 *   "pic_200x200.jpg" → "pic.jpg"
 * 
 * @param {string} url - 图片URL
 * @returns {string} 规范后的URL (便于去重)
 */
function canonicalImageUrl(url) {
  try {
    const parsed = new URL(url);
    if (/^\?imageView2\//i.test(parsed.search)) parsed.search = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(x-oss-process|imageMogr2|imageView2|imageView|resize|format|quality|width|height|w|h|crop|thumbnail|spm|scene|from)$/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = "";
    parsed.pathname = canonicalImagePath(parsed.pathname);
    return parsed.origin + parsed.pathname + (parsed.search ? parsed.search : "");
  } catch {
    return canonicalImagePath(String(url).split(/[?#]/)[0]);
  }
}

function canonicalImagePath(path) {
  return String(path)
    .replace(/_\d+x\d+[^./]*(?=\.)/gi, "")
    .replace(/\.(?:\d+x\d+|sum|thumb|small|medium|large)(?=\.(?:jpg|jpeg|png|webp)$)/gi, "")
    .replace(/(?:\.jpg|\.jpeg|\.png)_\.(?:webp|avif)$/i, (match) => match.split("_.")[0])
    .replace(/\.(jpg|jpeg|png|webp)_(?:\d+x\d+|\d+x\d+xq\d+|\.webp|\.avif)$/i, ".$1")
    .replace(/!!\d+-\d+-cib\.\d+x\d+(\.(?:jpg|jpeg|png|webp))$/i, "!!$1")
    .toLowerCase();
}

/**
 * 判断URL是否为可用的商品图片
 * 排除: 图标、logo、占位图、sprite、data:image等
 * 
 * @param {string} url - 图片URL
 * @returns {boolean} 是否为有效商品图
 */
function isUsableImage(url) {
  if (!url || !/^https?:\/\//.test(url)) return false;
  if (url.includes("data:image")) return false;
  if (location.hostname.includes("temu.com") && isTemuProductImage(url)) return true;
  if (/sprite|icon|logo|avatar|loading|blank|grey|placeholder|base64/i.test(url)) return false;
  if (location.hostname.includes("temu.com") && isTemuUiImage(url)) return false;
  if (/\.(jpg|jpeg|png|webp|avif)(\?|#|$)/i.test(url)) return true;
  if (/(?:format|image_format)=(?:avif|webp|jpg|jpeg|png)/i.test(url)) return true;
  if (/alicdn|tbcdn|temu|shein|pinduoduo|images-amazon|media-amazon/i.test(url)) return true;
  return false;
}

function bestSrcsetUrl(srcset) {
  if (!srcset) return "";
  const candidates = String(srcset).split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean);
  return candidates[candidates.length - 1] || "";
}

function extractCssUrls(value) {
  return [...String(value || "").matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
}

function elementPathText(element) {
  const parts = [];
  let current = element;
  while (current && current !== document.body && parts.length < 6) {
    parts.push(`${current.id || ""} ${current.className || ""} ${current.getAttribute?.("data-testid") || ""}`);
    current = current.parentElement;
  }
  return parts.join(" ");
}

function compactObjectText(object) {
  const name = object.name || object.attrName || object.specName || object.key || object.title || object.label;
  const value = object.value || object.attrValue || object.specValue || object.val || object.text;
  if (name && value && String(name).length < 80 && String(value).length < 120) return `${clean(name)}:${clean(value)}`;
  return "";
}

function compactSkuObjectText(object) {
  const name = object.attr_name || object.attrName || object.attribute_name || object.attributeName || object.name || object.key || object.specName || object.label;
  const value = object.attr_value_name || object.attrValueName || object.attr_value || object.attrValue || object.value_name || object.valueName || object.value || object.val || object.text;
  if (name && value && String(name).length < 80 && String(value).length < 120) return `${clean(name)}:${clean(value)}`;
  if (value && String(value).length < 80 && isMeaningfulGenericSkuPart(String(value))) return clean(value);
  return "";
}

function compactAttributeObjectText(object) {
  const name = object.name || object.attr_name || object.attrName || object.key || object.title;
  const value = object.value || object.attr_value || object.attrValue || object.val || object.text;
  if (name && value && String(name).length < 80 && String(value).length < 180) return `${clean(name)}:${clean(value)}`;
  return "";
}

function pickFirstRegex(text, result, field, patterns) {
  if (result[field]) return;
  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (matched?.[1]) {
      result[field] = decodeText(matched[1]);
      return;
    }
  }
}

function appendText(existing, value, separator) {
  const cleanValue = clean(value);
  if (!cleanValue) return existing || "";
  if (!existing) return cleanValue;
  if (existing.includes(cleanValue)) return existing;
  return `${existing}${separator}${cleanValue}`;
}

function decodeText(value) {
  try {
    return JSON.parse(`"${String(value).replaceAll('"', '\\"')}"`);
  } catch {
    return clean(value);
  }
}

/**
 * 规范化标题 - 移除平台标识和特殊词汇
 * 例: "红色T恤-天猫-官方旗舰店" → "红色T恤"
 * 
 * @param {string} title - 原始标题
 * @returns {string} 清理后的标题
 */
function normalizeTitle(title) {
  return clean(title).replace(/\s*[-_].*?(1688|淘宝|天猫|拼多多|Temu|SHEIN).*$/i, "");
}

/**
 * 规范化价格 - 提取纯数字
 * 例: "¥99.99" → "99.99"
 *     "$15.50" → "15.50"
 * 
 * @param {string} value - 原始价格字符串
 * @returns {string} 纯数字价格
 */
function normalizePrice(value) {
  const matched = String(value || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return matched ? matched[0] : "";
}

/**
 * 从URL中提取商品ID
 * 支持多种URL格式:
 * - offer/123456 (1688)
 * - item.htm?id=123456 (淘宝)
 * - goods/123456 or product/123456
 * - -p-123456.html (Temu)
 * 
 * @param {string} url - 商品链接
 * @returns {string} 商品ID (纯数字)
 */
function extractSourceId(url) {
  const patterns = [
    /offer\/(\d+)/,
    /item\.htm.*?[?&]id=(\d+)/,
    /goods_id[=/](\d+)/,
    /product_id[=/](\d+)/,
    /goods\/(\d+)/,
    /product\/(\d+)/,
    /-p-(\d+)\.html/,
    /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i,
    /[?&](?:_oak_mp_inf|productId|goodsId|itemId)=(\d+)/
  ];
  for (const pattern of patterns) {
    const matched = String(url).match(pattern);
    if (matched) return matched[1];
  }
  return "";
}

function makeProductCode(source) {
  let hash = 0;
  for (const char of String(source || location.href)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `P-${hash.toString(36).toUpperCase()}`;
}

function mergeImages(...lists) {
  return uniqueImageUrls(lists.flat());
}

/**
 * 图片URL去重 (核心逻辑)
 * 
 * 流程:
 * 1. normalizeImageUrl() - 修复协议、转义字符
 * 2. canonicalImageUrl() - 移除图片处理参数 (x-oss-process, resize, crop等)
 * 3. Set去重 - 用规范后的URL作为key
 * 4. 返回去重后的原始URL列表
 * 
 * 例: [
 *   "https://img.com/pic.jpg?x-oss-process=xxx",
 *   "https://img.com/pic.jpg?w=100"  ← 相同图片不同参数
 * ] → ["https://img.com/pic.jpg?x-oss-process=xxx"]
 * 
 * @param {string[]} urls - 图片URL数组
 * @returns {string[]} 去重后的URL数组
 */
function uniqueImageUrls(urls) {
  const seen = new Set();
  const result = [];
  for (const url of urls.map(normalizeImageUrl).filter(isUsableImage)) {
    const key = canonicalImageUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}

function excludeDuplicateImages(urls, existingUrls) {
  const existing = new Set(existingUrls.map(normalizeImageUrl).filter(Boolean).map(canonicalImageUrl));
  return urls.filter((url) => !existing.has(canonicalImageUrl(normalizeImageUrl(url))));
}

function joinLinks(values) {
  return uniqueImageUrls(values).join("，");
}

/**
 * 清理文本 - 移除HTML标签和多余空格
 * 例: "<div>  价格: 99  </div>" → "价格: 99"
 * 
 * @param {string} value - 原始文本
 * @returns {string} 清理后的文本
 */
function clean(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}
