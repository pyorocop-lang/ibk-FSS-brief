# 변경 이력

## 2026-07-01
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
