# BRD — 업무 요구사항 정의서 (Business Requirements Document)

> **프로젝트**: IBK FSS 제재·경영유의 브리핑 (ibk-FSS-brief)
> **주관**: IBK기업은행 내부통제점검팀
> **작성일**: 2026-07-02 · **상태**: 전 요구사항 구현·검증 완료 (라이브)
> **관련 문서**: [SOD](01_SOD.md) · [업무문서](03_BUSINESS_DOC.md) · [기술문서](04_TECH_DOC.md) · [예상질의답변](05_QNA.md)

---

## 1. 개요

### 1.1 목적

금융감독원(FSS)이 게시하는 제재공시·경영유의사항을 자동 수집하고, Claude LLM이 IBK기업은행 업무 연관성을 벤치마킹 자가점검 관점으로 분석해, 매일 08:00·16:00 KST Telegram 알림과 DOCX 보고서로 전달하는 시스템의 업무 요구사항을 정의한다.

### 1.2 이해관계자

| 구분 | 대상 | 역할 |
|---|---|---|
| 주 사용자 | 내부통제점검팀 담당자 | 알림·보고서 수신, 점검 제안 검토·실행 |
| 정보 수요자 | IBK 유관 부서 (여신·AML·소비자보호 등) | 보고서 기반 자가점검 수행 |
| 운영자 | 내부통제점검팀 (1인 운영) | Secrets 관리, 실패 알림 대응, 수동 재실행 |
| 데이터 원천 | 금융감독원 (fss.or.kr) | 제재공시·경영유의사항 게시 (외부, 통제 불가) |

### 1.3 AS-IS / TO-BE

| 구분 | AS-IS | TO-BE (구현 완료) |
|---|---|---|
| 신규 공시 확인 | 담당자가 FSS 게시판 2곳 수동 순회 | 매일 08:00·16:00 자동 수집·신규 판별 |
| 신규/기존 구분 | 육안 대조 (목록에 과거 건 누적 노출) | 게시일 앵커(REPORT_SINCE) + `state/seen_ids.json` ledger 자동 대조 |
| IBK 연관성 분석 | 담당자 개인 역량 의존 | LLM이 제재 핵심·발생 가능성·점검 제안·부서를 표준 틀로 산출 |
| 중요도 선별 | 없음 (전건 동일 취급) | 기관 계층(T0~T3) × 위험도(상/중/하) |
| 전달 | 없음 (개인 확인) | Telegram 알림 + DOCX 보고서 |
| 이력 관리 | 개인 메모 | git 감사 커밋 + Artifact 90일 보관 |

---

## 2. 업무 요구사항 (Business Requirements)

| ID | 요구사항 |
|---|---|
| BR-01 | 담당자는 FSS 홈페이지를 방문하지 않고도 신규 제재·경영유의 건을 매일 아침 인지할 수 있어야 한다. |
| BR-02 | 이미 보고된 건은 다시 알림되지 않아야 한다 (중복 알림 0건). |
| BR-03 | 각 건은 "IBK에도 발생 가능한가"라는 벤치마킹 자가점검 관점으로 분석되어야 한다. |
| BR-04 | IBK와 무관한 소규모 업권(환전영업소·GA 등) 제재가 알림을 오염시키지 않아야 한다. |
| BR-05 | 분석 표현은 법적 단정 없이 "점검 제안"형이어야 한다 (제재의 법적 민감성). |
| BR-06 | 수집 실패가 "오늘 신규 없음"으로 오인 보고되어서는 안 된다. |
| BR-07 | 수집 원문과 실행 이력이 감사 증빙으로 보존되어야 한다. |
| BR-08 | 시스템은 담당자 PC·사내 서버 없이 무인 운영되어야 한다. |

---

## 3. 기능 요구사항 (Functional Requirements)

### 3.1 수집 (FR-1x)

| ID | 요구사항 | 구현 |
|---|---|---|
| FR-11 | 제재공시(menuNo=200476, 상세 HTML+PDF)와 경영유의(menuNo=200483, PDF 직결) 2소스를 수집한다. | `fss_crawler.js` |
| FR-12 | 상세 경로는 목록 HTML 앵커 href에서 추출한다 (경로 추정·하드코딩 금지). | `fss_crawler.js` |
| FR-13 | **게시일(postDate) ≥ 앵커 `REPORT_SINCE`(기본 2026-07-02) AND `state/seen_ids.json`에 없는 건**만 분석 대상(`graded[]`)으로 선별한다. 앵커 이전 게시분(백로그)은 레저 등록·보고 제외(게시일 파싱 실패는 fail-open). dedup 키: 제재공시=`examMgmtNo_emOpenSeq`, 경영유의=첨부 파일명 선두 ID. | `fss_crawler.js` |
| FR-14 | 최초 실행(ledger 빈 상태)은 **시드 모드**로 과거건을 보고 대상에서 제외하고 ledger만 채운다 (초기 알림 범람 방지). | `fss_crawler.js` |
| FR-15 | 수집 실패 시 `failure_meta.json`만 기록하고 성공본(`crawl_result.json`)·ledger는 건드리지 않는다 (실패 격리). | `fss_crawler.js` + `daily-brief.yml` |
| FR-16 | 원본 HTML·PDF를 `reports/{DATE}/{SLOT}/raw/`, `/pdfs/`에 증빙 보존한다. | `fss_crawler.js` |
| FR-17 | 수집은 Job 레벨 최대 3회 재시도한다 (재시도 간격 120초). | `daily-brief.yml` STEP1 |

### 3.2 분석 (FR-2x)

| ID | 요구사항 | 구현 |
|---|---|---|
| FR-21 | 신규 건별로 LLM이 다음을 산출한다: 제재 핵심(what_changes) / IBK 유사업무·재발위험(ctrl_insight) / 점검 제안(our_action) / 담당·유관 부서(dept·related_depts) / 위험도(risk_grade: 상·중·하) / 워크플로우 유형 / 용어 해설(term). | `analyst.js` (Claude Haiku) |
| FR-22 | 제재대상 기관을 계층으로 분류한다: T0(IBK직접)·T1(은행)·T2(인접금융)·T3(주변). | `fss_crawler.js` `classifyTier()` |
| FR-23 | 시스템 프롬프트에 IBK 지식(조직도·부서매핑·매핑규칙·액션기준)과 tone-guide(해요체 8원칙)를 주입한다. | `analyst.js` |
| FR-24 | API 키 미설정·오류 시 키워드 템플릿 fallback으로 강등하되 파이프라인은 계속 진행한다 (치명 오류만 중단). | `analyst.js` exit 0/1/2 |

### 3.3 보고서·알림 (FR-3x)

| ID | 요구사항 | 구현 |
|---|---|---|
| FR-31 | DOCX 보고서는 **전건**(T3 포함)을 항목 카드(제재대상 → 무슨 일 → IBK 발생 가능? → 점검 제안)로 수록하고, Tier→위험도 순으로 정렬한다. | `briefV2.js` |
| FR-32 | Telegram 알림은 **T0·T1·T2 전건**(T3 제외, 제외 건수는 헤더 표기)을 질문형 2계층 레이아웃으로 전송한다. | `briefV2.js` tgMsg |
| FR-33 | 신규 0건 시 "✅ 신규 제재·경영유의 없음 — 기존 점검 유지" 1줄로 조용히 알림한다. 신규가 전부 T3면 "IBK 유관 없음"으로 마감한다. | `briefV2.js` |
| FR-34 | 시작·완료·오류 3종 알림을 단일 Telegram 봇으로 발송한다. | `notify_telegram.js` |

### 3.4 검증·보존 (FR-4x)

| ID | 요구사항 | 구현 |
|---|---|---|
| FR-41 | 보고서·메시지 품질을 자동 검증한다: A(톤 8원칙) / B(텍스트 절삭) / C(tgMsg 구조) / D(DOCX 구조). | `validator.js` |
| FR-42 | 실행 메타(run_meta.json)·매니페스트(run_manifest.jsonl)를 기록하고 보관 정책을 적용한다. | `archivist.js` |
| FR-43 | 성공 시 crawl_result·run_meta·seen_ids·manifest를 git 커밋한다. 실패 시 failure_meta만 격리 커밋한다. | `daily-brief.yml` STEP6 |
| FR-44 | 산출물 일체를 GitHub Artifact(`fss-brief-{DATE}-{SLOT}`)로 90일 보관한다. | `daily-brief.yml` |
| FR-45 | 산출물은 런 슬롯(am/pm)별로 분리 보존해 재실행이 이전 기록을 덮지 않도록 한다. | `runslot.js` |

### 3.5 트리거 (FR-5x)

| ID | 요구사항 | 구현 |
|---|---|---|
| FR-51 | 매일 08:00·16:00 KST 정시에 파이프라인을 기동한다(am·pm 2회). | Cloudflare Workers Cron `0 23 * * *`(am) · `0 7 * * *`(pm) → `workflow_dispatch` |
| FR-52 | 수동 실행이 가능해야 한다. | `gh workflow run "IBK FSS Sanction Brief" --ref main` |
| FR-53 | pm(16:00) 슬롯은 오전 이후 신규만 델타 알림하고, 신규 0건이면 '변동 없음 · 기존 점검 유지' 마감 알림을 보낸다. | `notify_telegram.js --delta-since reports/{DATE}/am/crawl_result.json` + seen_ids dedup |

---

## 4. 비기능 요구사항 (Non-Functional Requirements)

| ID | 분류 | 요구사항 | 구현 |
|---|---|---|---|
| NFR-01 | 정시성 | 08:00·16:00 KST ±수 분 내 기동 (GitHub schedule cron의 ~12h 지연 회피) | 외부 Cloudflare Workers Cron 전담 |
| NFR-02 | 무인 운영 | 로컬 PC·상시 서버 불요, 상태는 repo에 지속 | 완전 클라우드 + git 상태 저장소 |
| NFR-03 | 신뢰성 | 수집 재시도 ≤3회, 동시 실행 방지, push 충돌 자동 해소 | Job retry + concurrency group + `-X theirs` rebase |
| NFR-04 | 컴플라이언스 | 단정적 법적 판단 금지, 제안형 해요체 강제 | tone-guide 주입 + validator A7/A7b |
| NFR-05 | 감사성 | 원문·결과·메타 전 이력 git 추적, Artifact 90일 | STEP6 감사 커밋 |
| NFR-06 | 보안 | 자격증명은 GitHub Secrets(3종)·Cloudflare Secret(GH_PAT)로만 관리, 코드에 미포함 | Secrets 주입 |
| NFR-07 | 비용 | LLM은 경량 모델(Haiku) 사용, 신규 건만 분석(재분석 없음) | analyst 설계 |
| NFR-08 | 성능 | 전체 Job 30분 내 완료, LLM 분석은 소규모 병렬(3) | timeout-minutes: 30, CONCURRENCY=3 |

---

## 5. 데이터 요구사항

| 데이터 | 위치 | 보존 |
|---|---|---|
| 수집+분석 결과 (crawl_result.json) | `reports/{DATE}/{SLOT}/` | git 영구 |
| 원본 HTML·PDF | `reports/{DATE}/{SLOT}/raw/`, `/pdfs/` | Artifact 90일 |
| DOCX 보고서 | `reports/{DATE}/{SLOT}/{DATE}_{morning\|afternoon}_brief.docx` | Artifact 90일 |
| 중복방지 원장 (seen_ids.json) | `state/` | git 영구 (유일한 상태 저장소) |
| 실행 메타·매니페스트 | `run_meta.json` · `logs/run_manifest.jsonl` | git 영구 |
| 검증 결과 (validation_result.json) | `reports/{DATE}/{SLOT}/` | 30일 |

---

## 6. 제약사항

| 제약 | 내용 |
|---|---|
| C-01 | FSS OPEN API에 제재/경영유의 엔드포인트가 없어 HTML/PDF 스크래핑에 의존한다 (사이트 개편 시 수집기 보수 필요). |
| C-02 | Cloudflare cron 대시보드가 평일 범위(0-4)를 받지 못해 매일 실행한다 — 주말 신규 0건은 조용한 알림으로 무해 처리. |
| C-03 | Tier 판정은 기관명 키워드 휴리스틱이라 경계 사례(예: "○○에셋") 오분류 가능 — 필요 시 규칙 보강. |
| C-04 | 자매 프로젝트(Daily-Morning-brief)는 읽기 전용 참조 — 직접 수정·push 금지. |

---

## 7. 수용 기준 (Acceptance Criteria) — 전건 검증 완료

| # | 시나리오 | 기대 결과 | 검증 |
|---|---|---|---|
| AC-1 | 신규 T1 은행 제재 1건 게시 | 08:00 알림에 질문형 2계층 카드 포함, DOCX 수록, ledger 갱신 | ✅ 실운영 확인 |
| AC-2 | 신규 0건 | "신규 없음" 1줄 알림, 오인 보고 없음 | ✅ |
| AC-3 | 신규가 전부 T3 | 알림은 "IBK 유관 없음" 마감, DOCX에는 전건 수록 | ✅ 혼합 Tier 재실행 검증 |
| AC-4 | 수집 3회 연속 실패 | "❌ 수집 실패" 알림 + Job 실패, 기존 성공본·ledger 비파괴 | ✅ 실패 격리 검증 |
| AC-5 | 동일 건 재수집 | ledger 대조로 알림 제외 (중복 알림 0) | ✅ |
| AC-6 | 최초 실행 (ledger 빈 상태) | 과거건 알림 범람 없이 ledger만 시드 | ✅ (2026-07-01 수정 반영) |
| AC-7 | 톤 검증 | 개조식(~함/~음) 0건, 해요체 준수 (validator A7b 위반 0) | ✅ |
