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
const { generate, audit, scaffold } = require("../org_tools");

test("구조화 조직 정본의 ID·명칭·계층·출처·업무매핑은 유효하다", () => {
  const result = validateOrganizationData();
  assert.equal(result.version.version, "2026-H2");
  assert.equal(result.documented.length, 94);
  assert.equal(result.assignable.length, 91);
  assert.equal(result.idMap.size, result.units.length);
  assert.equal(result.nameMap.size, result.units.length);
  assert.equal(result.dutyMappings.mappings.length, 8);
  assert.ok(result.version.sources.every(source => /^[a-f0-9]{64}$/.test(source.sha256)));
  for (const role of ["AML보고책임자", "재난·안전관리책임자", "정보보호최고책임자"])
    assert.equal(result.nameMap.get(role).assignable, false, role);
});

test("자동 생성 조직 레지스트리는 버전 정본과 바이트 단위로 일치한다", () => {
  const expected = renderGeneratedRegistry(validateOrganizationData());
  assert.equal(fs.readFileSync(GENERATED_REGISTRY_PATH, "utf8"), expected);
  assert.doesNotThrow(() => generate({ check: true }));
});

test("전역 감사기는 실행파일 폐지명과 과거 분석의 비현행 배정을 허용하지 않는다", () => {
  const result = audit();
  assert.equal(result.invalidAssignments, 0);
  assert.equal(result.narrativeDeprecatedHits, 0);
  assert.equal(result.liveDeprecatedHits, 0);
  assert.ok(result.runtimeFiles > 3);
});

test("다음 반기의 조직 수는 코드 수정 없이 버전 선언값으로 검증한다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibk-org-future-"));
  const versionsDir = path.join(dir, "versions");
  const changesDir = path.join(dir, "changes");
  fs.mkdirSync(versionsDir, { recursive: true });
  fs.mkdirSync(changesDir, { recursive: true });
  try {
    const current = validateOrganizationData();
    const future = JSON.parse(JSON.stringify(current.version));
    future.version = "2027-H1";
    future.effective_from = "2027-01-01";
    future.status = "active";
    future.structure[0].children.push({ id: "ORG-0095", name: "미래신설부", kind: "department" });
    future.expected_unit_count = 95;
    future.expected_assignable_count = 92;
    fs.writeFileSync(path.join(versionsDir, "2027-H1.json"), JSON.stringify(future), "utf8");
    fs.writeFileSync(path.join(changesDir, "2027-H1.json"), JSON.stringify({
      schema_version: 1,
      version: "2027-H1",
      effective_from: "2027-01-01",
      changes: [{ type: "create", to_id: "ORG-0095", evidence_type: "official_comparison_table" }],
    }), "utf8");
    const activePath = path.join(dir, "active.json");
    fs.writeFileSync(activePath, JSON.stringify({
      schema_version: 1,
      active_version: "2027-H1",
      version_file: "versions/2027-H1.json",
      effective_from: "2027-01-01",
    }), "utf8");

    const validationOptions = {
      activePath,
      dutyMappingPath: DUTY_MAPPING_PATH,
      compareMarkdown: false,
      validationDate: "2027-01-01",
    };
    const result = validateOrganizationData(validationOptions);
    assert.equal(result.documented.length, 95);
    assert.equal(result.assignable.length, 92);

    future.expected_assignable_count = 91;
    fs.writeFileSync(path.join(versionsDir, "2027-H1.json"), JSON.stringify(future), "utf8");
    assert.throws(
      () => validateOrganizationData(validationOptions),
      /2027-H1 자동배정 조직 수 오류: 92 \(버전 정본 기대 91\)/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffold는 버전·변경명세를 함께 만들고 기존 파일을 덮어쓰지 않는다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibk-org-scaffold-"));
  try {
    const result = scaffold({ version: "2027-H2", effectiveFrom: "2027-07-01", orgRoot: dir });
    assert.equal(fs.existsSync(result.versionPath), true);
    assert.equal(fs.existsSync(result.changePath), true);
    assert.throws(
      () => scaffold({ version: "2027-H2", effectiveFrom: "2027-07-01", orgRoot: dir }),
      /이미 존재하는 조직버전/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffold 두 번째 반영이 실패하면 첫 번째 파일도 롤백한다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibk-org-scaffold-rollback-"));
  const originalRename = fs.renameSync;
  let calls = 0;
  try {
    fs.renameSync = (...args) => {
      calls += 1;
      if (calls === 2) throw new Error("강제 두 번째 rename 실패");
      return originalRename(...args);
    };
    assert.throws(
      () => scaffold({ version: "2028-H1", effectiveFrom: "2028-01-01", orgRoot: dir }),
      /강제 두 번째 rename 실패/
    );
    assert.equal(fs.existsSync(path.join(dir, "versions", "2028-H1.json")), false);
    assert.equal(fs.existsSync(path.join(dir, "changes", "2028-H1.json")), false);
  } finally {
    fs.renameSync = originalRename;
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
