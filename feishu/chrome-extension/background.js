chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CAPTURE_VISIBLE_TAB") {
    chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, dataUrl });
    });
    return true;
  }

  if (message?.type !== "DOWNLOAD_IMAGES") return;

  const urls = Array.isArray(message.urls) ? message.urls.filter(Boolean) : [];
  const folder = sanitizePath(message.folder || `商品同步助手/${Date.now()}`);
  urls.forEach((url, index) => {
    chrome.downloads.download({
      url,
      filename: `${folder}/${String(index + 1).padStart(2, "0")}-${filenameFromUrl(url)}`,
      saveAs: false
    });
  });
  sendResponse({ ok: true, count: urls.length });
});

function filenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(name)) return sanitizePath(name);
  } catch {
    // Fall through to default name.
  }
  return "image.jpg";
}

function sanitizePath(value) {
  return String(value || "image").replace(/[\\:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
}
