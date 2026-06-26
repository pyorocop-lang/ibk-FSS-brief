"use strict";
/**
 * archivist.js — IBK 아침 규제 브리핑 감사 대응 아카이브 에이전트
 *
 * 역할:
 *  1. 실행 메타데이터 기록 (타임스탬프, 수집건수, 오류, 소요시간)
 *  2. 날짜별 로그 분리 저장 (logs/YYYYMMDD/pipeline.log)
 *  3. 보관 정책 적용 (raw JSON 30일, 보고서 90일, 로그 14일)
 *  4. 전체 실행 이력 매니페스트 갱신 (logs/run_manifest.jsonl)
 *  5. Word 임시 파일(~$) 자동 삭제
 *
 * 실행: node archivist.js [--date YYYYMMDD] [--status ok|error] [--duration 초]
 *        파이프라인 완료 직후 run_pipeline.vbs에서 호출
 */

const fs   = require("fs");
const path = require("path");

// ─── CLI 인수 파싱 ─────────────────────────────────────────────
function getArg(name, def = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const argDate     = getArg("date");
const argStatus   = getArg("status", "ok");     // ok | error
const argDuration = parseInt(getArg("duration", "0"), 10);
const argMsg      = getArg("msg", "");

// ─── 날짜 계산 ─────────────────────────────────────────────────
const now = new Date();
const pad = n => String(n).padStart(2, "0");
const TODAY = argDate && /^\d{8}$/.test(argDate)
  ? argDate
  : `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
const TIMESTAMP = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

const ROOT        = __dirname;
const REPORT_DIR  = path.join(ROOT, "reports", TODAY);
const LOGS_DIR    = path.join(ROOT, "logs", TODAY);
const MANIFEST    = path.join(ROOT, "logs", "run_manifest.jsonl");
const PIPELINE_LOG = path.join(ROOT, "pipeline_run.log");

// ─── 디렉토리 보장 ─────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── 1. 날짜별 로그 디렉토리 생성 및 로그 복사 ───────────────
function archivePipelineLog() {
  ensureDir(LOGS_DIR);
  const dest = path.join(LOGS_DIR, "pipeline.log");

  if (fs.existsSync(PIPELINE_LOG)) {
    try {
      const content = fs.readFileSync(PIPELINE_LOG, "utf8");
      // 헤더 주입 (감사 추적용)
      const header = [
        "═".repeat(60),
        `실행일시 : ${TIMESTAMP}`,
        `실행상태 : ${argStatus.toUpperCase()}`,
        `소요시간 : ${argDuration}초`,
        "═".repeat(60),
        "",
      ].join("\n");
      fs.writeFileSync(dest, header + content, "utf8");
      console.log(`[ARCHIVIST] 로그 저장: ${dest}`);
    } catch (e) {
      console.warn(`[ARCHIVIST] 로그 복사 실패: ${e.message}`);
    }
  } else {
    // 로그 파일이 없으면 메타만 기록
    const stub = `실행일시: ${TIMESTAMP}\n상태: ${argStatus}\n로그 파일 없음\n`;
    fs.writeFileSync(dest, stub, "utf8");
  }
}

// ─── 2. 실행 메타데이터 수집 ──────────────────────────────────
function buildMeta() {
  let crawlCount = 0, ibkCount = 0, urgentCount = 0, reportExists = false;

  const crawlPath = path.join(REPORT_DIR, "crawl_result.json");
  if (fs.existsSync(crawlPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(crawlPath, "utf8"));
      crawlCount  = data.total    || (data.items  || []).length;
      ibkCount    = data.ibkTotal || (data.graded || data.items || []).length;
      urgentCount = (data.graded  || data.items || []).filter(i => i.grade === "상").length;
    } catch (e) {}
  }

  const docxPath = path.join(REPORT_DIR, `${TODAY}_morning_brief.docx`);
  reportExists = fs.existsSync(docxPath);

  return {
    date:          TODAY,
    timestamp:     TIMESTAMP,
    status:        argStatus,
    duration_sec:  argDuration,
    crawl_total:   crawlCount,
    ibk_count:     ibkCount,
    urgent_count:  urgentCount,
    report_ok:     reportExists,
    error_msg:     argStatus === "error" ? argMsg : "",
  };
}

// ─── 3. 실행 이력 매니페스트 갱신 (JSONL 추가 방식) ──────────
function updateManifest(meta) {
  ensureDir(path.dirname(MANIFEST));
  const line = JSON.stringify(meta) + "\n";
  fs.appendFileSync(MANIFEST, line, "utf8");
  console.log(`[ARCHIVIST] 매니페스트 기록: ${MANIFEST}`);
}

// ─── 4. 실행 메타 JSON을 reports/{TODAY}/ 에도 저장 ──────────
function saveRunMeta(meta) {
  ensureDir(REPORT_DIR);
  const metaPath = path.join(REPORT_DIR, "run_meta.json");
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
  console.log(`[ARCHIVIST] 실행 메타 저장: ${metaPath}`);
}

// ─── 5. Word 임시 파일 정리 (~$*) ────────────────────────────
function cleanTempFiles() {
  let removed = 0;
  const reportsRoot = path.join(ROOT, "reports");
  if (!fs.existsSync(reportsRoot)) return;

  function walkAndClean(dir) {
    fs.readdirSync(dir).forEach(f => {
      const full = path.join(dir, f);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walkAndClean(full);
        } else if (f.startsWith("~$")) {
          fs.unlinkSync(full);
          console.log(`[ARCHIVIST] 임시파일 삭제: ${f}`);
          removed++;
        }
      } catch (e) {}
    });
  }
  walkAndClean(reportsRoot);
  if (removed === 0) console.log("[ARCHIVIST] 임시파일 없음");
}

// ─── 6. 보관 정책 적용 ────────────────────────────────────────
// raw JSON: 30일 초과 삭제
// 보고서 .docx: 90일 초과 삭제
// 로그: 14일 초과 삭제
function applyRetentionPolicy() {
  const msPerDay = 86400000;
  const cutoffs = {
    json:  new Date(Date.now() - 30 * msPerDay),
    docx:  new Date(Date.now() - 90 * msPerDay),
    log:   new Date(Date.now() - 14 * msPerDay),
  };

  // reports/{YYYYMMDD}/ 순회
  const reportsRoot = path.join(ROOT, "reports");
  if (fs.existsSync(reportsRoot)) {
    fs.readdirSync(reportsRoot)
      .filter(d => /^\d{8}$/.test(d))
      .forEach(d => {
        const dirDate = new Date(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8));
        const dirPath = path.join(reportsRoot, d);
        try {
          fs.readdirSync(dirPath).forEach(f => {
            const full = path.join(dirPath, f);
            if (f.endsWith(".json") && dirDate < cutoffs.json) {
              try { fs.unlinkSync(full); console.log(`[ARCHIVIST] 삭제(30일): ${f}`); } catch(e) {}
            } else if (f.endsWith(".docx") && dirDate < cutoffs.docx) {
              try { fs.unlinkSync(full); console.log(`[ARCHIVIST] 삭제(90일): ${f}`); } catch(e) {}
            }
          });
          // 폴더가 비었으면 삭제
          if (fs.readdirSync(dirPath).length === 0) {
            fs.rmdirSync(dirPath);
          }
        } catch(e) {}
      });
  }

  // logs/{YYYYMMDD}/ 순회
  const logsRoot = path.join(ROOT, "logs");
  if (fs.existsSync(logsRoot)) {
    fs.readdirSync(logsRoot)
      .filter(d => /^\d{8}$/.test(d))
      .forEach(d => {
        const dirDate = new Date(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8));
        if (dirDate < cutoffs.log) {
          const dirPath = path.join(logsRoot, d);
          try {
            fs.readdirSync(dirPath).forEach(f => {
              fs.unlinkSync(path.join(dirPath, f));
            });
            fs.rmdirSync(dirPath);
            console.log(`[ARCHIVIST] 로그 폴더 삭제(14일): ${d}`);
          } catch(e) {}
        }
      });
  }
}

// ─── 7. 디렉토리 구조 요약 출력 (감사 확인용) ────────────────
function printAuditSummary(meta) {
  console.log("\n" + "─".repeat(50));
  console.log("  ARCHIVIST 실행 요약");
  console.log("─".repeat(50));
  console.log(`  실행일시   : ${meta.timestamp}`);
  const statusLabel = meta.status === "ok" ? "✅ 정상" : meta.status === "warn" ? "⚠ 경고(검증 이슈)" : "❌ 오류";
  console.log(`  상태       : ${statusLabel}`);;
  console.log(`  소요시간   : ${meta.duration_sec}초`);
  console.log(`  수집건수   : 전체 ${meta.crawl_total}건 / IBK ${meta.ibk_count}건 / 긴급 ${meta.urgent_count}건`);
  console.log(`  보고서     : ${meta.report_ok ? "✅ 생성 완료" : "❌ 미생성"}`);
  console.log(`  로그위치   : logs/${TODAY}/pipeline.log`);
  console.log(`  메타위치   : reports/${TODAY}/run_meta.json`);
  if (meta.error_msg) console.log(`  오류내용   : ${meta.error_msg}`);
  console.log("─".repeat(50) + "\n");
}

// ─── MAIN ─────────────────────────────────────────────────────
(async function main() {
  console.log(`[ARCHIVIST] 시작 — ${TODAY} / 상태: ${argStatus}`);

  archivePipelineLog();
  const meta = buildMeta();
  saveRunMeta(meta);
  updateManifest(meta);
  cleanTempFiles();
  applyRetentionPolicy();
  printAuditSummary(meta);

  console.log("[ARCHIVIST] 완료");
})();
