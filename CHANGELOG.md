# 변경 이력

## 2026-07-01
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
