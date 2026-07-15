"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { CURRENT_DEPARTMENTS, isCurrentDepartment } = require("../org_registry");
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

test("조직 정본은 현행 핵심 부서를 포함하고 폐지부서를 제외한다", () => {
  assert.ok(CURRENT_DEPARTMENTS.size >= 70);
  for (const [, dept] of expected) assert.equal(isCurrentDepartment(dept), true, dept);
  for (const old of ["데이터혁신부", "WM사업부", "브랜드전략부", "재무회계부", "리스크관리부", "방카슈랑스사업부"])
    assert.equal(isCurrentDepartment(old), false, old);
  assert.equal(isCurrentDepartment("경영전략부"), true);
});

test("fallback 업무매핑 8건은 모두 현행 부서를 반환한다", () => {
  for (const [text, dept] of expected) {
    const result = fallbackDept(text);
    assert.equal(result.dept, dept, text);
    assert.equal(isCurrentDepartment(result.dept), true, result.dept);
    result.related.forEach(name => assert.equal(isCurrentDepartment(name), true, name));
  }
});

test("분석 병합은 비현행 부서명을 거부한다", () => {
  assert.throws(
    () => applyAnalysis({}, { dept: "WM사업부", related_depts: [], risk_grade: "중" }),
    /현행 조직 정본에 없는 부서명/
  );
});

test("분석 프롬프트는 현행 경영전략부를 금지하지 않는다", () => {
  const prompt = fs.readFileSync(path.join(__dirname, "..", "agents", "analyst_system_prompt.md"), "utf8");
  const bannedBlock = prompt.match(/## ❌[\s\S]*?(?=\n## |$)/)?.[0] || "";
  assert.match(bannedBlock, /경영전략부.*현행 공식 부서/);
  assert.doesNotMatch(bannedBlock, /IT운영부,\s*경영전략부/);
});
