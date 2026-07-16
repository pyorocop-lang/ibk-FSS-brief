"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  CURRENT_ORG_VERSION, CURRENT_DEPARTMENTS, isCurrentDepartment,
  loadCurrentDepartments, getCurrentOrganization,
} = require("../org_registry");
const { fallbackDept, applyAnalysis } = require("../analyst");

const expected = [
  ["마이데이터 데이터 활용", "AX데이터혁신부"],
  ["WM 자산관리", "자산관리사업부"],
  ["브랜드 홍보", "브랜드홍보부"],
  ["BCP 비상계획", "안전기획부"],
  ["AI 거버넌스", "AX디지털전략부"],
  ["내부회계 공시", "경영관리부"],
  ["리스크관리 BIS", "리스크총괄부"],
  ["방카슈랑스", "자산관리사업부"],
];

const fallbackCases = [
  ["자금세탁 AML", "자금세탁방지부", ["준법지원부", "내부통제총괄부"]],
  ["대출 여신", "여신기획부", ["여신관리부", "기업개선부"]],
  ["채권 추심", "여신관리부", ["기업개선부"]],
  ["마이데이터 데이터 활용", "AX데이터혁신부", ["정보보호총괄부"]],
  ["개인정보 정보유출", "정보보호총괄부", ["AX데이터혁신부", "준법지원부"]],
  ["전자금융 오픈뱅킹", "개인디지털사업부", ["IT내부통제부"]],
  ["IT보안 사이버", "정보보호총괄부", ["IT내부통제부"]],
  ["불완전판매 설명의무", "금융소비자보호부", ["금융소비자지원부"]],
  ["방카슈랑스", "자산관리사업부", []],
  ["WM 자산관리", "자산관리사업부", ["신탁부"]],
  ["AI 거버넌스", "AX디지털전략부", []],
  ["내부회계 공시", "경영관리부", []],
  ["BCP 비상계획", "안전기획부", []],
  ["브랜드 홍보", "브랜드홍보부", []],
  ["리스크관리 BIS", "리스크총괄부", []],
  ["카드", "카드사업부", ["카드지원부"]],
  ["지배구조 내부통제 겸직 전결", "내부통제총괄부", ["준법지원부", "검사부"]],
  ["분류되지 않은 주제", "내부통제총괄부", ["준법지원부"]],
];

test("조직 정본은 현행 핵심 부서를 포함하고 폐지부서를 제외한다", () => {
  assert.equal(CURRENT_ORG_VERSION, "2026-H2");
  assert.equal(CURRENT_DEPARTMENTS.size, 91);
  assert.equal(isCurrentDepartment("검사부"), true);
  assert.equal(getCurrentOrganization("검사부").id, "ORG-0001");
  for (const role of ["AML보고책임자", "재난·안전관리책임자", "정보보호최고책임자"])
    assert.equal(isCurrentDepartment(role), false, role);
  for (const [, dept] of expected) assert.equal(isCurrentDepartment(dept), true, dept);
  for (const old of ["데이터혁신부", "WM사업부", "브랜드전략부", "재무회계부", "리스크관리부", "방카슈랑스사업부"])
    assert.equal(isCurrentDepartment(old), false, old);
  assert.equal(isCurrentDepartment("경영전략부"), true);
});

test("fallback의 모든 분기는 현행 주담당·협조부서를 반환한다", () => {
  for (const [text, dept, related] of fallbackCases) {
    const result = fallbackDept(text);
    assert.equal(result.dept, dept, text);
    assert.deepEqual(result.related, related, text);
    assert.equal(isCurrentDepartment(result.dept), true, result.dept);
    result.related.forEach(name => assert.equal(isCurrentDepartment(name), true, name));
  }
});

test("활성 조직 버전 파일이 없으면 레지스트리 로드를 중단한다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibk-org-registry-"));
  const file = path.join(dir, "active.json");
  try {
    fs.writeFileSync(file, JSON.stringify({ active_version: "2099-H1", version_file: "versions/missing.json" }), "utf8");
    assert.throws(() => loadCurrentDepartments(file), /활성 조직 버전 파일 없음/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("분석 병합은 비현행 부서명을 거부한다", () => {
  assert.throws(
    () => applyAnalysis({}, { dept: "WM사업부", related_depts: [], risk_grade: "중" }),
    /현행 조직 정본에 없는 부서명/
  );
});

test("분석 병합은 책임자 역할을 담당부서로 허용하지 않는다", () => {
  for (const role of ["AML보고책임자", "재난·안전관리책임자", "정보보호최고책임자"]) {
    assert.throws(
      () => applyAnalysis({}, { dept: role, related_depts: [], risk_grade: "중" }),
      /현행 조직 정본에 없는 부서명/,
      role
    );
  }
});

test("분석 병합은 조직버전과 안정 ID를 함께 기록한다", () => {
  const result = applyAnalysis({}, {
    dept: "내부통제총괄부",
    related_depts: ["준법지원부", "검사부"],
    risk_grade: "중",
  });
  assert.equal(result.org_version, "2026-H2");
  assert.equal(result.dept_id, "ORG-0079");
  assert.deepEqual(result.related_dept_ids, ["ORG-0078", "ORG-0001"]);
});

test("분석 프롬프트는 현행 경영전략부를 금지하지 않는다", () => {
  const prompt = fs.readFileSync(path.join(__dirname, "..", "agents", "analyst_system_prompt.md"), "utf8");
  const bannedBlock = prompt.match(/## ❌[\s\S]*?(?=\n## |$)/)?.[0] || "";
  assert.match(bannedBlock, /경영전략부.*현행 공식 부서/);
  assert.doesNotMatch(bannedBlock, /IT운영부,\s*경영전략부/);
});
