# ibk-legis-morning-brief Skill

> **v2.4 기준 (뉴스레터형)** — 실제 출력 생성기 `briefV2.js`와 일치하도록 작성.
> 보고서는 `🌞/🔴/🔹/📖` 시맨틱 헤더의 뉴스레터형이다. v2.3의 ❶~❺ 고정번호·대시보드 3칸표·
> 체크포인트 세칙그룹·마감캘린더 5열표는 **폐지**(현행 미생성). 디자인 상수(폰트·마진·색·타입스케일)는
> CLAUDE.md "디자인 상수(변경 금지)"와 동일하다. 수치 변경 시 반드시 버전 표기.

---

## 트리거

| 조건 | 값 |
|------|-----|
| 스케줄 | 평일 06:00(am)·16:00(pm) KST (Cloudflare Workers Cron → workflow_dispatch) |
| 입력 | `reports/{YYYYMMDD}/{slot}/crawl_result.json` (수집 + Claude 분석 결과) |
| 출력 | `reports/{YYYYMMDD}/{slot}/{YYYYMMDD}_{morning\|afternoon}_brief.docx` |
| 생성기 | `briefV2.js` (docx 라이브러리) |

---

## 페이지 설정 (실측 — 변경 금지)

```javascript
page: {
  size:   { width: 11906, height: 16838 },          // A4 portrait, DXA
  margin: { top: 850, right: 1020, bottom: 850, left: 1020,
            header: 708, footer: 708, gutter: 0 }   // DXA
}
// 본문폭 CW = 11906 - 1020 - 1020 = 9866 DXA
```

## 폰트 · 색상 상수 (briefV2.js 실측)

모든 텍스트: **맑은 고딕**.

```javascript
const ibkBlue = "0D2F8B";   // 소제목·액션·강조 / 헤더 구분선·마무리
const skyBlue = "1E88BC";   // 부제(IBK AI Agent …)
const red     = "C0392B";   // 🔴 즉시검토 법령명·강조
const gray1   = "666666";   // 날짜·캡션·메타·"그 외" 제목
const gray2   = "999999";   // 보조 캡션(용어 출처 등)
const blk     = "1A1A1A";   // 일반 본문
```

## 타입 스케일 (4단계 고정 — v3.2)

```javascript
const TS = {
  title:   36,   // 문서 제목 "🌞 아침에 읽는 규제 변화"
  law:     24,   // 🔴 법령명 헤더
  opening: 21,   // 오프닝/마무리 문장
  sub:     19,   // 소제목 (뭐가 바뀌나요? 등) · 본문(Bold로 구분)
  body:    19,
  caption: 17,   // 날짜·출처·"그 외" 항목 설명
};
```

## 간격 · 스페이서 · 구분선 (실측)

```javascript
const GAP = {
  sub_before:  120,   // 소제목 위 공백
  body_after:   32,   // 본문/불릿 단락 아래 공백
  section_gap: 480,   // SP_LARGE — 섹션 사이
  item_gap:    280,   // SP_MEDIUM
  micro:       120,   // SP_SMALL
};
// 스페이서 빈 단락은 sz:1, lineRule:"exact" (줄 높이 과대 방지)

// 구분선(divider) — 색이 아니라 '두께'로 역할 구분
//   role "section": 두께6 ibkBlue  — 헤더/마무리
//   role "item"   : 두께4 BBBBBB    — 🔴 항목 앞
//   role "minor"  : 두께2 DDDDDD    — 그 외/마감/용어

// 불릿 numbering: reference "bullets"(•) / "subbullets"(–) — 동일 abstractNum 혼용 금지
```

---

## 문서 구조 (뉴스레터형 — 조립 순서)

briefV2.js `buildDocument`가 아래 7개 빌더를 순서대로 조립한다(각 `safeSection`으로 장애 격리).
**고정 2개**(header·opening)는 항상, **조건부 5개**는 콘텐츠가 있을 때만 출력한다.

| # | 섹션 | 빌더 | 출력 조건 | 핵심 마커/내용 |
|---|------|------|-----------|----------------|
| 1 | 🌞 헤더 | `buildHeader` | **항상** | 날짜 "YYYY. MM. DD. (요일)" + "🌞 아침에 읽는 규제 변화" + "IBK AI Agent 법령 모니터링 — 내부통제점검팀" + 구분선(section) |
| 2 | 요약 오프닝 | `buildOpening` | **항상** | 아래 3분기 |
| 3 | 🔴 즉시검토 카드 | `buildUrgentItems` | 상(score≥4) 1건 이상 | 상 등급 **최대 2건** |
| 4 | 🔹 그 외 오늘 체크할 법령 | `buildOtherItems` | 위 2건 외 항목 존재 | "그 외 오늘 체크할 법령" + 🔶/🔹 목록 |
| 5 | 📅 이번 주 마감 요약 | `buildDeadlineSummary` | graded≥3 **및** D-7 이내≥2 | "📅 이번 주 마감 요약" + D-7 이내 최대 3건 |
| 6 | 📖 오늘의 용어 | `buildTerm` | `term.word` 존재 | "📖 오늘의 용어 (처음 보시는 분만)" + 정의 + (출처) |
| 7 | 오늘 하나만 | `buildClosing` | graded≥1 | 구분선(section) + "오늘 하나만 기억하세요." + 한 줄 |

### 2. 요약 오프닝 3분기 (buildOpening)

| 분기 | 조건 | 문구 |
|------|------|------|
| noUpdate | `data.noUpdate` | "오늘 금융위원회 신규 입법예고는 없었어요." + "전일과 동일한 내용이에요 …" |
| 빈 상태 | graded 0건 | "오늘은 금융위원회 신규 입법·개정 예고가 없었어요." + "기존 내규와 점검 체계를 재점검하는 시간으로 …" |
| 일반 | graded≥1 | "오늘 금융위원회에서 입법·개정 예고한 법령은 {N}개예요." + "그 중 지금 바로 챙겨야 할 건 {상 등급 수}개예요." (상≥1이면 빨강 강조) |

> **빈 상태 처리 원칙:** v2.3처럼 빈 섹션 헤딩을 고정 출력하지 않는다. graded가 없으면 오프닝 문구가 안내를 대신하고, 조건부 섹션(3~7)은 자연히 생략된다.

### 3. 🔴 즉시검토 카드 (buildUrgentItems) — 상 등급 최대 2건, 각 카드 구성

```
divider("item")
🔴 {약칭}   ·  D-{n}                         (TS.law=24, red, Bold)
{주담당부서}라면 오늘 {핵심 액션 힌트}        (TS.body=19, Bold 일부)
협조부서: {관련부서 · 관련부서}               (관련부서 있을 때, TS.caption gray1)
뭐가 바뀌나요?                               (subHeading, ibkBlue) — what_changes 불릿 최대 2
왜 중요한가요?                               (subHeading) — ctrl_insight 한 줄
할 일                                        (subHeading) — our_action 불릿 최대 3 (ibkBlue Bold)
```
> LLM이 못 채운 항목은 `(키워드 추정 — 검토 필요)` 배지를 붙여 노출(항목 숨김 금지 — 신뢰 오인 방지).

### 4. 🔹 그 외 오늘 체크할 법령 (buildOtherItems)
"그 외 오늘 체크할 법령" 소제목 아래, 상 등급 상위 2건을 제외한 나머지를 한 줄 카드로:
`{🔶|🔹} {약칭}  D-{n}` + 들여쓴 요약줄 `{핵심변경}  →  {주담당}[ 외 N개 부서]`.

### 5~7. 마감 요약 · 용어 · 마무리
- **📅 이번 주 마감 요약:** D-7 이내 항목을 `{D-n} {약칭} → {부서}` 로 최대 3건.
- **📖 오늘의 용어:** `{용어}란? {정의}` + `({출처})`.
- **오늘 하나만 기억하세요:** 상 등급 2건↑이면 "D-day 마감 법령이 {N}개예요. 오늘 안에 …", 1건이면 부서·D-day 안내.

---

## Telegram 메시지 (tgMsg — briefV2 `buildTgMsg`)

보고서와 별개로 crawl_result.json `tgMsg`에 기록(완료 알림 본문). 시나리오별 형식:

| 시나리오 | 형식 |
|----------|------|
| 즉시검토 있음 | 헤더 "🔔 내부통제 동향 알림 (HH:MM)" + "{N}건 수집 · 즉시검토 {M}건🔴 · 검토 {K}건" + 각 🔴 블록(WHAT/WHEN/WHO/HOW/WHY) |
| 검토만 있음 | 헤더 + "{N}건 수집 · 검토 {K}건" + 🔶/🔹 항목 |
| 영향 없음 | 헤더 + "{N}건 수집" + "✅ IBK 영향 없음 — 추가 조치 불필요" |
| 변동 없음(noUpdate, 전일 대비) | 헤더 + "{N}건 수집 · 전일 대비 변동 없음" + "✅ 신규 입법예고 없음 …" |

> 즉시검토(WHAT/WHEN/WHO/HOW/WHY) 포맷은 다행(多行)·장문이 정상이다. validator C1(글자수)·C2(줄수)는 **경고가 아니라 정보(info)** 로 기록한다.
>
> ※ **pm 오전 대비 델타 마감**은 위 tgMsg(briefV2)와 별개로 `notify_telegram.js`가 생성한다: 오전 대비 신규 graded 0건이면
> "🔔 내부통제 동향 알림 (HH:MM) / {N}건 수집 · 오전 대비 변동 없음 / ✅ 신규 입법·행정 예고 없음 — 기존 진행건 모니터링 유지"를 전송(무음 아님).

---

## 중요도 판정 로직

```python
def grade(score, days_left):
    if days_left <= 14: score += 2
    elif days_left <= 30: score += 1
    # tier1 매칭 +3, tier2 +1 (ibk-keywords.md)
    if score >= 4: return "상"   # 🔴 즉시검토
    if score >= 2: return "중"   # 🔶 관심 모니터링
    if score >= 1: return "하"   # 🔹 참고
    return None                  # 제외
```

---

## 주의 사항

1. **스페이서 단락 sz:1** — 빈 단락은 `lineRule:"exact"` + sz:1. 기본 크기로 두면 줄 높이 과대.
2. **시맨틱 헤더 사용** — 섹션 식별은 🌞/🔴/🔶/🔹/📅/📖 이모지. ❶❷❸❹❺ 원문자 번호는 폐지.
3. **빈 섹션 헤딩 고정 출력 금지** — 조건부 섹션(3~7)은 콘텐츠 없으면 생략. 빈 상태는 오프닝 문구로 안내.
4. **safeSection 장애 격리** — 섹션 빌더가 throw해도 placeholder 한 줄로 대체하고 나머지 섹션은 계속 생성.
5. **fallback 배지** — LLM 미채움 항목은 `(키워드 추정 — 검토 필요)` 라벨로 노출(숨김 금지).
6. **subbullets reference 분리** — bullets와 동일 abstractNum 공유 금지.
7. **파일명 슬롯 일치** — docx 파일명은 슬롯 라벨(am→morning / pm→afternoon)을 반영한다(`reportDocxName(date, slot)`).

---

## 의존 파일

| 파일 | 용도 |
|------|------|
| `briefV2.js` | 보고서 생성기 (이 명세의 권위 기준) |
| `knowledge/ibk-keywords.md` | 법령 필터링 키워드 사전 |
| `knowledge/tone-guide.md` | 라이팅 8원칙 |
| `validator.js` | 보고서 구조·항목 품질·tgMsg 검증 |

---

_v2.4 (뉴스레터형) — briefV2.js 실측 일치 작성 · 2026-06-30_
_이전: v2.3 (IBK_아침에읽는규제변화_v2.3_Final_20260610.docx 기준 — 대시보드/체크리스트형, 폐지)_
