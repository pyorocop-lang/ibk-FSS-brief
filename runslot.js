"use strict";
/**
 * runslot.js — 런 슬롯(am/pm) 경로 결정 공용 헬퍼
 *
 * 원칙(절대): 오전(06:00)·오후(16:00) 및 재실행은 각각 독립·공존하는 기록이다.
 *   한 런이 다른 런의 산출물을 덮어쓰면 안 된다(감사 추적성). 따라서 보고서 산출물은
 *   reports/{YYYYMMDD}/{slot}/ 하위에 슬롯별로 분리 저장한다.
 *
 * 슬롯 결정 우선순위: CLI `--slot` → 환경변수 RUN_SLOT → KST 시각 추론(<12=am, ≥12=pm).
 */
const path = require("path");
const fs   = require("fs");

// 슬롯 문자열(am|pm) 결정
function resolveSlot(argv) {
  argv = argv || process.argv.slice(2);
  const i = argv.indexOf("--slot");
  let slot = (i >= 0 && argv[i + 1]) ? argv[i + 1] : (process.env.RUN_SLOT || "");
  slot = String(slot).trim().toLowerCase();
  if (slot !== "am" && slot !== "pm") {
    const kstHour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
    slot = kstHour < 12 ? "am" : "pm";
  }
  return slot;
}

// 산출물 라벨: am→morning, pm→afternoon (docx 파일명·표기용)
function slotLabel(slot) {
  return slot === "pm" ? "afternoon" : "morning";
}

// 런별 산출물 디렉터리: reports/{date}/{slot}
function reportDir(root, dateCode, slot) {
  slot = slot || resolveSlot();
  return path.join(root, "reports", dateCode, slot);
}

// 보고서 docx 파일명: {date}_{morning|afternoon}_brief.docx
function reportDocxName(dateCode, slot) {
  return `${dateCode}_${slotLabel(slot)}_brief.docx`;
}

// 과거(전일 이전) 최신 crawl_result.json '파일경로' 1개 반환.
//   슬롯폴더(pm 우선 → am)와 레거시 평탄(reports/{date}/crawl_result.json)을 모두 탐색한다.
//   (슬롯 도입 이전 기록과의 호환을 위해 평탄 경로도 후보에 포함)
function findPreviousCrawlFile(root, currentDateCode) {
  const reportsDir = path.join(root, "reports");
  if (!fs.existsSync(reportsDir)) return null;
  let dates;
  try {
    dates = fs.readdirSync(reportsDir)
      .filter(d => /^\d{8}$/.test(d) && d < currentDateCode)
      .sort().reverse();
  } catch (e) { return null; }
  for (const d of dates) {
    const dayDir = path.join(reportsDir, d);
    const candidates = [
      path.join(dayDir, "pm", "crawl_result.json"),
      path.join(dayDir, "am", "crawl_result.json"),
      path.join(dayDir, "crawl_result.json"), // legacy 평탄 구조
    ];
    for (const f of candidates) {
      if (fs.existsSync(f)) return f;
    }
  }
  return null;
}

module.exports = { resolveSlot, slotLabel, reportDir, reportDocxName, findPreviousCrawlFile };
