"use strict";

const fs = require("fs");
const path = require("path");
const {
  ROOT, ORG_ROOT, GENERATED_REGISTRY_PATH, validateOrganizationData, renderGeneratedRegistry,
} = require("./org_data");

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(filePath, visit);
    else visit(filePath);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsStandaloneName(text, name) {
  return new RegExp(`(?<![가-힣A-Za-z0-9&])${escapeRegExp(name)}(?![가-힣A-Za-z0-9&])`).test(text);
}

function findDeprecatedNames(value, deprecated, prefix, out) {
  if (typeof value === "string") {
    for (const name of deprecated) if (containsStandaloneName(value, name)) out.push(`${prefix}: ${name}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findDeprecatedNames(item, deprecated, `${prefix}[${index}]`, out));
  }
}

function listRuntimeFiles() {
  const files = [];
  walk(ROOT, filePath => {
    const relative = path.relative(ROOT, filePath).replaceAll(path.sep, "/");
    if (relative.startsWith("test/") || relative.startsWith("reports/") || relative.startsWith("logs/")) return;
    const runtimeCode = relative.endsWith(".js");
    const workflow = relative.startsWith(".github/workflows/") && /\.ya?ml$/.test(relative);
    const agentPrompt = relative.startsWith("agents/") && relative.endsWith(".md");
    const generatedKnowledge = relative.startsWith("knowledge/generated/") && relative.endsWith(".md");
    if (runtimeCode || workflow || agentPrompt || generatedKnowledge) files.push(relative);
  });
  return files.sort();
}

function generate({ check = false } = {}) {
  const validated = validateOrganizationData();
  const rendered = renderGeneratedRegistry(validated);
  if (check) {
    const current = fs.existsSync(GENERATED_REGISTRY_PATH) ? fs.readFileSync(GENERATED_REGISTRY_PATH, "utf8") : "";
    if (current !== rendered) throw new Error("자동 생성 조직 레지스트리가 정본과 다름: npm run org:generate 실행 필요");
  } else {
    fs.mkdirSync(path.dirname(GENERATED_REGISTRY_PATH), { recursive: true });
    fs.writeFileSync(GENERATED_REGISTRY_PATH, rendered, "utf8");
  }
  return { version: validated.version.version, count: validated.assignable.length, path: GENERATED_REGISTRY_PATH };
}

function audit({ runtime = false } = {}) {
  const validated = validateOrganizationData();
  generate({ check: true });
  const currentNames = new Set(validated.assignable.map(unit => unit.name));
  const invalidAssignments = [];
  const narrativeHits = [];
  let jsonFiles = 0;

  const deprecated = new Set((validated.changes.changes || [])
    .filter(change => ["rename", "abolish"].includes(change.type))
    .map(change => change.from_name)
    .filter(Boolean));

  if (!runtime) {
    walk(ROOT, filePath => {
      if (!filePath.endsWith(".json")) return;
      jsonFiles += 1;
      let data;
      try { data = JSON.parse(fs.readFileSync(filePath, "utf8")); }
      catch (error) { throw new Error(`${path.relative(ROOT, filePath)} JSON 파싱 실패: ${error.message}`); }
      for (const field of ["graded", "newGraded"]) {
        for (const [index, item] of (Array.isArray(data[field]) ? data[field] : []).entries()) {
          for (const name of [item.dept, ...(Array.isArray(item.related_depts) ? item.related_depts : [])]) {
            if (name && !currentNames.has(name)) invalidAssignments.push(`${path.relative(ROOT, filePath)}:${field}[${index}] ${name}`);
          }
          findDeprecatedNames(item.our_action, deprecated, `${path.relative(ROOT, filePath)}:${field}[${index}].our_action`, narrativeHits);
          findDeprecatedNames(item.ctrl_insight, deprecated, `${path.relative(ROOT, filePath)}:${field}[${index}].ctrl_insight`, narrativeHits);
        }
      }
      findDeprecatedNames(data.tgMsg, deprecated, `${path.relative(ROOT, filePath)}:tgMsg`, narrativeHits);
    });
  }

  const liveFiles = listRuntimeFiles();
  const liveHits = [];
  for (const relative of liveFiles) {
    const text = fs.readFileSync(path.join(ROOT, relative), "utf8");
    for (const name of deprecated) if (containsStandaloneName(text, name)) liveHits.push(`${relative}: ${name}`);
  }

  if (invalidAssignments.length || narrativeHits.length || liveHits.length) {
    throw new Error([
      ...invalidAssignments.map(value => `비현행 분석 배정: ${value}`),
      ...narrativeHits.map(value => `분석 생성서술의 폐지·변경 전 조직명: ${value}`),
      ...liveHits.map(value => `실행 파일의 폐지·변경 전 조직명: ${value}`),
    ].join("\n"));
  }
  return {
    version: validated.version.version,
    currentOrganizations: validated.documented.length,
    assignableOrganizations: validated.assignable.length,
    dutyMappings: validated.dutyMappings.mappings.length,
    jsonFiles: runtime ? null : jsonFiles,
    runtimeFiles: liveFiles.length,
    invalidAssignments: 0,
    narrativeDeprecatedHits: 0,
    liveDeprecatedHits: 0,
  };
}

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function scaffold({ version, effectiveFrom, orgRoot = ORG_ROOT }) {
  if (!/^\d{4}-H[12]$/.test(version || "")) throw new Error("--version은 YYYY-H1 또는 YYYY-H2 형식이어야 함");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom || "")) throw new Error("--effective는 YYYY-MM-DD 형식이어야 함");
  const current = validateOrganizationData();
  const versionPath = path.join(orgRoot, "versions", `${version}.json`);
  const changePath = path.join(orgRoot, "changes", `${version}.json`);
  if (fs.existsSync(versionPath) || fs.existsSync(changePath)) throw new Error(`이미 존재하는 조직버전: ${version}`);
  const draft = {
    ...current.version,
    version,
    effective_from: effectiveFrom,
    effective_to: null,
    status: "draft",
    sources: [],
  };
  const changes = { schema_version: 1, version, effective_from: effectiveFrom, changes: [] };
  fs.mkdirSync(path.dirname(versionPath), { recursive: true });
  fs.mkdirSync(path.dirname(changePath), { recursive: true });
  const nonce = `${process.pid}-${Date.now()}`;
  const versionTemp = `${versionPath}.${nonce}.tmp`;
  const changeTemp = `${changePath}.${nonce}.tmp`;
  let versionCommitted = false;
  let changeCommitted = false;
  try {
    fs.writeFileSync(versionTemp, `${JSON.stringify(draft, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    fs.writeFileSync(changeTemp, `${JSON.stringify(changes, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    fs.renameSync(versionTemp, versionPath);
    versionCommitted = true;
    fs.renameSync(changeTemp, changePath);
    changeCommitted = true;
  } catch (error) {
    for (const temp of [versionTemp, changeTemp]) fs.rmSync(temp, { force: true });
    if (versionCommitted && !changeCommitted) fs.rmSync(versionPath, { force: true });
    throw error;
  }
  return { version, effectiveFrom, versionPath, changePath, next: "공식 출처·변경명세 입력 후 active.json 전환 PR 작성" };
}

function main() {
  const command = process.argv[2] || "validate";
  const check = process.argv.includes("--check");
  const runtime = process.argv.includes("--runtime");
  try {
    let result;
    if (command === "validate") {
      const validated = validateOrganizationData();
      result = { version: validated.version.version, currentOrganizations: validated.documented.length, assignableOrganizations: validated.assignable.length, dutyMappings: validated.dutyMappings.mappings.length };
    } else if (command === "generate") result = generate({ check });
    else if (command === "audit") result = audit({ runtime });
    else if (command === "scaffold") result = scaffold({ version: getArg("version"), effectiveFrom: getArg("effective") });
    else throw new Error(`알 수 없는 명령: ${command}`);
    console.log(`[ORG] ${command} 통과 — ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`[ORG] ${command} 실패\n${error.message}`);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { generate, audit, scaffold };
