# 기술문서 — FSS 제재·경영유의 브리핑 기술 명세

> **프로젝트**: IBK FSS 제재·경영유의 브리핑 (ibk-FSS-brief)
> **작성일**: 2026-07-02 · **개정일**: 2026-07-12 (신규 판정 = 관측 창 차집합 전환 반영) · **상태**: 라이브 (현행 구현 기준)
> **관련 문서**: [SOD](01_SOD.md) · [BRD](02_BRD.md) · [업무문서](03_BUSINESS_DOC.md) · [예상질의답변](05_QNA.md) · 상세 다이어그램: [ARCHITECTURE.md](../technical/ARCHITECTURE.md)

---

## 1. 기술 스택

| 계층 | 기술 | 비고 |
|---|---|---|
| 런타임 | Node.js 22 (GitHub Actions `ubuntu-latest`) | 외부 프레임워크 없이 표준 `https`/`fs` 중심 |
| 의존성 | `docx` ^9.7.1 (DOCX 생성) · `pdf-parse` ^1.1.4 (PDF 본문 추출) | 의도적 최소 의존 |
| LLM | Anthropic Claude API — `claude-haiku-4-5-20251001` (env `ANALYST_MODEL`로 교체 가능) | max_tokens 2048, 병렬 3 |
| 트리거 | Cloudflare Workers Cron (`cloud-trigger/`, wrangler) | UTC `0 23 * * *`=08:00 KST(am) · `0 7 * * *`=16:00 KST(pm) |
| CI/CD·실행 | GitHub Actions `workflow_dispatch` 단일 Job | timeout 30분, concurrency group `fss-brief` |
| 알림 | Telegram Bot API | 단일 봇 (시작·완료·오류) |
| 상태 저장 | git 저장소 자체 (`state/seen_ids.json`) | 클라우드 실행의 유일한 상태 저장소 |

---

## 2. 저장소 구조

```
ibk-FSS-brief/
├── .github/workflows/
│   ├── daily-brief.yml        # 메인 파이프라인 (workflow_dispatch 단일 트리거)
│   └── diag-fss-access.yml    # FSS 해외 IP 접근 진단 (1회성, PASS 확인됨)
├── cloud-trigger/             # Cloudflare Workers Cron (src/index.js, wrangler.toml)
├── fss_crawler.js             # STEP1 수집+dedup+Tier분류
├── analyst.js                 # STEP2 LLM 분석
├── briefV2.js                 # STEP3 DOCX + tgMsg 생성
├── validator.js               # STEP4 품질 검증
├── archivist.js               # STEP5 아카이브
├── notify_telegram.js         # 알림 발송 (--msg / --from-crawl-result)
├── runslot.js                 # am/pm 슬롯·reports 경로 결정
├── agents/analyst_system_prompt.md   # LLM 기본 프롬프트
├── knowledge/                 # LLM 지식 + org/ 반기별 조직 정본 + generated/ 현행 조직표
├── state/seen_ids.json        # 중복방지 원장 (dedup ledger)
├── reports/{DATE}/{SLOT}/     # 런별 산출물 (crawl_result·docx·raw·pdfs·검증결과)
└── logs/run_manifest.jsonl    # 실행 매니페스트 (누적)
```

---

## 3. 컴포넌트 상세

### 3.1 fss_crawler.js — 수집 + dedup (STEP1)

- **소스 2종** (앵커 href 실측 추출, 경로 하드코딩 없음):
  | 소스 | 목록 | 상세 | dedup 키 |
  |---|---|---|---|
  | 제재공시 | `/fss/job/openInfo/list.do?menuNo=200476` | `view.do` HTML(`bd-view` dl/dt/dd 메타) + 제재내용 PDF 첨부 | `examMgmtNo_emOpenSeq` |
  | 경영유의 | `/fss/job/openInfoImpr/list.do?menuNo=200483` | 상세페이지 없음 — 바로 PDF (`/fss.hpdownload?...`) | 첨부 파일명 선두 ID (예: `202600082_11`) |
- **Tier 분류**: `classifyTier(org)` — 기관명 키워드로 T0(IBK직접)/T1(은행)/T2(인접금융)/T3(주변). 우선순위 T0→T1→T2→T3, 미매칭 T3.
- **목록 정렬 특성 (신규 판정의 전제)**: FSS 목록엔 **게시일 컬럼이 없다.** 3번째 컬럼은 `제재조치요구일`(`actionRequestDate`)이고 목록은 그 값의 **내림차순 정렬**이다. 따라서 오늘 새로 게시된 건도 조치요구일이 과거면 목록 맨 위가 아니라 **중간에 삽입**된다 → **날짜(조치요구일)로는 신규를 판정할 수 없다.**
- **신규 판별 = 직전 실행 관측 창 차집합 (scan-window diff)**:
  - `buildScanWindow(직전 crawl_result.scanAudit)` → 소스별 `{ 본 key 집합, 훑은 깊이(depth) }` 복원.
  - `classifyRow(key, page, ledgerMap, win, seed)` → `known` | `new` | `backfill` | `skip`
    - 레저(`state/seen_ids.json`)·직전 창에 있음 → `known` (재알림 차단)
    - `seed`(최초 실행) → `backfill` (목록 전체가 과거 누적분)
    - `page ≤ win.depth` 이고 레저에 없음 → `new` (**조치요구일이 과거여도 신규**)
    - `page > win.depth` (창 밖 — 판정 근거 없음) → `backfill` (`--pages` 확장 시 과거 누적분 범람 방지)
    - 직전 창 유실 시 `depth = WINDOW_FALLBACK_DEPTH` 가정 → 레저로만 판정
  - `backfill`은 레저에만 등록하고 보고에서 제외하되 **`crawl_result.backfilled[]`에 명시 기록**한다 → **침묵 폐기(조용히 버리기)를 하지 않는다.**
  - 산출: `crawl_result.{ newItems[], backfilled[], scanWindow{}, completeness{}, scanAudit[] }`, `newItemBasis: "scan-window-diff"`.
  - **창 깊이 경고**: `scanWindow.floorLookbackDays` < **45일**이면 창이 얕다고 경고한다(창이 얕으면 늦게 게시된 과거 조치요구일 건이 창 밖에 떨어져 영구 미탐).
  - **폐지**: `REPORT_SINCE`(게시일 앵커)는 2026-07-10 폐지 — env로 설정해도 **무시**되고 경고만 출력된다. 정렬 컬럼(조치요구일)에 커트오프를 걸어 늦게 게시된 과거 조치요구일 건을 침묵 폐기했기 때문이다(`아이비케이신용정보` 미탐 사고). 필드명도 `postDate`(게시일 — 오칭) → **`actionRequestDate`**로 정정했다(briefV2 `mapCrawlerItem`의 `postDate` 잔존은 과거 crawl_result 하위호환 fallback일 뿐이다).
- **수집 파이프라인**: 두 소스 공통 통합 `collectSource(SOURCES.sanction / SOURCES.mngimpr)` — `scanSource`(목록 스냅샷) → `classifySnapshot` → `reconcile`(총건수 체크섬) → `buildEntry`(본문·PDF).
  - 완전성 체크섬(`reconcile`): `listTotal − prevListTotal == 신규 − 삭제`. 불일치 시 전 페이지 심화 스캔으로 승격.
  - 커버리지: `ledger.meta.sources[소스].covered` = 전 페이지를 훑어 레저를 시드했는가. 미확립이면 전 페이지 심화 스캔으로 커버리지를 세운다.
- **시드 모드**: ledger가 비어 있으면 items·ledger만 채우고 `graded`/`newGraded`는 비운다 (최초 실행 과거건 범람 방지 — 2026-07-01 수정). 시드분은 `backfill`로 분류·기록된다.
- **'목록에서 찾는 법' 안내**: 신규 건이 목록 상단에 없어 수신자가 혼동하므로, `listedOutOfOrder`(조치요구일 < 최초 등장일)인 건에 한해 **조치요구일 · 최초 등장일(`firstSeenDate`) · 목록 행 번호(`listRank`)** 를 안내한다. 구현은 briefV2 `listingNoticeLines()` 공용 → docx `buildListingNotice`(7번째 빌더, safeSection `"listing"`) + Telegram `tgMsg` 말미. 해당 건이 없으면 안내를 아예 싣지 않는다(소음 방지).
- **실패 격리 계약**: 성공 시 `crawl_result.json` 작성 + ledger 갱신 + 기존 failure_meta 삭제. 실패 시 `failure_meta.json`(error 필드)만 작성하고 성공본·ledger는 비파괴.
- **증빙**: raw HTML → `raw/`, PDF → `pdfs/` 저장(Artifact 90일). 추가로 **매 페이지 스캔 증적**을 `crawl_result.scanAudit`(page·url·status·rowCount·**목록 key 전체**·**본문 SHA-256**)에 기록 → 신규 0건(noUpdate)이어도 남고 crawl_result와 함께 **git 영구** 커밋되어, 원본 HTML 없이도 "무엇을 스캔했나"를 항구 증적한다.
- 실행: `node fss_crawler.js [--date YYYYMMDD] [--pages N]` — `--pages`는 **관측 창 깊이**로, 기본 **5**(`FSS_MAX_PAGES`로 override).

### 3.2 analyst.js — LLM 분석 (STEP2)

- **모델**: `claude-haiku-4-5-20251001` (`ANALYST_MODEL`로 오버라이드 가능), `max_tokens: 2048`
  - 1024에서 한국어 11개 필드 분석이 잘려 JSON 미완결→파싱 실패→폴백된 실측 사례(2026-07-02 우리은행)로 상향.
- **동시성**: `CONCURRENCY = 3` — 신규 다건 시 소규모 병렬 (Haiku Tier1 50 RPM 여유 내).
- **시스템 프롬프트 조립** (실행 시 동적):
  `agents/analyst_system_prompt.md` + tone-guide(해요체 8원칙, FSS 맥락 적용 주석 포함) + ibk-dept-mapping + 자동 생성 현행 조직 레지스트리 + ibk_mapping_rules + ibk_action_rules
- **출력 필드** (crawl_result.json의 각 건에 병합): `what_changes` / `ctrl_insight` / `our_action` / `dept`·`related_depts` / `risk_grade`(RED/ORANGE/GREEN→상/중/하) / `workflow_type`(A~F) / `tg_key` / `term`
  - 필드명은 자매 프로젝트(briefV2) 구조를 그대로 재사용해 briefV2 무수정 호환.
- **분석 대상**: crawler가 걸러낸 **신규 건(graded)만** — 재분석 없음(병목 제거), 매 실행 소량.
- **종료 코드**: `0`=정상 / `1`=fallback(API 키 미설정·오류 → 키워드 템플릿, 파이프라인 계속) / `2`=치명(프롬프트 파일 부재 등 → Job 중단)
- 실행: `node analyst.js [--date YYYYMMDD]`

### 3.3 briefV2.js — 보고서·메시지 생성 (STEP3)

- **DOCX**: 맑은 고딕·IBK Blue, 폰트 위계 5단계(제목18 / 제재대상 헤더13 / 오프닝11 / 라벨·본문10 / 캡션9pt). 전건을 항목 카드(`제재대상 → 무슨 일이 있었나요? → IBK에도 발생 가능한가요? → 무엇을 점검할까요?`)로 수록, `byTierGrade`(Tier→위험도) 정렬. 파일명 `{DATE}_{morning|afternoon}_brief.docx`.
- **tgMsg** (crawl_result.json에 기록): 헤더 `🔔 금융감독원 제재·경영유의 브리핑 (HH:MM)` + T0·T1·T2 전건(`tier !== "T3"` 필터, 제외 건수 헤더 표기)을 질문형 라벨 + 질문·답변 2계층으로 구성. 신규 0건 → "✅ 신규 없음", 전부 T3 → "IBK 유관 없음".

### 3.4 validator.js — 품질 검증 (STEP4)

| 시리즈 | 검사 |
|---|---|
| A. 텍스트 품질 (톤 8원칙) | A1 핵심 선행 / A2 문장 길이(120/200자) / A3 원문 복붙 금지 / A4 독자 주어 / A5 빈말 / A6 숫자·날짜(제재는 D-day 검사 제외) / A7 동사 종결 / A7b 해요체 |
| B. 절삭 검사 | what_changes·our_action 빈 배열, 원문 과단축(PDF 미수집 의심), ctrl_insight 공백(analyst 미실행 의심) |
| C. tgMsg 검증 | 출처·존재, 길이·줄 수, FSS 카드(제재대상·질문형 라벨) 패턴, "유관 없음" 형식 |
| D. DOCX 구조 | crawl_result 데이터로 기대 섹션을 계산해 실제 docx 출력과 대조 (헤더·오프닝·카드 라벨) |

- 종료 코드: `0`=통과 / `1`=경고(계속) / `2`=오류(중단 권고 — 워크플로우는 warning 처리 후 계속)
- 결과: `validation_result.json`

### 3.5 archivist.js / notify_telegram.js / runslot.js

- **archivist.js** (`--date --status ok|error`): 로그 정리, `run_meta.json` 기록, `logs/run_manifest.jsonl` 누적, 보관 정책 적용. `if: always()`로 실패 시에도 실행.
- **notify_telegram.js**: `--msg "텍스트"`(임의 메시지) 또는 `--from-crawl-result`(briefV2가 기록한 tgMsg 전송, `REPORT_DATE` env 참조).
- **runslot.js**: KST 발화 시각 `<12`→`am`, `≥12`→`pm`. `reportDir(ROOT, date)` → `reports/{DATE}/{SLOT}/`. 08:00 정시 실행은 am, 16:00 정시 실행은 pm. 수동 오후 재실행도 pm으로 분리돼 오전 기록 비파괴. `findPreviousCrawlFile(root, dateCode, currentSlot)` — 직전 관측 창(기준 스냅샷)이 될 `crawl_result.json`을 찾는다. `currentSlot` 인자로 **pm은 당일 am을 직전 관측 창으로 우선 사용**한다.

### 3.6 cloud-trigger/ — Cloudflare Workers Cron

- `scheduled()` 핸들러가 `POST /repos/pyorocop-lang/ibk-FSS-brief/actions/workflows/daily-brief.yml/dispatches` (`ref: main`) 호출. 인증: Worker secret `GH_PAT` (fine-grained PAT, Actions R/W).
- 진단 엔드포인트는 `www.fss.or.kr` allowlist로 제한 (오픈 프록시화 방지).
- GitHub 자체 `schedule` cron은 최대 ~12시간 지연·누락이 실측되어 **백업으로도 두지 않고 제거** — 정시성은 Cloudflare가 전담.

---

## 4. 파이프라인 실행 명세 (daily-brief.yml)

```
workflow_dispatch (Cloudflare가 08:00·16:00 KST 호출)
└─ Job: brief (ubuntu-latest, timeout 30m, concurrency group fss-brief)
   ├─ checkout(fetch-depth 2) → 날짜·슬롯 설정(KST) → Node 22 + npm ci
   ├─ 시작 알림 (continue-on-error)
   ├─ STEP1 수집: 최대 3회 시도, 간격 120s. failure_meta.json 존재 = 실패 신호
   │   └─ 최종 실패 → "❌ 수집 실패" 알림 + exit 1 (Job 중단)
   ├─ STEP2 분석: exit 2만 중단, exit 1(fallback)은 warning 후 계속
   ├─ STEP3 보고서 → STEP4 검증(경고 비중단) → STEP5 아카이브(always)
   ├─ STEP6 감사 커밋 (always):
   │   ├─ 실패 시: failure_meta + manifest만 커밋 (성공본·ledger 미커밋 = 비파괴)
   │   ├─ 성공 시: crawl_result + run_meta + seen_ids + manifest 커밋
   │   └─ push: git pull --rebase --autostash -X theirs → push, 3회 재시도
   │       (-X theirs: 같은 날짜 add/add 충돌 시 최신 런 채택. 일반 rebase는
   │        충돌마커로 crawl_result.json이 손상돼 완료알림 JSON.parse가 깨진 실측 이력)
   ├─ Artifact 업로드 (always): reports/{DATE}/{SLOT}/ → fss-brief-{DATE}-{SLOT}, 90일
   ├─ 완료 알림 (success): am → notify_telegram.js --from-crawl-result / pm → + --delta-since reports/{DATE}/am/crawl_result.json (오전 이후 신규만, 0건 시 '변동 없음' 마감)
   └─ 오류 알림 (failure): "❌ 브리핑 오류 발생"
```

### 상태 관리·동시성 핵심 규칙

1. **repo = 유일한 상태 저장소.** 클라우드 러너는 휘발성이므로 `state/seen_ids.json`을 git 커밋으로 지속한다. **성공 시에만** ledger를 커밋해, 실패 런이 중복방지 상태를 오염시키지 않는다.
2. **실패 격리.** 수집 실패는 `failure_meta.json`으로만 표현된다. 배경: 2026-06-27 timeout이 성공 기록 6건을 0건으로 덮어쓴 사고(f93e0c4) → 원천 차단 구조로 재설계.
3. **동시 실행 차단.** `concurrency: group: fss-brief, cancel-in-progress: false` — 수동 실행과 정시 실행이 겹쳐도 순차화.
4. **슬롯 분리.** 산출물은 `reports/{DATE}/{SLOT}/`로 런별 보존 — 재실행이 이전 기록을 덮지 않는다(감사 추적).

---

## 5. 자격증명 (Secrets)

| 위치 | 키 | 용도 |
|---|---|---|
| GitHub Actions Secrets | `ANTHROPIC_API_KEY` | analyst.js Claude API |
| | `TELEGRAM_BOT_TOKEN` | FSS 전용 봇 토큰 |
| | `TELEGRAM_CHAT_ID` | 알림 수신 채팅 |
| Cloudflare Worker Secret | `GH_PAT` | workflow_dispatch 호출용 fine-grained PAT |

코드·저장소에 자격증명을 두지 않는다. 로컬 검증 시 `.env.example` 참고.

---

## 6. 운영·디버깅

| 작업 | 방법 |
|---|---|
| 수동 실행 | `gh workflow run "IBK FSS Sanction Brief" --ref main` |
| 특정 날짜 로컬 재현 | `node fss_crawler.js --date YYYYMMDD` → `node analyst.js --date …` → `node briefV2.js --date …` → `node validator.js --date …` |
| 접근 진단 | `diag-fss-access.yml` (FSS 해외 IP 차단 여부 — 미국 러너 4종 PASS 확인됨) |
| 모델 교체 | env `ANALYST_MODEL` 지정 (기본 `claude-haiku-4-5-20251001`) |
| 실행 이력 | `logs/run_manifest.jsonl` + 감사 커밋 로그 (`brief: {DATE}/{SLOT} …`) |

## 7. 알려진 제약·기술 부채

| 항목 | 내용 | 대응 |
|---|---|---|
| 스크래핑 의존 | FSS OPEN API 부재 → 사이트 개편 시 파서 보수 필요 | 실패 시 즉시 오류 알림으로 조기 인지 |
| Tier 키워드 휴리스틱 | 경계 기관명(예: "○○에셋") 오분류 가능 | `knowledge/fss_tier_methodology.md` 규칙 보강으로 대응 |
| cron 매일 실행 | Cloudflare 대시보드가 평일 범위(0-4) 미지원 | 주말 0건은 조용한 알림 — 무해 |
| LLM 비결정성 | 동일 입력에도 문면 변동 | validator A~D 이중 검증 + 원문 PDF 증빙 보존 |
