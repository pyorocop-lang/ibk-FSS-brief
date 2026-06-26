# 변경 이력

## 2026-06-26
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
