#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cwd = process.cwd();
const config = JSON.parse(fs.readFileSync(path.resolve(cwd, ".feishu-base.json"), "utf8"));
const baseToken = config.baseToken;

const selectOptions = {
  "采集平台": ["1688", "拼多多", "淘宝", "天猫", "Temu", "SHEIN", "Amazon", "其他"],
  "处理状态": ["待AI识图", "AI处理中", "待人工审核", "可导出", "已导出", "异常"],
  "商品状态": ["待AI识图", "AI处理中", "待审核", "可导出", "已导出", "异常"],
  "AI判断类目": ["饰品类", "服装类", "家居类", "工具类", "数码配件", "其他"],
  "风险判断": ["正常", "疑似侵权", "疑似禁售", "需人工审核"],
  "标题审核状态": ["待审核", "通过", "需修改", "停用"],
  "轮播图状态": ["待生成", "待审核", "已通过", "需重做"],
  "预览图状态": ["待生成", "待审核", "已通过", "需重做"],
  "利润状态": ["待计算", "可销售", "低利润", "不可售"],
  "导出状态": ["待聚合", "待审核", "可导出", "已导出", "异常"],
  "状态": ["启用", "停用"]
};

const flowTables = {
  "原始数据暂存": [
    text("产品主编号"),
    text("产品名称"),
    text("货源ID"),
    text("货币类型"),
    text("产品主图"),
    text("SKU图片"),
    text("详情图"),
    text("产品视频"),
    text("产品证书"),
    text("尺寸图表"),
    text("网页截图", "url"),
    text("SKU库存"),
    text("SKU重量(KG)"),
    text("SKU尺寸(CM)"),
    text("采集诊断"),
    text("AI处理批次"),
    select("商品状态")
  ],
  "AI识图分析表": [
    text("商品ID"),
    text("原始产品标题"),
    text("主图链接"),
    text("网页截图", "url"),
    text("AI识图结果JSON"),
    text("产品核心名称"),
    text("主要功能/用途"),
    text("核心卖点"),
    text("外观特征"),
    text("主图颜色"),
    text("使用场景"),
    text("使用方式"),
    select("AI判断类目"),
    select("风险判断"),
    text("风险说明"),
    text("识图提示词版本")
  ],
  "标题处理表": [
    text("商品ID"),
    text("产品核心名称"),
    text("核心卖点"),
    text("已优化-中文标题"),
    text("标题风险词"),
    select("标题审核状态"),
    text("最终中文标题"),
    text("最终英文标题"),
    text("标题提示词版本")
  ],
  "轮播图处理表": [
    text("商品ID"),
    text("轮播图1处理方向"),
    text("轮播图2处理方向"),
    text("轮播图3处理方向"),
    text("AI生成轮播图1"),
    text("AI生成轮播图2"),
    text("AI生成轮播图3"),
    text("轮播图提示词版本")
  ],
  "预览图处理表": [
    text("商品ID"),
    text("主图链接"),
    text("预览图1风格"),
    text("预览图2风格"),
    text("预览图3风格"),
    text("最终选中预览图"),
    text("预览图提示词版本")
  ],
  "利润配置表": [
    text("商品ID"),
    number("采购成本(元)"),
    number("国内运费(元)"),
    number("包装成本(元)"),
    number("预估平台成本(元)"),
    number("总成本(元)"),
    number("目标利润率"),
    number("建议售价(美元)"),
    number("预估利润率"),
    number("最低可售价格(美元)"),
    text("SKU差异化方案"),
    text("利润提示词版本")
  ],
  "主表：导出模版聚合": [
    text("产品主编号"),
    text("产品名称"),
    text("货币类型"),
    text("产品主图"),
    text("货源链接"),
    text("货源平台"),
    text("货源ID"),
    text("详情描述"),
    text("详情图"),
    text("货源类目"),
    text("自定义属性"),
    text("产品视频"),
    text("产品证书"),
    text("尺寸图表"),
    text("网页截图", "url"),
    text("SKU规格1"),
    text("SKU规格2"),
    text("平台SKU"),
    number("SKU售价"),
    text("SKU图片"),
    text("SKU库存"),
    text("SKU重量(KG)"),
    text("SKU尺寸(CM)"),
    select("导出状态")
  ],
  "AI提示词库": [
    text("提示词编号"),
    text("使用阶段"),
    text("适用表"),
    text("提示词名称"),
    text("专业提示词"),
    text("输出格式"),
    select("状态")
  ]
};

const promptRows = [
  ["P01", "AI识图", "AI识图分析表", "商品事实识别与风险判断", professionalVisionPrompt(), "严格输出 JSON：core_name, function, selling_points, appearance, main_color, scene, usage, category, risk_level, risk_reason", "启用"],
  ["P02", "标题处理", "标题处理表", "Temu 中文标题优化", professionalChineseTitlePrompt(), "输出：中文标题、标题结构拆解、删除风险词、保留关键词", "启用"],
  ["P03", "标题处理", "标题处理表", "Temu 英文标题生成", professionalEnglishTitlePrompt(), "输出：English Title、keyword bank、risk terms removed", "启用"],
  ["P04", "轮播图处理", "轮播图处理表", "轮播图差异化生图提示词", professionalCarouselPrompt(), "每张图输出：定位、构图、场景、光线、负面约束、生图提示词", "启用"],
  ["P05", "预览图处理", "预览图处理表", "预览图场景化提示词", professionalPreviewPrompt(), "输出 3 套预览图提示词，分别覆盖白底、场景、功能/细节", "启用"],
  ["P06", "利润配置", "利润配置表", "利润与 SKU 裂变方案", professionalProfitPrompt(), "输出：成本拆解、建议售价、最低价、利润风险、SKU差异化方案", "启用"]
];

main();

function main() {
  const tables = getTables();
  const tableIds = { ...config.tables };

  for (const [tableName, fields] of Object.entries(flowTables)) {
    let tableId = tables.get(tableName);
    if (!tableId) {
      const created = runLark(["base", "+table-create", "--base-token", baseToken, "--name", tableName]);
      tableId = created?.data?.table?.id || created?.table?.id;
      tableIds[tableName] = tableId;
      console.log(`created table: ${tableName} ${tableId}`);
    }
    ensureFields(tableName, tableId, fields);
  }

  config.tables = { ...config.tables, ...tableIds };
  config.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.resolve(cwd, ".feishu-base.json"), `${JSON.stringify(config, null, 2)}\n`);

  if (tableIds["AI提示词库"]) seedPrompts(tableIds["AI提示词库"]);
  console.log(`Base ready: ${config.url}`);
}

function getTables() {
  const result = runLark(["base", "+table-list", "--base-token", baseToken, "--limit", "100"]);
  const tables = result?.data?.tables || [];
  return new Map(tables.map((table) => [table.name, table.id]));
}

function ensureFields(tableName, tableId, fields) {
  const existing = getFields(tableId);
  for (const field of fields) {
    if (existing.has(field.name)) continue;
    runLark(["base", "+field-create", "--base-token", baseToken, "--table-id", tableId, "--json", JSON.stringify(field)]);
    console.log(`created field: ${tableName}.${field.name}`);
  }
}

function getFields(tableId) {
  const result = runLark(["base", "+field-list", "--base-token", baseToken, "--table-id", tableId, "--limit", "200"]);
  const fields = result?.data?.fields || [];
  return new Set(fields.map((field) => field.name));
}

function seedPrompts(tableId) {
  const payload = {
    fields: ["提示词编号", "使用阶段", "适用表", "提示词名称", "专业提示词", "输出格式", "状态"],
    rows: promptRows
  };
  runLark(["base", "+record-batch-create", "--base-token", baseToken, "--table-id", tableId, "--json", JSON.stringify(payload)]);
  console.log("seeded professional prompt rows");
}

function runLark(args) {
  const result = spawnSync("lark-cli", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(`${["lark-cli", ...args].join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
  const output = result.stdout.trim();
  try {
    return JSON.parse(output);
  } catch {
    return { stdout: output };
  }
}

function text(name) {
  return { name, type: "text" };
}

function number(name) {
  return { name, type: "number", style: { type: "plain", precision: 2, percentage: false, thousands_separator: false } };
}

function select(name) {
  return {
    name,
    type: "select",
    multiple: false,
    options: (selectOptions[name] || ["待处理", "已完成"]).map((option, index) => ({
      name: option,
      hue: ["Blue", "Green", "Orange", "Red", "Purple", "Turquoise", "Gray"][index % 7],
      lightness: "Light"
    }))
  };
}

function professionalVisionPrompt() {
  return `你是 Temu 跨境上架的商品事实识别专家。只基于原始标题、主图、轮播图、详情图、SKU信息、属性信息进行判断，不允许编造页面未出现的信息。任务：1. 识别产品核心名称，避免品牌词、IP词、功效夸大词；2. 提取主要功能/用途、核心卖点、材质/结构/外观特征；3. 判断唯一主色；4. 给出真实使用场景和使用方式；5. 在饰品类、服装类、家居类、工具类、数码配件、其他中选择一个类目；6. 检查侵权、禁售、医疗功效、儿童安全、强功效、3D打印版权模型等风险。`;
}

function professionalChineseTitlePrompt() {
  return `你是 Temu 中文标题优化专家。基于 AI识图事实生成中文标题，要求：保留核心品类词、材质词、功能词、场景词、规格词；删除品牌、IP、绝对化、医疗/强功效、侵权和禁售风险词；标题适合批量上架和后续英文翻译；不超过 80 个中文字符；不用标点堆砌；不能编造未识别的功能。`;
}

function professionalEnglishTitlePrompt() {
  return `You are a Temu listing title specialist. Generate a compliant English product title from verified product facts only. Keep product type, material, function, use case, color/size if verified. Remove brand names, IP terms, medical claims, exaggerated words, prohibited and unsafe claims. Use natural marketplace English, 120 characters max, no keyword stuffing, no unsupported claims.`;
}

function professionalCarouselPrompt() {
  return `你是 Temu 商品轮播图策划师。基于原始商品图和识图事实，为每张轮播图生成可执行的 AI 生图提示词。强约束：商品主体必须完全复用原图，不改形状、结构、颜色、比例、细节；只改变背景、场景、光线、构图、道具；场景真实可落地；禁止漂浮、畸形、AI感、文字乱码。轮播结构：图1白底高清主图，图2真实使用场景，图3功能卖点展示，图4细节/材质质感，图5尺寸/SKU展示。`;
}

function professionalPreviewPrompt() {
  return `你是 Temu 列表预览图转化设计师。为同一商品输出 3 个预览图方向：1. 白底高质感主图；2. 真实生活/使用场景图；3. 功能或细节卖点图。要求主体复用原图，不改变商品；构图突出主体，背景干净，适合移动端缩略图；不加不可读文字，不加品牌或侵权元素。`;
}

function professionalProfitPrompt() {
  return `你是 Temu 成本利润与 SKU 裂变策略专家。根据采购成本、国内运费、包装成本、平台成本、目标利润率，计算建议售价、最低可售价格、利润风险，并给出 SKU 差异化方案。SKU 方案优先考虑颜色、尺寸、套装数量、配件组合、场景组合；不能改变商品真实属性；低利润或高风险商品要标记需人工审核。`;
}
