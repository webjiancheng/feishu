import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";
import { makeProductCode } from "./template-fields.mjs";

export function readTemplateHeaders(templatePath) {
  if (!fs.existsSync(templatePath)) return [];
  const workbook = xlsx.readFile(templatePath, { cellDates: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
  return (rows[0] || []).map((value) => String(value).trim()).filter(Boolean);
}

export function exportRowsToTemplate({ templatePath, rows, outputPath }) {
  const headers = readTemplateHeaders(templatePath);
  const normalizedRows = rows.map((row, index) => normalizeTemplateRow(row, index));
  const workbook = xlsx.utils.book_new();

  const sheetName = "Sheet1";
  const data = [headers.length ? headers : Object.keys(normalizedRows[0] || {}), ...normalizedRows.map((row) => {
    const activeHeaders = headers.length ? headers : Object.keys(row);
    return activeHeaders.map((header) => row[header] ?? "");
  })];

  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(data), sheetName);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  xlsx.writeFile(workbook, outputPath);
  return { outputPath, rowCount: normalizedRows.length, headers: data[0] };
}

function normalizeTemplateRow(row, index = 0) {
  const productCode = row["*产品主编号"] ?? row["商品编码"] ?? row["平台SKU"] ?? makeProductCode(row, index);
  const title = row["*产品名称"] ?? row["中文标题"] ?? row["英文标题"] ?? row["原始标题"] ?? "";
  const sourceUrl = row["货源链接"] ?? row["商品链接"] ?? "";
  const mainImage = row["产品主图"] ?? row["主图"] ?? row["主图链接"] ?? "";
  const sourcePlatform = row["货源平台"] ?? row["平台来源"] ?? row["采集平台"] ?? "";
  const skuText = row["SKU规格1"] ?? row["SKU"] ?? row["规格/SKU"] ?? "";
  const price = row["*SKU售价"] ?? row["建议售价"] ?? row["采集价"] ?? row["原价"] ?? "";

  return {
    ...row,
    "*产品主编号": productCode,
    "*产品名称": title,
    "货币类型": row["货币类型"] ?? row["币种"] ?? "USD",
    "产品主图": mainImage,
    "货源链接": sourceUrl,
    "货源平台": sourcePlatform,
    "货源ID": row["货源ID"] ?? productCode,
    "详情描述": row["详情描述"] ?? row["导出备注"] ?? row["AI处理-输出结果"] ?? row["原始属性"] ?? "",
    "详情图": row["详情图"] ?? row["预览图"] ?? row["详情图链接"] ?? "",
    "货源类目": row["货源类目"] ?? row["商品类目"] ?? row["类目路径"] ?? "",
    "自定义属性": row["自定义属性"] ?? row["原始属性"] ?? row["关键词"] ?? "",
    "SKU规格1": skuText,
    "SKU规格2": row["SKU规格2"] ?? "",
    "平台SKU": row["平台SKU"] ?? productCode,
    "*SKU售价": price,
    "SKU图片": row["SKU图片"] ?? mainImage,
    "SKU库存": row["SKU库存"] ?? row["库存"] ?? 999,
    "SKU重量(KG)": row["SKU重量(KG)"] ?? row["重量(KG)"] ?? "",
    "SKU尺寸(CM)": row["SKU尺寸(CM)"] ?? row["尺寸(CM)"] ?? ""
  };
}
