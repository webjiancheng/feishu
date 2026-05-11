#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { tableSchemas } from "./schema.mjs";
import { renderPrompt } from "./prompts.mjs";
import { runLark } from "./lark.mjs";
import { exportRowsToTemplate, readTemplateHeaders } from "./template.mjs";

const cwd = process.cwd();
const args = process.argv.slice(2);
const command = args[0] || "help";

try {
  if (command === "schema") schemaCommand();
  else if (command === "prompts") promptsCommand();
  else if (command === "create-base") createBaseCommand();
  else if (command === "import-products") importProductsCommand();
  else if (command === "export-template") exportTemplateCommand();
  else if (command === "export-collected") exportCollectedCommand();
  else helpCommand();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function schemaCommand() {
  const templatePath = option("--template", "导入产品模板.xls");
  const headers = readTemplateHeaders(path.resolve(cwd, templatePath));
  console.log(JSON.stringify({ tables: tableSchemas, templateHeaders: headers }, null, 2));
}

function promptsCommand() {
  const platform = option("--platform", "all");
  const keyword = option("--keyword", "待填写关键词");
  console.log(renderPrompt(platform, keyword));
}

function createBaseCommand() {
  const execute = flag("--execute");
  const name = option("--name", "Temu 高效采集到上架流程");
  const baseToken = option("--base-token", "");
  const commands = [];
  let activeBaseToken = baseToken;

  if (!baseToken) {
    const createdBase = runLark(["base", "+base-create", "--name", name, "--time-zone", "Asia/Shanghai"], { execute });
    commands.push(createdBase);
    activeBaseToken = execute ? extractBaseToken(createdBase) : "<base_token_from_created_base>";
  }

  if (!activeBaseToken) {
    throw new Error("已创建 Base，但没有从 lark-cli 输出中识别到 base token。请把返回结果保存下来后用 --base-token 重新执行建表。");
  }

  const existingTableNames = execute ? listExistingTableNames(activeBaseToken) : new Set();
  for (const table of tableSchemas) {
    if (existingTableNames.has(table.name)) {
      commands.push({ skipped: true, reason: "table_exists", table: table.name });
      continue;
    }

    commands.push(runLark([
      "base",
      "+table-create",
      "--base-token",
      activeBaseToken,
      "--name",
      table.name,
      "--fields",
      JSON.stringify(table.fields),
      "--view",
      JSON.stringify([{ name: "默认表格", type: "grid" }])
    ], { execute }));
  }

  if (execute) {
    fs.writeFileSync(path.resolve(cwd, ".feishu-base.json"), JSON.stringify({ name, createdAt: new Date().toISOString(), results: commands }, null, 2));
  }

  console.log(JSON.stringify({ execute, commands }, null, 2));
}

function extractBaseToken(result) {
  return result?.base?.app_token
    || result?.base?.token
    || result?.base?.base_token
    || result?.app_token
    || result?.base_token
    || result?.token
    || "";
}

function listExistingTableNames(baseToken) {
  const result = runLark(["base", "+table-list", "--base-token", baseToken, "--limit", "100"], { execute: true });
  const tables = result?.data?.tables || result?.tables || result?.items || [];
  return new Set(tables.map((table) => table.name || table.table_name).filter(Boolean));
}

function importProductsCommand() {
  const execute = flag("--execute");
  const baseToken = required("--base-token");
  const tableId = option("--table-id", "原始数据暂存");
  const file = required("--file");
  const rows = JSON.parse(fs.readFileSync(path.resolve(cwd, file), "utf8"));
  if (!Array.isArray(rows)) throw new Error("导入文件必须是 JSON 数组。");

  const commands = rows.map((row) => runLark([
    "base",
    "+record-upsert",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--json",
    JSON.stringify(row)
  ], { execute }));

  console.log(JSON.stringify({ execute, rowCount: rows.length, commands }, null, 2));
}

function exportTemplateCommand() {
  const templatePath = path.resolve(cwd, option("--template", "导入产品模板.xls"));
  const input = path.resolve(cwd, required("--input"));
  const output = path.resolve(cwd, option("--output", `exports/导入产品模板-${dateStamp()}.xls`));
  const rows = JSON.parse(fs.readFileSync(input, "utf8"));
  if (!Array.isArray(rows)) throw new Error("导出输入文件必须是 JSON 数组。");
  console.log(JSON.stringify(exportRowsToTemplate({ templatePath, rows, outputPath: output }), null, 2));
}

function exportCollectedCommand() {
  const templatePath = path.resolve(cwd, option("--template", "导入产品模板.xls"));
  const input = path.resolve(cwd, option("--input", "data/collected-products.jsonl"));
  const output = path.resolve(cwd, option("--output", `exports/导入产品模板-插件采集-${dateStamp()}.xls`));
  const rows = readJsonl(input);
  console.log(JSON.stringify(exportRowsToTemplate({ templatePath, rows, outputPath: output }), null, 2));
}

function helpCommand() {
  console.log(`Temu 飞书上架流程 CLI

用法：
  node src/cli.mjs schema
  node src/cli.mjs prompts --platform all --keyword "收纳盒"
  node src/cli.mjs create-base --name "Temu 上架流程"              # dry-run
  node src/cli.mjs create-base --name "Temu 上架流程" --execute    # 真正调用 lark-cli
  node src/cli.mjs import-products --base-token app_xxx --file products.json
  node src/cli.mjs export-template --input export-rows.json
  node src/cli.mjs export-collected

说明：
  写飞书的命令默认只输出 dry-run。确认授权和参数后加 --execute。`);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`没有找到采集数据文件：${filePath}`);
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function option(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function required(name) {
  const value = option(name, "");
  if (!value) throw new Error(`缺少必填参数：${name}`);
  return value;
}

function flag(name) {
  return args.includes(name);
}

function dateStamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0")
  ].join("");
}
