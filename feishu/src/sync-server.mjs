#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { runLark } from "./lark.mjs";

const cwd = process.cwd();
const configPath = path.resolve(cwd, ".feishu-base.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(process.env.PORT || 17321);
const collectedPath = path.resolve(cwd, "data/collected-products.jsonl");
const rawPath = path.resolve(cwd, "data/raw-products.jsonl");
const screenshotDir = path.resolve(cwd, "data/screenshots");

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true, base: config.name, table: "原始数据暂存" });
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/image?")) {
    await proxyImage(req, res);
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/screenshots/")) {
    await serveScreenshot(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/sync/product") {
    try {
      const body = await readJson(req);
      body["网页截图"] = saveScreenshot(body["网页截图"], body["*产品主编号"] || body["货源ID"] || body["平台SKU"]);
      saveJsonl(rawPath, { ...body, "本地接收时间": new Date().toISOString() });
      validateProductPayload(body);
      const collectedRecord = normalizeCollectedRecord(body);
      const record = normalizeProductRecord(body);
      saveJsonl(collectedPath, { ...collectedRecord, "本地采集时间": new Date().toISOString() });
      const result = runLark([
        "base",
        "+record-upsert",
        "--base-token",
        config.baseToken,
        "--table-id",
        config.tables["原始数据暂存"] || "原始数据暂存",
        "--json",
        JSON.stringify(record)
      ], { execute: true });
      const fanout = createFlowRecords(collectedRecord, record);

      json(res, 200, { ok: true, record, collectedRecord, fanout, backup: collectedPath, raw: rawPath, result });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/sync/screenshot") {
    try {
      const body = await readJson(req, 12 * 1024 * 1024);
      const url = saveScreenshot(body.dataUrl, body.productId);
      json(res, 200, { ok: true, url });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  json(res, 404, { ok: false, error: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`商品同步助手本地服务已启动：http://127.0.0.1:${port}`);
  console.log(`目标 Base：${config.url}`);
});

function normalizeCollectedRecord(input) {
  if (input["*产品名称"] || input["货源链接"]) {
    return {
      "*产品主编号": clean(input["*产品主编号"]),
      "*产品名称": clean(input["*产品名称"]),
      "货币类型": clean(input["货币类型"] || "CNY"),
      "产品主图": clean(input["产品主图"]),
      "轮播图": clean(input["轮播图"]),
      "货源链接": clean(input["货源链接"]),
      "货源平台": clean(input["货源平台"]),
      "货源ID": clean(input["货源ID"]),
      "详情描述": clean(input["详情描述"]),
      "详情图": clean(input["详情图"]),
      "货源类目": clean(input["货源类目"]),
      "自定义属性": clean(input["自定义属性"]),
      "产品视频": clean(input["产品视频"]),
      "产品证书": clean(input["产品证书"]),
      "尺寸图表": clean(input["尺寸图表"]),
      "网页截图": clean(input["网页截图"]),
      "SKU规格1": normalizeSkuText(input["SKU规格1"]),
      "SKU规格2": normalizeSkuText(input["SKU规格2"]),
      "平台SKU": clean(input["平台SKU"]),
      "*SKU售价": clean(input["*SKU售价"]),
      "SKU图片": clean(input["SKU图片"]),
      "SKU库存": clean(input["SKU库存"] || "100"),
      "SKU重量(KG)": clean(input["SKU重量(KG)"]),
      "SKU尺寸(CM)": clean(input["SKU尺寸(CM)"])
    };
  }

  return {
    "*产品主编号": "",
    "*产品名称": clean(input.title),
    "货币类型": "CNY",
    "产品主图": arrayText(input.carouselImages || input.mainImage),
    "货源链接": clean(input.url),
    "货源平台": clean(input.platform),
    "货源ID": "",
    "详情描述": clean(input.attributesText),
    "详情图": arrayText(input.detailImages),
    "货源类目": clean(input.categoryPath),
    "自定义属性": clean(input.attributesText),
    "产品视频": "",
    "产品证书": "",
    "尺寸图表": "",
    "网页截图": clean(input.screenshot),
    "SKU规格1": normalizeSkuText(input.skuText),
    "SKU规格2": "",
    "平台SKU": "",
    "*SKU售价": clean(input.price),
    "SKU图片": clean(input.mainImage),
    "SKU库存": "100",
    "SKU重量(KG)": "",
    "SKU尺寸(CM)": ""
  };
}

function createFlowRecords(templateRecord, rawRecord) {
  const results = {};
  const productId = templateRecord["*产品主编号"] || rawRecord["产品主编号"] || rawRecord["货源ID"];
  const title = templateRecord["*产品名称"] || rawRecord["原始标题"];
  const imagePlan = getImagePlan(templateRecord, rawRecord);
  const mainImages = imagePlan.mainImages;
  const carouselImages = imagePlan.carousel.join(",");
  const skuImages = templateRecord["SKU图片"] || rawRecord["SKU图片"];
  const detailImages = imagePlan.detail.join(",");
  const screenshot = templateRecord["网页截图"] || rawRecord["网页截图"];
  const productVideo = templateRecord["产品视频"] || rawRecord["产品视频"];
  const skuText = [templateRecord["SKU规格1"], templateRecord["SKU规格2"]].filter(Boolean).join(" / ");
  const attributes = templateRecord["自定义属性"] || rawRecord["原始属性"];
  const price = toNumber(templateRecord["*SKU售价"]);

  results["AI识图分析表"] = upsertFlowRecord("AI识图分析表", {
    "商品ID": productId,
    "原始产品标题": title,
    "主图链接": firstLink(mainImages),
    "网页截图": screenshot,
    "AI识图结果JSON": JSON.stringify({
      status: "待AI识图",
      input: {
        title,
        main_images: splitLinks(mainImages),
        carousel_images: splitLinks(carouselImages),
        sku_images: splitLinks(skuImages),
        detail_images: splitLinks(detailImages),
        product_video: productVideo || "",
        screenshot,
        sku: skuText,
        attributes
      },
      prompt: buildVisionPrompt({ title, mainImages, skuImages, detailImages, productVideo, screenshot, skuText, attributes })
    }),
    "风险判断": "需人工审核",
    "风险说明": "待 AI 根据图片、标题、属性识别后回填",
    "识图提示词版本": "P01"
  });

  results["标题处理表"] = upsertFlowRecord("标题处理表", {
    "商品ID": productId,
    "产品标题（截图标题）": title,
    "产品核心名称": "",
    "核心卖点": "",
    "已优化-中文标题": "",
    "已优化-英文标题": "",
    "标题风险词": "",
    "标题审核状态": "待审核",
    "最终中文标题": "",
    "最终英文标题": "",
    "AI处理-输出结果": buildTitlePrompt({ title, skuText, attributes }),
    "标题提示词版本": "P02/P03"
  });

  const carousel = splitLinks(carouselImages).slice(0, 3);
  results["轮播图处理表"] = upsertFlowRecord("轮播图处理表", {
    "商品ID": productId,
    "产品标题（截图标题）": title,
    "轮播图-1": carousel[0] || "",
    "轮播图-2": carousel[1] || "",
    "轮播图-3": carousel[2] || "",
    "轮播图1处理方向": "白底主图",
    "轮播图2处理方向": "真实使用场景图",
    "轮播图3处理方向": "功能卖点展示图",
    "轮播图-1（AI 根据提示词）": buildImagePrompt({ title, image: carousel[0], allImages: mainImages, skuImages, detailImages, productVideo, screenshot, skuText, attributes, direction: "白底高清主图，突出产品类目和主体外观" }),
    "轮播图-2（AI 根据提示词）": buildImagePrompt({ title, image: carousel[1], allImages: mainImages, skuImages, detailImages, productVideo, screenshot, skuText, attributes, direction: "真实使用场景图，体现产品用途和效果" }),
    "轮播图-3（AI 根据提示词）": buildImagePrompt({ title, image: carousel[2], allImages: mainImages, skuImages, detailImages, productVideo, screenshot, skuText, attributes, direction: "功能卖点展示图，展示核心结构、尺寸或使用步骤" }),
    "轮播图状态": "待生成",
    "轮播图提示词版本": "P04"
  });

  results["预览图处理表"] = upsertFlowRecord("预览图处理表", {
    "商品ID": productId,
    "产品标题（截图标题）": title,
    "主图链接": firstLink(mainImages),
    "预览图-1": firstLink(skuImages) || firstLink(mainImages),
    "预览图1风格": "白底",
    "预览图-1（AI 根据提示词）": buildPreviewPrompt({ title, mainImages, skuImages, detailImages, productVideo, screenshot, skuText, attributes, style: "SKU白底预览图，准确保留规格颜色/款式" }),
    "预览图2风格": "场景",
    "预览图-2（AI 根据提示词）": buildPreviewPrompt({ title, mainImages, skuImages, detailImages, productVideo, screenshot, skuText, attributes, style: "SKU场景预览图，体现使用效果" }),
    "预览图3风格": "使用演示",
    "预览图-3（AI 根据提示词）": buildPreviewPrompt({ title, mainImages, skuImages, detailImages, productVideo, screenshot, skuText, attributes, style: "SKU细节/尺寸/规格说明图" }),
    "预览图状态": "待生成",
    "预览图提示词版本": "P05"
  });

  results["利润配置表"] = upsertFlowRecord("利润配置表", {
    "商品ID": productId,
    "产品标题（截图标题）": title,
    "采购成本": price,
    "采购成本(元)": price,
    "国内运费(元)": 0,
    "包装成本(元)": 0,
    "预估平台成本(元)": 0,
    "目标利润率": 0.3,
    "建议售价": price ? Number((price / 7.2 * 1.8).toFixed(2)) : null,
    "建议售价(美元)": price ? Number((price / 7.2 * 1.8).toFixed(2)) : null,
    "利润状态": "待计算",
    "SKU差异化方案": buildSkuPlanPrompt({ title, skuText, attributes }),
    "利润提示词版本": "P06"
  });

  results["主表：导出模版聚合"] = upsertFlowRecord("主表：导出模版聚合", {
    "产品主编号": templateRecord["*产品主编号"],
    "产品名称": templateRecord["*产品名称"],
    "货币类型": templateRecord["货币类型"],
    "产品主图": imagePlan.mainImages,
    "货源链接": templateRecord["货源链接"],
    "货源平台": templateRecord["货源平台"],
    "货源ID": templateRecord["货源ID"],
    "详情描述": templateRecord["详情描述"],
    "详情图": imagePlan.detail.join(","),
    "货源类目": templateRecord["货源类目"],
    "自定义属性": templateRecord["自定义属性"],
    "产品视频": templateRecord["产品视频"],
    "产品证书": templateRecord["产品证书"],
    "尺寸图表": templateRecord["尺寸图表"],
    "网页截图": templateRecord["网页截图"],
    "SKU规格1": templateRecord["SKU规格1"],
    "SKU规格2": templateRecord["SKU规格2"],
    "平台SKU": templateRecord["平台SKU"],
    "SKU售价": price,
    "SKU图片": templateRecord["SKU图片"],
    "SKU库存": templateRecord["SKU库存"],
    "SKU重量(KG)": templateRecord["SKU重量(KG)"],
    "SKU尺寸(CM)": templateRecord["SKU尺寸(CM)"],
    "导出状态": "待审核"
  });

  return results;
}

function upsertFlowRecord(tableName, fields) {
  const tableId = config.tables?.[tableName];
  if (!tableId) return { skipped: true, reason: "missing_table", tableName };
  return runLark([
    "base",
    "+record-upsert",
    "--base-token",
    config.baseToken,
    "--table-id",
    tableId,
    "--json",
    JSON.stringify(stripEmptyFields(fields))
  ], { execute: true });
}

function getImagePlan(templateRecord, rawRecord) {
  const sourceMain = splitLinks(templateRecord["产品主图"] || rawRecord["产品主图"] || rawRecord["轮播图链接"]);
  const sourceCarousel = splitLinks(templateRecord["轮播图"]);
  const sourceDetail = splitLinks(templateRecord["详情图"] || rawRecord["详情图"]);
  const combined = dedupeLinks([...sourceMain, ...sourceCarousel]);

  return {
    mainImages: combined.join(","),
    mainPrimary: combined[0] || "",
    carousel: combined.slice(1, 6),
    detail: dedupeLinks(sourceDetail).slice(0, 12)
  };
}

function dedupeLinks(links) {
  const seen = new Set();
  const result = [];
  for (const link of links.map(clean).filter(Boolean)) {
    const key = link.replace(/\.(jpg|jpeg|png)_\.(webp|avif)$/i, ".$1").split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result;
}

function stripEmptyFields(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== "" && value !== undefined));
}

function buildVisionPrompt({ title, mainImages, skuImages, detailImages, productVideo, screenshot, skuText, attributes }) {
  return `你是跨境电商商品识别与图片提示词专家。只基于网页截图、主图/轮播图、SKU预览图、详情图、视频、标题、属性进行判断，不得编造。网页截图：${screenshot || "无"}。标题：${title}。主图/轮播图：${mainImages || "无"}。SKU预览图：${skuImages || "无"}。详情图：${detailImages || "无"}。产品视频：${productVideo || "无"}。SKU规格：${skuText || "无"}。属性：${attributes || "无"}。输出严格 JSON，字段包括：category_name（产品类目名称）、product_core_name（产品核心名称）、product_effect（产品用途/效果）、selling_points（3-5条）、appearance（外观/结构/材质）、sku_summary（颜色/尺寸/款式规格）、size_chart_info（能否制作尺寸图及应展示的尺寸信息）、carousel_prompts（三条轮播图生成提示词：白底主图/使用场景/卖点尺寸说明）、preview_prompts（三条SKU预览图生成提示词：白底SKU/场景SKU/规格尺寸SKU）、risk_level、risk_reason。`;
}

function buildTitlePrompt({ title, skuText, attributes }) {
  return `请基于商品事实优化 Temu 标题。原始标题：${title}。SKU：${skuText}。属性：${attributes}。要求：删除品牌/IP/禁售/强功效/医疗/侵权风险词；输出已优化中文标题、英文标题、标题风险词、最终建议标题。`;
}

function buildImagePrompt({ title, image, allImages, skuImages, detailImages, productVideo, screenshot, skuText, attributes, direction }) {
  return `商品：${title}。网页截图用于识别类目/用途/真实卖点：${screenshot || "无"}。主图全集：${allImages || "无"}。当前参考主图/轮播图：${image || "待补充"}。SKU图：${skuImages || "无"}。详情图：${detailImages || "无"}。产品视频：${productVideo || "无"}。SKU规格：${skuText || "无"}。属性：${attributes || "无"}。生成方向：${direction}。强约束：主体完全复用原商品，不改形状、颜色、结构、比例、细节；根据截图和属性提炼真实产品效果，不添加页面未出现功能；禁止品牌/IP、乱码文字、夸大功效。`;
}

function buildPreviewPrompt({ title, mainImages, skuImages, detailImages, productVideo, screenshot, skuText, attributes, style }) {
  return `商品：${title}。网页截图用于识别类目/用途/规格信息：${screenshot || "无"}。主图全集：${mainImages || "无"}。SKU预览图参考：${skuImages || "待补充"}。详情图：${detailImages || "无"}。产品视频：${productVideo || "无"}。SKU规格：${skuText || "无"}。属性：${attributes || "无"}。预览图风格：${style}。要求移动端缩略图清晰，准确保留SKU颜色/款式/尺寸差异；可生成尺寸/规格说明构图，但不得编造未出现尺寸；不改变商品结构，不添加品牌/IP。`;
}

function buildSkuPlanPrompt({ title, skuText, attributes }) {
  return `请为商品制定 Temu SKU 差异化方案。商品：${title}。现有 SKU：${skuText}。属性：${attributes}。输出颜色/尺寸/套装/配件组合建议、建议售价逻辑、低利润风险和人工审核点。`;
}

function validateProductPayload(input) {
  const title = clean(input["*产品名称"] || input.title);
  const url = clean(input["货源链接"] || input.url);
  const images = clean(input["产品主图"] || input["SKU图片"] || input.mainImage || arrayText(input.carouselImages));

  if (!title && !url && !images) {
    throw new Error("没有采集到商品标题、链接或图片，已阻止写入空白行。请刷新商品详情页后再点一次。");
  }

  if (!title) {
    throw new Error("没有采集到商品标题，已阻止写入。请确认当前页是商品详情页。");
  }

  if (!url) {
    throw new Error("没有采集到货源链接，已阻止写入。");
  }
}

function normalizeProductRecord(input) {
  if (input["*产品名称"] || input["货源链接"]) {
    return normalizeTemplateRecord(input);
  }

  return {
    "采集平台": clean(input.platform),
    "商品链接": clean(input.url),
    "原始标题": clean(input.title),
    "店铺名": clean(input.shopName),
    "类目路径": clean(input.categoryPath),
    "原价": toNumber(input.originalPrice),
    "采集价": toNumber(input.price),
    "主图链接": clean(input.mainImage),
    "轮播图链接": arrayText(input.carouselImages),
    "详情图链接": arrayText(input.detailImages),
    "规格/SKU": clean(input.skuText),
    "原始属性": clean(input.attributesText),
    "处理状态": "待处理",
    "备注": clean(input.note || `插件采集于 ${new Date().toLocaleString("zh-CN", { hour12: false })}`)
  };
}

function normalizeTemplateRecord(input) {
  const imagePlan = getImagePlan(input, {});
  const feishuMainImages = imagePlan.mainImages;
  const feishuCarouselImages = imagePlan.carousel.join(",");
  const feishuDetailImages = imagePlan.detail.join(",");

  return {
    "产品主编号": clean(input["*产品主编号"]),
    "产品名称": clean(input["*产品名称"]),
    "货源ID": clean(input["货源ID"]),
    "货币类型": clean(input["货币类型"]),
    "产品主图": feishuMainImages,
    "SKU图片": clean(input["SKU图片"]),
    "详情图": feishuDetailImages,
    "产品视频": clean(input["产品视频"]),
    "产品证书": clean(input["产品证书"]),
    "尺寸图表": clean(input["尺寸图表"]),
    "网页截图": clean(input["网页截图"]),
    "SKU库存": clean(input["SKU库存"]),
    "SKU重量(KG)": clean(input["SKU重量(KG)"]),
    "SKU尺寸(CM)": clean(input["SKU尺寸(CM)"]),
    "商品状态": "待AI识图",
    "采集诊断": clean(input._debug ? JSON.stringify(input._debug) : ""),
    "采集平台": clean(input["货源平台"]),
    "商品链接": clean(input["货源链接"]),
    "原始标题": clean(input["*产品名称"]),
    "店铺名": "",
    "类目路径": clean(input["货源类目"]),
    "原价": toNumber(input["*SKU售价"]),
    "采集价": toNumber(input["*SKU售价"]),
    "主图链接": firstLink(feishuMainImages),
    "网页截图": clean(input["网页截图"]),
    "轮播图链接": feishuCarouselImages,
    "详情图链接": feishuDetailImages,
    "规格/SKU": [normalizeSkuText(input["SKU规格1"]), normalizeSkuText(input["SKU规格2"])].filter(Boolean).join(" / "),
    "原始属性": clean(input["自定义属性"] || input["详情描述"]),
    "处理状态": "待AI识图",
    "备注": clean(`模板字段采集；产品主编号=${input["*产品主编号"] || ""}；平台SKU=${input["平台SKU"] || ""}`)
  };
}

function splitLinks(value) {
  return clean(value).split(/[，,]/).map((item) => item.trim()).filter(Boolean);
}

function firstLink(value) {
  return splitLinks(value)[0] || "";
}

function normalizeSkuText(value) {
  const parts = clean(value)
    .split(/\s*[|｜;；\n/]\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(isValidSkuPart);
  return [...new Set(parts)].slice(0, 10).join(" | ");
}

function isValidSkuPart(value) {
  if (!value || value.length > 180) return false;
  if (/复制sku|购买数量|采购量|库存|价格|起批|物流|运费|加入进货单|立即订购|去下单|配送|服务|保障|退货|客服/i.test(value)) return false;
  if (/^[>\d\s:;,\-_.]+$/.test(value)) return false;
  if (/^[￥¥$]?\d+(\.\d+)?$/.test(value)) return false;
  return /[\u4e00-\u9fa5A-Za-z]/.test(value);
}

async function proxyImage(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    const imageUrl = requestUrl.searchParams.get("url");
    if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
      json(res, 400, { ok: false, error: "missing image url" });
      return;
    }

    const upstream = await fetch(imageUrl, {
      headers: {
        "Referer": "https://detail.1688.com/",
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!upstream.ok) {
      json(res, upstream.status, { ok: false, error: `image fetch failed: ${upstream.status}` });
      return;
    }

    res.writeHead(200, {
      "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400"
    });
    const arrayBuffer = await upstream.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}

async function serveScreenshot(req, res) {
  try {
    const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    const fileName = path.basename(decodeURIComponent(requestUrl.pathname));
    if (!/^[\w.-]+\.png$/.test(fileName)) {
      json(res, 400, { ok: false, error: "invalid screenshot path" });
      return;
    }
    const filePath = path.join(screenshotDir, fileName);
    if (!fs.existsSync(filePath)) {
      json(res, 404, { ok: false, error: "screenshot not found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400"
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}

function saveScreenshot(value, productId) {
  const dataUrl = clean(value);
  if (!dataUrl) return "";
  if (/^https?:\/\//.test(dataUrl)) return dataUrl;
  const matched = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!matched) return dataUrl;

  fs.mkdirSync(screenshotDir, { recursive: true });
  const safeId = clean(productId || "product").replace(/[^\w.-]+/g, "_").slice(0, 80) || "product";
  const fileName = `${safeId}-${Date.now()}.png`;
  fs.writeFileSync(path.join(screenshotDir, fileName), Buffer.from(matched[1], "base64"));
  return `http://127.0.0.1:${port}/screenshots/${encodeURIComponent(fileName)}`;
}

function saveJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function arrayText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(",");
  return clean(value);
}

function toNumber(value) {
  const matched = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return matched ? Number(matched[0]) : null;
}

function readJson(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let rejected = false;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      if (rejected) return;
      raw += chunk;
      if (raw.length > maxBytes) {
        rejected = true;
        reject(new Error("请求体过大"));
      }
    });
    req.on("end", () => {
      if (rejected) return;
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}
