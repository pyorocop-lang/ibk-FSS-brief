## 프로젝트 개요 (기획 단계)
IBK기업은행 내부통제점검팀 — **금융감독원(FSS) 제재공시·경영유의사항** 모니터링 자동 보고서.
금감원이 제재/경영유의 건을 게시하면 신규분을 수집 → Claude LLM이 IBK 업무 연관성 분석 → Telegram 알림 + DOCX 보고서.
작업 디렉토리: D:\projects\ibk-FSS-brief

## 현재 상태
**코드 미구현 — 기획 확정 단계.** 먼저 [PROJECT_BRIEF.md](PROJECT_BRIEF.md)를 읽을 것. 거기에 목적·소스·아키텍처·결정사항·로드맵이 정리돼 있다.

## 자매 프로젝트 (아키텍처 원본)
FSC 입법예고 브리핑: https://github.com/pyorocop-lang/Daily-Morning-brief
로컬 클론: D:\projects\ibk-morning-brief
→ 완전 클라우드(Cloudflare Cron → GitHub Actions 단일 Job → Telegram) 멀티에이전트 구조를 **그대로 차용**한다.
→ briefV2.js / validator.js / archivist.js / notify_telegram.js / cloud-trigger / knowledge / SKILL.md / tone-guide 는 거기서 복사해 재사용 (PROJECT_BRIEF §8 참조).

## 가장 먼저 할 일 (PROJECT_BRIEF §9 1단계)
1. FSS OpenAPI(data.go.kr 금감원 제재) 존재 여부 확인 — 있으면 HTML 크롤보다 우선.
2. 없으면 FSS 사이트 해외 IP 차단 여부를 **클라우드에서 1회 진단** (FSC 때 교훈: 추측 말고 검증).
3. 크롤 경로 확정 후 골격 이식 → 신규 모듈(fss_crawler.js, analyst.js 프롬프트, state/seen_ids.json) 작성.

## FSC 프로젝트와의 결정적 차이 (분석 관점)
- FSC = 예방(법령 변경 대응). **FSS = 사후(실제 제재사례 기반 IBK 자가점검·벤치마킹).**
- 발행 부정기적 → **중복방지 ledger(state/seen_ids.json)** 가 필수. 클라우드 실행이므로 repo가 유일한 상태 저장소.
- 마감(D-day) 캘린더 대신 **제재 심도/유형 기반 중요도**.
- 제재는 법적으로 민감 → 분석은 단정 금지, "점검 제안"형으로만 (tone-guide 준수).

## 확정 필요 (사용자와 합의 후 진행 — PROJECT_BRIEF §7)
A. Telegram 봇: 신규 분리(권장) vs 기존 brief_bot 재사용
B. 실행 시각: 평일 08:00 KST(권장, 07:30 FSC와 충돌 회피)
C. FSS 해외 IP 차단 여부: 진단 필요
D. OpenAPI 우선 검토

## Git 커밋 규율 (FSC 프로젝트와 동일 — 변경 금지)
- main 직접 커밋 허용 (1인 프로젝트)
- 커밋 메시지에 "왜" 포함: `<type>: <what>` + 필요 시 body. type: feat/fix/chore/docs/refactor
- CHANGELOG.md를 코드 변경과 **같은 커밋**에 포함 (분리 금지)

## 주의
이 프로젝트는 FSC 브리핑(D:\projects\ibk-morning-brief)과 **별개 repo·별개 세션**이다. 두 작업 컨텍스트를 섞지 말 것.
