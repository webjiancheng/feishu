export const platformPrompts = {
  "1688": {
    title: "1688 源头货盘采集提示词",
    prompt: `你是跨境电商选品采集助手。请围绕关键词「{{keyword}}」在 1688 查找可用于 Temu 裂变上架的源头商品。
筛选要求：
1. 优先工厂、实力商家、牛头标、复购高、近 30 天成交稳定的商品。
2. 避开品牌侵权、明显 IP 图案、药品医疗、危险品、强功效宣称、3D 打印版权模型。
3. 记录商品标题、链接、价格区间、起批量、SKU 规格、主图、轮播图、详情图、店铺名、类目路径。
4. 输出适合差异化的角度：使用场景、材质/结构卖点、可裂变 SKU、可改图方向。
只输出真实页面能看到的信息，不要补编。`
  },
  "拼多多": {
    title: "拼多多 爆款价格带采集提示词",
    prompt: `你是低价爆款采集助手。请围绕关键词「{{keyword}}」在拼多多查找适合 Temu 跟卖和差异化上架的商品。
筛选要求：
1. 优先销量高、评价多、价格低、图片清晰、SKU 丰富的商品。
2. 对比 3-5 个同款，提取最低可参考价格、常见 SKU、主要卖点和买家关注点。
3. 避开侵权品牌、卡通 IP、医疗功效、危险品、平台禁售品。
4. 记录商品标题、链接、价格、SKU、主图/轮播图/详情图、评论高频词。
输出时标记「可直接采集」「需改图」「不建议」三类判断。`
  },
  "淘宝": {
    title: "淘宝/天猫 风格款与场景图采集提示词",
    prompt: `你是商品视觉和标题优化采集助手。请围绕关键词「{{keyword}}」在淘宝/天猫查找图片质量高、场景表达清楚的商品。
筛选要求：
1. 优先找真实场景图、细节图、使用图完整的商品，用于参考 AI 出图方向。
2. 提取标题结构、材质词、场景词、功能词、人群词、规格词。
3. 不采集明显品牌、明星同款、IP 图案、强功效和敏感品类。
4. 记录商品标题、链接、价格、店铺、类目、图片类型和可借鉴视觉方向。
输出适合生成 Temu 中文标题和英文标题的关键词。`
  },
  "抖音电商": {
    title: "抖音电商 内容卖点采集提示词",
    prompt: `你是短视频电商卖点拆解助手。请围绕关键词「{{keyword}}」在抖音电商查找近期热卖商品。
重点提取：
1. 视频/直播里反复强调的痛点、功能、使用前后对比、场景。
2. 用户评论中的疑问、顾虑、好评点和差评点。
3. 可转化成 Temu 图文详情的卖点表达。
4. 避开夸大效果、医疗功效、虚假对比和违规承诺。
输出：核心卖点、适用人群、使用场景、图文改写方向。`
  },
  "小红书": {
    title: "小红书 生活场景和人群词采集提示词",
    prompt: `你是生活方式场景采集助手。请围绕关键词「{{keyword}}」在小红书查找真实使用场景和人群表达。
提取要求：
1. 场景：居家、办公、户外、收纳、穿搭、送礼等真实语境。
2. 人群：学生、宝妈、租房、宠物家庭、通勤、手作爱好者等。
3. 图片风格：极简白底、真实生活场景、高级静物、功能演示、人体互动。
4. 不采集品牌/IP/明星/医疗功效相关方向。
输出可直接用于 AI 出图的场景词和构图建议。`
  },
  "Amazon": {
    title: "Amazon 英文标题和五点卖点参考提示词",
    prompt: `Act as a cross-border ecommerce research assistant. Search Amazon for products related to "{{keyword}}" and extract reusable listing insights.
Requirements:
1. Capture generic product names, use cases, materials, colors, size/spec attributes, and common customer concerns.
2. Do not copy brand names, patented designs, trademarked terms, or exaggerated claims.
3. Summarize title patterns and bullet point angles in neutral, original wording.
4. Mark risky terms that should not appear in a Temu listing.
Output: English keyword bank, safe title structure, selling points, image-scene ideas.`
  },
  "Temu": {
    title: "Temu 同平台标题和差异化提示词",
    prompt: `你是 Temu 上架合规和差异化助手。请围绕关键词「{{keyword}}」分析 Temu 同类商品。
提取要求：
1. 常见标题结构、类目词、功能词、材质词、场景词。
2. 价格带、SKU 组合、主图风格、详情页表达方式。
3. 找到可差异化方向：场景不同、组合不同、颜色/尺寸不同、图片风格不同。
4. 过滤禁售品、敏感品类、侵权品牌、3D 打印词、强功效词。
输出：安全中文标题、英文标题关键词、图片差异化建议。`
  }
};

export const imagePrompt = `你是 Temu 商品图 AI 处理专家。请基于商品识别结果 + 图片内容提取以下信息，必须真实，不可臆测：
产品核心名称、主要功能/用途、核心卖点（结构、特点、优势）、外观特征、主图颜色（仅一个）、使用场景、安装/使用方式。

步骤1：自动判断商品类目，只能选一个：
饰品类、服装类、家居类、工具类、数码配件、其他。

步骤2：根据类目匹配场景策略：
饰品类 => 人体佩戴/手部/脖子/耳朵特写
服装类 => 真人穿搭/半身/全身/日常环境
工具类 => 实际使用场景/操作过程/功能展示
家居类 => 桌面/手持/场景搭配/氛围摆拍
数码配件 => 设备搭配/使用中/办公桌面
其他 => 自动判断使用场景

强约束：
商品主体必须 100% 复用原图，不可重绘、不可修改。
严禁改变形状、比例、颜色、结构、细节。
商品必须为视觉中心。
只允许变化：场景、背景、光线、构图、氛围。
新图必须与原图明显不同，至少 2 个维度变化。
场景必须真实可落地，禁止 AI 感、漂浮、不合理结构、违背物理。

输出格式：
1 产品信息
产品名称：
核心功能：
核心卖点：
颜色：
使用场景：
使用方式：

2 标题
中文标题：
英文标题：

3 最终出图提示词
【主体】
使用原图商品(image reference)，主体完全一致，不做任何修改，位置稳定，比例真实，细节完整。
【场景】
基于产品用途生成真实使用环境。
【构图】
突出商品主体和使用价值，电商转化优先。
【光线】
真实自然光或柔和摄影棚光。
【风格】
从极简电商白底、真实生活场景、功能使用演示、高级质感静物、桌面/墙面搭配、人体互动中选择最合理的一种。`;

export function renderPrompt(platform, keyword = "待填写关键词") {
  if (platform === "all") {
    return Object.entries(platformPrompts)
      .map(([key, item]) => `## ${key} - ${item.title}\n\n${fill(item.prompt, keyword)}`)
      .join("\n\n---\n\n");
  }

  if (platform === "image") return imagePrompt;

  const item = platformPrompts[platform];
  if (!item) {
    throw new Error(`未知平台：${platform}。可选：${Object.keys(platformPrompts).join(", ")}, all, image`);
  }
  return `## ${platform} - ${item.title}\n\n${fill(item.prompt, keyword)}`;
}

function fill(text, keyword) {
  return text.replaceAll("{{keyword}}", keyword);
}
