# Temu 飞书上架流程程序

这个目录实现了 `上架流程.md` 里的流程：采集商品信息进入飞书多维表格，经过标题、轮播图、预览图、利润配置四张 AI 处理表，最后聚合到主表并导出 `导入产品模板.xls`。

## 当前程序能做什么

- 生成飞书 Base 建表方案：`原始数据暂存`、`标题处理表`、`轮播图处理表`、`预览图处理表`、`利润配置表`、`主表：导出模版聚合`
- 调用 `lark-cli base +base-create`、`+table-create`、`+record-upsert`
- 内置 1688、拼多多、淘宝/天猫、抖音电商、小红书、Amazon、Temu 的采集提示词
- 内置商品识图、标题优化、图片差异化出图提示词
- 基于 `导入产品模板.xls` 导出本地 Excel

## 安装依赖

```bash
npm install
```

## 查看表结构

```bash
npm run schema
```

## 生成各平台采集提示词

```bash
node src/cli.mjs prompts --platform all --keyword "桌面收纳盒"
node src/cli.mjs prompts --platform 1688 --keyword "厨房切菜器"
node src/cli.mjs prompts --platform image
```

## 预览飞书建表命令

默认是 dry-run，只输出将要执行的命令，不会写飞书：

```bash
node src/cli.mjs create-base --name "Temu 高效采集到上架流程"
```

真正执行前，需要先完成飞书授权：

```bash
lark-cli config init --new
lark-cli auth login --recommend
```

确认后再执行：

```bash
node src/cli.mjs create-base --name "Temu 高效采集到上架流程" --execute
```

如果你已经有 Base，只想在现有 Base 里建表：

```bash
node src/cli.mjs create-base --base-token app_xxx --execute
```

## 导入采集商品

先参考 [examples/products.sample.json](examples/products.sample.json) 准备 JSON 数组，然后 dry-run：

```bash
node src/cli.mjs import-products --base-token app_xxx --file examples/products.sample.json
```

确认后写入：

```bash
node src/cli.mjs import-products --base-token app_xxx --file examples/products.sample.json --execute
```

## 导出 Temu 模板

```bash
node src/cli.mjs export-template --input examples/export-rows.sample.json
```

输出文件默认放在 `exports/`。

导出时会自动把主表字段映射到模板表头，例如 `商品编码 -> *产品主编号`、`中文标题 -> *产品名称`、`主图 -> 产品主图`、`商品链接 -> 货源链接`、`建议售价 -> *SKU售价`。

## 依赖安全说明

本程序使用 `xlsx` 读取本地 `.xls` 模板。npm audit 会提示该包存在上游已知高危告警且暂无 npm 侧可用修复版本。当前用途限定为读取你本机可信模板文件，不要用它处理陌生人上传的 Excel。

## Chrome 商品同步助手

已提供 Chrome 插件目录：[chrome-extension](chrome-extension)。

先启动本地同步服务：

```bash
npm run sync-server
```

再到 Chrome 打开 `chrome://extensions/`，开启开发者模式，加载 `chrome-extension` 文件夹。打开 1688、淘宝、天猫、拼多多、Temu、SHEIN 商品详情页后，点击插件里的「采集并同步到飞书」。

插件弹窗字段已与 `导入产品模板.xls` 表头保持一致，包括 `*产品主编号`、`*产品名称`、`产品主图`、`*SKU售价`、`SKU库存` 等。插件同步时会做两件事：

1. 写入飞书 `原始数据暂存` 表
2. 保存本地备份到 `data/collected-products.jsonl`

要把插件采集的数据按 `导入产品模板.xls` 的表头导出：

```bash
npm run export-collected
```

输出文件会放到 `exports/`，文件名类似 `导入产品模板-插件采集-202605091230.xls`。
