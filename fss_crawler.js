"use strict";
/**
 * fss_crawler.js — 금융감독원(FSS) 제재공시 / 경영유의·개선사항 수집기
 *
 * 소스 (2종, 실제 HTML 실측 확정 — 하드코딩 없이 앵커 href에서 상세경로 추출):
 *   ① 제재공시:    https://www.fss.or.kr/fss/job/openInfo/list.do?menuNo=200476
 *      - "내용보기" = <a href> → view.do?...&examMgmtNo=&emOpenSeq=  (일반 링크. onclick/form/AJAX 아님)
 *      - 상세(view.do) = bd-view dl/dt/dd 메타(금융기관명·제재조치일·관련부서·기관/임원/직원 제재대상)
 *        + 본문 PDF 첨부(/fss.hpdownload?...제재내용 공개안.pdf)
 *      - dedup 키 = examMgmtNo + "_" + emOpenSeq
 *   ② 경영유의:    https://www.fss.or.kr/fss/job/openInfoImpr/list.do?menuNo=200483
 *      - "내용보기" = <a href> → 바로 PDF(/fss.hpdownload?...개선사항 공개안.pdf). 상세페이지 없음.
 *      - dedup 키 = 파일명 선두 ID (예: 202600082_11)
 *
 * 아키텍처 계약 (Daily-Morning-brief 최신 골격 준수):
 *   - require("./runslot") → 산출물 reports/{date}/{slot}/
 *   - 성공: crawl_result.json 작성 + state/seen_ids.json 갱신 + (있으면) failure_meta 삭제
 *   - 실패: failure_meta.json(error 필드)만 작성, 성공본 보존 (실패 격리)
 *   - raw HTML/PDF 증빙: reports/{date}/{slot}/raw/, /pdfs/ 저장
 *   - tgMsg/IBK 심층 연관분석은 analyst.js(STEP2) 담당. 본 수집기는 표준 JSON까지.
 *
 * 실행: node fss_crawler.js [--date YYYYMMDD] [--pages N]
 *
 * ※ FSS는 해외 IP 차단 없음 검증됨(diag-fss-access.yml) → KR 프록시/OPEN API 계층 없음(순수 스크래핑).
 */

const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");
const url   = require("url");
const { reportDir, findPreviousCrawlFile } = require("./runslot");

const HOST = "https://www.fss.or.kr";
const SOURCES = {
  sanction: { key: "제재공시",   menuNo: "200476", listPath: "/fss/job/openInfo/list.do" },
  mngimpr:  { key: "경영유의",   menuNo: "200483", listPath: "/fss/job/openInfoImpr/list.do" },
};

// ─────────────────────────────────────────────────────────────
// 중요도 판정 (PROJECT_BRIEF §6 — 제재 관점, 사후 벤치마킹)
//   제재대상 은행/유사업권(+2) · 사유가 IBK 핵심업무(+2) · 제재강도(+1) · IBK 직접(최상 "상")
// ─────────────────────────────────────────────────────────────
const IBK_SELF = ["기업은행", "IBK", "중소기업은행"];
const BANK_LIKE = [
  "은행", "금융지주", "지주회사", "저축은행", "증권", "보험", "카드", "캐피탈",
  "자산운용", "신탁", "종합금융", "상호저축", "농협", "수협", "신협", "새마을금고",
];
const CORE_BIZ = [   // 사유가 IBK 핵심업무 (여신·AML·내부통제·불완전판매·전자금융·정보보호 등)
  "여신", "대출", "신용공여", "자금세탁", "자금세탁방지", "특정금융거래", "의심거래", "고객확인", "KYC",
  "내부통제", "준법감시", "지배구조", "리스크관리", "위험관리",
  "불완전판매", "적합성", "적정성", "설명의무", "금융소비자", "부당권유",
  "전자금융", "전자금융거래", "정보보호", "개인정보", "신용정보", "정보유출",
  "금융실명", "실명확인", "대주주", "이해상충", "횡령", "배임", "부당대출",
];
const SANCTION_STRENGTH = [
  "과징금", "과태료", "기관경고", "기관주의", "영업정지", "업무정지", "인가취소",
  "직무정지", "문책경고", "감봉", "정직", "시정명령", "고발", "수사기관",
];

function hit(text, arr) { return arr.some(k => text.includes(k)); }

function scoreItem({ org, bodyText }) {
  const org_ = org || "";
  const body = (org_ + " " + (bodyText || ""));
  if (hit(org_, IBK_SELF)) return { score: 99, isIBK: true, bankTarget: true };  // IBK 직접 = 최상
  let score = 0;
  const bankTarget = hit(org_, BANK_LIKE);
  if (bankTarget) score += 2;
  if (hit(body, CORE_BIZ)) score += 2;
  if (hit(body, SANCTION_STRENGTH)) score += 1;
  return { score, isIBK: false, bankTarget };
}

function grade(score) {
  if (score >= 4) return "상";
  if (score >= 2) return "중";
  if (score >= 1) return "하";
  return null;
}

// ─────────────────────────────────────────────────────────────
// 제재대상 기관 계층 (Tier) — IBK 벤치마킹 관점 (knowledge/fss_tier_methodology.md)
//   T0 IBK 직접 / T1 은행(저축은행 제외) / T2 인접 금융업권 / T3 주변·비은행(환전·대부·GA 등)
//   알림 포함 = T0·T1·T2 전건, T3 제외 / 보고서 = 전건 포함. (2026-07-02 표준 방법론)
// ─────────────────────────────────────────────────────────────
function classifyTier(org) {
  const o = (org || "").replace(/\s/g, "");
  if (/기업은행|중소기업은행|IBK/i.test(o)) return "T0";
  if ((/은행/.test(o) && !/저축은행/.test(o)) || /카카오뱅크|토스뱅크|케이뱅크/.test(o)) return "T1";
  if (/저축은행|금융지주|금융복합기업집단|지주회사|생명보험|손해보험|화재해상|생명|화재|증권|자산운용|투자자문|투자일임|자산신탁|부동산신탁|신탁|카드|캐피탈|캐피털|여신전문|종합금융/.test(o)) return "T2";
  return "T3";  // 대부·환전영업소·소액송금·보험/금융 판매대리점(GA)·에셋·금융서비스·P2P·크라우드펀딩·조합 등
}
const TIER_LABEL = { T0: "IBK직접", T1: "은행", T2: "인접금융", T3: "주변" };

// ─────────────────────────────────────────────────────────────
// HTTP GET (리다이렉트 최대 3회, timeout 60초 — 해외 러너 대응)
// ─────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(targetUrl, redirectCount = 0, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) return reject(new Error("Too many redirects"));
    const parsed = new url.URL(targetUrl);
    const mod = parsed.protocol === "https:" ? https : http;
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      timeout: timeoutMs,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
        "Accept-Encoding": "identity",
        "Referer": HOST,
      },
    };
    const req = mod.request(opts, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
        return httpGet(next, redirectCount + 1, timeoutMs).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });
}

async function httpGetWithRetry(targetUrl, maxRetry = 3) {
  for (let i = 0; i < maxRetry; i++) {
    try { return await httpGet(targetUrl); }
    catch (e) {
      if (i === maxRetry - 1) throw e;
      console.warn(`  [재시도 ${i + 1}/${maxRetry}] ${e.message} — 3초 후...`);
      await sleep(3000);
    }
  }
}

// Binary GET (PDF) — timeout 60초
function httpGetBinary(targetUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) return reject(new Error("Too many redirects"));
    const parsed = new url.URL(targetUrl);
    const mod = parsed.protocol === "https:" ? https : http;
    const opts = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: "GET", timeout: 60000,
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/pdf,*/*", "Accept-Encoding": "identity", "Referer": HOST },
    };
    const req = mod.request(opts, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith("http") ? res.headers.location
          : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
        return httpGetBinary(next, redirectCount + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), contentType: res.headers["content-type"] || "" }));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });
}

function decodeEntities(s) { return (s || "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').trim(); }
function stripTags(html) { return (html || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim(); }
function normDate(s) { const m = (s || "").match(/(\d{4})[.\-]?(\d{2})[.\-]?(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : (s || ""); }
function absUrl(href) { const h = decodeEntities(href); return h.startsWith("http") ? h : HOST + h; }

// 첨부 PDF 다운로드 + 텍스트 추출(pdf-parse). 원문은 savePath에 저장(감사 증빙).
async function fetchPdf(pdfUrl, savePath) {
  let pdfParse;
  try { pdfParse = require("pdf-parse"); }
  catch (e) { console.warn("  [PDF] pdf-parse 미설치 — 본문 추출 생략"); return { text: null, saved: false }; }
  try {
    await sleep(600);
    const res = await httpGetBinary(pdfUrl);
    if (res.status !== 200 || res.body.length < 500) { console.warn(`  [PDF] 응답 이상 status=${res.status} size=${res.body.length}`); return { text: null, saved: false }; }
    if (res.body.slice(0, 4).toString("ascii") !== "%PDF") { console.warn("  [PDF] %PDF 아님 — 건너뜀"); return { text: null, saved: false }; }
    if (res.body.length > 10 * 1024 * 1024) { console.warn(`  [PDF] 크기 초과 ${(res.body.length/1048576).toFixed(1)}MB`); }
    let saved = false;
    if (savePath) {
      try { fs.mkdirSync(path.dirname(savePath), { recursive: true }); fs.writeFileSync(savePath, res.body); saved = true; }
      catch (e) { console.warn(`  [PDF] 저장 실패: ${e.message}`); }
    }
    const data = await pdfParse(res.body, { max: 15 });
    const text = data.text.replace(/\s+/g, " ").trim();
    console.log(`  [PDF] 텍스트 ${text.length}자 / ${data.numpages}p ${saved ? "· 원문 저장" : ""}`);
    return { text: text.length > 30 ? text : null, saved };
  } catch (e) { console.warn(`  [PDF] 오류: ${e.message}`); return { text: null, saved: false }; }
}

// ── 목록 파서 (공용) ──────────────────────────────────────────
//   tbody의 각 <tr>에서 셀 + "내용보기" 앵커 href를 추출한다. 상세 경로는 href 그대로 사용(추정 금지).
function parseListRows(html) {
  const tb = html.match(/<tbody[\s\S]*?<\/tbody>/i);
  if (!tb) return [];
  const rows = tb[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  return rows.map(tr => {
    const cells = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(td => stripTags(td));
    const a = tr.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    return { cells, href: a ? decodeEntities(a[1]) : null, anchorText: a ? stripTags(a[2]) : "" };
  }).filter(r => r.href);   // 내용보기 앵커 있는 행만
}

// ── 제재공시 상세 파서 (bd-view dl/dt/dd + 첨부 PDF) ──────────
function parseSanctionDetail(html) {
  const bd = html.match(/class="bd-view"[\s\S]*?(?=<\/section>|<footer|$)/i);
  const scope = bd ? bd[0] : html;
  const meta = {};
  const dl = scope.match(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi) || [];
  for (const pair of dl) {
    const m = pair.match(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i);
    if (m) { const k = stripTags(m[1]); const v = stripTags(m[2]); if (k) meta[k] = v; }
  }
  const attachments = [];
  const re = /href="([^"]*fss\.hpdownload[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let a;
  while ((a = re.exec(scope)) !== null) attachments.push({ url: absUrl(a[1]), name: stripTags(a[2]) });
  return { meta, attachments };
}

// ── 파일명 선두 ID 추출 (경영유의 dedup 키) ─────────────────
function fileIdFromHpdownload(href) {
  const m = decodeEntities(href).match(/file=([^&]+)/i);
  if (!m) return null;
  const fname = decodeURIComponent(m[1]);
  const id = fname.match(/^(\d+_\d+)/);   // 예: 202600082_11
  return id ? id[1] : fname.slice(0, 40);
}

// ── 게시일 커트오프 (고정 앵커) ──────────────────────────────
//   "신규"의 기준을 레저 부재만이 아니라 FSS 실제 게시일(postDate)로 앵커링한다.
//   게시일 ≥ REPORT_SINCE 인 건만 보고(newItems/graded). 그 이전 게시분은 '백로그' —
//   레저에만 등록해 재검토를 막고 알림·보고에선 완전 제외한다(레저는 중복방지 보조).
//   근거: FSS 목록엔 과거 공시가 누적 노출돼, 레저 부재만으론 오래된 공시가 '신규'로 샜다
//   (총평단 2026-07-03 지적: 게시일 7/2·6/26 건이 당일 신규로 오인 보고). env로 재정의 가능.
const REPORT_SINCE = (process.env.REPORT_SINCE || "2026-07-03").trim();

// ── seen_ids ledger ─────────────────────────────────────────
const LEDGER_PATH = path.join(__dirname, "state", "seen_ids.json");
function loadLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")); }
  catch (e) { return { version: 1, updatedAt: null, openInfo: {}, openInfoImpr: {} }; }
}
function saveLedger(led) {
  led.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(led, null, 2), "utf8");
}

// ── 소스별 수집 ─────────────────────────────────────────────
async function collectSanctions(result, ledger, rawDir, pdfDir, maxPages, seedMode) {
  const src = SOURCES.sanction;
  const ledMap = ledger.openInfo;
  for (let page = 1; page <= maxPages; page++) {
    const listUrl = `${HOST}${src.listPath}?menuNo=${src.menuNo}&pageIndex=${page}`;
    const res = await httpGetWithRetry(listUrl);
    if (res.status !== 200) throw new Error(`제재공시 목록 HTTP ${res.status} (p${page})`);
    fs.writeFileSync(path.join(rawDir, `sanction_list_p${page}.html`), res.body, "utf8");
    const rows = parseListRows(res.body);
    if (rows.length === 0) break;
    result.totalFetched += rows.length;

    for (const row of rows) {
      // 셀: [번호, 금융기관명, 게시일, 내용보기(앵커), 관련부서, 조회수]
      const org = row.cells[1] || "";
      const postDate = normDate(row.cells[2] || "");
      const dept = row.cells[4] || "";
      const q = new url.URL(absUrl(row.href));
      const examMgmtNo = q.searchParams.get("examMgmtNo") || "";
      const emOpenSeq = q.searchParams.get("emOpenSeq") || "";
      const key = `${examMgmtNo}_${emOpenSeq}`;
      if (!examMgmtNo) continue;

      const isNew = !ledMap[key];
      // 상세 파싱 + PDF는 신규 건만(부하·차단 경감). 기존 건은 목록 메타만 스킵.
      if (!isNew) continue;

      // 게시일 커트오프: 앵커 이전 게시분은 백로그 — 레저에만 등록하고 상세수집·보고를 완전 건너뛴다.
      //   게시일 파싱 실패(빈값)는 fail-open(보고)해 파싱 글리치로 실제 건을 놓치지 않는다.
      if (postDate && postDate < REPORT_SINCE) {
        ledMap[key] = { seenDate: result.dateCode, org, title: "", backlog: true };
        result.backlogSkipped++;
        continue;
      }

      await sleep(1000);
      let meta = {}, attachments = [], bodyText = null;
      try {
        const dv = await httpGetWithRetry(absUrl(row.href));
        fs.writeFileSync(path.join(rawDir, `sanction_detail_${key}.html`), dv.body, "utf8");
        const parsed = parseSanctionDetail(dv.body);
        meta = parsed.meta; attachments = parsed.attachments;
        const pdf = attachments.find(x => /\.pdf/i.test(x.url));
        if (pdf) {
          const safe = (pdf.name || key).replace(/\.pdf$/i, "").replace(/[^\w가-힣.\- ]/g, "").trim().slice(0, 60);
          const r = await fetchPdf(pdf.url, path.join(pdfDir, `${key}_${safe || "doc"}.pdf`));
          bodyText = r.text;
        }
      } catch (e) { console.warn(`  ✗ 제재 상세 실패 ${key}: ${e.message}`); }

      const actionDate = normDate(meta["제재조치일"] || "");
      const entry = {
        key, source: src.key, org: meta["금융기관명"] || org,
        postDate, actionDate, dept: meta["관련부서"] || dept,
        sanctionTargets: {
          기관: meta["기관 제재대상"] || "", 임원: meta["임원 제재대상"] || "", 직원: meta["직원 제재대상"] || "",
        },
        attachments, bodyText: bodyText ? bodyText.slice(0, 4000) : null,
        detailUrl: absUrl(row.href),
        url: absUrl(row.href),
        examMgmtNo, emOpenSeq,
      };
      const sc = scoreItem(entry);
      entry.grade = grade(sc.score); entry.score = sc.score; entry.isIBK = sc.isIBK; entry.bankTarget = sc.bankTarget;
      entry.tier = classifyTier(entry.org); entry.tierLabel = TIER_LABEL[entry.tier];

      result.items.push(entry);   // items = 이번 실행 신규 원본(기록·감사용). seed모드에선 과거 베이스라인.
      if (!seedMode) {
        // graded/newGraded는 '보고 대상' — seed(최초)에선 비워 과거건 범람 방지. items·ledger엔 남겨 재알림만 차단.
        result.newItems.push(entry);
        if (entry.grade) { result.graded.push(entry); result.newGraded.push(entry); }
      }
      ledMap[key] = { seenDate: result.dateCode, org: entry.org, title: entry.sanctionTargets.기관.slice(0, 40) };
      console.log(`  ${entry.grade ? "["+entry.grade+"]" : "[-]"} 제재 ${entry.org} (${key})`);
    }
  }
}

async function collectMngImpr(result, ledger, rawDir, pdfDir, maxPages, seedMode) {
  const src = SOURCES.mngimpr;
  const ledMap = ledger.openInfoImpr;
  for (let page = 1; page <= maxPages; page++) {
    const listUrl = `${HOST}${src.listPath}?menuNo=${src.menuNo}&pageIndex=${page}`;
    const res = await httpGetWithRetry(listUrl);
    if (res.status !== 200) throw new Error(`경영유의 목록 HTTP ${res.status} (p${page})`);
    fs.writeFileSync(path.join(rawDir, `mngimpr_list_p${page}.html`), res.body, "utf8");
    const rows = parseListRows(res.body);
    if (rows.length === 0) break;
    result.totalFetched += rows.length;

    for (const row of rows) {
      // 셀: [번호, 대상기관, 게시일, 내용보기(PDF앵커), 담당부서]. href=바로 PDF.
      const org = row.cells[1] || "";
      const postDate = normDate(row.cells[2] || "");
      const dept = row.cells[4] || row.cells[3] || "";
      const key = fileIdFromHpdownload(row.href);
      if (!key) continue;
      const isNew = !ledMap[key];
      if (!isNew) continue;

      // 게시일 커트오프: 앵커 이전 게시분은 백로그 — 레저에만 등록하고 PDF수집·보고를 완전 건너뛴다.
      //   게시일 파싱 실패(빈값)는 fail-open(보고).
      if (postDate && postDate < REPORT_SINCE) {
        ledMap[key] = { seenDate: result.dateCode, org, title: "", backlog: true };
        result.backlogSkipped++;
        continue;
      }

      const pdfUrl = absUrl(row.href);
      const safe = org.replace(/[^\w가-힣.\- ]/g, "").trim().slice(0, 40);
      let bodyText = null;
      try {
        const r = await fetchPdf(pdfUrl, path.join(pdfDir, `${key}_${safe || "doc"}.pdf`));
        bodyText = r.text;
      } catch (e) { console.warn(`  ✗ 경영유의 PDF 실패 ${key}: ${e.message}`); }

      const entry = {
        key, source: src.key, org, postDate, actionDate: "", dept,
        sanctionTargets: null,
        attachments: [{ url: pdfUrl, name: decodeURIComponent((row.href.match(/file=([^&]+)/) || [,""])[1]) }],
        bodyText: bodyText ? bodyText.slice(0, 4000) : null,
        detailUrl: null, url: pdfUrl,
      };
      const sc = scoreItem(entry);
      entry.grade = grade(sc.score); entry.score = sc.score; entry.isIBK = sc.isIBK; entry.bankTarget = sc.bankTarget;
      entry.tier = classifyTier(entry.org); entry.tierLabel = TIER_LABEL[entry.tier];

      result.items.push(entry);   // items = 이번 실행 신규 원본(기록·감사용). seed모드에선 과거 베이스라인.
      if (!seedMode) {
        // graded/newGraded는 '보고 대상' — seed(최초)에선 비워 과거건 범람 방지. items·ledger엔 남겨 재알림만 차단.
        result.newItems.push(entry);
        if (entry.grade) { result.graded.push(entry); result.newGraded.push(entry); }
      }
      ledMap[key] = { seenDate: result.dateCode, org, title: "" };
      console.log(`  ${entry.grade ? "["+entry.grade+"]" : "[-]"} 경영유의 ${org} (${key})`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────
async function main() {
  const argIdx = process.argv.indexOf("--date");
  const argDate = argIdx >= 0 ? process.argv[argIdx + 1] : null;
  const pgIdx = process.argv.indexOf("--pages");
  const maxPages = pgIdx >= 0 ? Math.max(1, parseInt(process.argv[pgIdx + 1]) || 2) : 2;

  const base = (argDate && /^\d{8}$/.test(argDate))
    ? new Date(+argDate.slice(0, 4), +argDate.slice(4, 6) - 1, +argDate.slice(6, 8))
    : new Date();
  const dateCode = `${base.getFullYear()}${String(base.getMonth() + 1).padStart(2, "0")}${String(base.getDate()).padStart(2, "0")}`;

  const outDir = reportDir(__dirname, dateCode);
  const rawDir = path.join(outDir, "raw");
  const pdfDir = path.join(outDir, "pdfs");
  [outDir, rawDir, pdfDir].forEach(d => fs.mkdirSync(d, { recursive: true }));
  const outFile = path.join(outDir, "crawl_result.json");
  const failFile = path.join(outDir, "failure_meta.json");

  const ledger = loadLedger();
  // 최초 실행(레저 비었음) = 베이스라인 시드: 과거건 대량 알림 방지(신규로 안 뱉고 레저만 채움).
  const seedMode = Object.keys(ledger.openInfo).length === 0 && Object.keys(ledger.openInfoImpr).length === 0;

  const result = {
    dateCode, crawledAt: new Date().toISOString(),
    source: "FSS 제재공시(openInfo) + 경영유의(openInfoImpr) 스크래핑",
    collectMode: "scrape",
    ledgerSeeded: seedMode,
    totalFetched: 0,
    items: [], graded: [], newItems: [], newGraded: [],
    backlogSkipped: 0,   // 게시일 앵커(REPORT_SINCE) 이전 백로그 — 레저 등록·보고 제외 건수
    reportSince: REPORT_SINCE,
    noUpdate: false, error: null,
  };

  console.log(`[FSS 크롤러] ${dateCode} 수집 시작 (pages=${maxPages}${seedMode ? ", 최초 시드모드" : ""})`);

  try {
    await collectSanctions(result, ledger, rawDir, pdfDir, maxPages, seedMode);
    await collectMngImpr(result, ledger, rawDir, pdfDir, maxPages, seedMode);

    result.noUpdate = !seedMode && result.newGraded.length === 0 && result.newItems.length === 0;
    console.log(`[FSS 크롤러] 완료 — 신규 ${result.newItems.length}건(IBK관련 ${result.newGraded.length}) / 백로그 제외 ${result.backlogSkipped}건(게시일<${REPORT_SINCE}) / 누적수집 ${result.totalFetched}`);
    if (result.noUpdate) console.log(`[FSS 크롤러] ✅ 신규 없음 (noUpdate=true)`);
  } catch (e) {
    result.error = e.message;
    console.error(`[FSS 크롤러] 수집 실패: ${e.message}`);
  }

  // 실패 격리: 실패 시 failure_meta만, 성공본·레저 안 건드림.
  if (result.error) {
    fs.writeFileSync(failFile, JSON.stringify({
      dateCode, crawledAt: result.crawledAt, source: result.source,
      totalFetched: result.totalFetched, error: result.error,
    }, null, 2), "utf8");
    console.error(`[FSS 크롤러] 실패 격리 기록: ${failFile}`);
    process.exit(1);
  } else {
    saveLedger(ledger);                       // 성공 시에만 dedup 상태 지속
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
    try { if (fs.existsSync(failFile)) fs.unlinkSync(failFile); } catch (e) {}
    console.log(`[FSS 크롤러] 저장: ${outFile} · ledger 갱신`);
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = {
  scoreItem, grade, parseListRows, parseSanctionDetail, fileIdFromHpdownload,
  normDate, decodeEntities, stripTags, absUrl,
};
