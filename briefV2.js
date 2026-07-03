"use strict";
/**
 * briefV2.js — IBK FSS 제재·경영유의 브리핑 보고서 생성기
 * 수정 이력:
 *   v3.0  2026.06.20  전면 재작성 (표 제거, Amazon+Axios 원칙 적용)
 *   v3.1  2026.06.20  our_action fallback 보완 + ensureTone() 추가
 *   v3.2  2026.06.20  가독성 개선 (타입 스케일 4단계 / 간격 통일 / 구분선 정리 / \n → 별도 단락)
 */

const fs   = require("fs");
const path = require("path");

const {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, LevelFormat, BorderStyle,
} = require("docx");

// ──────────────────────────────────────────────────────────────
// 날짜 계산
// ──────────────────────────────────────────────────────────────
const _argIdx  = process.argv.indexOf("--date");
const _argDate = _argIdx >= 0 ? process.argv[_argIdx + 1] : null;
const BASE_DATE = (_argDate && /^\d{8}$/.test(_argDate))
  ? new Date(+_argDate.slice(0,4), +_argDate.slice(4,6)-1, +_argDate.slice(6,8))
  : new Date();
const _DOW = ["일","월","화","수","목","금","토"];
const TODAY_CODE  = `${BASE_DATE.getFullYear()}${String(BASE_DATE.getMonth()+1).padStart(2,"0")}${String(BASE_DATE.getDate()).padStart(2,"0")}`;
const TODAY_LABEL = `${BASE_DATE.getFullYear()}. ${String(BASE_DATE.getMonth()+1).padStart(2,"0")}. ${String(BASE_DATE.getDate()).padStart(2,"0")}. (${_DOW[BASE_DATE.getDay()]})`;

// ──────────────────────────────────────────────────────────────
// crawl_result.json 로드
// ──────────────────────────────────────────────────────────────
const { reportDir, reportDocxName, resolveSlot } = require("./runslot");
const CRAWL_PATH = path.join(reportDir(__dirname, TODAY_CODE), "crawl_result.json");  // reports/{date}/{slot}
let crawlData = null;
if (fs.existsSync(CRAWL_PATH)) {
  try {
    crawlData = JSON.parse(fs.readFileSync(CRAWL_PATH, "utf8"));
    console.log(`[REPORT] crawl_result.json 로드 완료 — 수집 ${crawlData.items ? crawlData.items.length : 0}건`);
  } catch(e) {
    console.warn("[REPORT] crawl_result.json 파싱 실패:", e.message);
  }
}

// ──────────────────────────────────────────────────────────────
// 색상 상수
// ──────────────────────────────────────────────────────────────
const ibkBlue  = "0D2F8B";
const skyBlue  = "1E88BC";
const red      = "C0392B";
const lightRed = "C0392B";  // 구분선용 — 두께로 역할 구분
const gray1    = "666666";
const gray2    = "999999";
const blk      = "1A1A1A";

// ──────────────────────────────────────────────────────────────
// 타입 스케일 (4단계 고정 — v3.2)
// ──────────────────────────────────────────────────────────────
const TS = {
  title:    36,   // 18pt 문서 제목
  law:      26,   // 13pt 제재대상 헤더 (본문과 뚜렷이 구분)
  opening:  22,   // 11pt 오프닝 문장
  sub:      20,   // 10pt 라벨 (무슨 일 / IBK 발생 가능 / 점검)
  body:     20,   // 10pt 본문 (가독성 위해 9.5→10pt 상향)
  caption:  18,   //  9pt 보조 (계층·일자·유형)
};

// ──────────────────────────────────────────────────────────────
// 간격 상수 (2규칙 통일 — v3.2)
// sub_before : 소제목 위 공백
// body_after : 본문 단락 아래 공백
// ──────────────────────────────────────────────────────────────
const GAP = {
  sub_before:  120,
  body_after:   32,
  section_gap: 480,   // SP_LARGE
  item_gap:    280,   // SP_MEDIUM
  micro:       120,   // SP_SMALL
};

// ──────────────────────────────────────────────────────────────
// Fallback(키워드 추정) 배지 — A-02/B-02
// LLM 분석 실패 시 키워드 규칙이 채운 항목임을 보고서에 명시한다.
// (항목을 숨기지 않고 '검토 필요' 라벨만 붙여 신뢰 오인을 방지)
// ──────────────────────────────────────────────────────────────
const FALLBACK_BADGE = "(키워드 추정 — 검토 필요) ";
const withFallbackBadge = (text, item) =>
  item && item._fallback && text ? `${FALLBACK_BADGE}${text}` : text;

// ──────────────────────────────────────────────────────────────
// 크롤 아이템 → REPORT 포맷 변환
// ──────────────────────────────────────────────────────────────
function mapCrawlerItem(it) {
  function ddayStr(dateStr) {
    if (!dateStr) return "";
    const d = Math.ceil((new Date(dateStr.replace(/\./g, "-")) - new Date()) / 86400000);
    return d < 0 ? "마감완료" : `D-${d}`;
  }
  const deadlineDday = it.deadline_status || ddayStr(it.deadline);
  const enforceDday  = ddayStr(it.enforce_date);
  return {
    noticeId:     String(it.noticeId),
    title:        it.title || "",
    grade:        it.grade || "하",
    ministry:     it.ministry || "금융감독원",
    from:         (it.notice_date  || "미확인").replace(/-/g, "."),
    to:           (it.deadline     || "미확인").replace(/-/g, "."),
    sanctionDate: (it.actionDate || it.postDate || "").replace(/-/g, "."),   // FSS 제재조치일·게시일 (마감 없음)
    dday:         deadlineDday || "미확인",
    enforce:      (it.enforce_date || "").replace(/\./g, "-"),
    enforceLabel: enforceDday ? `${enforceDday} 시행` : "",
    ctrl_insight: it.ctrl_insight || "",
    _fallback:    it._fallback || false,   // A-02/B-02: fallback(키워드 추정) 표식 전달
    ibkDept:       it.dept || "",
    related_depts: Array.isArray(it.related_depts) ? it.related_depts.slice(0, 4) : [],
    what_changes:  Array.isArray(it.what_changes) && it.what_changes.length > 0
      ? it.what_changes : [],
    our_action:    Array.isArray(it.our_action) && it.our_action.length > 0
      ? it.our_action : [],
    tg_key:       it.tg_key || "",
    term:         it.term || null,
    source:       it.source || "",              // 제재공시 / 경영유의
    sanction_type: it.sanction_type || "",       // 제재유형 (과태료/기관경고/경영유의 등)
    tier:         it.tier || "T3",              // 기관 계층 (T0 IBK / T1 은행 / T2 인접금융 / T3 주변)
    tierLabel:    it.tierLabel || "",
  };
}
// 기관 계층 정렬 가중치 (T0>T1>T2>T3, 그 안에서 grade)
const TIER_RANK = { T0: 4, T1: 3, T2: 2, T3: 1 };
const GRADE_RANK = { "상": 3, "중": 2, "하": 1 };
function byTierGrade(a, b) {
  return (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0)
      || (GRADE_RANK[b.grade] || 0) - (GRADE_RANK[a.grade] || 0);
}

// ──────────────────────────────────────────────────────────────
// REPORT 구성
// ──────────────────────────────────────────────────────────────
const _isRegul   = it => (it.title||"").includes("규정변경예고") || (it.title||"").includes("규정제정예고");
const _allItems  = crawlData ? (crawlData.items  || []) : [];
const _newGraded = crawlData
  ? (crawlData.graded || crawlData.newGraded || []).map(mapCrawlerItem)
  : [];

const REPORT = {
  date:        TODAY_LABEL,
  dateCode:    TODAY_CODE,
  totalNew:     _allItems.length,
  totalFetched: crawlData ? (crawlData.totalFetched || _allItems.length) : 0,
  totalLegis:  _allItems.filter(it => !_isRegul(it)).length,
  totalRegul:  _allItems.filter(it =>  _isRegul(it)).length,
  ibkTotal:    _newGraded.length,
  urgentTotal: _newGraded.filter(g => g.grade === "상").length,
  graded:      _newGraded,
  deadlines:   crawlData ? (crawlData.deadlines || []) : [],
  term:        crawlData ? (crawlData.term || null) : null,
  noUpdate:    crawlData ? !!crawlData.noUpdate : false,
};

// ──────────────────────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────────────────────

function rf(sz, color, bold = false) {
  return { font: "맑은 고딕", size: sz, color, bold };
}

function sp(line) {
  return new Paragraph({
    spacing: { line, lineRule: "exact" },
    children: [new TextRun({ text: "", size: 1 })],
  });
}
const SP_LARGE  = () => sp(GAP.section_gap);
const SP_MEDIUM = () => sp(GAP.item_gap);
const SP_SMALL  = () => sp(GAP.micro);

/**
 * 구분선 — v3.2: 색상 제거, 두께로만 역할 구분
 *   role "section" : 두께 6, ibkBlue  — 헤더/마무리
 *   role "item"    : 두께 4, BBBBBB   — 🔴 항목 앞
 *   role "minor"   : 두께 2, DDDDDD   — 나머지/마감/용어
 */
function divider(role = "minor") {
  const map = {
    section: { color: ibkBlue, size: 6 },
    item:    { color: "BBBBBB", size: 4 },
    minor:   { color: "DDDDDD", size: 2 },
  };
  const { color, size } = map[role] || map.minor;
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, color, size, space: 1 } },
    spacing: { after: 0, before: 0 },
    children: [new TextRun({ text: "", size: 1 })],
  });
}

function shortTitle(title) {
  return (title || "")
    .replace(/[｢「」｣]/g, "")
    .replace(/\s*(일부개정령안|일부개정고시안|규정변경예고|규정제정예고|입법예고).*/g, "")
    .trim();
}

function gradeEmoji(grade) {
  return grade === "상" ? "🔴" : grade === "중" ? "🔶" : "🔹";
}

/** 소제목 단락 — before:120 고정 */
function subHeading(text, color = ibkBlue) {
  return new Paragraph({
    spacing: { before: GAP.sub_before, after: 0 },
    children: [new TextRun({ text, ...rf(TS.sub, color, true) })],
  });
}

/** 본문 단락 — after:32 고정 */
function bodyPara(children, spacingAfter = GAP.body_after) {
  return new Paragraph({
    spacing: { before: 0, after: spacingAfter },
    children,
  });
}

/** 불릿 단락 — after:32 고정 */
function bulletPara(text, color = blk, bold = false) {
  return new Paragraph({
    style: "ListParagraph",
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 0, after: GAP.body_after },
    children: [new TextRun({ text, ...rf(TS.body, color, bold) })],
  });
}

function ensureTone(text, fieldName = "") {
  if (!text) return text;
  const violations = [
    /하여야\s*합니다/, /검토가\s*필요합니다/, /상기\s*법령에\s*따르면/,
    /준수\s*의무가\s*있습니다/, /하시기\s*바랍니다/, /이행하여야/,
    /[가-힣]합니다/, /입니다\./, /필요합니다/, /할\s*수\s*있어요/,
  ];
  if (violations.some(re => re.test(text))) {
    console.warn(`[TONE WARN]${fieldName ? ` (${fieldName})` : ""}: "${text.slice(0, 40)}"`);
  }
  return text;
}

// ──────────────────────────────────────────────────────────────
// 섹션 빌더
// ──────────────────────────────────────────────────────────────

function buildHeader(data) {
  return [
    sp(600),
    bodyPara(
      [new TextRun({ text: data.date, ...rf(TS.caption, gray1) })],
      20
    ),
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({ text: "⚖️ ", size: TS.title, color: blk }),
        new TextRun({ text: "오늘의 제재·경영유의 브리핑", ...rf(TS.title, ibkBlue, true) }),
        new TextRun({ text: "  ", size: 22 }),
        new TextRun({ text: "IBK AI Agent 제재사례 모니터링  —  내부통제점검팀", ...rf(TS.caption + 2, skyBlue, true) }),
      ],
    }),
    divider("section"),
    SP_MEDIUM(),
  ];
}

function buildOpening(data) {
  if (data.noUpdate) {
    return [
      bodyPara([new TextRun({ text: "금융감독원에서 새로 확인된 제재·경영유의가 없어요.", ...rf(TS.opening, blk) })], 24),
      bodyPara([new TextRun({ text: "지난 실행 이후 새로 게시된 건이 없어요. 기존 진행건 점검을 유지해 주세요.", ...rf(TS.body, gray1) })]),
      SP_MEDIUM(),
    ];
  }

  if (!data.graded || data.graded.length === 0) {
    return [
      bodyPara([new TextRun({ text: "새로 확인된 건 중 IBK 연관 제재·경영유의는 없어요.", ...rf(TS.opening, blk) })], 24),
      bodyPara([new TextRun({ text: "기존 점검 체계를 재점검하는 시간으로 활용해보세요 🙂", ...rf(TS.body, gray1) })]),
      SP_LARGE(),
    ];
  }

  const urgentCount = data.graded.filter(it => it.grade === "상").length;
  return [
    bodyPara([new TextRun({ text: `금융감독원에서 새로 확인된 제재·경영유의는 ${data.totalNew}건이에요.`, ...rf(TS.opening, blk) })], 16),
    bodyPara([
      new TextRun({ text: `그 중 지금 바로 살펴봐야 할 건 `, ...rf(TS.opening, blk) }),
      new TextRun({ text: `${urgentCount}건`, ...rf(TS.opening, urgentCount > 0 ? red : blk, true) }),
      new TextRun({ text: `이에요.`, ...rf(TS.opening, blk) }),
    ]),
    SP_MEDIUM(),
  ];
}

// 항목 카드 — 전 건 동일 구조: [제재대상(기관·계층·일자)] → 무슨 일 → IBK에도 발생 가능? → 점검.
//   ★ 제재받은 곳(제재대상)과 IBK 점검 부서(IBK 발생 가능·점검)를 명확히 분리한다.
//   ★ "IBK에도 발생 가능한가요?"(ctrl_insight)로 재발 가능성을 명시. tier→위험도 정렬은 buildDocument에서.
function buildItems(items) {
  const list = items || [];
  if (list.length === 0) return [];
  const sections = [];

  const label = (t) => new Paragraph({
    spacing: { before: GAP.sub_before, after: 0 },
    children: [new TextRun({ text: t, ...rf(TS.sub, ibkBlue, true) })],
  });
  const bodyLine = (text, color = blk) => new Paragraph({
    indent: { left: 160 },
    spacing: { before: 0, after: GAP.body_after },
    children: [new TextRun({ text, ...rf(TS.body, color) })],
  });

  list.forEach(item => {
    const org   = shortTitle(item.title) || item.tg_key || "제재대상";
    const meta  = [item.tierLabel, item.sanctionDate, item.sanction_type].filter(Boolean).join("  ·  ");
    const what  = (item.what_changes || [])[0] || "";
    const why   = item.ctrl_insight || "";
    const how   = (item.our_action || [])[0] || "";
    const isUrg = item.grade === "상";

    sections.push(divider("item"), SP_SMALL());
    // 제재대상 헤더 (기관명 굵게 — 상=빨강, 그 외=IBK블루)
    sections.push(new Paragraph({
      spacing: { before: 0, after: meta ? 4 : 10 },
      children: [
        new TextRun({ text: `${gradeEmoji(item.grade)} 제재대상  `, ...rf(TS.law, blk, true) }),
        new TextRun({ text: org, ...rf(TS.law, isUrg ? red : ibkBlue, true) }),
      ],
    }));
    if (meta) sections.push(new Paragraph({
      spacing: { before: 0, after: 12 },
      children: [new TextRun({ text: meta, ...rf(TS.caption, gray1) })],
    }));

    if (what) { sections.push(label("무슨 일이 있었나요?"));       sections.push(bodyLine(ensureTone(what, "what_changes"))); }
    if (why)  { sections.push(label("IBK에도 발생 가능한가요?")); sections.push(bodyLine(withFallbackBadge(ensureTone(why, "ctrl_insight"), item))); }
    if (how)  { sections.push(label("무엇을 점검할까요?"));         sections.push(bodyLine(ensureTone(how, "our_action"), ibkBlue)); }

    sections.push(SP_MEDIUM());
  });
  return sections;
}

function buildOtherItems(items) {
  let urgentSeen = 0;
  const others = (items || []).filter(it => {
    if (it.grade === "상") { urgentSeen++; return urgentSeen > 2; }
    return true;
  });
  if (others.length === 0) return [];

  const sections = [
    divider("minor"),
    SP_SMALL(),
    // 소그룹 제목
    new Paragraph({
      spacing: { before: 0, after: 24 },
      children: [new TextRun({ text: "그 외 새로 확인된 제재·경영유의", ...rf(TS.sub, gray1, true) })],
    }),
  ];

  others.forEach(item => {
    const emoji     = gradeEmoji(item.grade);
    const name      = shortTitle(item.title);
    const dept      = item.ibkDept || "내부통제총괄부";
    const relDepts  = item.related_depts || [];
    const change    = withFallbackBadge(ensureTone((item.what_changes || [])[0] || item.ctrl_insight || "", "other"), item);
    const ddayTxt   = item.dday && item.dday !== "미확인" ? `  ${item.dday}` : "";
    const deptLabel = relDepts.length > 0
      ? `${dept} 외 ${relDepts.length}개 부서`
      : dept;

    // 법령명 줄 — TS.body Bold
    sections.push(
      new Paragraph({
        spacing: { before: 0, after: 6 },
        children: [
          new TextRun({ text: `${emoji} `, ...rf(TS.body, blk) }),
          new TextRun({ text: item.tierLabel ? `[${item.tierLabel}] ` : "", ...rf(TS.caption, gray1) }),
          new TextRun({ text: name, ...rf(TS.body, blk, true) }),
          new TextRun({ text: ddayTxt, ...rf(TS.caption, gray2) }),
        ],
      }),
    );

    // 요약 줄 — TS.caption, 들여쓰기 (별도 Paragraph, \n 제거)
    sections.push(
      new Paragraph({
        indent: { left: 300 },
        spacing: { before: 0, after: GAP.body_after * 2 },
        children: [
          new TextRun({
            text: change ? `${change}  →  ${deptLabel}` : `→  ${deptLabel}`,
            ...rf(TS.caption, gray1),
          }),
        ],
      }),
    );
  });

  sections.push(SP_LARGE());
  return sections;
}

function buildDeadlineSummary(data) {
  const allItems = data.graded || [];
  if (allItems.length < 3) return [];

  const urgentDeadlines = allItems.filter(it => {
    const n = parseInt((it.dday || "").replace("D-", ""));
    return !isNaN(n) && n <= 7;
  });
  if (urgentDeadlines.length < 2) return [];

  const sections = [
    divider("minor"),
    SP_SMALL(),
    new Paragraph({
      spacing: { before: 0, after: 20 },
      children: [new TextRun({ text: "📅 이번 주 마감 요약", ...rf(TS.sub, ibkBlue, true) })],
    }),
  ];

  urgentDeadlines.slice(0, 3).forEach(it => {
    const name = shortTitle(it.title).slice(0, 18);
    const dept = it.ibkDept || "내부통제총괄부";
    sections.push(
      bodyPara([
        new TextRun({ text: `${it.dday}  `, ...rf(TS.body, red, true) }),
        new TextRun({ text: `${name}`, ...rf(TS.body, blk) }),
        new TextRun({ text: `  →  ${dept}`, ...rf(TS.caption, gray1) }),
      ]),
    );
  });

  sections.push(SP_LARGE());
  return sections;
}

function buildTerm(data) {
  const t = data.term;
  if (!t || !t.word) return [];

  return [
    divider("minor"),
    SP_SMALL(),
    new Paragraph({
      spacing: { before: 0, after: 16 },
      children: [
        new TextRun({ text: "📖 오늘의 용어  ", ...rf(TS.sub, ibkBlue, true) }),
        new TextRun({ text: "(처음 보시는 분만)", ...rf(TS.caption, gray2) }),
      ],
    }),
    bodyPara([
      new TextRun({ text: `${t.word}란?  `, ...rf(TS.body, blk, true) }),
      new TextRun({ text: t.def, ...rf(TS.body, blk) }),
    ]),
    bodyPara([new TextRun({ text: `(${t.src})`, ...rf(TS.caption, gray2) })]),
    SP_LARGE(),
  ];
}

function buildClosing(data) {
  if (!data.graded || data.graded.length === 0) return [];

  const topUrgent   = data.graded.find(it => it.grade === "상");
  const urgentCount = data.graded.filter(it => it.grade === "상").length;
  const dept        = topUrgent ? (topUrgent.ibkDept || "관련 부서") : "관련 부서";
  const dday        = topUrgent ? topUrgent.dday : "";
  const ddayStr     = dday && dday !== "마감완료" && dday !== "미확인" ? ` ${dday} 마감이에요.` : "";

  const closingText = urgentCount >= 2
    ? `오늘 우선 살펴볼 제재사례가 ${urgentCount}건이에요. ${dept} 등 관련 부서에 유사 업무 점검을 제안해 주세요.`
    : topUrgent
      ? `오늘은 ${dept}의 유사 업무 점검 여지를 먼저 챙겨보세요.`
      : "관련 부서와 유사 업무 점검 여지를 살펴보세요.";

  return [
    divider("section"),
    SP_SMALL(),
    new Paragraph({
      spacing: { before: 0, after: 16 },
      children: [new TextRun({ text: "오늘 하나만 기억하세요.", ...rf(TS.sub, ibkBlue, true) })],
    }),
    bodyPara([new TextRun({ text: closingText, ...rf(TS.opening, blk, true) })]),
    SP_MEDIUM(),
  ];
}

// ──────────────────────────────────────────────────────────────
// Telegram 메시지
// ──────────────────────────────────────────────────────────────
function buildTgMsg(data) {
  const now  = new Date(Date.now() + 9 * 3600 * 1000);
  const time = `${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")}`;
  const fetched = data.totalFetched || data.totalNew || 0;

  const HEADER = `🔔 금융감독원 제재·경영유의 브리핑 (${time})`;

  // Scenario noUpdate — 신규 없음
  if (data.noUpdate) {
    return [HEADER, `금감원 신규 확인 · 변동 없음`, `✅ 신규 제재·경영유의 없음 — 기존 점검 유지`].join("\n");
  }

  const graded = data.graded || [];
  // ★ 표준 방법론: 알림 = T0·T1·T2 전건, T3(주변·환전영업소·GA 등) 제외(보고서엔 수록). tier→grade 순.
  const alertItems = [...graded].filter(it => it.tier !== "T3").sort(byTierGrade);
  const excludedT3 = graded.length - alertItems.length;

  // 알림 대상(T0~T2) 없음 — 신규가 없거나 전부 주변기관(T3)
  if (alertItems.length === 0) {
    const tail = excludedT3 > 0 ? `주변기관(환전·대부·대리점 등) ${excludedT3}건은 참고용 — 보고서에만 수록` : "추가 조치 불필요";
    return [HEADER, `금감원 신규 확인 · IBK 유관 없음`, `✅ ${tail}`].join("\n");
  }

  const urgentCount = alertItems.filter(it => it.grade === "상").length;
  const orgName = (item) => shortTitle(item.title) || item.tg_key || "제재대상";

  // 항목 블록 — [제재대상(기관·계층)] → 왜 제재를 받았나요? → IBK에서도 발생 가능한가요?(부서·재발위험) → 이런 부분을 점검하시면 좋아요.
  //   ※ 제재받은 곳(제재대상)과 점검할 IBK 부서(발생가능성/점검)를 명확히 분리해 혼동을 없앤다.
  const itemBlock = (item) => {
    const meta = [item.sanctionDate, item.sanction_type].filter(Boolean).join(" · ");
    const what = (item.what_changes || [])[0] || "";
    const why  = item.ctrl_insight || "";
    const how  = (item.our_action || [])[0] || "";
    // 질문(불릿)과 답변(들여쓰기 다음 줄)을 2계층으로 분리 — 같은 줄 혼재 시 가독성·집중도 저하(총평단 3차 리뷰).
    const qa = (q, a) => a ? `• ${q}\n   ${a}` : null;
    const head = `${gradeEmoji(item.grade)} 제재대상: ${orgName(item)} [${item.tierLabel || "기관"}]${meta ? ` · ${meta}` : ""}`;
    const blocks = [
      qa("왜 제재를 받았나요?", what),
      qa("IBK에서도 발생 가능한가요?", why ? withFallbackBadge(why, item) : ""),
      qa("이런 부분을 점검하시면 좋아요", how),
    ].filter(Boolean);
    return [head, "", blocks.join("\n\n")].join("\n");
  };

  const parts = [
    HEADER,
    `금감원 신규 중 IBK 유관 ${alertItems.length}건`
      + (urgentCount ? ` (🔴 즉시점검 ${urgentCount})` : "")
      + (excludedT3 > 0 ? ` · 주변 ${excludedT3}건 참고` : ""),
    "",
  ];
  alertItems.forEach((it, i) => { parts.push(itemBlock(it)); if (i < alertItems.length - 1) parts.push(""); });
  return parts.join("\n").trim();
}

// ──────────────────────────────────────────────────────────────
// 문서 조립
// ──────────────────────────────────────────────────────────────
// B-09: 섹션 빌더를 개별 try-catch로 격리한다. 한 섹션의 데이터 오류가
// 보고서 전체 생성을 막지 않도록 부분 실패를 허용하고, 실패는 문서에 가시화한다.
function safeSection(label, fn) {
  try {
    return fn();
  } catch (e) {
    console.error(`⚠️ 섹션 [${label}] 생성 실패 — 건너뜀:`, e.message);
    return [
      new Paragraph({
        children: [new TextRun({ text: `(이 섹션은 데이터 오류로 생성되지 못했습니다 — ${label})`, ...rf(TS.caption, gray2) })],
      }),
    ];
  }
}

function buildDocument(data) {
  // 보고서 항목을 기관 계층(tier)→위험도 순으로 정렬 — 은행·인접금융이 주변기관(T3)보다 위. T3도 수록(하위).
  if (Array.isArray(data.graded)) data.graded = [...data.graded].sort(byTierGrade);
  const children = [
    ...safeSection("header",   () => buildHeader(data)),
    ...safeSection("opening",  () => buildOpening(data)),
    ...safeSection("items",    () => buildItems(data.graded)),
    ...safeSection("deadline", () => buildDeadlineSummary(data)),
    ...safeSection("term",     () => buildTerm(data)),
    ...safeSection("closing",  () => buildClosing(data)),
  ];

  return new Document({
    numbering: {
      config: [{
        reference: "bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 340, hanging: 240 } } },
        }],
      }],
    },
    styles: {
      default: {
        document: { run: { font: "맑은 고딕", size: TS.body } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 850, right: 1020, bottom: 850, left: 1020, header: 708, footer: 708, gutter: 0 },
        },
      },
      children,
    }],
  });
}

// ──────────────────────────────────────────────────────────────
// 실행
// ──────────────────────────────────────────────────────────────
const RUN_SLOT_RESOLVED = resolveSlot();   // am/pm — 폴더·파일명 라벨 일치(D6 수정: 파일명도 슬롯 반영)
const outDir  = reportDir(__dirname, REPORT.dateCode, RUN_SLOT_RESOLVED);   // reports/{date}/{slot} — 런별 분리 보존
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, reportDocxName(REPORT.dateCode, RUN_SLOT_RESOLVED));  // {date}_{morning|afternoon}_brief.docx

Packer.toBuffer(buildDocument(REPORT))
  .then(buf => {
    if (fs.existsSync(outFile)) {
      try { fs.unlinkSync(outFile); } catch(e) {}
    }
    fs.writeFileSync(outFile, buf);

    if (crawlData) {
      crawlData.tgMsg = buildTgMsg(REPORT);
      fs.writeFileSync(CRAWL_PATH, JSON.stringify(crawlData, null, 2), "utf8");
    }

    console.log("✅ 생성 완료:", outFile);
    console.log("\n── TG_MSG ─────────────────────────────────────");
    console.log(buildTgMsg(REPORT));
    console.log("───────────────────────────────────────────────");
  })
  .catch(e => {
    console.error("❌ 생성 실패:", e.message);
    process.exit(1);
  });
