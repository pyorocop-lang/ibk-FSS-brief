# ibk-FSS-brief Skill

> **FSS 제재·경영유의 브리핑 보고서 레이아웃 정본** — 실제 출력 생성기 `briefV2.js`(v3.2)와 일치하도록 작성.
> 보고서는 `⚖️/🔴/🔶/🔹/📖` 시맨틱 헤더의 뉴스레터형이다. 각 제재/경영유의 건을 **동일 구조의 카드**로 전건 수록한다.
> 아래 폰트·색·여백·타입스케일 수치는 모두 briefV2.js 실측값이다. **수치 변경 시 briefV2.js와 함께 갱신할 것.**

---

## 트리거

| 조건 | 값 |
|------|-----|
| 스케줄 | 매일 08:00·16:00 KST 2회 (Cloudflare Workers Cron `0 23 * * *`·`0 7 * * *` UTC → GitHub Actions. 08:00=am / 16:00=pm) |
| 입력 | `reports/{YYYYMMDD}/{slot}/crawl_result.json` (FSS 2소스 수집 + Claude 분석 결과) |
| 출력 | `reports/{YYYYMMDD}/{slot}/{YYYYMMDD}_{morning\|afternoon}_brief.docx` |
| 생성기 | `briefV2.js` (docx 라이브러리) |

> `slot`(am/pm)과 파일명 라벨(morning/afternoon)은 `runslot.js`의 `reportDir`·`reportDocxName`·`resolveSlot`가 결정한다.

---

## 페이지 설정 (briefV2.js 실측 — 변경 금지)

```javascript
page: {
  size:   { width: 11906, height: 16838 },          // A4 portrait, DXA
  margin: { top: 850, right: 1020, bottom: 850, left: 1020,
            header: 708, footer: 708, gutter: 0 }   // DXA
}
// 본문폭 CW = 11906 - 1020 - 1020 = 9866 DXA
```

## 폰트 · 색상 상수 (briefV2.js 실측)

모든 텍스트: **맑은 고딕** (기본 스타일 run.font, size=TS.body).

```javascript
const ibkBlue  = "0D2F8B";   // 라벨·점검액션·강조 / 헤더·마무리 구분선 / 그 외 등급 기관명
const skyBlue  = "1E88BC";   // 부제(IBK AI Agent 제재사례 모니터링)
const red      = "C0392B";   // 🔴 상 등급 기관명 · 오프닝 강조 (lightRed도 동일 값)
const gray1    = "666666";   // 날짜·메타(계층·일자·유형)·"그 외" 제목
const gray2    = "999999";   // 보조 캡션(용어 출처·placeholder 등)
const blk      = "1A1A1A";   // 일반 본문 · "제재대상" 라벨 텍스트
```

## 타입 스케일 (briefV2.js `TS` 실측 — 단위: docx half-point)

```javascript
const TS = {
  title:    36,   // 18pt  문서 제목 "오늘의 제재·경영유의 브리핑"
  law:      26,   // 13pt  제재대상 헤더 (본문과 뚜렷이 구분)
  opening:  22,   // 11pt  오프닝/마무리 문장
  sub:      20,   // 10pt  라벨 (무슨 일이 있었나요? 등)
  body:     20,   // 10pt  본문
  caption:  18,   //  9pt  메타(계층·일자·유형)·출처·"그 외" 요약
};
// half-point → pt = 값 ÷ 2. (예: title 36 = 18pt)
// 부제("IBK AI Agent …")는 caption+2 = 20(10pt), skyBlue Bold.
```

## 간격 · 스페이서 · 구분선 (briefV2.js 실측)

```javascript
const GAP = {
  sub_before:  120,   // 라벨/소제목 위 공백
  body_after:   32,   // 본문/불릿 단락 아래 공백
  section_gap: 480,   // SP_LARGE — 섹션 사이
  item_gap:    280,   // SP_MEDIUM — 카드 사이
  micro:       120,   // SP_SMALL
};
// 스페이서 빈 단락 sp()은 sz:1, lineRule:"exact" (줄 높이 과대 방지)

// 구분선(divider) — 색이 아니라 '두께'로 역할 구분
//   role "section": 두께 6, ibkBlue  — 헤더/마무리
//   role "item"   : 두께 4, BBBBBB   — 각 제재 카드 앞
//   role "minor"  : 두께 2, DDDDDD   — 그 외/마감/용어

// 불릿 numbering: reference "bullets"(•) 1종만 정의 (level 0, indent left:340/hanging:240)
```

---

## 문서 구조 (조립 순서 — briefV2.js `buildDocument`)

`buildDocument`는 아래 6개 빌더를 순서대로 조립한다(각 `safeSection`으로 장애 격리).
정렬은 먼저 `data.graded`를 **기관 계층(Tier)→등급** 순(`byTierGrade`)으로 재정렬한 뒤 진행한다.

| # | 섹션 | 빌더 | 출력 조건 | 핵심 마커/내용 |
|---|------|------|-----------|----------------|
| 1 | ⚖️ 헤더 | `buildHeader` | **항상** | 날짜 "YYYY. MM. DD. (요일)" + "⚖️ 오늘의 제재·경영유의 브리핑" + "IBK AI Agent 제재사례 모니터링 — 내부통제점검팀" + 구분선(section) |
| 2 | 요약 오프닝 | `buildOpening` | **항상** | 아래 3분기 |
| 3 | 제재 카드 | `buildItems` | graded≥1 | **전 건**을 동일 구조 카드로 (Tier→등급 순) |
| 4 | 📅 마감 요약 | `buildDeadlineSummary` | graded≥3 **및** D-7 이내≥2 | FSS는 D-day가 없어 dday가 항상 "미확인" → **실질 미발동** |
| 5 | 📖 오늘의 용어 | `buildTerm` | `term.word` 존재 | "📖 오늘의 용어 (처음 보시는 분만)" + 정의 + (출처) |
| 6 | 오늘 하나만 | `buildClosing` | graded≥1 | 구분선(section) + "오늘 하나만 기억하세요." + 한 줄 |

> **버려진 빌더:** `buildOtherItems`("그 외 오늘의 제재·경영유의")는 코드에 정의돼 있으나 `buildDocument`에서 **호출하지 않는다**. 모든 항목은 §3 카드로 전건 수록되므로 별도 "그 외" 목록은 출력되지 않는다.
> **마감(📅 D-day) 섹션:** FSS 제재·경영유의는 의견마감·시행일 개념이 없다. `buildDeadlineSummary`는 남아 있지만 dday가 채워지지 않아 조건(D-7 이내≥2)을 못 채워 사실상 출력되지 않는다.

### 2. 요약 오프닝 3분기 (buildOpening)

| 분기 | 조건 | 문구 |
|------|------|------|
| noUpdate | `data.noUpdate` | "오늘 금융감독원 신규 제재·경영유의는 없었어요." + "전일 이후 새로 공개된 건이 없어요. 기존 진행건 점검을 유지해 주세요." |
| 빈 상태 | graded 0건 | "오늘은 IBK 연관 신규 제재·경영유의가 없었어요." + "기존 점검 체계를 재점검하는 시간으로 활용해보세요 🙂" |
| 일반 | graded≥1 | "오늘 금융감독원이 공개한 제재·경영유의는 {N}건이에요." + "그 중 지금 바로 살펴봐야 할 건 {상 등급 수}건이에요." (상≥1이면 그 수를 빨강 강조) |

> `{N}` = `data.totalNew`(수집 전체 건수). "지금 바로 살펴봐야 할 건" = 상(🔴) 등급 수.
> **빈 상태 처리 원칙:** 빈 섹션 헤딩을 고정 출력하지 않는다. graded가 없으면 오프닝 문구가 안내를 대신하고, 조건부 섹션(3~6)은 자연히 생략된다.

### 3. 제재 카드 (buildItems) — 전 건, 각 카드 동일 구조

```
divider("item") + SP_SMALL
🔴|🔶|🔹 제재대상  {기관명}                    ("제재대상 " = TS.law 26 blk Bold / 기관명 = TS.law 26 Bold, 상=red · 그 외=ibkBlue)
{계층라벨}  ·  {제재조치일·게시일}  ·  {제재유형}   (메타 줄, TS.caption 18 gray1 — 값 있는 것만 "  ·  "로 연결)
무슨 일이 있었나요?                              (라벨: TS.sub 20 ibkBlue Bold) → what_changes[0]  (본문 들여쓰기 left:160)
IBK에도 발생 가능한가요?                         (라벨) → ctrl_insight        (재발 가능성 — fallback 시 배지)
무엇을 점검할까요?                                (라벨) → our_action[0]        (본문 색 ibkBlue)
SP_MEDIUM
```

- **핵심 분리 원칙:** 헤더 "제재대상 {기관명}"은 **제재받은 곳**이다. "IBK에도 발생 가능한가요?/무엇을 점검할까요?"는 **IBK 자가점검 관점**이다. 두 주체를 혼동하지 않도록 명확히 구분한다.
- LLM이 못 채운 항목(`item._fallback`)은 `(키워드 추정 — 검토 필요)` 배지를 앞에 붙여 노출한다(항목 숨김 금지 — 신뢰 오인 방지).
- `ensureTone()`이 강요형·평어 위반 패턴을 콘솔 경고로 잡는다(텍스트는 그대로 출력).

### 5~6. 용어 · 마무리
- **📖 오늘의 용어:** `{용어}란? {정의}` + `({출처})`. `term.word`가 있을 때만.
- **오늘 하나만 기억하세요:** 상 등급 2건↑이면 "오늘 우선 살펴볼 제재사례가 {N}건이에요. {부서} 등 관련 부서에 유사 업무 점검을 제안해 주세요.", 1건이면 "오늘은 {부서}의 유사 업무 점검 여지를 먼저 챙겨보세요.", 없으면 "관련 부서와 유사 업무 점검 여지를 살펴보세요."

---

## Telegram 메시지 (tgMsg — briefV2.js `buildTgMsg`)

보고서와 별개로 crawl_result.json `tgMsg`에 기록(완료 알림 본문). **헤더는 항상 `🔔 FSS 제재·경영유의 브리핑 (HH:MM)`.**

**알림 대상 규칙:** `alertItems` = graded 중 **T3(주변기관: 환전·대부·대리점 등) 제외** = T0·T1·T2 전건, `byTierGrade` 순 정렬. 제외된 T3 건수는 "참고"로만 언급(보고서에는 전건 수록).

| 시나리오 | 형식 |
|----------|------|
| noUpdate | 헤더 + "금감원 신규 확인 · 변동 없음" + "✅ 신규 제재·경영유의 없음 — 기존 점검 유지" |
| 알림 대상 0건 | 헤더 + "금감원 신규 확인 · IBK 유관 없음" + "✅ {T3 N건은 참고용 — 보고서에만 수록 \| 추가 조치 불필요}" |
| 알림 대상 있음 | 헤더 + "금감원 신규 중 IBK 유관 {N}건 (🔴 즉시점검 {M}) · 주변 {K}건 참고" + 각 항목 블록 |

**항목 블록(itemBlock):** 질문 라벨(불릿)과 답변(들여쓰기 다음 줄)을 2계층으로 분리.
```
🔴|🔶|🔹 제재대상: {기관명} [{계층라벨|기관}] · {제재조치일·게시일} · {제재유형}

• 왜 제재를 받았나요?
   {what_changes[0]}

• IBK에서도 발생 가능한가요?
   {ctrl_insight}          (fallback 시 배지)

• 이런 부분을 점검하시면 좋아요
   {our_action[0]}
```

> **pm 오전 대비 델타 마감**은 위 tgMsg(briefV2)와 별개로 `notify_telegram.js`가 생성한다: 오전 대비 신규 없음이면 "✅ 신규 제재·경영유의 없음" 취지의 델타 메시지를 전송한다.

---

## 중요도 판정 로직 (D-day 없음 — Tier × 제재강도)

FSS는 의견마감·시행일이 없으므로 days_left 가산은 하지 않는다. 정렬·알림은 **기관 계층(Tier)**과 **제재강도(grade)**로 결정한다.

```javascript
// 정렬 가중치 (briefV2.js 실측)
const TIER_RANK  = { T0: 4, T1: 3, T2: 2, T3: 1 };   // T0 IBK · T1 은행 · T2 인접금융 · T3 주변
const GRADE_RANK = { "상": 3, "중": 2, "하": 1 };
byTierGrade(a, b) = TIER_RANK 차 || GRADE_RANK 차;    // Tier 우선, 동 Tier 내 등급

// 알림 = T0·T1·T2 전건 (T3 제외, 보고서엔 수록)
// 보고서 = 전건 (T3 포함, 하위 정렬)
```

> 등급(상/중/하) 및 Tier 산정 기준은 `knowledge/fss_tier_methodology.md`가 정본이다.

---

## 주의 사항

1. **스페이서 단락 sz:1** — 빈 단락은 `lineRule:"exact"` + sz:1. 기본 크기로 두면 줄 높이 과대.
2. **시맨틱 헤더 사용** — 섹션 식별은 ⚖️/🔴/🔶/🔹/📖 이모지. 원문자 번호(❶❷…)는 쓰지 않는다.
3. **빈 섹션 헤딩 고정 출력 금지** — 조건부 섹션은 콘텐츠 없으면 생략. 빈 상태는 오프닝 문구로 안내.
4. **safeSection 장애 격리** — 섹션 빌더가 throw해도 placeholder 한 줄로 대체하고 나머지 섹션은 계속 생성.
5. **fallback 배지** — LLM 미채움 항목은 `(키워드 추정 — 검토 필요)` 라벨로 노출(숨김 금지).
6. **제재대상 vs IBK 점검부서 분리** — 카드 헤더 기관명과 점검 항목의 주체를 혼동하지 않게 표기.
7. **파일명 슬롯 일치** — docx 파일명은 슬롯 라벨(am→morning / pm→afternoon)을 반영한다(`reportDocxName(date, slot)`).

---

## 의존 파일

| 파일 | 용도 |
|------|------|
| `briefV2.js` | 보고서·tgMsg 생성기 (이 명세의 권위 기준) |
| `fss_crawler.js` | FSS 2소스(제재공시/경영유의) 수집 + seen_ids dedup |
| `analyst.js` | Claude(claude-haiku-4-5) 분석 — what_changes/ctrl_insight/our_action |
| `knowledge/fss_tier_methodology.md` | 기관 계층 × 제재강도 중요도 방법론 |
| `knowledge/tone-guide.md` | 라이팅 8원칙(해요체) |
| `validator.js` | 항목 품질(A·B) · tgMsg(C) · 보고서 구조(D) 검증 |

---

_last updated: 2026-07-02 (FSS 현행 구현 기준 갱신)_
