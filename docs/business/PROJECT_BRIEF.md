# IBK FSS 제재 브리핑 — 프로젝트 기획안 → 구현 완료

> 작성일 2026-06-26 · **상태: 구현·클라우드 라이브 완료 (현행 기준 2026-07-12 — 신규 판정을 게시일 앵커에서 관측 창 차집합으로 전환)** · 이 문서는 설계 배경/이력 + 현행 반영
> 자매 프로젝트: [Daily-Morning-brief](https://github.com/pyorocop-lang/Daily-Morning-brief) (FSC 입법예고 브리핑) — 아키텍처 원본(읽기 전용)
> 운영 개요는 [workflow.md](../operations/workflow.md), 개발 지침은 [CLAUDE.md](../../CLAUDE.md), 상세 아키텍처는 [ARCHITECTURE.md](../technical/ARCHITECTURE.md).

---

## 1. 목적 (한 줄)

금융감독원(FSS)이 **제재공시·경영유의사항**을 게시하면, 신규 건을 자동 수집하고 Claude LLM이 **IBK기업은행 업무와의 연관성**을 분석해 **Telegram 알림 + DOCX 보고서**를 생성하는 완전 클라우드 멀티에이전트 파이프라인.

---

## 2. 데이터 소스 (2종)

| 소스 | URL | 내용 |
|---|---|---|
| 제재공시 | https://www.fss.or.kr/fss/job/openInfo/list.do?menuNo=200476 | 금융회사·임직원 제재내역 (과징금·기관경고·영업정지 등) |
| 경영유의·개선사항 | https://www.fss.or.kr/fss/job/openInfoImpr/list.do?menuNo=200483 | 검사 결과 경영유의/개선 요구사항 |

---

## 3. FSC 프로젝트와의 핵심 차이 (★ 설계의 출발점)

| 구분 | FSC 입법예고 (기존) | **FSS 제재 (신규)** |
|---|---|---|
| 성격 | **예방** — 향후 규제 변화 | **사후** — 실제 위반·제재 사례 |
| LLM 분석 관점 | "법령 변경에 어떻게 대응할까" | **"이 제재사례에서 IBK도 같은 통제 미비점이 있나" (벤치마킹 자가점검)** |
| 핵심 가치 | 마감(D-day) 내 의견 제출·내규 반영 | 타행 제재 → IBK 동일 리스크 선제 점검 / IBK 직접 제재 → 즉시 대응 |
| 발행 주기 | 입법예고일 기준 명확 | **부정기적 — 매일 신규가 없을 수 있음** |
| 신규 판별 | 날짜 기반 | **직전 관측 창 차집합(scan-window diff) + 중복방지 레저** (목록에 게시일 칸이 없어 날짜로 판정 불가) |
| 마감 캘린더(❹) | 있음 | 없음 → **제재 심도/유형 기반 중요도로 대체** |

> 결론: 크롤·dedup·분석 프롬프트·중요도 로직은 **신규 설계**, 보고서/검증/아카이브/알림 골격은 **FSC에서 재사용**.

---

## 4. 아키텍처 (FSC 미러 — 완전 클라우드)

```
Cloudflare Workers Cron (하루 2회: 08:00 KST cron "0 23 * * *" = am / 16:00 KST cron "0 7 * * *" = pm)
  → GitHub workflow_dispatch (워크플로우명 "IBK FSS Sanction Brief")
  → 단일 GitHub Actions Job (ubuntu-latest):
      시작 알림                  notify_telegram.js
      STEP1  크롤(2소스)+dedup    fss_crawler.js      → reports/{DATE}/{SLOT}/crawl_result.json (신규건만 graded[])
      STEP2  분석(Claude Haiku)   analyst.js          (Tier기반 IBK 벤치마킹·부서·점검제안·tgMsg, tone-guide 주입)
      STEP3  보고서(docx)         briefV2.js          → {DATE}_{morning|afternoon}_brief.docx
      STEP4  검증                 validator.js
      STEP5  아카이브             archivist.js        → run_meta.json
      STEP6  감사 커밋·push        crawl_result·run_meta·manifest·state/seen_ids.json
      Artifact 업로드(fss-brief-{DATE}-{SLOT}) + 완료 알림
```
\* 하루 2회 실행: 08:00(am) 전체 알림 · 16:00(pm) 오전 이후 신규만 델타 알림(FSC 동형, 결정 B). SLOT은 발화시각 KST로 판별(runslot.js) — <12=am, ≥12=pm. pm은 `--delta-since reports/{DATE}/am/crawl_result.json` + seen_ids dedup로 오전 이후 신규만 보고하고, 신규 0건이면 '변동 없음 · 기존 점검 유지' 마감 알림. 산출물은 reports/{DATE}/{SLOT}/로 슬롯별 분리 보존(공존·비파괴). 수집 실패 시 failure_meta.json만 쓰고 성공본 비파괴.

**신규 제재 0건일 때:** "오늘 신규 제재 없음" 1줄 조용한 알림(또는 무알림). 오인 보고 금지.

---

## 5. 신규 판별 — 관측 창 차집합 + 중복방지 ledger (★ 신규 핵심 모듈)

**FSS 목록엔 게시일 컬럼이 없다.** 3번째 컬럼은 `제재조치요구일`이고 목록은 그 값의 **내림차순 정렬**이다. 따라서 오늘 새로 게시된 건도 조치요구일이 과거면 목록 맨 위가 아니라 **중간에 삽입**된다 → **조치요구일(날짜)로는 신규를 판정할 수 없다.**

- **신규 = 직전 실행 관측 창 차집합(scan-window diff).** 직전 실행의 `crawl_result.scanAudit`(페이지별 전체 행 key + 훑은 깊이)을 복원해, **그 깊이 안에서 그때는 없다가 지금 나타난 행**만 신규로 본다.
- 판정 3분기 — `classifyRow(key, page, ledgerMap, win, seed)`:

| 조건 | 판정 | 처리 |
|---|---|---|
| 레저(`state/seen_ids.json`)에 있거나 직전 창에 있음 | `known` | 재알림 차단 |
| 직전 창 **깊이 안**에서 새로 나타남 | `new` | **보고** (조치요구일이 과거여도 신규) |
| 직전 창 **밖 깊이** | `backfill` | 레저 등록만, 보고 제외 (`--pages` 확장 시 과거 누적분 범람 방지) |
| 최초 시드(seed) | `backfill` | 레저 등록만, 보고 제외 (목록 전체가 과거 누적분) |

- 직전 창이 유실되면 `WINDOW_FALLBACK_DEPTH` 깊이를 가정해 레저로만 판정한다.
- `backfill`은 레저에만 등록하고 보고에서 제외하되, `crawl_result.backfilled[]`에 **명시 기록**한다 → **침묵 폐기(조용히 버리기)를 하지 않는다.**
- **중복방지 ledger `state/seen_ids.json`**: 소스별 고유키(제재공시=examMgmtNo_emOpenSeq / 경영유의=파일ID) 저장. 같은 건 재알림 차단(특히 08:00·16:00 두 실행 간). git 커밋(감사추적 + 상태 지속성) — 클라우드 실행이라 로컬 상태에 의존 불가, **repo가 유일한 상태 저장소**.
- 관측 창 깊이 = `--pages` **기본 5**(`FSS_MAX_PAGES` override). `scanWindow.floorLookbackDays` < **45일**이면 창이 얕다고 경고한다(창이 얕으면 늦게 게시된 과거 조치요구일 건이 창 밖에 떨어져 영구 미탐).
- 산출: `crawl_result.{ newItems[], backfilled[], scanWindow{}, completeness{}, scanAudit[] }`, `newItemBasis: "scan-window-diff"`.

> **`REPORT_SINCE`(게시일 앵커)는 2026-07-10 폐지.** env로 설정해도 무시되고 경고만 출력된다.
> 폐지 이유: 정렬 컬럼(조치요구일)에 커트오프를 걸어 **늦게 게시된 과거 조치요구일 건을 침묵 폐기**했다. 실제로 **`아이비케이신용정보`**(2026-07-09 신규 게시, 조치요구일 06-25) — 레저 전체를 통틀어 유일한 IBK 계열 건 — 을 놓쳤고, 롯데손해보험·BNP파리바·순창농협·여수농협 등 12건이 같은 방식으로 침묵 폐기됐다.
> 필드명도 정정했다: `postDate`(게시일 — 오칭) → **`actionRequestDate`(제재조치요구일)**.

**목록에서 찾는 법 안내:** 신규 건이 목록 상단에 없어 수신자가 혼동하므로, `listedOutOfOrder`(조치요구일 < 최초 등장일)인 건에 한해 **조치요구일 · 최초 등장일 · 목록 행 번호**를 알림·보고서 말미에 안내한다. 해당 건이 없으면 아예 싣지 않는다(소음 방지).

---

## 6. 중요도 판정 (구현 = 기관 계층 Tier × 위험도)

정본: [knowledge/fss_tier_methodology.md](../../knowledge/fss_tier_methodology.md). 은행 제재와 환전영업소 제재를 같은 무게로 취급하지 않는다 — **기관 계층을 먼저 나누고, 그 안에서 위험도를 잰다.**

| 계층 | 대상 | 처리 |
|---|---|---|
| **T0** IBK직접 | 기업은행·IBK | 최상 — 무조건 |
| **T1** 은행 | 시중·국책·지방·인터넷전문 등 | 직접 벤치마킹 |
| **T2** 인접금융 | 금융지주·저축은행·보험·증권·카드·캐피탈 등 | 유사 업무 가능 |
| **T3** 주변 | 대부·환전영업소·GA·P2P 등 | 참고 |

- 위험도(analyst): 제재수위·IBK 핵심업무 연관·재발 가능성 → 상(🔴)/중(🔶)/하(🔹).
- **Telegram 알림 = T0·T1·T2 전건(T3 제외, 헤더에 건수 표기) / DOCX 보고서 = 전건**, 정렬 Tier→위험도.
- ※ 제재는 시행일·의견마감(D-day) 개념 없음.

---

## 7. 결정사항 (전부 확정·종결)

| # | 항목 | 결정 | 결과 |
|---|---|---|---|
| **A** | Telegram 봇 | **신규 봇 분리** | FSS 전용 봇 생성, Secrets 등록 완료 |
| **B** | 실행 시각 | **08:00·16:00 KST 2회(FSC 동형)** | Cloudflare cron `0 23 * * *`(am, 매일) + `0 7 * * *`(pm, 매일). 08:00은 전체 알림, 16:00은 오전 이후 신규만 델타 알림. FSS 제재는 부정기 발행이라 오후는 대개 '신규 없음' 조용한 마감 |
| **C** | FSS 해외 IP 차단 | **차단 없음(PASS)** | 미국 러너 4종 접근 검증(diag-fss-access.yml) → 프록시 미도입, 직결 수집 |
| **D** | OpenAPI 우선 검토 | **API 없음** | FSS OPEN API에 제재/경영유의 엔드포인트 없음 → HTML/PDF 크롤 채택 |

---

## 8. 재사용 vs 신규 작성 (FSC 자산 기준)

| 자산 | 처리 |
|---|---|
| `knowledge/` (조직도·부서매핑·키워드) | **복사** 후 제재 관점 키워드 보강 |
| `SKILL.md`(docx 레이아웃)·`tone-guide.md` | **복사** 후 섹션 명칭만 조정 |
| `briefV2.js`·`validator.js`·`archivist.js`·`notify_telegram.js` | **복사** + 경미한 조정 |
| `cloud-trigger/`(Cloudflare Worker) | **복사** + repo 타겟을 `ibk-FSS-brief`로 변경 |
| `.github/workflows/daily-brief.yml` | **복사** + STEP1 크롤러 교체, dedup 단계 추가 |
| `fss_crawler.js` | **신규** (FSS 사이트 구조 + 2소스 + dedup) |
| `analyst.js` 프롬프트 | **신규** (제재사례 벤치마킹 분석 관점) |
| `state/seen_ids.json` | **신규** (ledger) |

---

## 9. 단계별 실행 로드맵 (전 단계 완료)

- ✅ **1단계 — 타당성 검증**: FSS OpenAPI 없음 확인(D) → 해외 IP 차단 없음 진단(C). 크롤 경로 확정(openInfo HTML / openInfoImpr PDF).
- ✅ **2단계 — 골격 이식**: FSC 재사용 자산 복사(runslot 포함), 워크플로우/cloud-trigger repo 타겟 변경.
- ✅ **3단계 — 신규 모듈**: `fss_crawler.js`(2소스+dedup+Tier), `analyst.js`(제재 벤치마킹, tone-guide 주입), `seen_ids.json` ledger.
- ✅ **4단계 — 통합·검증**: workflow_dispatch 실행으로 신규/0건 케이스·실제 Telegram·DOCX 확인.
- ✅ **5단계 — 정시화**: Cloudflare Cron 08:00·16:00 KST 2회, Secrets 3종 등록, 라이브 운영 전환.

---

## 10. 운영 설정 (현행)

- **GitHub Secrets (3)**: `ANTHROPIC_API_KEY` · `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID`
- **Cloudflare Worker secret**: `GH_PAT` (workflow_dispatch 호출용)
- **Cloudflare Cron**: `0 23 * * *` (= 08:00 KST am, 매일) + `0 7 * * *` (= 16:00 KST pm, 매일)
- **산출물**: `reports/{DATE}/{SLOT}/{DATE}_{morning|afternoon}_brief.docx`(90일) · `crawl_result.json`·`run_meta.json`·`validation_result.json`(30일) · `state/seen_ids.json`(영구) · `logs/run_manifest.jsonl`(누적)

---

## 11. 리스크

| 리스크 | 대응 |
|---|---|
| FSS 해외 IP 차단 가능성 | ✅ 해소 — 차단 없음 검증(미국 러너 PASS), 직결 수집 |
| 제재 본문이 PDF·첨부 위주 | ✅ 대응 — pdf-parse로 openInfo 상세·openInfoImpr 첨부 파싱 |
| 부정기 발행 → 과거 누적 공시가 '당일 신규'로 오인 | **관측 창 차집합 + backfill 격리로 과거 누적분 범람 차단**(backfill은 레저 등록만·보고 제외하되 `backfilled[]`에 기록) + ledger 키 신중 설계, 감사 커밋 추적 |
| 관측 창이 얕아 늦게 게시된 과거 조치요구일 건이 창 밖으로 이탈 | `--pages` 기본 5, `scanWindow.floorLookbackDays` < 45일이면 경고 · 체크섬 불일치 시 전 페이지 심화 스캔으로 승격 |
| 제재사례 오분석(법적 민감) | 분석은 "점검 제안"형으로만, 단정 금지 (tone-guide 준수) |
