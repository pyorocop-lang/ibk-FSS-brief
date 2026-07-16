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
const { generate, audit, scaffold, deriveOrganizationChanges, plan } = require("../org_tools");

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
    future.expected_kind_counts.department = 72;
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

test("그룹·부문 등 비 ORG 노드도 유형별 선언 수로 검증한다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibk-org-kind-count-"));
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
    future.structure.push({ id: "GRP-FUTURE", name: "미래신설그룹", kind: "group", assignable: false });
    fs.writeFileSync(path.join(versionsDir, "2027-H1.json"), JSON.stringify(future), "utf8");
    fs.writeFileSync(path.join(changesDir, "2027-H1.json"), JSON.stringify({
      schema_version: 1,
      version: "2027-H1",
      effective_from: "2027-01-01",
      changes: [{ type: "create", to_id: "GRP-FUTURE", evidence_type: "official_comparison_table" }],
    }), "utf8");
    const activePath = path.join(dir, "active.json");
    fs.writeFileSync(activePath, JSON.stringify({
      schema_version: 1,
      active_version: "2027-H1",
      version_file: "versions/2027-H1.json",
      effective_from: "2027-01-01",
    }), "utf8");
    const options = {
      activePath,
      dutyMappingPath: DUTY_MAPPING_PATH,
      compareMarkdown: false,
      validationDate: "2027-01-01",
    };

    assert.throws(
      () => validateOrganizationData(options),
      /2027-H1 조직 유형 수 오류: group 16 \(버전 정본 기대 15\)/
    );
    future.expected_kind_counts.group = 16;
    fs.writeFileSync(path.join(versionsDir, "2027-H1.json"), JSON.stringify(future), "utf8");
    assert.equal(validateOrganizationData(options).kindCounts.group, 16);
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
    const draft = JSON.parse(fs.readFileSync(result.versionPath, "utf8"));
    assert.equal(draft.based_on_version, "2026-H2");
    assert.deepEqual(draft.sources, []);
    assert.throws(
      () => scaffold({ version: "2027-H2", effectiveFrom: "2027-07-01", orgRoot: dir }),
      /이미 존재하는 조직버전/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("org:plan은 안정 ID로 신설·명칭변경·이동·폐지를 도출하고 승계를 pending으로 둔다", () => {
  const base = {
    version: "2026-H2",
    structure: [{ id: "ROOT", name: "루트", kind: "container", children: [
      { id: "PARENT-A", name: "A그룹", kind: "container", children: [
        { id: "ORG-0001", name: "기존부", kind: "department" },
        { id: "ORG-0002", name: "폐지부", kind: "department" },
      ] },
      { id: "PARENT-B", name: "B그룹", kind: "container", children: [] },
    ] }],
  };
  const target = {
    version: "2027-H1",
    structure: [{ id: "ROOT", name: "루트", kind: "container", children: [
      { id: "PARENT-A", name: "A그룹", kind: "container", children: [] },
      { id: "PARENT-B", name: "B그룹", kind: "container", children: [
        { id: "ORG-0001", name: "개편부", kind: "department" },
        { id: "ORG-0003", name: "신설부", kind: "department" },
      ] },
    ] }],
  };
  const result = deriveOrganizationChanges(base, target);
  assert.deepEqual(result.changes, [
    { type: "rename", from_name: "기존부", to_id: "ORG-0001", evidence_type: "official_comparison_table" },
    { type: "move", name: "개편부", from_parent_id: "PARENT-A", to_parent_id: "PARENT-B", evidence_type: "official_comparison_table" },
    { type: "abolish", from_id: "ORG-0002", from_name: "폐지부", successor_status: "pending", evidence_type: "official_comparison_table" },
    { type: "create", to_id: "ORG-0003", evidence_type: "official_comparison_table" },
  ]);
  assert.deepEqual(result.pendingSuccessors.map(item => item.from_name), ["폐지부"]);
  assert.deepEqual(result.counts, { units: 2, assignable: 2, byKind: { container: 3, department: 2 } });
});

test("org:plan은 scaffold 초안에 자동 변경명세를 쓰되 수동 명세를 덮어쓰지 않는다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibk-org-plan-"));
  try {
    const scaffolded = scaffold({ version: "2027-H1", effectiveFrom: "2027-01-01", orgRoot: dir });
    const draft = JSON.parse(fs.readFileSync(scaffolded.versionPath, "utf8"));
    draft.structure[0].children[0].name = `${draft.structure[0].children[0].name} 개편`;
    fs.writeFileSync(scaffolded.versionPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

    const result = plan({ version: "2027-H1", orgRoot: dir });
    assert.equal(result.changes, 1);
    const generated = JSON.parse(fs.readFileSync(scaffolded.changePath, "utf8"));
    assert.equal(generated.generated_by, "org:plan");
    assert.equal(generated.changes[0].type, "rename");

    assert.throws(
      () => validateOrganizationData({ version: "2027-H1", orgRoot: dir, compareMarkdown: false }),
      /필수 공식 출처 3종/
    );
    draft.sources = [
      { name: "직제규정.pdf", type: "official_regulation", sha256: "a".repeat(64) },
      { name: "직제도.jpg", type: "official_org_chart", sha256: "b".repeat(64) },
      { name: "대비표.pdf", type: "official_comparison_table", sha256: "c".repeat(64) },
    ];
    fs.writeFileSync(scaffolded.versionPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
    assert.doesNotThrow(() => validateOrganizationData({ version: "2027-H1", orgRoot: dir, compareMarkdown: false }));

    const originalPlan = fs.readFileSync(scaffolded.changePath, "utf8");
    assert.throws(() => plan({ version: "2027-H1", orgRoot: dir }), /기존 변경명세를 덮어쓸 수 없음/);
    const forced = plan({ version: "2027-H1", orgRoot: dir, force: true });
    assert.ok(forced.backupPath.endsWith(".bak"));
    assert.equal(fs.readFileSync(forced.backupPath, "utf8"), originalPlan);
    assert.equal(fs.readdirSync(path.dirname(scaffolded.changePath)).filter(name => name.endsWith(".bak")).length, 1);
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
