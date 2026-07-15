"use strict";

/** 현행 조직 레지스트리 — Markdown이 아니라 버전별 JSON 정본만 읽는다. */
const { ACTIVE_PATH, validateOrganizationData } = require("./org_data");

function loadCurrentDepartments(activePath = ACTIVE_PATH) {
  return new Set(validateOrganizationData({ activePath, compareMarkdown: activePath === ACTIVE_PATH })
    .assignable.map(unit => unit.name));
}

const ORGANIZATION_DATA = validateOrganizationData();
const CURRENT_ORG_VERSION = ORGANIZATION_DATA.version.version;
const CURRENT_ORG_UNITS = new Map(ORGANIZATION_DATA.assignable.map(unit => [unit.name, unit]));
const CURRENT_DEPARTMENTS = new Set(CURRENT_ORG_UNITS.keys());

function isCurrentDepartment(name) {
  return typeof name === "string" && CURRENT_DEPARTMENTS.has(name.trim());
}

function getCurrentOrganization(name) {
  return typeof name === "string" ? CURRENT_ORG_UNITS.get(name.trim()) || null : null;
}

module.exports = {
  ACTIVE_PATH, CURRENT_ORG_VERSION, CURRENT_ORG_UNITS, CURRENT_DEPARTMENTS,
  loadCurrentDepartments, isCurrentDepartment, getCurrentOrganization,
};
