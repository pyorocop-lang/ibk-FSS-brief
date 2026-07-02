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
 *        GitHub Actions 워크플로우(daily-brief.yml) STEP5에서 호출
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
const { reportDir, reportDocxName, resolveSlot } = require("./runslot");
const REPORT_SLOT = resolveSlot();            // D6: 슬롯 확정(am/pm) — docx 파일명·경로 일치용
const REPORT_DIR  = reportDir(ROOT, TODAY, REPORT_SLOT);   // reports/{date}/{slot} — 런별 분리 보존
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
  let errMsg = argStatus === "error" ? argMsg : "";

  // 실패 결과 격리(Codex): 실패 run은 crawl_result.json(성공본)을 덮지 않으므로,
  //   error 상태에서 이전 성공본의 카운트를 잘못 집계하지 않도록 0으로 둔다.
  //   실패 원인은 격리 파일(failure_meta.json)에서 보강한다.
  if (argStatus !== "error") {
    const crawlPath = path.join(REPORT_DIR, "crawl_result.json");
    if (fs.existsSync(crawlPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(crawlPath, "utf8"));
        crawlCount  = data.total    || (data.items  || []).length;
        ibkCount    = data.ibkTotal || (data.graded || data.items || []).length;
        urgentCount = (data.graded  || data.items || []).filter(i => i.grade === "상").length;
      } catch (e) {}
    }
  } else {
    const failPath = path.join(REPORT_DIR, "failure_meta.json");
    if (fs.existsSync(failPath)) {
      try {
        const f = JSON.parse(fs.readFileSync(failPath, "utf8"));
        if (f.error && !errMsg) errMsg = f.error;
      } catch (e) {}
    }
  }

  const docxPath = path.join(REPORT_DIR, reportDocxName(TODAY, REPORT_SLOT));
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
    error_msg:     errMsg,
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
        // 슬롯 분리 보존(reports/{date}/{slot}/) + 레거시 평탄 파일을 함께 정리한다.
        //   날짜 폴더 직속 파일(레거시)과 한 단계 아래 슬롯 폴더 내 파일을 모두 대상.
        //   (pdfs 등 하위 폴더는 기존과 동일하게 보존정책 비대상)
        const purgeFile = (full, name) => {
          if (name.endsWith(".json") && dirDate < cutoffs.json) {
            try { fs.unlinkSync(full); console.log(`[ARCHIVIST] 삭제(30일): ${name}`); } catch(e) {}
          } else if (name.endsWith(".docx") && dirDate < cutoffs.docx) {
            try { fs.unlinkSync(full); console.log(`[ARCHIVIST] 삭제(90일): ${name}`); } catch(e) {}
          }
        };
        try {
          fs.readdirSync(dirPath).forEach(f => {
            const full = path.join(dirPath, f);
            let isDir = false;
            try { isDir = fs.statSync(full).isDirectory(); } catch(e) {}
            if (isDir) {
              try {
                fs.readdirSync(full).forEach(sf => purgeFile(path.join(full, sf), sf));
                if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);  // 빈 슬롯 폴더 정리
              } catch(e) {}
            } else {
              purgeFile(full, f);   // 레거시 평탄 파일
            }
          });
          // 날짜 폴더가 비었으면 삭제
          if (fs.readdirSync(dirPath).length === 0) fs.rmdirSync(dirPath);
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
