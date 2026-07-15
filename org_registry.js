"use strict";

/**
 * 현행 부서명 레지스트리.
 * 단일 정본인 knowledge/ibk_org_chart.md의 "현행 조직" 구간만 읽어
 * analyst와 validator가 같은 부서명 집합을 사용하게 한다.
 */
const fs = require("fs");
const path = require("path");

const ORG_CHART_PATH = path.join(__dirname, "knowledge", "ibk_org_chart.md");
const TRANSITION_HEADING = "## 개정 전·후 대비표로 확인된 전환";

function loadCurrentDepartments(filePath = ORG_CHART_PATH) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.includes(TRANSITION_HEADING)) {
    throw new Error(`현행 조직 구간 경계를 찾을 수 없음: ${TRANSITION_HEADING}`);
  }
  const currentSection = text.split(TRANSITION_HEADING)[0];
  const names = currentSection
    .split(/\r?\n/)
    .map(line => line.match(/^\s*-\s+(.+?)\s*$/)?.[1] || "")
    .map(name => name.replace(/^`|`$/g, "").trim())
    .filter(Boolean);

  const departments = new Set(names);
  if (departments.size < 70) {
    throw new Error(`현행 조직 정본 파싱 실패: 부서명 ${departments.size}개`);
  }
  return departments;
}

const CURRENT_DEPARTMENTS = loadCurrentDepartments();

function isCurrentDepartment(name) {
  return typeof name === "string" && CURRENT_DEPARTMENTS.has(name.trim());
}

module.exports = { ORG_CHART_PATH, CURRENT_DEPARTMENTS, loadCurrentDepartments, isCurrentDepartment };
