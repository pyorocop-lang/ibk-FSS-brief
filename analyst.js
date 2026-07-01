"use strict";
/**
 * analyst.js — FSS 제재사례 벤치마킹 분석 에이전트 (Claude Haiku)
 *
 * 역할: crawl_result.json의 각 (신규) 제재/경영유의 건을 LLM으로 분석해
 *   what_changes(제재 핵심) / ctrl_insight(IBK 유사업무+재발위험) / our_action(점검 제안) /
 *   dept·related_depts(IBK 부서) / risk_grade(RED/ORANGE/GREEN→상/중/하) / workflow_type(A~F) /
 *   tg_key / term 을 채운다. 시스템 프롬프트 = agents/analyst_system_prompt.md + knowledge/ 주입.
 *
 *   ★ 필드 이름은 DMB(briefV2) 구조 그대로 재사용 — 의미만 제재 도메인으로. briefV2 무수정.
 *   ★ 분석 대상은 crawler가 seen_ids로 걸러낸 '신규 건'뿐(graded) → 매 실행 소량. 재분석 없음(병목 구조 제거).
 *   ★ 소규모 병렬(CONCURRENCY)로 처리 — 직렬 병목 회피(단, Haiku RPM 여유 내).
 *
 * 실행: node analyst.js [--date YYYYMMDD]   (fss_crawler 직후, briefV2 직전)
 * API 키 미설정 시: fallback(키워드 템플릿) 모드. 종료코드 0=정상 / 1=fallback / 2=치명오류.
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

const ROOT          = __dirname;
const { reportDir } = require("./runslot");
const AGENTS_DIR    = path.join(ROOT, "agents");
const KNOWLEDGE_DIR = path.join(ROOT, "knowledge");
const API_KEY       = process.env.ANTHROPIC_API_KEY || "";
const MODEL         = process.env.ANALYST_MODEL || "claude-haiku-4-5-20251001";
const MAX_TOKENS    = 1024;
const CONCURRENCY   = 3;   // 신규 다건일 때 소규모 병렬(직렬 병목 회피). Haiku Tier1 50RPM 여유 내.

function getArg(name, def = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const pad = n => String(n).padStart(2, "0");
const TODAY = (() => {
  const d = getArg("date");
  if (d && /^\d{8}$/.test(d)) return d;
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
})();
const CRAWL_PATH = path.join(reportDir(ROOT, TODAY), "crawl_result.json");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function loadFile(dir, f) { try { return fs.readFileSync(path.join(dir, f), "utf8").trim() || null; } catch { return null; } }
// 주격조사 이/가 (받침 有→이, 無→가)
function josaGa(w) { const c = (w || "가").charCodeAt(w.length - 1); if (c < 0xAC00 || c > 0xD7A3) return w + "가"; return w + (((c - 0xAC00) % 28) ? "이" : "가"); }

// ─── 시스템 프롬프트 (agents/ + knowledge/ 동적 주입) ──────────
const BASE_PROMPT = loadFile(AGENTS_DIR, "analyst_system_prompt.md");
if (!BASE_PROMPT) { console.error("[ANALYST] 치명: agents/analyst_system_prompt.md 없음"); process.exit(2); }
const K_DEPT    = loadFile(KNOWLEDGE_DIR, "ibk-dept-mapping.md");
const K_ORG     = loadFile(KNOWLEDGE_DIR, "ibk_org_chart.md");
const K_MAPPING = loadFile(KNOWLEDGE_DIR, "ibk_mapping_rules.md");
const K_ACTION  = loadFile(KNOWLEDGE_DIR, "ibk_action_rules.md");
const SYSTEM_PROMPT = BASE_PROMPT
  + (K_DEPT    ? `\n\n---\n## [참조] IBK 부서 매핑 기준\n${K_DEPT}`    : "")
  + (K_ORG     ? `\n\n---\n## [참조] IBK 조직도\n${K_ORG}`             : "")
  + (K_MAPPING ? `\n\n---\n## [참조] 법령-내규 매핑 규칙\n${K_MAPPING}` : "")
  + (K_ACTION  ? `\n\n---\n## [참조] 부서별 대응 액션 기준\n${K_ACTION}` : "");

// ─── Claude API ───────────────────────────────────────────────
function callHaiku(userContent) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: "user", content: userContent }] });
    const req = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(body) },
      timeout: 40000,
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (data.error) { const e = new Error(data.error.message); e.statusCode = res.statusCode; return reject(e); }
          const text = data.content?.[0]?.text || "";
          const m = text.match(/\{[\s\S]*\}/);
          if (!m) return reject(new Error(`JSON 파싱 실패: ${text.slice(0, 80)}`));
          resolve(JSON.parse(m[0]));
        } catch (e) { reject(e); }
      });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("API timeout")); });
    req.on("error", reject);
    req.write(body); req.end();
  });
}

async function callHaikuWithRetry(userContent, maxRetries = 3) {
  let last;
  for (let a = 1; a <= maxRetries; a++) {
    try { return await callHaiku(userContent); }
    catch (e) {
      last = e; const code = e.statusCode || 0; const msg = e.message || "";
      const retry = /timeout|ECONNRESET|ETIMEDOUT/.test(msg) || [429, 529, 503, 502].includes(code);
      if (!retry || a === maxRetries) throw e;
      const w = 1000 * Math.pow(3, a - 1);
      console.warn(`  [ANALYST] 재시도 ${a}/${maxRetries} (${w / 1000}s): ${msg}`);
      await sleep(w);
    }
  }
  throw last;
}

// ─── 위반유형 A~F / 위험등급 (fallback·보정 공용) ───────────────
const WF = [
  ["A", /대주주|신용공여|특수관계인|출자|여신한도/],
  ["B", /적격투자자|불완전판매|고객확인|투자권유|적합성|적정성|설명의무/],
  ["C", /충실의무|이해상충|이해충돌|전결|자금집행|운용지시|편입|일임/],
  ["D", /겸직|모니터링|이상거래|사후관리|내부통제|준법감시/],
  ["E", /\bPF\b|브릿지|충당금|한도|고정이하|손실|건전성/],
  ["F", /광고|공시|오인|심의|표시/],
];
function classifyWorkflow(text) {
  const hits = WF.filter(([, re]) => re.test(text)).map(([k]) => k);
  return hits.length ? hits.join("+") : "";
}
function riskFromText(text, isIBK) {
  if (isIBK) return { grade: "상", basis: "IBK 직접 제재·언급" };
  if (/문책경고|직무정지|해임|정직|감봉|영업정지|업무정지|인가취소|등록취소|고발/.test(text))
    return { grade: "상", basis: "문책경고 이상/영업정지 등 중대 제재" };
  if (/경영유의|개선사항|기관경고|기관주의|과징금|과태료|시정명령/.test(text))
    return { grade: "중", basis: "경영유의/기관경고·주의/과징금 수준" };
  return { grade: "하", basis: "경미 또는 IBK 연관 약함" };
}

// ─── 부서 매핑 (fallback — IBK 키워드 트리, DMB analyst 재사용) ──
function fallbackDept(text) {
  if (/자금세탁|KYC|CDD|FIU|특금법|AML|의심거래/.test(text))       return { dept: "자금세탁방지부", related: ["준법지원부", "내부통제총괄부"] };
  if (/대출|여신|신용공여|LTV|DSR|보증|여신금리|대주주/.test(text)) return { dept: "여신기획부",     related: ["여신관리부", "기업개선부"] };
  if (/채권|추심|채무조정|신용회복|고정이하/.test(text))           return { dept: "여신관리부",     related: ["기업개선부"] };
  if (/신용정보|개인정보|마이데이터|정보유출/.test(text))          return { dept: "준법지원부",     related: ["IT내부통제부", "데이터혁신부"] };
  if (/전자금융|오픈뱅킹|IT보안|사이버|정보보호|전산/.test(text))   return { dept: "IT내부통제부",   related: ["정보보호총괄부"] };
  if (/불완전판매|적합성|적정성|설명의무|소비자|민원|투자권유/.test(text)) return { dept: "금융소비자보호부", related: ["금융소비자지원부"] };
  if (/펀드|신탁|WM|자산관리|일임|이해상충|충실의무|운용/.test(text)) return { dept: "자산관리사업부", related: ["신탁부", "WM사업부"] };
  if (/카드/.test(text))                                          return { dept: "카드사업부",     related: ["카드지원부"] };
  if (/지배구조|내부통제|준법|겸직|전결/.test(text))               return { dept: "내부통제총괄부", related: ["준법지원부", "감사부"] };
  return { dept: "내부통제총괄부", related: ["준법지원부"] };
}

function fallbackAnalyze(item) {
  const body = `${item.org || ""} ${item.bodyText || ""}`;
  const isMngImpr = item.source === "경영유의";
  const { dept, related } = fallbackDept(body);
  const wf = classifyWorkflow(body);
  const risk = riskFromText(body, item.isIBK);
  const orgShort = (item.org || "").replace(/\s*(주식회사|㈜|\(주\))\s*/g, "").trim();
  const sanctionType = isMngImpr ? "경영유의·개선사항"
    : (body.match(/문책경고|기관경고|기관주의|영업정지|과징금|과태료|시정명령/) || ["제재"])[0];

  const what = isMngImpr
    ? `${orgShort}에 ${josaGa(sanctionType)} 통보됐어요.`.slice(0, 35)
    : `${orgShort}에 ${josaGa(sanctionType)} 부과됐어요.`.slice(0, 35);
  const insight = `${dept}의 유사 업무 점검 여지를 살펴보세요.`.slice(0, 40);
  const action = `${dept} 담당자라면 관련 통제 절차를 점검해 보세요.`.slice(0, 60);

  return {
    what_changes: [what],
    our_action: [action],
    ctrl_insight: insight,
    dept, related_depts: related,
    tg_key: `${orgShort} ${isMngImpr ? "경영유의" : "제재"}`.slice(0, 18),
    sanction_type: sanctionType,
    risk_grade: risk.grade, risk_basis: risk.basis,
    workflow_type: wf,
    term: null,
    _fallback: true,
  };
}

// ─── 항목 분석 ────────────────────────────────────────────────
async function analyzeItem(item, useApi) {
  if (!useApi) return applyAnalysis(item, fallbackAnalyze(item));
  const targets = item.sanctionTargets
    ? `기관:${item.sanctionTargets.기관 || "-"} / 임원:${item.sanctionTargets.임원 || "-"} / 직원:${item.sanctionTargets.직원 || "-"}`
    : "(경영유의·개선사항)";
  const userMsg = `제재대상 금융기관: ${item.org}
소스: ${item.source}   제재조치일: ${item.actionDate || item.postDate || "미확인"}
FSS 검사/담당부서: ${item.dept || "미확인"}
제재/개선 대상(목록): ${targets}
위반·지적 원문(PDF 발췌):
${(item.bodyText || "(원문 없음 — 기관명·유형 기반 분석)").slice(0, 1500)}`;
  try {
    const r = await callHaikuWithRetry(userMsg);
    return applyAnalysis(item, { ...r, _llm: true });
  } catch (e) {
    console.warn(`  [ANALYST] API 오류 (${(item.org || "").slice(0, 16)}): ${e.message} → fallback`);
    return applyAnalysis(item, { ...fallbackAnalyze(item), _api_error: e.message });
  }
}

// LLM/fallback 결과를 item에 병합 + 위험등급을 grade로 승격(briefV2가 grade 사용)
function applyAnalysis(item, r) {
  const gradeMap = { "상": "상", "중": "중", "하": "하", RED: "상", ORANGE: "중", GREEN: "하" };
  const finalGrade = gradeMap[r.risk_grade] || item.grade || "중";
  return {
    ...item,
    grade:         finalGrade,
    title:         item.title || item.org || "",   // briefV2 헤드라인용(제재대상 기관명). FSS 항목엔 title 없음 → org 주입
    what_changes:  Array.isArray(r.what_changes) ? r.what_changes.slice(0, 2) : [],
    our_action:    Array.isArray(r.our_action)   ? r.our_action.slice(0, 3)   : [],
    ctrl_insight:  r.ctrl_insight || "",
    dept:          r.dept || "내부통제총괄부",
    related_depts: Array.isArray(r.related_depts) ? r.related_depts.slice(0, 2) : [],
    tg_key:        (r.tg_key || "").slice(0, 20),
    sanction_type: r.sanction_type || "",
    risk_basis:    r.risk_basis || "",
    workflow_type: r.workflow_type || "",
    term:          (r.term && r.term.word) ? r.term : null,
    _llm:          !!r._llm, _fallback: !!r._fallback, _api_error: r._api_error,
  };
}

// ─── 소규모 병렬 풀 (직렬 병목 회피) ──────────────────────────
async function analyzePool(items, useApi, concurrency) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const t0 = Date.now();
      out[i] = await analyzeItem(items[i], useApi);
      const tag = out[i]._llm ? "LLM" : "fallback";
      console.log(`  [ANALYST] [${i + 1}/${items.length}] ${(items[i].org || "").slice(0, 20)} — ${out[i].grade} ${tag} (${Date.now() - t0}ms)`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

// ─── MAIN ─────────────────────────────────────────────────────
(async function main() {
  console.log(`\n[ANALYST] 시작 — ${TODAY} (model=${MODEL})`);
  if (!fs.existsSync(CRAWL_PATH)) { console.error(`[ANALYST] crawl_result.json 없음: ${CRAWL_PATH}`); process.exit(2); }
  let crawlData;
  try { crawlData = JSON.parse(fs.readFileSync(CRAWL_PATH, "utf8")); }
  catch (e) { console.error(`[ANALYST] JSON 파싱 실패: ${e.message}`); process.exit(2); }

  // FSS: crawler가 dedup으로 신규 IBK관련만 graded에 담음(seed·무신규 시 []). items로 폴백 금지(과거건 범람 방지).
  const srcItems = Array.isArray(crawlData.graded) ? crawlData.graded : [];
  if (srcItems.length === 0) { console.log("[ANALYST] 분석 대상 0건 (신규 없음) — 종료"); process.exit(0); }

  const useApi = !!API_KEY;
  if (!useApi) console.warn("[ANALYST] ⚠ ANTHROPIC_API_KEY 미설정 — fallback(키워드) 모드");
  else console.log(`[ANALYST] LLM 모드 — ${srcItems.length}건 분석 (병렬 ${CONCURRENCY})`);

  const analyzed = await analyzePool(srcItems, useApi, CONCURRENCY);

  crawlData.graded = analyzed;
  if (Array.isArray(crawlData.newGraded)) crawlData.newGraded = analyzed;
  crawlData.analyzedAt = new Date().toISOString();
  crawlData.analyzeMode = useApi ? "llm" : "fallback-no-key";
  // 종합 위험등급(당일 최고값) — briefV2 표지/알림용
  const rank = { "상": 3, "중": 2, "하": 1 };
  crawlData.overallGrade = analyzed.reduce((mx, it) => (rank[it.grade] || 0) > (rank[mx] || 0) ? it.grade : mx, "하");
  const topTerm = analyzed.find(it => it.term && it.grade === "상") || analyzed.find(it => it.term);
  crawlData.term = topTerm ? topTerm.term : null;

  fs.writeFileSync(CRAWL_PATH, JSON.stringify(crawlData, null, 2), "utf8");
  const fb = analyzed.filter(it => it._fallback).length;
  console.log(`[ANALYST] 완료 — ${analyzed.length}건 (fallback ${fb}) / 종합등급 ${crawlData.overallGrade} → ${CRAWL_PATH}`);
  process.exit(fb > 0 && !useApi ? 1 : 0);
})();
