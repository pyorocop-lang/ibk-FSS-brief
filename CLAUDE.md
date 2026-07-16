## 프로젝트 개요
IBK기업은행 내부통제점검팀 — **금융감독원(FSS) 제재공시·경영유의사항** 모니터링 자동 보고서.
금감원이 제재/경영유의 건을 게시하면 신규분을 수집 → Claude LLM이 IBK 업무 연관성(벤치마킹 자가점검)을 분석 → Telegram 알림 + DOCX 보고서.
작업 디렉토리: D:\projects\ibk-FSS-brief

## 현재 상태
**구현·클라우드 라이브 완료.** 로컬 PC 없이 완전 클라우드로 동작한다.
매일 08:00·16:00 KST Cloudflare Workers Cron이 GitHub Actions를 호출 → 실행당 단일 Job이 조직 정본 사전검사→수집→분석→보고서→검증→아카이브→알림을 수행(하루 2회, FSC 동형).
전체 문서 지도(정본 인덱스)는 [docs/README.md](docs/README.md). 목적·소스·결정사항은 [docs/business/PROJECT_BRIEF.md](docs/business/PROJECT_BRIEF.md), 상세 파이프라인은 [docs/operations/workflow.md](docs/operations/workflow.md)·[docs/technical/ARCHITECTURE.md](docs/technical/ARCHITECTURE.md) 참조.

## 파이프라인 (완전 클라우드)
```
Cloudflare Workers Cron (매일 08:00·16:00 KST = 23:00·07:00 UTC, 대시보드 cron "0 23 * * *"·"0 7 * * *")
  → GitHub workflow_dispatch (.github/workflows/daily-brief.yml, 실행당 단일 Job)
      (08:00=am 전체 알림 / 16:00=pm 오전 이후 신규만 델타 알림)
      PRECHECK 조직정본  org_tools.js    (버전·생성물·실행부서 검증, 실패 시 중단)
      시작 알림          notify_telegram.js
      STEP1 수집+dedup   fss_crawler.js   → reports/{DATE}/{SLOT}/crawl_result.json
      STEP2 분석          analyst.js       (Claude Haiku, tone-guide 주입, Tier기반, graded만)
      STEP3 보고서(docx)  briefV2.js       + Telegram tgMsg 생성
      STEP4 검증          validator.js
      STEP5 아카이브       archivist.js
      STEP6 감사 커밋      crawl_result·run_meta·manifest·state/seen_ids.json
      Artifact 업로드 + 완료 알림
```
- 산출물은 `reports/{DATE}/{SLOT}/` 에 런별 분리 보존(SLOT: 08:00=am / 16:00=pm, runslot.js가 KST 시각으로 판별 <12=am·≥12=pm). 두 슬롯은 공존·비파괴.
- 수집 실패는 `failure_meta.json`만 쓰고 성공본(crawl_result.json)은 건드리지 않는다 → "신규 없음" 오인 보고 차단.

## FSC 프로젝트와의 결정적 차이 (분석 관점)
- FSC = 예방(법령 변경 대응). **FSS = 사후(실제 제재사례 기반 IBK 자가점검·벤치마킹).**
- **FSS 목록엔 게시일 컬럼이 없다.** 3번째 컬럼은 `제재조치요구일`이고 목록은 그 값의 **내림차순 정렬**이다 → 오늘 새로 게시된 건도 조치요구일이 과거면 **목록 맨 위가 아니라 중간에 삽입**된다. 조치요구일로는 신규를 판정할 수 없다.
- 발행 부정기적 → **직전 실행 관측 창 차집합 + 중복방지 ledger(state/seen_ids.json)** 로 신규 판별: 직전 실행의 `crawl_result.scanAudit`(페이지별 전체 행 key + 훑은 깊이)을 복원해 **그 깊이 안에서 그때는 없다가 지금 나타난 행**만 신규로 본다(`known`/`new`/`backfill`). 창 밖 깊이·최초 시드는 `backfill` — 레저만 등록하고 보고 제외(`--pages` 확장 시 과거 누적분 범람 방지). 클라우드 실행이므로 repo가 유일한 상태 저장소.
- ~~REPORT_SINCE 게시일 앵커~~ **폐지(2026-07-10).** 조치요구일에 커트오프를 걸어 늦게 게시된 과거 조치요구일 건을 침묵 폐기했고, 실제로 `아이비케이신용정보`(07-09 신규 게시, 조치요구일 06-25)를 놓쳤다. env로 설정해도 무시된다.
- 관측 창은 `--pages` 기본 5(`FSS_MAX_PAGES`). 창이 얕으면 늦게 게시된 과거 조치요구일 건이 창 밖에 떨어져 영구 미탐 → `scanWindow.floorLookbackDays` < 45일이면 크롤러가 경고한다.
- 신규 건이 목록 상단에 없어 수신자가 혼동하므로, 알림·보고서 맨 끝에 **'목록에서 찾는 방법' 참고 안내**를 붙인다(조치요구일·최초 등장일·목록 행 번호). 해당 건이 없으면 싣지 않는다.
- 마감(D-day) 캘린더 대신 **기관 계층(Tier) × 제재 심도 기반 중요도** ([knowledge/fss_tier_methodology.md](knowledge/fss_tier_methodology.md)).
- 제재는 법적으로 민감 → 분석은 단정 금지, "점검 제안"형 해요체로만 ([knowledge/tone-guide.md](knowledge/tone-guide.md) 주입).

## 확정된 결정 (전부 종결)
- **A. Telegram 봇**: 신규 봇 분리 (FSC 법령 알림과 채널 분리). Secrets `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` 등록 완료.
- **B. 실행 시각**: **08:00·16:00 KST 하루 2회(FSC Morning brief 동형, 2026-07-03 반전).** 대시보드 cron `0 23 * * *`·`0 7 * * *`(매일). pm(16:00)은 오전 이후 신규만 델타 알림(없으면 '변동 없음' 마감). 주말 신규 0건은 조용한 알림이라 무해.
- **C. FSS 해외 IP 차단**: 차단 없음(미국 러너 4종 접근 PASS, diag-fss-access.yml) → KR 프록시 미도입.
- **D. OpenAPI**: FSS OPEN API에 제재/경영유의 엔드포인트 없음 → HTML/PDF 크롤 채택.

## 자매 프로젝트 (아키텍처 원본 — 읽기 전용)
FSC 입법예고 브리핑: https://github.com/pyorocop-lang/Daily-Morning-brief (로컬 클론 D:\projects\ibk-morning-brief)
→ 완전 클라우드 멀티에이전트 골격의 원본. **읽기 전용 참고. 절대 직접 수정·push 금지.**
→ briefV2.js / validator.js / archivist.js / notify_telegram.js / runslot.js / cloud-trigger 골격을 차용, **데이터 수집 계층(fss_crawler.js)과 분석 관점(analyst.js)만 FSS 전용으로 신규 작성**했다.

## Git 커밋 규율 (FSC 프로젝트와 동일 — 변경 금지)
- main 직접 커밋 허용 (1인 프로젝트)
- 커밋 메시지에 "왜" 포함: `<type>: <what>` + 필요 시 body. type: feat/fix/chore/docs/refactor
- CHANGELOG.md를 코드 변경과 **같은 커밋**에 포함 (분리 금지)

## 주의
- 이 프로젝트는 FSC 브리핑(D:\projects\ibk-morning-brief)과 **별개 repo·별개 세션**이다. 두 작업 컨텍스트를 섞지 말 것.
- 사실관계(로그·실제 설정)를 확인하지 않고 코드를 수정하지 말 것.
