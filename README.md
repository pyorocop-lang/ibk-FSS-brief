# ibk-FSS-brief

IBK기업은행 내부통제점검팀 — **금융감독원(FSS) 제재공시·경영유의사항** 자동 모니터링·분석·보고.

> ✅ **라이브 운영 중** — 매일 08:00 KST 완전 클라우드 자동 실행.
> 📖 **모든 문서의 지도(정본 인덱스)는 [docs/README.md](docs/README.md)** — "알고 싶은 것 → 정본 하나".
> 운영 절차는 [docs/operations/workflow.md](docs/operations/workflow.md), 설계 배경은 [docs/business/PROJECT_BRIEF.md](docs/business/PROJECT_BRIEF.md), 개발 지침은 [CLAUDE.md](CLAUDE.md).

## 한 줄 요약
금감원이 제재/경영유의 건을 게시하면, 신규분을 수집해 Claude LLM이 IBK 업무 연관성(타행 제재 → IBK 자가점검 / IBK 직접 제재 → 즉시 대응)을 분석하고 Telegram 알림 + DOCX 보고서를 생성하는 완전 클라우드 멀티에이전트 파이프라인.

## 데이터 소스 (2종, 직접 스크래핑)
- 제재공시(openInfo, HTML+PDF): https://www.fss.or.kr/fss/job/openInfo/list.do?menuNo=200476
- 경영유의·개선사항(openInfoImpr, PDF): https://www.fss.or.kr/fss/job/openInfoImpr/list.do?menuNo=200483

FSS OPEN API에는 제재/경영유의 엔드포인트가 없어 HTML/PDF 직접 스크래핑을 채택. FSS는 해외 IP 차단이 없어(미국 러너 접근 PASS) 프록시 없이 GitHub Actions에서 직결 수집. 누적 목록에서 신규만 가리기 위해 `state/seen_ids.json` dedup ledger 사용.

## 아키텍처 (완전 클라우드)
```
Cloudflare Workers Cron (매일 23:00 UTC = 08:00 KST)
  → GitHub workflow_dispatch (.github/workflows/daily-brief.yml, 단일 Job)
      fss_crawler.js (2소스 스크래핑 + seen_ids dedup)
      → analyst.js (Claude Haiku, Tier기반 IBK 벤치마킹 분석)
      → briefV2.js (DOCX 보고서 + Telegram 메시지)
      → validator.js → archivist.js → notify_telegram.js
```
자매 프로젝트 [Daily-Morning-brief](https://github.com/pyorocop-lang/Daily-Morning-brief)(FSC 입법예고 브리핑)의 완전 클라우드 골격을 차용하되, **수집 계층(fss_crawler.js)과 분석 관점(analyst.js)은 FSS 제재 도메인 전용으로 신규 작성**했다. 상세 흐름은 [docs/operations/workflow.md](docs/operations/workflow.md)·[docs/technical/ARCHITECTURE.md](docs/technical/ARCHITECTURE.md).
