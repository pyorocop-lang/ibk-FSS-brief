"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const ORG_ROOT = path.join(ROOT, "knowledge", "org");
const ACTIVE_PATH = path.join(ORG_ROOT, "active.json");
const CHANGE_PATH = path.join(ORG_ROOT, "changes", "2026-H2.json");
const DUTY_MAPPING_PATH = path.join(ORG_ROOT, "duty_mappings.json");
const ORG_CHART_PATH = path.join(ROOT, "knowledge", "ibk_org_chart.md");
const GENERATED_REGISTRY_PATH = path.join(ROOT, "knowledge", "generated", "ibk_current_org_registry.md");
const TRANSITION_HEADING = "## 개정 전·후 대비표로 확인된 전환";

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${path.relative(ROOT, filePath)} 읽기 실패: ${error.message}`);
  }
}

function loadOrganizationData(activePath = ACTIVE_PATH) {
  const active = readJson(activePath);
  const orgRoot = path.dirname(activePath);
  const versionPath = path.resolve(orgRoot, active.version_file || "");
  if (!versionPath.startsWith(`${orgRoot}${path.sep}`)) {
    throw new Error("active.json의 version_file이 knowledge/org 밖을 가리킴");
  }
  if (!fs.existsSync(versionPath)) {
    throw new Error(`활성 조직 버전 파일 없음: ${path.relative(ROOT, versionPath)}`);
  }
  const version = readJson(versionPath);
  return { active, version, activePath, versionPath };
}

function flattenStructure(nodes, parentId = null, depth = 0, out = []) {
  for (const node of nodes || []) {
    const children = Array.isArray(node.children) ? node.children : [];
    const assignable = node.assignable === true || (node.assignable !== false && children.length === 0 && node.kind !== "container");
    out.push({ ...node, children: undefined, parent_id: parentId, depth, assignable });
    flattenStructure(children, node.id, depth + 1, out);
  }
  return out;
}

function parseCurrentOrgChart(filePath = ORG_CHART_PATH) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.includes(TRANSITION_HEADING)) {
    throw new Error(`현행 조직 구간 경계를 찾을 수 없음: ${TRANSITION_HEADING}`);
  }
  return new Set(text
    .split(TRANSITION_HEADING)[0]
    .split(/\r?\n/)
    .map(line => line.match(/^\s*-\s+(.+?)\s*$/)?.[1] || "")
    .map(name => name.replace(/^`|`$/g, "").trim())
    .filter(Boolean));
}

function validateOrganizationData(options = {}) {
  const data = loadOrganizationData(options.activePath || ACTIVE_PATH);
  const errors = [];
  const { active, version } = data;
  const units = flattenStructure(version.structure);
  const assignable = units.filter(unit => unit.assignable);
  const idMap = new Map();
  const nameMap = new Map();

  if (active.active_version !== version.version) errors.push("active_version과 version 파일의 version 불일치");
  if (active.effective_from !== version.effective_from) errors.push("active.json과 version 파일의 시행일 불일치");
  if (version.status !== "active") errors.push(`활성 포인터가 active 상태가 아닌 버전을 가리킴: ${version.status}`);
  if ((version.effective_from || "") > new Date().toISOString().slice(0, 10)) errors.push("시행일 전 조직버전은 활성화할 수 없음");
  if (!/^\d{4}-H[12]$/.test(version.version || "")) errors.push(`잘못된 반기 버전: ${version.version || "(없음)"}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version.effective_from || "")) errors.push("잘못된 effective_from");
  if (!Array.isArray(version.sources) || version.sources.length < 2) errors.push("공식 출처가 2개 미만");
  for (const source of version.sources || []) {
    if (!/^[a-f0-9]{64}$/.test(source.sha256 || "")) errors.push(`출처 해시 누락·오류: ${source.name || "(이름 없음)"}`);
  }

  for (const unit of units) {
    if (!unit.id || !unit.name || !unit.kind) errors.push(`필수 필드 누락: ${JSON.stringify(unit)}`);
    if (idMap.has(unit.id)) errors.push(`중복 조직 ID: ${unit.id}`);
    if (nameMap.has(unit.name)) errors.push(`중복 조직명: ${unit.name}`);
    idMap.set(unit.id, unit);
    nameMap.set(unit.name, unit);
    if (unit.parent_id && !units.some(parent => parent.id === unit.parent_id)) errors.push(`상위 조직 없음: ${unit.id} → ${unit.parent_id}`);
  }
  if (assignable.length !== 94) errors.push(`2026-H2 자동배정 조직 수 오류: ${assignable.length} (기대 94)`);

  const changePath = options.changePath || path.join(ORG_ROOT, "changes", `${version.version}.json`);
  const changes = readJson(changePath);
  if (changes.version !== version.version) errors.push("변경명세 version 불일치");
  const allowedChangeTypes = new Set(["create", "rename", "move", "merge", "split", "abolish", "no_successor"]);
  for (const change of changes.changes || []) {
    if (!change.type || !change.evidence_type) errors.push(`변경명세 필수값 누락: ${JSON.stringify(change)}`);
    if (!allowedChangeTypes.has(change.type)) errors.push(`지원하지 않는 변경유형: ${change.type}`);
    if (change.to_id && !idMap.has(change.to_id)) errors.push(`변경명세 대상 ID 없음: ${change.to_id}`);
    if (change.to_parent_id && !idMap.has(change.to_parent_id)) errors.push(`변경명세 대상 상위 ID 없음: ${change.to_parent_id}`);
    if (change.name && !nameMap.has(change.name)) errors.push(`이동 대상 현행 조직 없음: ${change.name}`);
  }

  const dutyMappings = readJson(options.dutyMappingPath || DUTY_MAPPING_PATH);
  const allowedEvidence = new Set(dutyMappings.allowed_evidence_for_automatic_assignment || []);
  const knownEvidence = new Set(["official", "user_confirmed", "press_inferred", "pending"]);
  const knownMappingStatus = new Set(["confirmed", "pending", "rejected"]);
  const mappingIds = new Set();
  for (const mapping of dutyMappings.mappings || []) {
    if (mappingIds.has(mapping.mapping_id)) errors.push(`중복 업무매핑 ID: ${mapping.mapping_id}`);
    mappingIds.add(mapping.mapping_id);
    if (!idMap.has(mapping.target_id)) errors.push(`업무매핑 대상 ID 없음: ${mapping.target_id}`);
    if (!knownEvidence.has(mapping.evidence_type)) errors.push(`알 수 없는 증거등급: ${mapping.mapping_id}/${mapping.evidence_type}`);
    if (!knownMappingStatus.has(mapping.status)) errors.push(`알 수 없는 업무매핑 상태: ${mapping.mapping_id}/${mapping.status}`);
    if (mapping.status === "confirmed" && !allowedEvidence.has(mapping.evidence_type)) {
      errors.push(`자동배정 불가 증거등급: ${mapping.mapping_id}/${mapping.evidence_type}`);
    }
  }

  if (options.compareMarkdown !== false) {
    const markdownNames = parseCurrentOrgChart(options.orgChartPath || ORG_CHART_PATH);
    const canonicalNames = new Set(assignable.map(unit => unit.name));
    const missing = [...canonicalNames].filter(name => !markdownNames.has(name));
    const extra = [...markdownNames].filter(name => !canonicalNames.has(name));
    if (missing.length) errors.push(`조직도 Markdown 누락: ${missing.join(", ")}`);
    if (extra.length) errors.push(`조직도 Markdown 비정본명: ${extra.join(", ")}`);
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return { ...data, units, assignable, idMap, nameMap, changes, dutyMappings };
}

function renderGeneratedRegistry(validated = validateOrganizationData()) {
  const { version, assignable, units } = validated;
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const rows = assignable.map(unit => {
    const parent = byId.get(unit.parent_id);
    return `| ${unit.id} | ${unit.name} | ${unit.kind} | ${parent?.name || "-"} |`;
  });
  return [
    "# IBK 현행 조직 레지스트리 (자동 생성)",
    "",
    "> 이 파일은 `knowledge/org/versions/`의 활성 정본에서 생성됩니다. 직접 수정하지 마세요.",
    `> 조직버전: ${version.version} / 시행기준: ${version.effective_from} / 자동배정 가능 조직: ${assignable.length}개`,
    "",
    "| 조직 ID | 현행 조직명 | 유형 | 상위 조직 |",
    "|---|---|---|---|",
    ...rows,
    ""
  ].join("\n");
}

module.exports = {
  ROOT, ORG_ROOT, ACTIVE_PATH, CHANGE_PATH, DUTY_MAPPING_PATH, ORG_CHART_PATH,
  GENERATED_REGISTRY_PATH, TRANSITION_HEADING, readJson, loadOrganizationData,
  flattenStructure, parseCurrentOrgChart, validateOrganizationData, renderGeneratedRegistry,
};
