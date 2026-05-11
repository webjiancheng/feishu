const serverUrl = "http://127.0.0.1:17321";
let currentProduct = null;

document.querySelector("#sync").addEventListener("click", collectAndSync);
document.querySelector("#allSku").addEventListener("click", useAllSku);
document.querySelector("#selectAllSku").addEventListener("click", () => setSkuChecked(true));
document.querySelector("#clearSku").addEventListener("click", () => setSkuChecked(false));
document.addEventListener("DOMContentLoaded", previewCurrentPage);

async function previewCurrentPage() {
  setStatus("预读中");
  setMessage("正在读取当前页面 SKU...");
  try {
    currentProduct = await collectCurrentPage();
    render(currentProduct);
    setStatus("待同步");
    setMessage("确认 SKU 数量后点击同步。");
  } catch (error) {
    setStatus("待同步");
    setMessage(`${error.message}。也可以刷新商品页后再打开插件。`);
  }
}

async function collectAndSync() {
  setStatus("采集中");
  setMessage("正在读取当前商品页...");

  try {
    const serviceReady = await checkServer();
    const product = prepareProductForSubmit(await collectCurrentPage(readSkuOptions()));
    currentProduct = product;
    render(product);
    const imageCount = countImages(product);
    if (imageCount === 0) {
      setMessage("已采集到文字，但图片数量为 0。当前页面可能还没加载完图片。");
    }

    if (!serviceReady) {
      setStatus("服务未启动");
      setMessage("本地服务未启动。请先在项目目录运行：npm run sync-server");
      return;
    }

    setStatus("同步中");
    if (imageCount > 0) setMessage("正在写入飞书和本地导出数据...");
    product["网页截图"] = await captureAndUploadScreenshot(product["*产品主编号"] || product["货源ID"] || product["平台SKU"]);
    const data = await postProduct(product);
    if (!data.ok) throw new Error(data.error || "同步失败");

    setStatus("已同步");
    setMessage("完成：已写入飞书，并保存到本地导出数据。");
  } catch (error) {
    setStatus("失败");
    setMessage(`${error.message}。未写入空白行。`);
  }
}

async function checkServer() {
  try {
    const response = await fetch(`${serverUrl}/health`);
    const data = await response.json();
    if (!data.ok) throw new Error();
    return true;
  } catch {
    return false;
  }
}

async function collectCurrentPageWithOptions(options) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: "COLLECT_PRODUCT", options });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    response = await chrome.tabs.sendMessage(tab.id, { type: "COLLECT_PRODUCT", options });
  }
  if (!response?.ok) throw new Error(response?.error || "当前页面无法采集，请刷新商品页后重试");
  return response.product;
}

async function collectCurrentPage(options = {}) {
  return collectCurrentPageWithOptions(options);
}

async function postProduct(product) {
  const response = await fetch(`${serverUrl}/sync/product`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(product)
  });
  return response.json();
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

function render(product) {
  const skuOptions = product._debug?.skuOptions || [];
  const skuCount = product._debug?.skuCount || skuOptions.length || countSku(product);
  document.querySelector("#platform").textContent = product["货源平台"] || "-";
  document.querySelector("#price").textContent = product["*SKU售价"] || "-";
  document.querySelector("#imageCount").textContent = countImages(product);
  document.querySelector("#skuCount").textContent = skuCount || "-";
  document.querySelector("#title").value = product["*产品名称"] || "";
  document.querySelector("#url").value = product["货源链接"] || "";
  syncSkuLimitInput(skuCount);
  renderSkuList(skuOptions);
}

function countImages(product) {
  return [
    product["产品主图"],
    product["详情图"],
    product["SKU图片"]
  ].join("，").split(/[，,]/).map((item) => item.trim()).filter(Boolean).length;
}

function countSku(product) {
  const text = product["SKU规格1"] || "";
  const groups = text.split(/\s*[|｜;；\n]\s*/).filter(Boolean);
  if (!groups.length) return 0;
  const counts = groups.map((group) => {
    const value = group.split(/[:：]/).slice(1).join(":");
    return value ? value.split(/[，,\/]/).filter(Boolean).length : 1;
  });
  return counts.reduce((total, count) => total * Math.max(count, 1), 1);
}

function readSkuLimit() {
  const input = document.querySelector("#skuLimit");
  const value = Number(input.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function readSkuOptions() {
  const selectedSkus = [...document.querySelectorAll(".sku-check:checked")].map((input) => input.value);
  const totalSkus = document.querySelectorAll(".sku-check").length;
  return totalSkus ? { selectedSkus } : { skuLimit: readSkuLimit() };
}

function syncSkuLimitInput(skuCount) {
  const input = document.querySelector("#skuLimit");
  if (!skuCount) {
    input.value = "";
    input.removeAttribute("max");
    return;
  }
  input.max = String(skuCount);
  if (!input.value || Number(input.value) > skuCount) input.value = String(skuCount);
}

function useAllSku() {
  const skuCount = currentProduct?._debug?.skuCount || countSku(currentProduct || {});
  if (skuCount) document.querySelector("#skuLimit").value = String(skuCount);
  setSkuChecked(true);
}

function renderSkuList(skuOptions) {
  const list = document.querySelector("#skuList");
  list.textContent = "";
  if (!skuOptions.length) {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "当前页面没有识别到可选择 SKU";
    list.appendChild(empty);
    return;
  }

  const selectedLabels = currentProduct?._debug?.selectedSkuLabels;
  const selected = new Set(Array.isArray(selectedLabels) ? selectedLabels : skuOptions.map((sku) => sku.label));
  for (const sku of skuOptions) {
    const label = document.createElement("label");
    label.className = "sku-item";

    const checkbox = document.createElement("input");
    checkbox.className = "sku-check";
    checkbox.type = "checkbox";
    checkbox.value = sku.label;
    checkbox.checked = selected.has(sku.label);
    checkbox.addEventListener("change", syncSelectedSkuCount);

    const image = document.createElement("img");
    image.className = "sku-thumb";
    image.alt = "";
    if (sku.image) image.src = sku.image;

    const name = document.createElement("span");
    name.className = "sku-name";
    name.title = sku.label;
    name.textContent = sku.label;

    label.append(checkbox, image, name);
    list.appendChild(label);
  }
  syncSelectedSkuCount();
}

function setSkuChecked(checked) {
  document.querySelectorAll(".sku-check").forEach((input) => {
    input.checked = checked;
  });
  syncSelectedSkuCount();
}

function syncSelectedSkuCount() {
  const checked = document.querySelectorAll(".sku-check:checked").length;
  const total = document.querySelectorAll(".sku-check").length;
  if (total) {
    document.querySelector("#skuCount").textContent = `${checked}/${total}`;
    document.querySelector("#skuLimit").value = checked ? String(checked) : "";
  }
}

function setStatus(text) {
  document.querySelector("#status").textContent = text;
}

function setMessage(text) {
  document.querySelector("#message").textContent = text;
}

function captureCurrentPageScreenshot() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" }, (response) => {
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
}

async function captureAndUploadScreenshot(productId) {
  const dataUrl = await captureCurrentPageScreenshot();
  const response = await fetch(`${serverUrl}/sync/screenshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, dataUrl })
  });
  const data = await response.json();
  if (!data.ok || !data.url) throw new Error(data.error || "截图保存失败");
  return data.url;
}
