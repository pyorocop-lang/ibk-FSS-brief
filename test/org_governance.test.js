"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  DUTY_MAPPING_PATH, GENERATED_REGISTRY_PATH,
  validateOrganizationData, renderGeneratedRegistry,
} = require("../org_data");
const { generate, audit } = require("../org_tools");

test("구조화 조직 정본의 ID·명칭·계층·출처·업무매핑은 유효하다", () => {
  const result = validateOrganizationData();
  assert.equal(result.version.version, "2026-H2");
  assert.equal(result.assignable.length, 94);
  assert.equal(result.idMap.size, result.units.length);
  assert.equal(result.nameMap.size, result.units.length);
  assert.equal(result.dutyMappings.mappings.length, 8);
  assert.ok(result.version.sources.every(source => /^[a-f0-9]{64}$/.test(source.sha256)));
});

test("자동 생성 조직 레지스트리는 버전 정본과 바이트 단위로 일치한다", () => {
  const expected = renderGeneratedRegistry(validateOrganizationData());
  assert.equal(fs.readFileSync(GENERATED_REGISTRY_PATH, "utf8"), expected);
  assert.doesNotThrow(() => generate({ check: true }));
});

test("전역 감사기는 실행파일 폐지명과 과거 분석의 비현행 배정을 허용하지 않는다", () => {
  const result = audit();
  assert.equal(result.invalidAssignments, 0);
  assert.equal(result.liveDeprecatedHits, 0);
});

test("추정 증거는 confirmed 자동 업무배정으로 승격할 수 없다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibk-duty-mapping-"));
  const file = path.join(dir, "duty_mappings.json");
  try {
    const mappings = JSON.parse(fs.readFileSync(DUTY_MAPPING_PATH, "utf8"));
    mappings.mappings[0].evidence_type = "press_inferred";
    fs.writeFileSync(file, JSON.stringify(mappings), "utf8");
    assert.throws(
      () => validateOrganizationData({ dutyMappingPath: file }),
      /자동배정 불가 증거등급/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
