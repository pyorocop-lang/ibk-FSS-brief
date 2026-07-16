"use strict";

const fs = require("fs");
const path = require("path");
const {
  ROOT, ORG_ROOT, GENERATED_REGISTRY_PATH, readJson, flattenStructure, countKinds,
  validateOrganizationData, renderGeneratedRegistry,
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

function indexUnits(units, label) {
  const byId = new Map();
  const byName = new Map();
  for (const unit of units) {
    if (!unit.id || !unit.name || !unit.kind) throw new Error(`${label} 필수 조직값 누락`);
    if (byId.has(unit.id)) throw new Error(`${label} 중복 조직 ID: ${unit.id}`);
    if (byName.has(unit.name)) throw new Error(`${label} 중복 조직명: ${unit.name}`);
    byId.set(unit.id, unit);
    byName.set(unit.name, unit);
  }
  return { byId, byName };
}

function deriveOrganizationChanges(baseVersion, targetVersion) {
  const baseUnits = flattenStructure(baseVersion.structure);
  const targetUnits = flattenStructure(targetVersion.structure);
  const base = indexUnits(baseUnits, baseVersion.version || "기준 버전");
  const target = indexUnits(targetUnits, targetVersion.version || "대상 버전");
  const changes = [];
  const warnings = [];

  for (const unit of baseUnits) {
    const next = target.byId.get(unit.id);
    if (!next) {
      changes.push({
        type: "abolish",
        from_id: unit.id,
        from_name: unit.name,
        successor_status: "pending",
        evidence_type: "official_comparison_table",
      });
      continue;
    }
    if (unit.name !== next.name) {
      changes.push({
        type: "rename",
        from_name: unit.name,
        to_id: next.id,
        evidence_type: "official_comparison_table",
      });
    }
    if (unit.parent_id !== next.parent_id) {
      changes.push({
        type: "move",
        name: next.name,
        from_parent_id: unit.parent_id,
        to_parent_id: next.parent_id,
        evidence_type: "official_comparison_table",
      });
    }
  }
  for (const unit of targetUnits) {
    if (!base.byId.has(unit.id)) {
      changes.push({ type: "create", to_id: unit.id, evidence_type: "official_comparison_table" });
      const prior = base.byName.get(unit.name);
      if (prior) warnings.push(`동일 명칭의 ID 변경 의심: ${unit.name} (${prior.id} → ${unit.id})`);
    }
  }

  return {
    changes,
    warnings,
    pendingSuccessors: changes
      .filter(change => change.type === "abolish")
      .map(change => ({ from_id: change.from_id, from_name: change.from_name, question: `${change.from_name} 업무의 승계부서는 어디입니까?` })),
    counts: {
      units: targetUnits.filter(unit => /^ORG-\d{4}$/.test(unit.id)).length,
      assignable: targetUnits.filter(unit => unit.assignable).length,
      byKind: countKinds(targetUnits),
    },
  };
}

function resolveDraftVersion(orgRoot, baseVersion, requestedVersion) {
  if (requestedVersion) {
    if (!/^\d{4}-H[12]$/.test(requestedVersion)) throw new Error("--version은 YYYY-H1 또는 YYYY-H2 형식이어야 함");
    return requestedVersion;
  }
  const versionsDir = path.join(orgRoot, "versions");
  const drafts = fs.readdirSync(versionsDir)
    .filter(name => /^\d{4}-H[12]\.json$/.test(name))
    .map(name => readJson(path.join(versionsDir, name)))
    .filter(version => version.status === "draft" && version.based_on_version === baseVersion)
    .map(version => version.version);
  if (drafts.length !== 1) throw new Error(`계획 대상 draft를 하나로 특정할 수 없음: ${drafts.join(", ") || "없음"} (--version 사용)`);
  return drafts[0];
}

function backupExistingPlan(changePath) {
  const stamp = `${Date.now()}-${process.pid}`;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? stamp : `${stamp}-${attempt}`;
    const backupPath = `${changePath}.${suffix}.bak`;
    try {
      fs.copyFileSync(changePath, backupPath, fs.constants.COPYFILE_EXCL);
      return backupPath;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`변경명세 백업 경로를 확보할 수 없음: ${path.relative(ROOT, changePath)}`);
}

function plan({ version, orgRoot = ORG_ROOT, force = false } = {}) {
  const current = validateOrganizationData();
  const targetVersionName = resolveDraftVersion(orgRoot, current.version.version, version);
  const versionPath = path.join(orgRoot, "versions", `${targetVersionName}.json`);
  const changePath = path.join(orgRoot, "changes", `${targetVersionName}.json`);
  if (!fs.existsSync(versionPath)) throw new Error(`대상 조직버전 파일 없음: ${targetVersionName}`);
  const target = readJson(versionPath);
  if (target.status !== "draft") throw new Error(`org:plan 대상은 draft여야 함: ${target.status}`);
  if (target.based_on_version !== current.version.version) {
    throw new Error(`기준 버전 불일치: ${target.based_on_version || "없음"} (활성 ${current.version.version})`);
  }
  const existing = fs.existsSync(changePath) ? readJson(changePath) : null;
  if (existing?.changes?.length && !force) {
    throw new Error(`기존 변경명세를 덮어쓸 수 없음: ${path.relative(ROOT, changePath)} (재생성하려면 --force)`);
  }

  const derived = deriveOrganizationChanges(current.version, target);
  const output = {
    schema_version: 1,
    version: target.version,
    based_on_version: current.version.version,
    effective_from: target.effective_from,
    generated_by: "org:plan",
    changes: derived.changes,
  };
  fs.mkdirSync(path.dirname(changePath), { recursive: true });
  let backupPath = null;
  if (force && existing?.changes?.length) backupPath = backupExistingPlan(changePath);
  const tempPath = `${changePath}.${process.pid}-${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    fs.renameSync(tempPath, changePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }

  return {
    version: target.version,
    basedOnVersion: current.version.version,
    changePath,
    backupPath,
    changes: derived.changes.length,
    counts: derived.counts,
    declaredCounts: {
      units: target.expected_unit_count,
      assignable: target.expected_assignable_count,
      byKind: target.expected_kind_counts,
    },
    pendingSuccessors: derived.pendingSuccessors,
    warnings: derived.warnings,
    next: "삭제 조직의 승계부서를 근거로 확정하고, 미확정 건은 pending으로 유지한 뒤 기대 조직 수와 새 공식 출처를 점검하세요.",
  };
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
    based_on_version: current.version.version,
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
      const version = getArg("version");
      const validated = validateOrganizationData(version ? { version, compareMarkdown: false } : {});
      result = { version: validated.version.version, currentOrganizations: validated.documented.length, assignableOrganizations: validated.assignable.length, dutyMappings: validated.dutyMappings.mappings.length };
    } else if (command === "generate") result = generate({ check });
    else if (command === "audit") result = audit({ runtime });
    else if (command === "scaffold") result = scaffold({ version: getArg("version"), effectiveFrom: getArg("effective") });
    else if (command === "plan") result = plan({ version: getArg("version"), force: process.argv.includes("--force") });
    else throw new Error(`알 수 없는 명령: ${command}`);
    console.log(`[ORG] ${command} 통과 — ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`[ORG] ${command} 실패\n${error.message}`);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { generate, audit, scaffold, deriveOrganizationChanges, plan };
