export const templateFields = [
  { name: "*产品主编号", multiline: false },
  { name: "*产品名称", multiline: true },
  { name: "货币类型", multiline: false, defaultValue: "CNY" },
  { name: "产品主图", multiline: true },
  { name: "货源链接", multiline: false },
  { name: "货源平台", multiline: false },
  { name: "货源ID", multiline: false },
  { name: "详情描述", multiline: true },
  { name: "详情图", multiline: true },
  { name: "货源类目", multiline: false },
  { name: "自定义属性", multiline: true },
  { name: "产品视频", multiline: false },
  { name: "产品证书", multiline: false },
  { name: "尺寸图表", multiline: false },
  { name: "SKU规格1", multiline: false },
  { name: "SKU规格2", multiline: false },
  { name: "平台SKU", multiline: false },
  { name: "*SKU售价", multiline: false },
  { name: "SKU图片", multiline: true },
  { name: "SKU库存", multiline: false, defaultValue: "100" },
  { name: "SKU重量(KG)", multiline: false },
  { name: "SKU尺寸(CM)", multiline: false }
];

export function makeProductCode(source, index = 0) {
  let hash = 0;
  for (const char of String(source || `ROW-${index + 1}`)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `P${String(index + 1).padStart(4, "0")}-${hash.toString(36).toUpperCase()}`;
}
