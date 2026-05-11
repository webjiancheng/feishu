export const tableSchemas = [
  {
    name: "原始数据暂存",
    description: "商品同步助手或人工采集后的原始商品池。",
    fields: [
      text("采集平台"),
      text("商品链接", "url"),
      text("原始标题"),
      text("店铺名"),
      text("类目路径"),
      number("原价"),
      number("采集价"),
      text("主图链接", "url"),
      text("轮播图链接"),
      text("详情图链接"),
      text("规格/SKU"),
      text("原始属性"),
      select("处理状态", ["待处理", "AI处理中", "待人工审核", "可导出", "已导出", "驳回"]),
      text("备注")
    ]
  },
  {
    name: "标题处理表",
    description: "AI 识图、中文标题优化、英文标题生成和敏感词过滤。",
    fields: [
      text("产品标题（截图标题）"),
      text("已优化-产品标题"),
      text("已优化-英文标题"),
      text("AI识图"),
      text("AI处理-输出结果"),
      text("预览图", "url"),
      select("商品类目", ["饰品类", "服装类", "家居类", "工具类", "数码配件", "其他"]),
      select("标题状态", ["待生成", "待审核", "已通过", "需重写"])
    ]
  },
  {
    name: "轮播图处理表",
    description: "为 Temu 轮播图生成差异化出图提示词。",
    fields: [
      text("产品标题（截图标题）"),
      text("轮播图-1", "url"),
      text("轮播图-1（AI 根据提示词）"),
      text("轮播图-2", "url"),
      text("轮播图-2（AI 根据提示词）"),
      text("轮播图-3", "url"),
      text("轮播图-3（AI 根据提示词）"),
      select("轮播图状态", ["待生成", "待审核", "已通过", "需重做"])
    ]
  },
  {
    name: "预览图处理表",
    description: "为详情页预览图生成真实场景、功能展示或质感静物提示词。",
    fields: [
      text("产品标题（截图标题）"),
      text("预览图-1", "url"),
      text("预览图-1（AI 根据提示词）"),
      text("预览图-2", "url"),
      text("预览图-2（AI 根据提示词）"),
      text("预览图-3", "url"),
      text("预览图-3（AI 根据提示词）"),
      select("预览图状态", ["待生成", "待审核", "已通过", "需重做"])
    ]
  },
  {
    name: "利润配置表",
    description: "成本、运费、平台费率、目标利润和最终售价配置。",
    fields: [
      text("产品标题（截图标题）"),
      number("采购成本"),
      number("国内运费"),
      number("包装成本"),
      number("平台佣金率"),
      number("广告预留率"),
      number("目标利润率"),
      number("建议售价"),
      number("最低售价"),
      select("利润状态", ["待计算", "可销售", "低利润", "不可售"])
    ]
  },
  {
    name: "主表：导出模版聚合",
    description: "聚合 AI 处理和利润配置字段，作为导出 Temu Excel 模板的数据源。",
    fields: [
      text("商品编码"),
      text("平台来源"),
      text("商品链接", "url"),
      text("中文标题"),
      text("英文标题"),
      select("商品类目", ["饰品类", "服装类", "家居类", "工具类", "数码配件", "其他"]),
      text("主图", "url"),
      text("轮播图"),
      text("预览图"),
      text("SKU"),
      number("采购成本"),
      number("建议售价"),
      text("关键词"),
      text("导出备注"),
      select("导出状态", ["待聚合", "待审核", "可导出", "已导出"])
    ]
  }
];

function text(name, styleType = "plain") {
  const field = { name, type: "text" };
  if (styleType !== "plain") field.style = { type: styleType };
  return field;
}

function number(name) {
  return {
    name,
    type: "number",
    style: { type: "plain", precision: 2, percentage: false, thousands_separator: false }
  };
}

function select(name, options) {
  return {
    name,
    type: "select",
    multiple: false,
    options: options.map((option, index) => ({
      name: option,
      hue: ["Blue", "Green", "Orange", "Red", "Purple", "Turquoise"][index % 6],
      lightness: "Light"
    }))
  };
}
