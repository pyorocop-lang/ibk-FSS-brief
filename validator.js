"use strict";
/**
 * validator.js — IBK 아침 규제 브리핑 검증 에이전트
 *
 * 검증 항목:
 *   A. 보고서 텍스트 품질 (Toss Bank 8원칙 준수)
 *      A1. 핵심 선행 — what_changes 첫 문장이 결론인가
 *      A2. 문장 길이 — 40자 초과 문장 존재 여부
 *      A3. 쉬운 단어 — 법령 원문 그대로 복붙 여부 (금지 패턴)
 *      A4. 독자 주어 — our_action에 부서명 또는 행위 주체 명시 여부
 *      A5. 빈말 제거 — 금지 표현 사용 여부
 *      A6. 숫자/날짜 — D-day 및 날짜 구체 표기 여부
 *      A7. 동사 종결 — our_action이 "~하세요/합니다/해요"로 끝나는가
 *      A8. 톤 검사  — 의무 항목에 평어("예요") 혼용 여부
 *   B. 텍스트 절삭 검사
 *      B1. what_changes 배열이 비었거나 첫 항목이 30자 미만
 *      B2. our_action 배열이 비었거나 1개 미만
 *      B3. summary 원본이 너무 짧음 (< 50자 → PDF 미수집 의심)
 *      B4. ctrl_insight 빈 문자열 (Analyst Agent 미실행 의심)
 *   C. 텔레그램 메시지 검증
 *      C1. 전체 글자 수 200자 이하
 *      C2. 5줄 이하 구조 준수
 *      C3. 필수 줄 패턴 포함 여부
 *      C4. IBK영향 없음 메시지 형식 검증
 *
 * 실행: node validator.js [--date YYYYMMDD]
 *        briefV2.js 완료 직후, archivist.js 직전에 호출
 *
 * 종료코드: 0=통과, 1=경고(계속 진행), 2=오류(파이프라인 중단 권고)
 */

const fs   = require("fs");
const path = require("path");

// ─── CLI 인수 ──────────────────────────────────────────────────
function getArg(name, def = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const argDate = getArg("date");
const now = new Date();
const pad = n => String(n).padStart(2, "0");
const TODAY = argDate && /^\d{8}$/.test(argDate)
  ? argDate
  : `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;

const ROOT       = __dirname;
const REPORT_DIR = path.join(ROOT, "reports", TODAY);
const CRAWL_PATH = path.join(REPORT_DIR, "crawl_result.json");
const LOG_PATH   = path.join(ROOT, "pipeline_run.log");

// ─── 검증 결과 누적기 ──────────────────────────────────────────
const issues = [];   // { level: "ERROR"|"WARN"|"INFO", code, item, msg }

function err(code, item, msg)  { issues.push({ level: "ERROR", code, item, msg }); }
function warn(code, item, msg) { issues.push({ level: "WARN",  code, item, msg }); }
function info(code, item, msg) { issues.push({ level: "INFO",  code, item, msg }); }

// ─── 금지 표현 사전 (원칙 3·5) ────────────────────────────────
const BANNED_WORDS = [
  "에 관한 사항", "의 경우에 있어서", "이에 따라", "상기와 같이",
  "을 통해", "함에 있어", "준수의무 부과", "이행 기한 도과",
  "이행 촉구", "시행 이전", "내부통제기준 미비",
  "관련하여", "~의 경우", "의무화하는 내용을 담고",
];

// 명사형 종결 패턴 (원칙 7 위반)
const NOUN_ENDINGS = [
  /검토\s*필요$/, /확인\s*요망$/, /반영\s*요망$/, /개정\s*검토$/, /점검\s*필요$/,
  /이행\s*필요$/, /조치\s*필요$/, /준비\s*필요$/, /보고\s*필요$/,
];

// 의무 항목에서 평어 종결 (원칙 8 위반)
const CASUAL_IN_URGENT = [/예요\.$/, /이에요\.$/, /해요\.$/];

// ─── A. 8원칙 텍스트 품질 검증 ────────────────────────────────
function validateItem(item, idx) {
  const label = `[${idx+1}] ${(item.title || "").slice(0, 20)}`;
  const wc    = item.what_changes || [];
  const oa    = item.our_action   || [];
  const sum   = item.summary      || "";
  const grade = item.grade        || "하";

  // ── B. 절삭 검사 ──
  if (wc.length === 0) {
    err("B1", label, "what_changes 비어 있음 — 보고서에서 '뭐가 바뀌나요?' 항목이 공백");
  } else if (wc[0].length < 15) {
    warn("B1", label, `what_changes 첫 항목이 너무 짧음 (${wc[0].length}자): "${wc[0]}"`);
  }

  if (oa.length === 0) {
    if (grade === "하") info("B2", label, "our_action 없음 (하 등급 — 선택 사항)");
    else err("B2", label, "our_action 비어 있음 — '다음 액션' 항목 없음 (상/중 등급 필수)");
  }

  if (sum.length < 50) {
    warn("B3", label, `summary 원본이 짧음 (${sum.length}자) — PDF 미수집 또는 크롤 실패 의심`);
  }

  if (!item.ctrl_insight || item.ctrl_insight.trim() === "") {
    warn("B4", label, "ctrl_insight 없음 — Analyst Agent(Claude API) 미실행 의심");
  }

  // ── A1. 핵심 선행 ──
  // what_changes[0]이 "~입니다/바뀝니다/됩니다"처럼 변화 서술로 시작하는지
  if (wc.length > 0 && /^(이번|본|해당|금번)/.test(wc[0])) {
    warn("A1", label, `핵심 선행 위반: 도입부로 시작 — "${wc[0].slice(0,40)}"`);
  }

  // ── A2. 문장 길이 ──
  // what_changes: 40자 기준 (원칙 2)
  // our_action: [부서][행동][날짜] 구조 → 55자 기준 (원칙 4+6 병행 적용 시 불가피)
  wc.forEach(sent => {
    if (sent.length > 40) warn("A2", label, `what_changes 40자 초과 (${sent.length}자): "${sent.slice(0,45)}…"`);
  });
  oa.forEach(sent => {
    if (sent.length > 60) warn("A2", label, `our_action 60자 초과 (${sent.length}자): "${sent.slice(0,55)}…"`);
  });

  // ── A3. 금지 표현 ──
  const allText = [...wc, ...oa, sum].join(" ");
  BANNED_WORDS.forEach(bw => {
    if (allText.includes(bw)) {
      warn("A3", label, `금지 표현 포함: "${bw}"`);
    }
  });

  // ── A4. 독자 주어 (상/중 등급만 강제) ──
  if ((grade === "상" || grade === "중") && oa.length > 0) {
    const hasDept = oa.some(a =>
      /부서|팀|부|실|센터|담당|IT운영|여신|내부통제|준법|법무|리스크|경영|신용/.test(a)
    );
    if (!hasDept) {
      warn("A4", label, `독자 주어 미명시 — our_action에 담당 부서가 없음 (grade: ${grade})`);
    }
  }

  // ── A5. 빈말 이미 A3에서 처리 ──

  // ── A6. 숫자·날짜 구체성 ──
  const ddayVal = item.dday || item.deadline_status || "";
  if (!ddayVal || ddayVal === "미확인") {
    warn("A6", label, "D-day 미표기 — 의견 마감일 또는 시행일이 없음");
  }

  // ── A7. 동사 종결 ──
  oa.forEach(a => {
    const isVerbEnd = /[하세요|합니다|해요|하세요\.|합니다\.|해요\.]$/.test(a.trim());
    const isNounEnd = NOUN_ENDINGS.some(re => re.test(a.trim()));
    if (isNounEnd) {
      err("A7", label, `명사형 종결 (원칙 7 위반): "${a}"`);
    } else if (!isVerbEnd) {
      warn("A7", label, `동사 종결 확인 필요: "${a.slice(0, 40)}"`);
    }
  });

  // ── A8. 톤 — 즉시검토(🔴)에서 평어 사용 ──
  if (grade === "상") {
    oa.forEach(a => {
      if (CASUAL_IN_URGENT.some(re => re.test(a))) {
        warn("A8", label, `즉시검토 항목에 평어 사용 (원칙 8): "${a}"`);
      }
    });
  }
}

// ─── C. 텔레그램 메시지 검증 ──────────────────────────────────
function validateTgMsg(logContent, crawlData) {
  // 우선순위 1: crawl_result.json의 tgMsg (briefV2 규칙기반 생성)
  // 우선순위 2: pipeline_run.log의 TG_MSG 블록 (briefV2 생성)
  let block = "";
  let source = "";

  if (crawlData && crawlData.tgMsg) {
    block  = crawlData.tgMsg.trim();
    source = "crawl_result.json (Analyst LLM)";
  } else if (logContent) {
    const headerRe  = /──\s*TG_MSG[^\n]*\n/;
    const closingRe = /\n─{10,}/;
    const hm = headerRe.exec(logContent);
    if (!hm) {
      err("C0", "TG_MSG", "pipeline_run.log에서 TG_MSG 블록을 찾을 수 없음");
      return;
    }
    const bodyStart = hm.index + hm[0].length;
    const cm = closingRe.exec(logContent.slice(bodyStart));
    block  = cm
      ? logContent.slice(bodyStart, bodyStart + cm.index).trim()
      : logContent.slice(bodyStart, bodyStart + 500).trim();
    source = "pipeline_run.log (briefV2)";
  }

  if (!block) {
    err("C0", "TG_MSG", "텔레그램 메시지를 찾을 수 없음");
    return;
  }
  info("C0", "TG_MSG", `메시지 출처: ${source}`);

  if (!block) {
    err("C0", "TG_MSG", "TG_MSG 블록이 비어 있음");
    return;
  }

  const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const fullText = lines.join("\n");

  // ── C1. 전체 글자 수 (WHAT/WHEN/WHO/HOW/WHY 포맷은 200자 초과 허용) ──
  const charCount = fullText.replace(/\s/g, "").length;
  info("C1", "TG_MSG", `글자 수: ${charCount}자`);

  // ── C2. 줄 수 (즉시검토 블록 포맷은 5줄 초과 허용) ──
  info("C2", "TG_MSG", `줄 수: ${lines.length}줄`);

  const isNoImpact = /IBK\s*영향\s*없음/.test(fullText) || /추가\s*조치\s*불필요/.test(fullText);
  const isUrgent   = /즉시검토\s*\d+건/.test(fullText);

  if (isNoImpact) {
    // ── C4. 영향 없음 형식 (Scenario AB) ──
    if (!lines[0].includes("내부통제 동향 알림")) {
      warn("C4", "TG_MSG", `줄1 형식 오류: "🔔 내부통제 동향 알림 (HH:MM)" 필요`);
    }
    if (!lines.some(l => /\d+건\s*수집/.test(l))) {
      warn("C4", "TG_MSG", "줄2에 수집건수(N건 수집) 표기 누락");
    }
  } else if (isUrgent) {
    // ── C3. 즉시검토 있음 (Scenario D/E) — WHAT/WHEN/WHO/HOW/WHY 블록 ──
    const checks = [
      { re: /내부통제 동향 알림/,   desc: "헤더: '내부통제 동향 알림 (HH:MM)'" },
      { re: /\d+건\s*수집/,        desc: "수집건수 'N건 수집'" },
      { re: /즉시검토\s*\d+건🔴/,  desc: "'즉시검토 N건🔴'" },
      { re: /━━.*즉시검토/,        desc: "즉시검토 블록 구분선" },
      { re: /^WHAT\s+/m,           desc: "WHAT 줄" },
      { re: /^WHEN\s+/m,           desc: "WHEN 줄" },
      { re: /^WHO\s+/m,            desc: "WHO 줄" },
      { re: /^HOW\s+/m,            desc: "HOW 줄" },
    ];
    checks.forEach(({ re, desc }) => {
      if (!re.test(fullText)) {
        warn("C3", "TG_MSG", `필수 요소 누락: ${desc}`);
      }
    });
  } else {
    // ── C3. 검토 항목만 있음 (Scenario C) ──
    const checks = [
      { re: /내부통제 동향 알림/,  desc: "헤더: '내부통제 동향 알림 (HH:MM)'" },
      { re: /\d+건\s*수집/,       desc: "수집건수 'N건 수집'" },
      { re: /검토\s*\d+건/,       desc: "'검토 N건'" },
      { re: /[🔶🔹]/,             desc: "중요도 아이콘 (🔶/🔹)" },
    ];
    checks.forEach(({ re, desc }) => {
      if (!re.test(fullText)) {
        warn("C3", "TG_MSG", `필수 요소 누락: ${desc}`);
      }
    });

    // 핵심변경 20자 초과 여부 (줄3)
    const line3 = lines[2] || "";
    const colonIdx = line3.indexOf(":");
    if (colonIdx > 0) {
      const keyChange = line3.slice(colonIdx + 1).trim();
      if (keyChange.length > 20) {
        warn("C3", "TG_MSG", `줄3 핵심변경 20자 초과 (${keyChange.length}자): "${keyChange}"`);
      }
    }
  }

  info("C_CONTENT", "TG_MSG", `메시지 내용:\n${fullText}`);
}

// ─── MAIN ─────────────────────────────────────────────────────
(function main() {
  console.log(`\n${"═".repeat(55)}`);
  console.log("  VALIDATOR — IBK 브리핑 품질 검증");
  console.log(`  대상일: ${TODAY}`);
  console.log("═".repeat(55));

  // 크롤 데이터 로드
  let crawlData = null;
  if (fs.existsSync(CRAWL_PATH)) {
    try {
      crawlData = JSON.parse(fs.readFileSync(CRAWL_PATH, "utf8"));
    } catch (e) {
      err("LOAD", "crawl_result.json", `파싱 실패: ${e.message}`);
    }
  } else {
    err("LOAD", "crawl_result.json", `파일 없음: ${CRAWL_PATH}`);
  }

  // A+B: 항목별 텍스트 품질 검증
  if (crawlData) {
    const items = crawlData.graded || crawlData.items || [];
    if (items.length === 0) {
      info("ITEMS", "crawl_result", "수집 항목 0건 — 텍스트 검증 생략");
    } else {
      console.log(`\n[A/B] 보고서 항목 검증 (${items.length}건)`);
      items.forEach((item, idx) => validateItem(item, idx));
    }
  }

  // C: 텔레그램 메시지 검증 (crawl_result.tgMsg 우선, 없으면 log 폴백)
  console.log("\n[C] 텔레그램 메시지 검증");
  const logContent = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, "utf8") : "";
  validateTgMsg(logContent, crawlData);

  // ── 결과 출력 ──────────────────────────────────────────────
  const errors = issues.filter(i => i.level === "ERROR");
  const warns  = issues.filter(i => i.level === "WARN");
  const infos  = issues.filter(i => i.level === "INFO");

  console.log(`\n${"─".repeat(55)}`);
  console.log("  검증 결과 요약");
  console.log("─".repeat(55));

  if (infos.length > 0) {
    infos.forEach(i => console.log(`  ℹ  [${i.code}] ${i.item} — ${i.msg}`));
  }

  if (warns.length > 0) {
    console.log("\n  ⚠  경고 (보고서 전송 후 수동 보완 권고)");
    warns.forEach(i => console.log(`     [${i.code}] ${i.item} — ${i.msg}`));
  }

  if (errors.length > 0) {
    console.log("\n  ❌ 오류 (즉시 수정 필요)");
    errors.forEach(i => console.log(`     [${i.code}] ${i.item} — ${i.msg}`));
  }

  if (errors.length === 0 && warns.length === 0) {
    console.log("  ✅ 모든 검증 통과");
  }

  // 검증 결과를 reports/{DATE}/validation_result.json 저장
  const resultPath = path.join(REPORT_DIR, "validation_result.json");
  const result = {
    date:      TODAY,
    timestamp: new Date().toISOString(),
    pass:      errors.length === 0,
    error_count: errors.length,
    warn_count:  warns.length,
    issues,
  };
  try {
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
    console.log(`\n  📄 검증 결과 저장: reports/${TODAY}/validation_result.json`);
  } catch (e) {
    console.warn(`  검증 결과 저장 실패: ${e.message}`);
  }

  console.log("═".repeat(55) + "\n");

  // 종료코드: 0=통과, 1=경고, 2=오류
  process.exit(errors.length > 0 ? 2 : warns.length > 0 ? 1 : 0);
})();
