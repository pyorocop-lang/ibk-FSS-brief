# 변경 이력

## 2026-07-16 (오전 분석본 복원)
- fix: 20260716/am 수동 재기동(신규 매핑 게이트 운영 검증 목적, 11:19)이 같은 슬롯 산출물을 신규 0건본으로 대체해, 오전 분석 5건 기록(`crawl_result.json`·`run_meta.json`)을 19b2918 시점으로 복원했다. dedup 레저(`state/seen_ids.json`)와 `run_manifest.jsonl`은 재기동 이력 그대로 유지한다.

## 2026-07-15 (반기 조직개편 자동화)
- fix: 그룹·부문을 포함한 전체 계층을 `expected_kind_counts`로 검증하고, `org:plan --force` 실행 전 기존 변경명세를 고유한 `.bak` 파일로 보존한다.
- fix: 20260716/am 구코드 생성 산출물의 환각 부서명(`보험상품과`)을 `자산관리사업부`로 정정, 원값은 `legacy_dept` 보존 (병합 틈새 데이터, 신규 게이트가 탐지)
- fix: 다음 반기의 조직 수를 코드 상수 94가 아니라 버전별 `expected_unit_count`·`expected_assignable_count`로 검증해 신설·폐지 시 코드 수정이 필요 없도록 했다.
- fix: 개인 역할인 AML보고책임자·재난안전관리책임자·정보보호최고책임자를 자동배정 대상에서 제외하고 하위 현업부서만 허용했다.
- fix: 전역 감사를 런타임 JS·workflow·에이전트 프롬프트·생성 지식과 과거 `our_action`·`ctrl_insight`·`tgMsg`까지 확대했다.
- fix: CI 경로가 하이픈형 `knowledge/ibk-*.md`를 놓치지 않도록 보완하고 scaffold를 임시파일·롤백 방식으로 변경했다.
- feat: 안정 ID로 두 반기의 신설·명칭변경·이동·폐지를 자동 비교하고 삭제 조직의 승계 확인 질의를 출력하는 `org:plan`을 추가했다.
- feat: 활성 포인터 전환 전에도 `org:validate -- --version YYYY-Hn`으로 draft의 출처·수량·변경명세·업무매핑을 검증할 수 있게 했다.
- fix: 새 반기 검증에 직제규정 전문·조직도·개정 전후 대비표 3종의 출처 유형과 SHA-256을 모두 요구한다.
- feat: 반기별 JSON 조직 정본·안정 `org_id`·시행일·출처 해시·변경명세·업무승계 증거등급을 도입했다.
- refactor: `org_registry.js`가 Markdown 불릿 대신 `knowledge/org/active.json`이 지정한 버전 정본을 읽도록 전환했다.
- feat: `org:validate`·`org:generate`·`org:audit` 명령과 자동 생성 현행 조직 레지스트리를 추가했다.
- ci: 조직 정본·생성물·전역 배정·회귀 테스트 전용 workflow와 일일 브리핑 PRECHECK를 추가했다.
- test: 안정 ID·계층·출처·생성물 드리프트·추정 증거 차단과 2027-H1 조직 수 변경·scaffold 원자성 회귀검증을 추가했다.
- docs: 1월·7월 조직개편의 D-30~D+7 운영 플레이북을 추가했다.

## 2026-07-15 (조직 정본 전역 정합성)
- fix: Claude 교차검증에서 발견된 `검사부` 레지스트리 누락을 정정하고, 분석 검증 예외를 정상 fallback(exit 1)이 아닌 치명 오류(exit 2)로 중단하도록 보완했다.
- fix: `analyst.js` fallback의 폐지부서(`데이터혁신부`, `WM사업부`) 출력을 현행 부서로 교체하고 사용자 확인 업무매핑 8건을 반영했다.
- fix: 분석 프롬프트에서 현행 공식 부서인 `경영전략부`를 금지하던 상충을 제거했다.
- feat: `org_registry.js`를 추가해 analyst와 validator가 `knowledge/ibk_org_chart.md`의 현행 부서명 집합을 공동 사용한다.
- feat: LLM이 비현행 부서명을 반환하면 fallback으로 전환하고, validator가 `dept`·`related_depts`를 조직 정본과 대조해 B5 오류로 차단한다.
- test: 조직 매핑 8건을 포함한 fallback 전체 18개 경로, `검사부`, 정본 구간 경계와 비현행 부서 차단 회귀 테스트를 추가했다.
- docs: 전역 Markdown 표 검사에서 발견한 `ARCHITECTURE.md`의 미이스케이프 파이프를 정정했다.

## 2026-07-13 (감사부서 명칭)
- fix: `analyst.js` fallback의 감사부서 명칭을 정본과 정합 — ~~감사부~~ → **검사부**
  - 왜: IBK 감사부서 공식명칭이 `감사부`/`검사부`로 상충한다고 보류해 둔 건. 실제 확인 결과 **정본(`ibk_mapping_rules.md` §19·§67·§163)·`ibk_org_chart.md`·`ibk-keywords.md`·`ibk_action_rules.md`가 모두 `검사부`로 일치**하고, 어긋난 곳은 `analyst.js:143`의 `related` 한 곳뿐이었다. 정본 기준으로 코드를 맞춘다(상충 아님, 코드 단독 오기).
  - 검증: `node --check` 통과, 단위테스트 10/10 통과.

## 2026-07-12 (부서 매핑)
- fix: analyst fallback 부서 매핑을 정본(`knowledge/ibk_mapping_rules.md`)과 정합 — 3갈래를 뭉뚱그려 부서가 틀렸다
  - 왜: 정본은 `개인·신용정보 관리 및 보호 규정: ~~준법지원부~~ → 정보보호총괄부`라고 **정정 사실까지 명시**해 뒀는데(ibk_mapping_rules.md), `analyst.js`의 `fallbackDept`는 여전히 구 매핑이었다. 문서 감사 중 발견.
  - `analyst.js`: `신용정보|개인정보|마이데이터|정보유출` → ~~준법지원부~~ **정보보호총괄부**(정본 §45). 또한 한 줄에 `전자금융|오픈뱅킹|IT보안|사이버|정보보호|전산`을 뭉쳐 전부 `IT내부통제부`로 보냈으나, 정본은 이를 **두 갈래로 구분**한다 → `전자금융|오픈뱅킹|비대면` → **개인디지털사업부**(정본 §49), `IT보안|사이버|정보보호|전산` → **정보보호총괄부**(정본 §50)로 분리.
  - `knowledge/ibk_action_rules.md`: `전자금융거래법 → IT내부통제부 / 개인디지털사업부` 순서가 정본과 반대(주담당이 뒤) → `개인디지털사업부(주담당) / IT내부통제부(보안 협조)`로 정정. 이 파일은 analyst에 주입되므로 순서가 부서 선택을 흔든다.
  - 영향 범위: LLM 정상 경로는 정본 knowledge를 주입받아 이미 옳았고, **API 키 미설정·오류 시 fallback 경로에서만** 오배정이 발생했다.
  - 검증: `node --check` 통과, 단위테스트 10/10 통과.

## 2026-07-12 (문서)
- docs: 전 문서를 현행(관측 창 차집합) 기준으로 정합화 — 폐지된 게시일 앵커 서술 일괄 제거 (19개 문서)
  - 왜: 07-10 신규판정 전환·07-12 코드 완결이 **코드에만** 반영되고 문서는 폐지된 `REPORT_SINCE` 앵커를 **현행처럼** 서술하고 있었다. 4개 클러스터 감사 결과 14개 문서에서 구식 서술이 확인됐다. 문서만 읽은 사람은 존재하지 않는 방식(게시일 앵커·`postDate`·`backlogSkipped`)을 현행으로 오해한다.
  - 정본 블록 선행 확정: 신규판정 서술을 경영진/평이/기술 3종 레지스터로 단일화한 뒤 전 문서가 이 블록만 인용하도록 했다(재드리프트 차단).
  - 신규판정 서술 재작성(high): README·docs/README·business/PROJECT_BRIEF §5·METHODOLOGY·EXECUTIVE_BRIEF·AI_멀티에이전트로_일한다는것·technical/ARCHITECTURE·AI_멀티에이전트_기술문서(§1·2·6·8·9·10)·operations/workflow·deliverables 01_SOD·02_BRD(FR-13)·03_BUSINESS_DOC·04_TECH_DOC(§3.1)·05_QNA(Q13). 모두 `buildScanWindow`→`classifyRow`(known/new/backfill)·`WINDOW_FALLBACK_DEPTH`·`backfilled[]` 명시기록·`--pages` 5·45일 경고 기준으로 통일.
  - 코드 모순 제거: `AI_멀티에이전트_기술문서 §9`의 "앵커 기준일은 env `REPORT_SINCE`로 조정" — 코드는 이 env를 **무시하고 경고만** 출력한다(fss_crawler.js). 삭제 후 `--pages`/`FSS_MAX_PAGES` 조정으로 정정.
  - 서사 교정: `AI_멀티에이전트로_일한다는것`이 **폐지·미탐 사고를 유발한 앵커를 '개선 성공 사례'로** 서술해 결과와 정반대였다 → "앵커 도입 → 미탐 발견 → 관측 창 차집합 재개선" 경위로 수정.
  - 누락 이력 보강: `06_개선사항_2026-07` — 건 2(앵커)에 취소선·폐지 배너를 얹어 **당시 기록으로 보존**하고, 건 5(관측 창 차집합 전환·아이비케이신용정보 미탐 수정)·건 6('목록에서 찾는 법' 안내)를 신설(4건→6건). `LESSONS_LEARNED` §10 신설 — 정렬 컬럼에 커트오프 금지 / 침묵 폐기 금지(backfill 명시) / 직전 관측 차집합 / 문서↔코드 드리프트.
  - 명세 누락 보강: `technical/SKILL.md` — `buildDocument` 빌더 6개→**7개**(`buildListingNotice`가 term↔closing 사이에 누락돼 있었음) + tgMsg 꼬리말 명세. `05_QNA` Part2 Q16(신규 판별 메커니즘) 신설.
  - 필드·수치 정합: `postDate`→`actionRequestDate` 전면 정정(briefV2 하위호환 fallback은 그대로 유지·명시), GitHub schedule cron 지연 수치 `~11h`/`~11~12h`/`~11–12h` 3종 혼재 → **`~12h`**로 통일(daily-brief.yml 기준), docx 산출물 표기 `morning`→`{morning|afternoon}`.
  - 검증: 폐지 용어(`REPORT_SINCE`/게시일 앵커/`postDate`/`backlogSkipped`/`collectSanctions`) grep 잔존분은 **전부 '폐지' 서술·CHANGELOG 이력·건2 보존 기록**뿐(현행으로 서술한 곳 0). 상대링크 129개 전수 확인 — broken 0.

## 2026-07-12
- fix: 07-10 관측 창 차집합 마이그레이션 미완성분 완결 — 크롤러가 실제로 실행되도록 (설계는 그대로, 코드만 완성)
  - 왜: 07-10 커밋은 설계·문서·테스트만 반영되고 실행 코드가 반쯤 남아 있어 `node fss_crawler.js`가 즉시 죽었다. `node --test`는 10건 전부 require 단계에서 에러였다. 설계 자체(CLAUDE.md/CHANGELOG)는 유효 → 코드를 문서·테스트에 맞춰 완성만 했다.
  - `WINDOW_FALLBACK_DEPTH`(=`DEFAULT_PAGES`) 상수 정의 — 참조만 3곳(경고 2·exports 1)+테스트인데 선언이 없어 모듈 로드 자체가 실패했다.
  - `classifyRow`/`classifySnapshot`의 5번째 인자 `covered` → `seed`로 정정. 기존 `if (covered) return "new"` 지름길은 문서의 "창 밖 깊이 → backfill"과 정면충돌(커버된 실행에서 창 밖 과거 누적분을 신규로 오탐)해 제거. 이제 seed=true→backfill, 창 안→new, 창 밖→backfill, 창 유실 시 fallback 깊이로 판정 — 테스트 10건 전부 통과.
  - `main()`이 삭제된 `collectSanctions`/`collectMngImpr`를 계속 호출 → 통합 `collectSource(SOURCES.sanction/mngimpr, ctx)`로 배선. `ctx.seed = seedMode` 전달.
  - `result.completeness` 초기화 누락(492행에서 undefined에 대입 → 첫 소스에서 throw) → `completeness: {}` 추가.
  - 검증: 모듈 로드 OK, 단위테스트 10/10 통과, 수정 4파일 `node --check` 통과. ※ 라이브 네트워크 파이프라인(main 전 구간)은 미실행 — 클라우드 배포 시 첫 런에서 확인 필요.

## 2026-07-10
- fix: 신규 판정을 '조치요구일 앵커' → '직전 실행 관측 창 차집합'으로 전환 (미탐 사고 수정)
  - 왜: FSS 목록엔 **게시일 컬럼이 없다.** 3번째 컬럼은 `제재조치요구일`이고 목록은 그 값의 내림차순 정렬이다. 즉 오늘 새로 게시된 건도 조치요구일이 과거면 목록 중간에 삽입된다. 그런데 `REPORT_SINCE`(기본 2026-07-02) 앵커는 이 컬럼에 커트오프를 걸어 **늦게 게시된 과거 조치요구일 건을 알림·보고 없이 조용히 폐기**했다.
  - 실제 누락: **`아이비케이신용정보`(조치요구일 06-25)** 가 07-09 신규 게시됐으나 backlog로 폐기 — 레저 전체를 통틀어 유일한 IBK 계열 건이었다. 그 외 롯데손해보험(07-08)·BNP파리바·순창농협·여수농협(07-10) 등 12건이 같은 방식으로 침묵 폐기됐다. 07-10 pm은 신규 4건 중 1건(DB손해보험)만 보고했다.
  - fss_crawler.js: `REPORT_SINCE` 게이트 제거(env 설정 시 무시 경고). 신규 = **직전 실행 `scanAudit`(페이지별 전체 행 key + 훑은 깊이)과의 차집합** — `buildScanWindow`·`classifyRow` 신설. 판정은 `known`/`new`/`backfill` 3분기이며, 직전에 훑지 않은 깊이(창 밖)와 최초 시드는 `backfill`(레저만 등록, 보고 제외)로 `--pages` 확장 시 과거 누적분 범람을 막는다. `backfilled[]`를 crawl_result에 명시 기록해 침묵 폐기를 없앴다.
  - 필드명 정정: `postDate`(게시일 오칭) → `actionRequestDate`(제재조치요구일). analyst.js·briefV2.js 참조 동기화(구 필드 읽기 호환은 유지).
  - 관측 창 확대: 기본 `--pages` 2 → 5 (`FSS_MAX_PAGES` override). 정렬이 조치요구일 desc라 창이 얕으면 늦게 게시된 과거 조치요구일 건이 창 밖에 떨어져 영구 미탐. `scanWindow`(깊이·행수·조치요구일 상/하한)를 기록하고 하한이 45일 이내면 경고한다.
  - runslot.js `findPreviousCrawlFile`에 `currentSlot` 인자 추가 — pm은 **당일 am**을 기준 스냅샷으로 우선 사용(전날 pm과 비교하면 당일 am 이후/이전 삽입분을 구분 못 한다).
  - 검증: 실제 07-08~07-10 scanAudit·레저로 리플레이 — 누락 4건(BNP파리바·DB손해보험·순창농협·여수농협) 전부 `new`, 오탐 0. `아이비케이신용정보` 단독 리플레이도 `new`. 단위테스트 10건 통과, validator 오류 0.
- feat: 알림·보고서 말미에 '목록에서 찾는 방법' 참고 안내 (수신자 혼선 차단)
  - 왜: 정렬이 조치요구일 순이라 신규 건이 목록 맨 위에 없다. 실제로 07-10 DB손해보험(목록 6번째 줄)을 수신자가 사이트에서 찾지 못해 오탐으로 의심했다.
  - briefV2.js `listingNoticeLines()` — `listedOutOfOrder`(조치요구일 < 최초 등장일)인 건에 대해서만 조치요구일·최초 등장일·목록 행 번호를 안내한다. 해당 건이 없으면 안내를 싣지 않는다(소음 방지). Telegram tgMsg 맨 끝 + docx `buildListingNotice` 섹션(safeSection 격리) 공용.
  - crawler가 `firstSeenDate`·`listRank`·`listingLagDays`·`listedOutOfOrder`를 항목에 실어 보낸다(`listingMeta`).
  - 구분선에 `─` 10자 이상 금지 — validator가 로그 TG_MSG 블록 끝을 `/─{10,}/`로 찾는다(주석 명시).

## 2026-07-04
- docs: 기술 패턴 문서 신설 — `docs/technical/AI_멀티에이전트_기술문서.md` (설계 패턴·신뢰성 엔지니어링, 기술팀)
  - 자매 FSC 기술문서를 템플릿으로 FSS 전면 적응: 단일 `fss_crawler`·직결 스크래핑(API/프록시 없음)·게시일 앵커+레저·Tier×위험도·pm 델타·scanAudit. FSC 고유 서술(KR 프록시·Vercel egress·Root Directory 사고·마감 D-day 리마인더·OPEN API 1차 fallback)은 전량 제거(프록시/egress 언급은 "FSS는 미사용" 대비로만).
  - 정본 지도 `docs/README.md` 등재 + 내러티브 업무문서와 상호링크. 링크 broken=0(34파일·128링크).
- docs: 소개 내러티브 업무문서 신설 — `docs/business/AI_멀티에이전트로_일한다는것.md` (경영진·일반·외부)
  - 자매 FSC 문서를 템플릿으로, 도메인은 FSS로 전면 적응: 제재·경영유의(사후 벤치마킹)·08:00/16:00·HTML/PDF 직접 스크래핑(제재 API 없음)·프록시 없음(해외 IP 차단 없음 검증)·Tier×위험도·게시일 앵커+레저·scanAudit. 링크는 FSS 실제 문서로 연결.
  - 정본 지도 `docs/README.md`에 등재(정본 지도 표 + 폴더 구조 business/). 링크 broken=0.
- docs: 개선사항 문서 신설 — `docs/deliverables/06_개선사항_2026-07.md` (2026-07 개선 4건 건별, 경영진·실무자)
  - 16:00 스케줄러 / 게시일 앵커 신규판정 / 사용자 문구 정합 / scanAudit 감사증적을 각 건 **업무(경영진: 왜·효과·리스크)** + **기술(실무자: 무엇을·어떻게·검증)**으로 정리. 커밋 참조 포함.
  - 정본 지도 `docs/README.md`에 등재(정본 지도 표 + 폴더 구조). 링크 broken=0.
- feat: crawl_result.scanAudit 추가 — 신규 0건(noUpdate)에도 "무엇을 스캔했나" git 영구 증적
  - 왜: 신규 없는 날 원본 목록 HTML은 Artifact 90일뿐이라 90일 초과 감사 시 원본 소실. 스캔 요약을 git 영구 커밋되는 crawl_result에 남겨 항구 증적(감사자 일단위 요구 대응).
  - fss_crawler.js: 각 목록 페이지에서 본 **전체 행 key + 본문 SHA-256**(page·url·status·rowCount 포함)을 `result.scanAudit`에 기록. noUpdate여도 남고 crawl_result와 함께 git 커밋(STEP6). crypto 도입, `sha256`·`openInfoKey` 헬퍼 추가(+export, 감사툴 재사용). 기존 수집·판정 로직 불변(순수 추가).
  - 검증: sha256 결정성·null안전, openInfoKey/fileId key 추출, scanAudit 엔트리 조립 실코드 확인, node -c OK.
  - 문서: docs/technical/ARCHITECTURE.md(감사 섹션)·04_TECH_DOC.md(증빙)·05_QNA.md(Q10 감사 대응)에 scanAudit 반영.
- fix: pm '변동 없음' 마감 메시지 "N건 확인" → "금융감독원 공시목록 확인" (제재 N건 오해 방지)
  - 왜: 텔레그램 pm 델타 마감의 "40건 확인"이 신규/제재 40건으로 오해될 소지. 실제로는 totalFetched(목록에서 스캔한 총 행 수, 필터 전)라 사용자에게 혼란.
  - notify_telegram.js:112: `${n}건 확인` → `금융감독원 공시목록 확인`(숫자 제거, "조회했고 신규 없음" 의미로 명확화). 이제 미사용인 `n`(totalFetched) 산출 제거. 렌더 지점은 이 한 곳뿐(briefV2 am noUpdate는 이미 숫자 없는 "금감원 신규 확인").
  - docs/operations/workflow.md 델타 마감 예시 문구 동기화. validator는 이 델타 메시지(런타임 override)를 검사하지 않아 영향 없음.

## 2026-07-03
- fix: 텔레그램 알림 헤더 "FSS 제재·경영유의 브리핑" → "금융감독원 제재·경영유의 브리핑" (사용자 노출 명칭 한글화)
  - 왜: 수신자에게 노출되는 유일한 'FSS'가 텔레그램 헤더였음. 약칭 대신 정식 기관명으로.
  - briefV2.js buildTgMsg HEADER + notify_telegram.js pm 델타 마감 메시지. validator.js C4 헤더 검사 정규식·문구 동기화(안 하면 검증 오경고).
  - 범위: 사용자 노출 출력만(사용자 확정). 문서의 헤더 출력 예시(🔔 …)는 코드와 정합 위해 동기화(SKILL 레이아웃 정본 포함). 프로젝트명(IBK FSS)·파일명(fss_crawler.js)·워크플로우명·repo명·env·URL(fss.or.kr)·내부 로그/주석·산문은 불변.
  - 검증: 시나리오 재실행 헤더 "🔔 금융감독원 …" 확인, validator C4 통과.
- fix: 게시일 앵커 기본값 2026-07-03 → 2026-07-02 (가상 시나리오 테스트로 확정)
  - 왜: 앵커 7/3은 "7/2 저녁 게시된 신규"(지난 실행 이후 올라온 진짜 신규)를 백로그로 오분류해 누락(시나리오 테스트1: 7/2 18시 하나은행). 7/2로 낮추면 7/2 신규는 포함하고 6/26 백로그는 제외 — 둘 다 올바름.
  - fss_crawler.js: `REPORT_SINCE` 기본값 7/2로. 시나리오 테스트·재사용 위해 `REPORT_SINCE`·`classifyTier`·`TIER_LABEL` export 추가.
  - E2E 시나리오 검증(크롤러 실제 앵커/계층 로직 통과): 테스트1(am) 하나은행(7/2) 보고·삼성생명(6/26) 백로그 제외·우리은행 레저 스킵 → 텔레그램 카드+보고서 정상 / 테스트2(pm) 신규 0 → '변동 없음' 마감.
  - 앵커값 인용 문서(CLAUDE·README·PROJECT_BRIEF·METHODOLOGY·ARCHITECTURE·workflow·01_SOD·02_BRD·04_TECH_DOC·05_QNA) 기본 7/2로 정합.
- fix: 보고서 오프닝 문구 "오늘 금감원이 공개한" → "금융감독원에서 새로 확인된" 정밀화 (게시일≠수집일)
  - 왜: "오늘 공개한"은 FSS가 당일 공시했다는 오해를 줌 — 실제로는 우리가 새로 확인(수집)한 것이고 공시일은 건별로 다름(총평단 지적). 게시일 앵커로 대상이 최근 게시분으로 좁혀졌고 문구도 정합화.
  - briefV2.js buildOpening 3분기(일반/noUpdate/빈상태) + "그 외" 섹션 헤더 문구 교체. 제목("오늘의 …브리핑")·"오늘의 용어"·행동 CTA("오늘 하나만 기억하세요")는 유지(오늘 만든 브리핑/행동 기준이라 사실).
  - validator.js D2 오프닝 검사 문자열을 새 문구("새로 확인된 …"/"없어요")로 정합. docs/technical/SKILL.md(레이아웃 정본) 3분기 문구표 동기화. 실보고서 생성→검증 D2 양 경로 통과 확인.
- feat: 신규 판정에 게시일 앵커(REPORT_SINCE) 도입 — 과거 누적 공시 '당일 신규' 오인 차단
  - 왜: 기존 "신규 = 레저(seen_ids)에 없는 key"는 FSS 실제 게시 시점과 무관 → 목록에 누적된 오래된 공시(게시일 7/2 하나은행·6/26 생보3사)가 '당일 신규'로 오인 보고됨(총평단 2026-07-03 지적).
  - fix(fss_crawler.js): "게시일(postDate) ≥ 앵커 REPORT_SINCE(env, 기본 2026-07-03) AND 레저에 없던 건"만 보고(newItems/graded). 앵커 이전 게시분(백로그)은 레저에만 등록(재검토 차단)하고 상세수집·알림·보고에서 완전 제외. 게시일 파싱 실패는 fail-open(보고)해 실제 건 누락 방지. crawl_result에 backlogSkipped·reportSince 기록. 레저는 중복방지(특히 08:00·16:00 두 실행 간) 보조로 병행.
  - 검증: 앵커 경계 판정(7/2·6/26→백로그 제외 / 7/3+→보고 / 빈값→fail-open) 실코드 통과, node -c OK.
  - 문서 정합: 신규 판별을 정의하는 전 문서(CLAUDE·README·docs/README 계열·PROJECT_BRIEF §5·METHODOLOGY·ARCHITECTURE·01_SOD·02_BRD·03_BUSINESS_DOC·04_TECH_DOC)에 게시일 앵커 반영. 05_QNA에 "'오늘'이 언제인가(수집일≠공시일)·백로그 처리" Q 추가.
  - fix(문구): 05_QNA am 서술 "그날 확인된"(오답) → "전날 오후(pm) 확인 이후 새로 게시된"(정확). am/pm은 레저 커밋 기반 연속 델타 창(am=전날 pm 이후, pm=오늘 am 이후).
- feat: 오후 16:00 KST 스케줄러 추가 — 하루 2회 발화(FSC Morning brief 동형) + pm 델타 게이트
  - 왜: FSC와 동일한 오전/오후 커버리지 요청(사용자 지시). 오전 이후 게시되는 제재·경영유의를 당일 오후에 포착. 결정 B를 "08:00 단일"에서 "08:00·16:00 2회"로 반전.
  - 트리거: `cloud-trigger/wrangler.toml` crons에 `0 7 * * *`(16:00 KST) 추가 → `["0 23 * * *", "0 7 * * *"]`. Cloudflare 대시보드에도 두 cron 등록·실발화 확인(wrangler 스케줄 쓰기 차단이라 대시보드가 실소스). worker `scheduled`는 두 cron 동일 dispatch — 슬롯은 러너가 KST 시각으로 판별(<12=am, ≥12=pm), 코드 로직 무변경.
  - pm 델타 배선: `daily-brief.yml` 완료알림에서 pm+오전본 존재 시 `--delta-since reports/{date}/am/crawl_result.json` 호출. 오전 이후 신규만 전체 알림, 0건이면 '변동 없음 · 기존 점검 유지' 마감(시작→완료 짝 보장). am이거나 오전본 없으면 평소대로 전체 전송(놓침 방지).
  - fix: `notify_telegram.js` 델타 게이트 비교키를 `noticeId`(FSC 스키마, FSS엔 없음→항상 undefined→오작동)에서 **`key`(examMgmtNo_emOpenSeq/파일ID)** 로 정정, `key || noticeId` fallback으로 FSC 호환. 빈 델타 메시지 FSC풍("내부통제 동향 알림")→FSS 도메인으로. 3경로(신규有/0/오전본없음) 실코드 리허설 통과.
  - 문서 정합(결정 B 반전): CLAUDE.md·README·docs/README(지도)·operations/workflow(정본)·business 3종·technical 3종(SKILL 포함)·deliverables 5종·cloud-trigger/README·wrangler·index.js 주석 전부 08:00·16:00 2회로. 자동 링크 체커 broken=0(31파일·81링크). 코드가 읽는 knowledge/·agents/ 무변경.

## 2026-07-02
- docs: 문서 디렉터리 재편 — 대상 독자별 분류 + 주제별 정본 단일화 + 정본 지도 신설
  - 왜: docs/가 평면 나열이고 같은 주제(워크플로우 등)를 여러 문서가 설명해 제3자가 "어느 게 정본인지" 즉시 못 고름. 실행 로직은 0줄 변경(순수 문서만 git mv + 링크 갱신).
  - 분류(git mv, 이력 보존): docs/business(PROJECT_BRIEF·EXECUTIVE_BRIEF·METHODOLOGY) / technical(ARCHITECTURE·AGENT_ORG_CHART·SKILL) / operations(workflow) / history(LESSONS_LEARNED). deliverables/(SOD·BRD·업무·기술·Q&A)는 공식 산출물 세트로 유지·통합
  - 정본 단일화: 워크플로우 요약(루트)+상세(docs) 중복 → docs/operations/workflow.md 단일 정본으로 통합. 루트 workflow.md·PROJECT_BRIEF.md·SKILL.md는 "정본은 여기" 포인터 stub으로 강등
  - 정본 지도: docs/README.md를 "알고 싶은 것 → 정본 하나" 매핑표 + 폴더 구조 + 정본 유지 원칙으로 재작성. 루트 README·CLAUDE가 이 지도를 진입점으로 가리킴
  - 링크 정합: 이동으로 깨지는 상대링크 전수 갱신(deliverables의 ../ARCHITECTURE·../../PROJECT_BRIEF 포함), 자동 링크 체커로 clickable broken=0 검증
  - 불건드림: 코드가 런타임에 읽는 knowledge/(6종)·agents/analyst_system_prompt.md와 모든 .js/.yml/cloud-trigger는 이동·수정 제외(grep으로 사전 식별)
- docs: 공식 산출 문서 5종 신설 (docs/deliverables/)
  - 왜: 내부 보고·인수인계·질의 대응용 표준 문서 세트(SOD·BRD·업무·기술·Q&A)가 없어 매번 개별 문서(ARCHITECTURE 등)를 발췌해야 했음 — 현행 라이브 구현 기준으로 일괄 정본화
  - 01_SOD.md(방향 정의서: 배경·방향·목표·범위·결정 A~D·로드맵) · 02_BRD.md(업무 요구사항: BR/FR/NFR/데이터/수용기준 AC-1~7) · 03_BUSINESS_DOC.md(업무문서: 운영 절차 + **AI 적용 아키텍처 시각화**(mermaid 2종·AI 적용지점 표)) · 04_TECH_DOC.md(기술문서: 컴포넌트·워크플로우·상태관리·Secrets·제약) · 05_QNA.md(예상질의답변: 비개발자 11문·개발자 15문)
  - docs/README.md 정본 지도에 deliverables/ 세트 편입
- docs: 저장소 전면 현행화 + 문서간 정합성 확보 (FSC 입법 잔재 제거)
  - 왜: 다수 문서가 자매프로젝트(FSC 입법예고) 골격 이식 시점의 서술로 남아 현행 FSS 제재 구현과 광범위 불일치(fsc_crawler/lawmaking·OPEN API·KR프록시·06:00/16:00·금융위 입법예고 등)
  - 루트: CLAUDE.md(기획단계→라이브)·README.md·workflow.md·SKILL.md·PROJECT_BRIEF.md 현행 재작성
  - docs/ 8종(ARCHITECTURE·AGENT_ORG_CHART·EXECUTIVE_BRIEF·README·METHODOLOGY·SKILL·workflow·LESSONS_LEARNED) FSS 도메인·08:00 단일·2소스·Tier·질문형 2계층으로 갱신, LESSONS는 FSC 귀속 라벨 부착
  - knowledge: tone-guide 예시 FSS 제재 벤치마킹으로 교체(D-day 제거), ibk-dept-mapping을 정본 ibk_mapping_rules와 정합화(개인·신용정보→정보보호총괄부, 전자금융 소관→개인디지털사업부), mapping_rules 프레이밍 정리, 死문서 3종(매핑_방법론·발표스크립트·ibk-keywords)에 "참고용·비참조(FSC)" 배너
  - cron 통일: wrangler.toml·cloud-trigger/README를 실제 대시보드값 `0 23 * * *`(매일)로 정정
  - 코드 정합: validator C시리즈 FSC 정규식(내부통제 동향 알림/WHAT·WHEN·WHO)→실제 FSS tgMsg(제재대상 카드·질문형 라벨)로 교체(오경고 해소), archivist 헤더 주석(run_pipeline.vbs→daily-brief.yml STEP5)
  - 부서명 정합: ibk_org_chart 감사부→검사부(공식명칭, 사용자 확인) — ibk_mapping_rules와 일치
- feat: Telegram 질문/답변 2계층 레이아웃(총평단 3차 리뷰) — 질문은 불릿 라인, 답변은 다음 줄 들여쓰기·그룹 간 빈 줄로 분리(같은 줄 혼재 시 가독성·집중도 저하 해소)
- feat: Telegram 항목 라벨 질문형 전환(총평단 2차 리뷰) — "무슨 일→왜 제재를 받았나요?", "IBK 연관→IBK에서도 발생 가능한가요?", "점검→이런 부분을 점검하시면 좋아요"
- fix: analyst MAX_TOKENS 1024→2048 (한국어 11필드 분석 truncation→JSON 미완결→폴백 방지; 우리은행 실측 사례)
- feat: 보고서 가독성(폰트 위계) + "IBK에도 발생 가능?"(재발 가능성) 명시
  - 왜(평가단 피드백): 제목/본문 폰트 위계가 흐리고, 보고서에 "IBK에도 발생 가능한 위험인지"가 안 보였음
  - 폰트: 제목18 / 제재대상헤더13 / 오프닝11 / 라벨·본문10 / 보조9pt (본문 9.5→10pt 상향)로 위계 명확화
  - 보고서 항목을 카드로 통일(buildItems): **제재대상(기관·계층·일자) → 무슨 일이 있었나요? → IBK에도 발생 가능한가요?(재발 가능성) → 무엇을 점검할까요?**. 전 건 tier순 정렬, 제재받은 곳↔IBK 점검부서 분리
  - validator D3/D4를 새 카드 라벨·"IBK에도 발생 가능한가요?" 검사로 갱신
- feat: Telegram 메시지 재설계 — 제재대상↔IBK부서 분리·정보순서 명확화
- feat: 기관 계층(Tier)×위험도 표준 방법론 + 톤(해요체) 학습기반 적용
  - 왜: 은행 제재와 환전영업소 제재를 같은 무게로 취급하던 문제 + 메시지가 개조식(~음/~함)으로 FSC 톤원칙 위반
  - 방법론 제정: `knowledge/fss_tier_methodology.md` — T0(IBK)/T1(은행)/T2(인접금융)/T3(주변·환전·GA). **알림=T0·T1·T2 전건·T3 제외, 보고서=전건 포함**, tier→위험도 순
  - fss_crawler.js: `classifyTier()` 기관 계층 판정 → 각 항목 tier·tierLabel 부여
  - briefV2.js: 알림 T3 제외·**전건 표기**·tier 태그·제외 건수 헤더, 보고서 tier 정렬·`[은행]/[인접금융]/[주변]` 태그
  - 톤: analyst에 `tone-guide.md`(토스 8원칙) **주입**(하드코딩 아님, FSS 맥락 적용) → 개조식 회귀 근본 해결. validator A7b(해요체 종결) 안전장치
  - 검증: 혼합 tier(T1 은행+T2 증권+T3 GA 2건) 재실행 — T3 2건 알림 제외·T1/T2 전건·해요체 전면 적용 확인, validator A7b 위반 0
- fix: 메시지·보고서·검증을 FSS 도메인으로 전면 교정 (입법·행정 → 제재·경영유의)
  - 왜: 자동 알림/보고서에 FSC 잔재 문구("신규 입법·행정 예고 없음" 등)가 남아, FSS(제재·경영유의 공시 모니터링) 성격과 불일치
  - notify_telegram.js: pm 델타 메시지 "입법·행정 예고"→"제재·경영유의"·"기존 점검 유지"
  - daily-brief.yml: 완료 알림에서 FSC식 pm 델타 게이트 제거(FSS는 08:00 단일 실행) → 항상 briefV2의 FSS tgMsg 전송
  - briefV2.js: ministry 기본값 금융위원회→금융감독원, 헤더 주석 FSS화
  - validator.js: FSC 검사→FSS화 — D1 헤더("제재·경영유의 브리핑")·D2 오프닝("공개한 제재·경영유의는")·D4 섹션 문자열, A2 글자수 40/60→120/200(analyst 완화 반영), A6 D-day 검사 제외(제재는 마감 없음), B3 summary→bodyText 폴백
  - 검증: 파이프라인 재실행 — tgMsg 완전 FSS 확인, validator 경고 103→2건(pass·error 0 유지)
- 클라우드 자동화 Go-live: Secrets 3종·워커 배포·자동트리거(GH_PAT 스코프 원인해결)·cron 0 23 * * *(평일 08:00 KST). Test A(콘텐츠) 폰 수신 확인, 자동트리거 실발화 검증

## 2026-07-01
- fix: 최초 실행 과거건 범람 방지 (seed 모드 graded 격리)
  - 문제: seed 모드에서도 graded를 채워, 첫 클라우드 실행에 과거 누적건(예 20건)이 전부 '신규'로 텔레그램 범람
  - 수정: crawler는 seed 시 items·ledger만 채우고 graded/newGraded는 비움 / analyst는 graded만 분석(items 폴백 제거)
  - 검증: seed→graded 0→analyst 0건 종료 · ledger 1건 제거→newItems 1·graded 1(신한투자증권) 정상 보고
- feat: 4단계 통합 — briefV2 FSS 렌더링 정합 (docx + tgMsg 완주 검증)
  - analyst: `title=org` 주입 — FSS 항목엔 title 없어 briefV2 헤드라인이 빈칸이던 것 해결(briefV2 로직 무수정)
  - briefV2: **FSC 도메인 하드코딩 문자열만 FSS로 지역화**(로직·레이아웃·구조 불변). 헤더("오늘의 제재·경영유의 브리핑")·오프닝(금융감독원/제재·경영유의/N건)·"그 외 제재·경영유의"·클로징(유사업무 점검 제안)·tgMsg(신규 제재·경영유의 없음)·WHEN(마감D-day→조치·게시일 sanctionDate)
  - 파이프라인 완주 검증: crawler→analyst→briefV2→validator(pass)→archivist. docx FSS 라벨 확인·FSC 라벨 제거, tgMsg WHAT/WHEN/WHO/HOW/WHY 제재 도메인 적절(예: 한국보험금융 명의차용→자산관리사업부 점검)
  - 남은 폴리시(비차단): validator 103 issues(pass=true, 대부분 경고) · LLM 간헐 톤 이탈("위반입니다") — 5단계 때 점검
- feat: analyst.js + FSS 제재 벤치마킹 시스템 프롬프트 (3단계)
  - 임무 = 3문항: 타행 제재사례에 대해 ①IBK 유사업무 있나 ②동일 위험 재발 가능성 ③무엇을 점검. 점검 제안형·단정 금지(법적 민감성 강제)
  - 옛 프로젝트(실패한 Claude Cowork) 문서에서 **도메인만 흡수, 구조는 미차용**(사용자 지침): RED/ORANGE/GREEN 위험기준→grade(상/중/하) 매핑, 위반유형 A~F 분류, 용어 풀이 표준, Toss 톤. briefV2 무수정(필드명 재사용)
  - 구현: agents/analyst_system_prompt.md(+knowledge/ 동적주입) · Claude Haiku 병렬(cap3, 직렬 병목 회피) · fallback(키워드) · risk_grade→grade 승격 · 종합등급(overallGrade). 분석 대상은 crawler dedup 통과 신규건뿐(재분석 없음)
  - 글자수 상한 완화(what 120/insight 150/action 200) — 제재 분석은 실질 우선, 분량은 briefV2가 조절
  - 로컬 LLM 실검증: 신한투자증권 자기거래→자산관리사업부, 우리은행 금리우대 불일치→여신기획부 점검 등 정확. 다음: briefV2 FSS 렌더링 정합 확인
- feat: fss_crawler.js — 제재공시·경영유의 2소스 수집기 (3단계 착수)
  - 실측 우선(추정 금지): 실제 HTML 확인 결과 "내용보기"는 순수 `<a href>` — 제재공시→`view.do?examMgmtNo&emOpenSeq`(dl/dt/dd 메타+PDF첨부), 경영유의→PDF 직행(`fss.hpdownload`). href에서 상세경로 추출(하드코딩 없음). onclick/form/AJAX 아님 확인
  - 구현: 목록 파서 + 상세 파서(bd-view dl/dt/dd) + 첨부 PDF 다운로드·pdf-parse 본문 + 표준 JSON 변환 + raw HTML·PDF 증빙 저장(reports/{date}/{slot}/raw·pdfs)
  - dedup: state/seen_ids.json ledger(키=examMgmtNo_emOpenSeq / 파일명ID), 최초 실행 시드모드(과거건 범람 방지). 중요도 등급(은행대상·핵심업무·제재강도·IBK직접)
  - 계약 준수: require("./runslot") reports/{date}/{slot}, 성공 시 crawl_result+ledger·실패 시 failure_meta 격리. FSS는 프록시/OPEN API 계층 없음(순수 스크래핑, 차단없음 검증)
  - 로컬 실검증: 20건(제재10+경영유의10) 파싱·PDF본문(325~4345자)·등급·ledger·증빙 정상. 다음: analyst.js(제재 벤치마킹 프롬프트)
- chore: 워크플로/cloud-trigger를 최신 아키텍처로 재동기화 (2/2 — 오케스트레이션)
  - daily-brief.yml: 최신 골격(런슬롯 reports/{date}/{slot}·failure_meta 실패격리·`-X theirs` 감사커밋) 채택 + FSS 델타: STEP1→fss_crawler.js, LAWMAKING_*·프록시 env 제거, STEP6 state/seen_ids.json 커밋, name/concurrency(fss-brief)/artifact 변경. FSS는 08:00 단일 슬롯(am)
  - cloud-trigger: 최신(/diag egress 점검 엔드포인트 포함) + FSS 타겟(REPO=ibk-FSS-brief, DIAG_ALLOW=www.fss.or.kr, 단일 cron `0 23 * * 0-4`, README 재작성)
  - 잔재 스윕 통과: lawmaking/moleg/proxy/morning-brief/06:00·16:00 없음
- chore: 재사용 인프라를 Daily-Morning-brief 최신(48bd6ff)으로 재동기화 (1/2 — 인프라)
  - 왜: 2단계는 GitHub과 분기된 로컬 FSC 클론에서 복사됨 → 정본(GitHub main)을 새 clone해 재동기화. 원칙(사용자 확정): FSC 원본 불수정·구조만 복제·아키텍처 유지·수집계층만 교체·KR프록시 미도입
  - 갱신(정본 verbatim): briefV2·validator·archivist·notify_telegram·package.json·SKILL.md·workflow.md·knowledge/*(+매핑_방법론·발표스크립트)·docs/*
  - 신규 이식: runslot.js(★ 갱신 모듈 4종의 필수 의존성 — reports/{date}/{slot}/ 네임스페이스), docs/LESSONS_LEARNED.md(자매 프로젝트 필독)
  - 슬롯: FSS는 08:00 단일 트리거 → resolveSlot=am 단일 슬롯. 2회 실행 아님(결정 B 유지). 슬롯 로직 제거 안 함(=아키텍처 불수정)
  - 후속: 워크플로/cloud-trigger 병합(커밋 2/2), 도메인 문구 적응·fss_crawler·analyst(3단계)

## 2026-06-26
- fix: briefV2.js 를 FSC 2767b36 기준으로 갱신 (A-02/B-02 fallback 배지 · B-09 섹션 격리)
  - 왜: 2단계 복사 시점 이후 FSC에 2767b36이 커밋돼 FSS 복사본이 개선 이전(674줄)이었음 → 현재본(699줄)으로 동기화. 다른 재사용 자산 13종은 일치 확인됨
- chore: 2단계 골격 이식 — FSC 재사용 자산 복사 + FSS 타겟 변경
  - 왜: 1단계 검증 종료(해외접근 PASS, 결정 A/B/C/D 확정) → FSC 멀티에이전트 골격을 FSS repo로 이식
  - 복사: briefV2.js·validator.js·archivist.js·notify_telegram.js·package(+pdf-parse)·knowledge/·docs/·SKILL.md·workflow.md·cloud-trigger/·daily-brief.yml
  - 타겟 변경: cloud-trigger repo→ibk-FSS-brief, Cron 08:00 KST(`0 23 * * 0-4`), 봇 신규분리(.env.example telegram)
  - 워크플로우: STEP1 fss_crawler.js+dedup, STEP6 seen_ids.json 커밋 추가
  - 신규 시드: state/seen_ids.json (dedup ledger, 키=examMgmtNo+emOpenSeq / 파일명ID)
  - 미생성(3단계): fss_crawler.js, analyst.js(제재분석 프롬프트)
  - 비고: 산출물 파일명은 다운스트림 재사용 위해 crawl_result.json 유지(브리프 §4 fss_result.json과 상이)
- chore: FSS 해외 IP 차단 진단 워크플로우 추가 (.github/workflows/diag-fss-access.yml)
  - 왜: §7-C 미검증 변수 — 미국 GitHub 러너에서 FSS 접근 가능해야 FSC식 완전 클라우드 구조 성립
  - 두 목록(openInfo·openInfoImpr) + 상세 HTML + PDF 첨부 4종을 1회 호출, runner geo·HTTP·콘텐츠 검증
  - 1단계 검증 결과 반영: OPEN API엔 제재 서비스 없음→HTML 크롤 채택(D 종결). dedup 키 = examMgmtNo+emOpenSeq(제재) / 파일명 ID(경영유의, PDF)
- docs: 프로젝트 기획안 초안 작성 (PROJECT_BRIEF.md, CLAUDE.md, README.md)
  - FSS 제재공시·경영유의 모니터링 자동화 — FSC(Daily-Morning-brief) 아키텍처 차용
  - 기획 단계, 코드 미구현. 착수 1단계 = OpenAPI 확인 / FSS 해외 IP 차단 진단
