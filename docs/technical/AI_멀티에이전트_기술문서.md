# AI 멀티 에이전트 기술문서 — 설계 패턴과 신뢰성 엔지니어링

> IBK 금융감독원 제재·경영유의 모니터링 파이프라인을 **2026년 에이전틱 AI 설계 패턴**에 매핑한 기술 문서.
> 시스템 사실의 정본은 코드/yml이며, 상세 명세는 [ARCHITECTURE](ARCHITECTURE.md)·[AGENT_ORG_CHART](AGENT_ORG_CHART.md)·[METHODOLOGY](../business/METHODOLOGY.md)·[SKILL](SKILL.md)를 참조한다(본 문서는 사실을 복제하지 않고 패턴을 설명한다).

_대상: 기술팀/개발자 · 2026-07-04 작성_

---

## 0. 설계 철학 한 줄

> **결정론적 오케스트레이션 + 단일 LLM 추론 에이전트 + 가드레일.**
> "완전 자율 멀티에이전트"가 아니라, **흐름은 코드로 고정**하고 **판단이 필요한 한 단계에만 LLM**을 쓰며 **출력은 자동 검증**한다. 신뢰성·감사성이 자율성보다 우선하는 도메인(내부통제)에 맞춘 선택.

---

## 1. 에이전트 구성 (역할·입출력·계약)

| 에이전트 | 유형 | 역할 | 입력 → 출력 | 종료코드 |
|---|---|---|---|---|
| `fss_crawler.js` | 규칙 | 수집 — FSS 2소스(제재공시 HTML+PDF / 경영유의 PDF) 직접 스크래핑, **관측 창 차집합(scan-window diff)+레저** 신규판정, Tier 분류·인라인 점수 | (날짜) → `crawl_result.json` | 0 정상 / 실패 시 `failure_meta.json`+exit1 |
| `analyst.js` | **LLM** | 분석 — IBK 벤치마킹(발생 가능성)·부서배정·점검제안·위험도·`tgMsg` | `crawl_result.json` → 갱신 | 0 정상 / 1 fallback / 2 치명 |
| `briefV2.js` | 규칙 | 보고서 — **제재 카드형** docx + `tgMsg` | `crawl_result.json` → `*_brief.docx` | 0 |
| `validator.js` | 규칙(가드레일) | 검증 — A 톤 8원칙·B 절삭·C tgMsg·D 보고서 구조 | `crawl_result.json`+docx → `validation_result.json` | 0 통과 / 1 경고 / 2 오류 |
| `archivist.js` | 규칙 | 아카이브 — 로그·메타·매니페스트·보관정책 | 전체 → `logs/`, `run_meta.json` | 0 |
| `notify_telegram.js` | 규칙 | 알림 — 시작/완료(pm 델타)/오류 | `tgMsg` → Telegram | 0 / 1 |

**모델:** 분석 에이전트는 Claude Haiku 4.5(`claude-haiku-4-5-20251001`, `MAX_TOKENS=2048`, `CONCURRENCY=3`) — *경계가 분명한 분류·작성 작업*에 소형·저지연 모델을 right-sizing한 사례. API 키 부재/오류 시 키워드 템플릿 fallback(exit 1, 파이프라인 계속). 보조: `runslot.js`(am/pm 슬롯·경로 결정).

> 패턴: **단일 책임 에이전트(single-responsibility agents)**. 각 에이전트는 표준 산출물(`crawl_result.json` 스키마)을 계약으로 주고받아 느슨하게 결합된다.

---

## 2. 오케스트레이션 — 결정론적 단일 Job

[.github/workflows/daily-brief.yml](../../.github/workflows/daily-brief.yml) 단일 GitHub Actions Job이 6개 에이전트를 **순차** 실행한다.

```
Cloudflare Workers Cron(08:00·16:00 KST) → workflow_dispatch
  → STEP0 시작알림 → STEP1 수집 → STEP2 분석 → STEP3 보고서 → STEP4 검증
  → STEP5 아카이브 → STEP6 감사커밋 → Artifact 업로드 → 완료알림
```

- **왜 결정론적 오케스트레이션인가:** 에이전트 간 자율 협상/플래닝 대신 고정 파이프라인 → 재현성·디버깅성·감사성 확보. (자율 멀티에이전트의 비결정성 위험을 피하고 *구조화된 에이전틱 워크플로우*를 택함)
- **정시성 분리:** GitHub 자체 schedule cron(지연·누락)을 제거하고 외부 Cloudflare Workers Cron이 `workflow_dispatch`로 발화 — 관심사 분리. 하루 2회(08:00 am / 16:00 pm).
- **슬롯 분리:** 런별 산출물을 `reports/{date}/{am|pm}/`에 **비파괴 분리 보존**(감사). 두 슬롯은 공존.
- **신규 판정(★ FSS 고유) — 직전 실행 관측 창 차집합(scan-window diff):**
  FSS 목록엔 **게시일 컬럼이 없다.** 3번째 컬럼은 `제재조치요구일`(`actionRequestDate`)이고 목록은 그 값의 **내림차순 정렬**이라, 오늘 새로 게시된 건도 조치요구일이 과거면 **목록 맨 위가 아니라 중간에 삽입**된다 → **날짜로는 신규를 판정할 수 없다.**
  그래서 직전 실행의 `crawl_result.scanAudit`(페이지별 전체 행 key + 훑은 깊이)을 복원(`buildScanWindow`)해, **그 깊이 안에서 그때는 없다가 지금 나타난 행**만 신규로 본다. `classifyRow(key, page, ledgerMap, win, seed)`가 3분기로 가른다.

  ```
  레저(state/seen_ids.json)/직전 창에 있음  → known    (재알림 차단)
  seed(최초 실행)                            → backfill (목록 전체가 과거 누적분)
  page ≤ win.depth 이고 레저에 없음          → new      (조치요구일이 과거여도 신규)
  page >  win.depth                          → backfill (창 밖 — 판정 근거 없음)
  직전 창 유실 시 depth = WINDOW_FALLBACK_DEPTH 가정 (레저로만 판정)
  ```

  `backfill`은 레저에만 등록하고 보고에서 제외하되 `crawl_result.backfilled[]`에 **명시 기록**한다(침묵 폐기 금지). 창 밖 격리 덕에 `--pages` 확장 시 과거 누적분이 범람하지 않는다. 관측 창 깊이는 `--pages` **기본 5**(`FSS_MAX_PAGES`)이며, `scanWindow.floorLookbackDays` < **45일**이면 창이 얕다고 경고한다. 레저 키는 제재=`examMgmtNo_emOpenSeq` / 경영유의=첨부 파일ID. 산출은 `crawl_result.{ newItems[], backfilled[], scanWindow{}, completeness{}, scanAudit[] }` · `newItemBasis: "scan-window-diff"`.
  > **폐지:** 구 `REPORT_SINCE`(게시일 앵커)는 정렬 컬럼(조치요구일)에 커트오프를 걸어 **늦게 게시된 과거 조치요구일 건을 침묵 폐기**했다(실제 사고: `아이비케이신용정보` — 2026-07-09 신규 게시, 조치요구일 06-25). 2026-07-10 폐지됐고 env로 설정해도 무시·경고만 출력된다. 필드명도 `postDate`(오칭) → `actionRequestDate`로 정정.

  신규 건이 목록 상단에 없어 수신자가 혼동하므로, `listedOutOfOrder`(조치요구일 < 최초 등장일) 건에 한해 **조치요구일 · 최초 등장일(`firstSeenDate`) · 목록 행 번호(`listRank`)** 를 안내한다(briefV2 `listingNoticeLines()` → DOCX `buildListingNotice` + Telegram `tgMsg` 말미; 해당 건 없으면 미출력). 제재는 시행일·의견마감(D-day) 개념이 없어 마감 리마인더는 두지 않는다.
- **pm 델타 완료 알림:** 16:00 실행은 오전본 대비 `--delta-since`로 *오전 이후 신규만* 알리고, 없으면 '변동 없음' 마감(시작→끝 짝 보장). 원장 git 커밋은 수집 성공 시에만(fail-safe).

---

## 3. 컨텍스트 엔지니어링 — 지식 주입

비즈니스 지식을 **코드/프롬프트에서 분리**해 런타임에 주입한다([analyst.js](../../analyst.js)).

```
코드(analyst.js)          = "어떻게 분석하나" (불변)
시스템 프롬프트(agents/)  = 분석·글쓰기 원칙(analyst_system_prompt.md)
지식 베이스(knowledge/)   = "무엇을 참고하나" (자주 갱신)
  ├ tone-guide.md          라이팅 8원칙(해요체) — analyst 주입
  ├ ibk-dept-mapping.md    부서 매핑
  ├ ibk_org_chart.md       조직도(검사부 등)
  ├ ibk_mapping_rules.md   제재유형-내규 매핑
  ├ ibk_action_rules.md    부서 배정·점검 액션 규칙
  └ fss_tier_methodology.md 기관 계층(T0~T3)×위험도 방법론(수집기 인라인 참조)
```

> 패턴: **컨텍스트 엔지니어링 / 지식-코드 분리**. `knowledge/*.md`만 고치면 재배포 없이 AI 동작이 바뀐다. 조직 개편·제재유형 변화 같은 *지식 변화*를 코드 변경 없이 반영 — 운영 민첩성과 거버넌스(지식의 단일 출처)를 동시에 확보. (정본은 `knowledge/`, 루트 동명 파일은 포인터 stub)

---

## 4. 신뢰성·하네스 엔지니어링

### 4.1 종료코드 계약
분석·검증 에이전트가 `0/1/2` 종료코드 규약을 따른다(§1 표). 오케스트레이터는 코드로 분기: 분석 exit2만 중단, exit1은 fallback 계속. 검증 exit2는 경고(계속, status=warn).

### 4.2 Fallback / 재시도 계층
```
수집:  FSS 2소스 직접 스크래핑(Job 레벨 최대 3회 재시도, 120초 간격) → 최종 실패 시 failure_meta 격리
분석:  Claude API 추론 → 키 없음/오류 시 키워드 템플릿(exit1, 보고서는 생성)
```
> ※ FSS는 데이터소스가 **단일 방식(직결 스크래핑)**이라, 자매 프로젝트(FSC)의 "OPEN API 1차 → 스크래핑 fallback" 같은 소스 이중화 계층이 없다. 대신 콜드스타트·일시장애를 재시도로 흡수한다.

### 4.3 실패 격리 (failure isolation)
수집 실패 시 **성공본 `crawl_result.json`을 건드리지 않고** `failure_meta.json`만 기록 → STEP6이 그 신호로 커밋 대상을 가른다(성공 데이터/실패 로그 분리). *과거(FSC) timeout이 성공 6건을 0건으로 덮어쓴 회귀를 원천 차단한 설계를 계승.*

### 4.4 "모르면 멈춘다"
수집 timeout/error를 *"IBK 영향 없음 / 신규 없음"으로 오인 보고하지 않는다.* 데이터 미확인 시 명시적 실패(exit1) + "❌ 수집 실패" 알림 → 재실행 유도.

> 패턴: **하네스 엔지니어링 / graceful degradation**. 실패를 숨기지 않고 등급화(치명 vs 계속)하며, 비파괴 기록으로 감사 안전성을 보장.

---

## 5. 가드레일 — LLM 출력 자동 검증

[validator.js](../../validator.js)가 LLM 산출물을 사람 전수 검수 없이 코드로 검증한다.

| 그룹 | 검사 |
|---|---|
| A (톤 8원칙) | 핵심선행·문장길이(A2 120/200자, 제재 분석 완화)·금지표현·독자주어·숫자날짜(**A6 D-day 검사 제외** — 제재는 마감 없음)·동사종결·해요체(A7/A7b) |
| B (절삭) | `what_changes`/`our_action`/`ctrl_insight` 존재·최소길이·과단 탐지 |
| C (tgMsg) | 헤더(`금융감독원 제재·경영유의 브리핑`)·제재대상 카드·질문형 라벨·"IBK 유관 없음" 형식 |
| **D (보고서 구조)** | crawl_result 데이터로 *기대 섹션*을 계산해 실제 docx 출력과 대조(제재대상 / 무슨 일이 있었나요? / IBK에도 발생 가능한가요? / 무엇을 점검할까요?) |

> 패턴: **가드레일 / 출력 평가(evaluation)**. 결함은 프롬프트 개선의 신호가 된다(피드백 루프). D 검증은 "사양↔구현 드리프트"를 자동 포착 — 문구 변경 시 [SKILL](SKILL.md) 정본과 함께 갱신한다.

---

## 6. 데이터·인프라

- **데이터소스:** 금융감독원 홈페이지 2소스를 **HTML 앵커 href에서 상세경로를 추출해 직접** 긁는다(추정 경로·하드코딩 없음).
  ① 제재공시 `openInfo/list.do?menuNo=200476`(목록 HTML → 상세 `view.do`, 본문 PDF 첨부) · dedup 키 `examMgmtNo_emOpenSeq`
  ② 경영유의·개선 `openInfoImpr/list.do?menuNo=200483`(목록 → 첨부 PDF 직행) · dedup 키 첨부 파일명 선두 ID
  제재 관련 공개 API가 없어(실측) HTML/PDF를 직접 스크래핑하고, PDF 본문은 `pdf-parse`로 추출한다.
- **egress: 프록시 없음(★ FSC와의 결정적 차이).** 금융감독원 사이트는 **해외 IP 차단이 없음이 검증**됐다(미국 러너 4종 접근 PASS, `diag-fss-access.yml`) → KR 경유 프록시·OPEN API 계층이 **불필요**. 네트워크 출구를 우회할 필요가 없어 구조가 단순하고 장애 지점이 적다.
- **상태 저장소:** `state/seen_ids.json`이 유일한 영속 상태(클라우드 러너는 휘발) — 성공 시에만 git 커밋해 중복방지 상태를 지속. 신규 판정은 §2의 **관측 창 차집합(scan-window diff) + 레저** 병행이며, 직전 창 복원의 근거인 `scanAudit`도 함께 커밋된다(repo가 유일한 상태 저장소).

> 패턴: **소스·출구 분리 진단**. 데이터소스(공식 게시판)와 네트워크 출구(egress)를 분리 진단한 결과, FSS는 출구 우회가 불필요함을 검증하고 **직결 스크래핑**을 채택 — 자매 프로젝트가 도입한 KR 엣지 프록시/설정관리 계층을 이 도메인에서는 두지 않는 것이 올바른 선택이었다.

---

## 7. 관측성·거버넌스 (감사 추적)

| 요구 | 설계 |
|---|---|
| 분석 근거 보존 | `crawl_result.json`에 원문 URL·PDF `bodyText`·판정 필드 |
| **스캔 증적(★ FSS 강화)** | `crawl_result.scanAudit` — 신규 0건인 날에도 *스캔한 목록 key 전체 + 페이지 본문 SHA-256*을 git 영구 기록 → 원본 HTML(Artifact 90일) 만료 후에도 "무엇을 스캔했나" 항구 증적 |
| 런별 산출물 분리 | `reports/{date}/{am\|pm}/` 비파괴(덮어쓰기 금지) |
| 실행 이력 | `logs/run_manifest.jsonl` 누적 |
| 버전 관리 | GitHub Artifacts 90일 + STEP6 감사 git 커밋(crawl_result·run_meta·manifest·seen_ids) |
| 보관 정책 | docx 90일 / json 30일 / 로그 14일(archivist) |

> 패턴: **관측성/거버넌스**. 모든 실행이 재현·추적 가능 — 내부통제·감사 대응의 1차 요건. scanAudit로 *신규가 없는 날의 크롤 사실*까지 영구 증적한다.

---

## 8. 2026 에이전틱 패턴 매핑 (요약)

| 패턴 | 구현 위치 |
|---|---|
| 단일 책임 에이전트 | 6개 에이전트, `crawl_result.json` 계약 |
| 결정론적 오케스트레이션 | daily-brief.yml 단일 Job |
| 모델 right-sizing | 분석=Claude Haiku, 나머지=규칙 |
| 컨텍스트 엔지니어링 | `knowledge/*.md` 런타임 주입 |
| 가드레일/평가 | validator A/B/C/D |
| Graceful degradation | fallback + 종료코드 + 재시도 |
| 실패 격리·비파괴 | failure_meta + 슬롯 분리 |
| 노이즈 억제(신규 1회) | 관측 창 차집합 + 영구 레저(seen_ids), pm 델타 |
| 감사 증적 강화 | scanAudit(신규 0건도 스캔 증적) |
| 휴먼 인 더 루프 | 사람 검토·의사결정 |
| 관측성/거버넌스 | manifest·artifact·감사커밋 |
| 소스·출구 분리 진단 | 해외 IP 차단 없음 검증 → 프록시 불요, 직결 스크래핑 |

---

## 9. 재현·확장·한계

- **재현:** 수동 실행 `gh workflow run "IBK FSS Sanction Brief" --ref main` / 단계별 `node <agent>.js --date YYYYMMDD`. 회귀 테스트 `npm test`(node:test).
- **확장:** 대상 기관·소스 추가는 수집 에이전트(`fss_crawler.js`) + `knowledge/` 갱신으로. 알림 채널 추가는 알림 에이전트 확장으로. 관측 창 깊이는 `--pages`(env `FSS_MAX_PAGES`, 기본 5)로 조정하며, 창을 넓혀도 창 밖 신규분은 `backfill`로 격리돼 과거 누적분이 범람하지 않는다. **`REPORT_SINCE`(게시일 앵커)는 폐지됐다 — env로 설정해도 무시되고 경고만 출력된다.**
- **한계:** LLM은 초안·분류를 담당하고 최종 판단은 사람(의도된 설계). 데이터소스가 직결(프록시 없음)이라 egress SPOF가 없는 대신, 소스 사이트 구조 변경 시 파서 점검이 필요 — 수집 실패 시 "❌ 수집 실패" 알림으로 조기 인지한다.

---

## 10. 참조 (정본)

| 자료 | 역할 |
|---|---|
| [.github/workflows/daily-brief.yml](../../.github/workflows/daily-brief.yml) | 오케스트레이션 정본 |
| [analyst.js](../../analyst.js) · `knowledge/*` · `agents/*` | 분석 에이전트·지식·프롬프트 |
| [fss_crawler.js](../../fss_crawler.js) · [validator.js](../../validator.js) | 수집(관측 창 차집합·레저·scanAudit)·가드레일 정본 |
| [ARCHITECTURE](ARCHITECTURE.md) · [AGENT_ORG_CHART](AGENT_ORG_CHART.md) | 구조·에이전트 명세 |
| [METHODOLOGY](../business/METHODOLOGY.md) | 설계 이유·글쓰기 원칙 |
| [SKILL](SKILL.md) | 보고서 레이아웃 정본(briefV2 v3.2) |
| [워크플로우](../operations/workflow.md) · [기술문서(명세)](../deliverables/04_TECH_DOC.md) · [최근 개선사항](../deliverables/06_개선사항_2026-07.md) | 운영 절차·컴포넌트 명세·개선 이력 |
