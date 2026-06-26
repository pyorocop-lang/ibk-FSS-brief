# ibk-FSS-brief

IBK기업은행 내부통제점검팀 — **금융감독원(FSS) 제재공시·경영유의사항** 자동 모니터링·분석·보고.

> 📌 **현재 기획 단계.** 설계 문서를 먼저 보세요 → **[PROJECT_BRIEF.md](PROJECT_BRIEF.md)**

## 한 줄 요약
금감원이 제재/경영유의 건을 게시하면, 신규분을 수집해 Claude LLM이 IBK 업무 연관성(타행 제재 → IBK 자가점검 / IBK 직접 제재 → 즉시 대응)을 분석하고 Telegram 알림 + DOCX 보고서를 생성하는 완전 클라우드 멀티에이전트 파이프라인.

## 데이터 소스
- 제재공시: https://www.fss.or.kr/fss/job/openInfo/list.do?menuNo=200476
- 경영유의·개선사항: https://www.fss.or.kr/fss/job/openInfoImpr/list.do?menuNo=200483

## 아키텍처
자매 프로젝트 [Daily-Morning-brief](https://github.com/pyorocop-lang/Daily-Morning-brief)(FSC 입법예고 브리핑)의 완전 클라우드 구조(Cloudflare Cron → GitHub Actions 단일 Job → Telegram)를 차용. 상세는 [PROJECT_BRIEF.md](PROJECT_BRIEF.md).
