# IBK FSS 제재·경영유의 브리핑 — 워크플로우

> 매일 08:00 KST 자동 실행 (완전 클라우드 — 로컬 PC 불필요)
> 담당: 내부통제점검팀
> 수집 대상: **금융감독원(FSS)** 제재공시(openInfo) + 경영유의·개선사항(openInfoImpr) — 사후 제재사례 기반 IBK 벤치마킹 자가점검

> 이 문서는 현행 클라우드 워크플로우의 **간결 요약**입니다.
> 단계별 상세·타임라인·오류 대응 절차는 **[docs/workflow.md](docs/workflow.md)** 를 참조하세요.

---

## 아키텍처 한눈에 보기

- **완전 클라우드 자동화** — 수집부터 알림까지 GitHub Actions에서 전부 실행. 로컬 스케줄러·로컬 listener 없음.
- **트리거:** 외부 **Cloudflare Workers Cron**(`cloud-trigger/`)이 매일 08:00 KST(= 23:00 UTC, cron `0 23 * * *`)에 GitHub `workflow_dispatch` 호출.
  (GitHub 자체 schedule cron은 ~11h 지연·누락이 확인돼 제거 — 정시성은 Cloudflare가 책임.)
- **파이프라인:** 단일 GitHub Actions Job — `.github/workflows/daily-brief.yml` (워크플로우명 `IBK FSS Sanction Brief`).
- **수집:** FSS 2소스 직접 스크래핑 + `state/seen_ids.json` dedup. FSS는 해외 IP 차단이 없어(미국 러너 접근 PASS) **KR 프록시·OPEN API 없이 직결**. 콜드스타트/일시장애 흡수용 재시도 최대 3회.
- **메신저:** Telegram (FSS 전용 신규 봇, FSC 법령 알림과 채널 분리). 알림 메시지 필드 `tgMsg`.

---

## 전체 파이프라인

```
[Trigger] 매일 08:00 KST
    Cloudflare Workers Cron → GitHub workflow_dispatch
    (수동: gh workflow run "IBK FSS Sanction Brief" --ref main)
    │
    ▼
[GitHub Actions 단일 Job — .github/workflows/daily-brief.yml]
    │
    ├─ 시작 알림  notify_telegram.js  ─── "⚙️ {DATE} 브리핑 생성 시작합니다."
    │
    ├─ STEP 1  fss_crawler.js ──────── FSS 2소스 수집 + seen_ids dedup (최대 3회 재시도, 120초 간격)
    │             제재공시(openInfo, HTML+PDF) + 경영유의(openInfoImpr, PDF)
    │             출력: reports/{DATE}/{SLOT}/crawl_result.json (신규건만 graded[])
    │             실패 시 failure_meta.json만 쓰고 성공본은 건드리지 않음(오인 보고 차단) → 3회 실패 시 오류 알림·중단
    │
    ├─ STEP 2  analyst.js ──────────── Claude Haiku LLM 분석 (graded[]만, 병렬 CONCURRENCY=3)
    │             Tier기반 IBK 벤치마킹 · tone-guide(해요체) 주입 · 부서 배정 · Telegram 메시지 생성
    │             출력: crawl_result.json 갱신 (분석 필드 + tgMsg)
    │             exitCode 0=정상 / 1=fallback(키워드 모드, 계속) / 2=치명(중단)
    │
    ├─ STEP 3  briefV2.js ──────────── Word 보고서 생성 (+ tgMsg 기록)
    │             출력: reports/{DATE}/{SLOT}/{DATE}_{morning|afternoon}_brief.docx
    │
    ├─ STEP 4  validator.js ────────── 품질 검증 (톤 8원칙 · 절삭 · tgMsg · 보고서 구조)
    │             출력: reports/{DATE}/{SLOT}/validation_result.json
    │             exitCode 0=통과 / 1=경고(계속) / 2=오류→status=warn
    │
    ├─ STEP 5  archivist.js ────────── 로그 정리 + 감사 메타 기록 (항상 실행)
    │             출력: run_meta.json · logs/run_manifest.jsonl(누적)
    │
    ├─ STEP 6  감사 커밋 ───────────── crawl_result.json · run_meta.json · run_manifest.jsonl · state/seen_ids.json
    │             git commit + push (충돌 시 -X theirs로 최신 런 채택). 성공 시에만 seen_ids 커밋(중복방지 상태 지속)
    │
    └─ Artifact 업로드(fss-brief-{DATE}-{SLOT}, 90일) + 완료 알림
                  node notify_telegram.js --from-crawl-result

[오류 알림] 워크플로우 if: failure() → "❌ 브리핑 오류 발생 ({DATE}/{SLOT}) — GitHub Actions 로그 확인 필요"
```

> **런 슬롯(runslot.js):** 산출물은 `reports/{DATE}/{SLOT}/` 에 런별 분리 보존(덮어쓰기 금지 = 감사 추적). SLOT은 발화시각 KST로 판별(<12=am, ≥12=pm). 08:00 정시 발화는 단일 슬롯(am). 수동 오후 재실행 시 pm으로 자동 분리돼 오전 기록을 덮지 않음.

---

## Telegram 알림 포맷 (출처: crawl_result.json의 tgMsg)

briefV2.js `buildTgMsg` 생성. **질문형 라벨 + 질문·답변 2계층 레이아웃**(총평단 리뷰 반영). 알림 포함 대상은 Tier T0·T1·T2 전건(T3 주변은 제외, 헤더에 건수만 표기) — [knowledge/fss_tier_methodology.md](knowledge/fss_tier_methodology.md).

**신규 IBK 유관 건이 있을 때:**
```
🔔 FSS 제재·경영유의 브리핑 (HH:MM)
금감원 신규 중 IBK 유관 N건 (🔴 즉시점검 M) · 주변 K건 참고

🔶 제재대상: {기관} [{계층}] · {일자} · {제재유형}

• 왜 제재를 받았나요?
   {제재 사유}

• IBK에서도 발생 가능한가요?
   {IBK 부서·재발 가능성}

• 이런 부분을 점검하시면 좋아요
   {점검 제안}
```

**신규 IBK 유관 없을 때:** `🔔 FSS 제재·경영유의 브리핑` + `금감원 신규 확인 · IBK 유관 없음` + `✅ …`

---

## 단계별 상세

### STEP 1 · fss_crawler.js — 수집기 (FSS 2소스 직접 스크래핑 + dedup)

- **소스:** ① 제재공시 `openInfo/list.do?menuNo=200476` (목록 HTML → 상세 view.do, 본문 PDF) ② 경영유의·개선 `openInfoImpr/list.do?menuNo=200483` (목록 → 첨부 PDF)
- **언어:** Node.js (https 모듈), PDF 본문은 `pdf-parse`
- **실행 위치:** GitHub Actions 러너(클라우드). FSS는 해외 IP 차단 없음(diag-fss-access.yml PASS) → 프록시 불요.
- **dedup:** 전체 목록 수집 후 `state/seen_ids.json`에 없는 것만 **신규**로 채택. 키 = openInfo(examMgmtNo_emOpenSeq) / openInfoImpr(파일 ID). 최초 실행(빈 ledger)은 seed 모드 — ledger만 채우고 보고하지 않음(범람 방지).
- **계층·점수:** `classifyTier(org)`로 T0(IBK)/T1(은행)/T2(인접금융)/T3(주변) 부여 + 제재대상 계층·IBK 핵심업무·제재강도 기반 인라인 점수화. ※ 제재는 시행일·의견마감(D-day) 개념이 없음.
- **재시도:** 일시 실패 시 최대 3회(120초 간격). 실패 시 `failure_meta.json`만 기록(성공본 비파괴).

### STEP 2 · analyst.js — Claude Haiku LLM 분석

- **모델:** `claude-haiku-4-5-20251001`, `MAX_TOKENS=2048`
- **API 키:** GitHub Secret `ANTHROPIC_API_KEY`
- **처리:** 신규 `graded[]`만 분석(과거건 범람 방지), **병렬 `CONCURRENCY=3`**
- **주입 지식:** `tone-guide.md`(해요체 8원칙, K_TONE) + 조직도/부서매핑/매핑규칙/액션규칙(K_ORG/K_DEPT/K_MAPPING/K_ACTION)
- **분석 관점:** 이 제재사례가 IBK에도 발생 가능한지(벤치마킹 자가점검) — 단정 금지, "점검 제안"형
- **주요 산출 필드:** `what_changes`(무슨 일) · `ctrl_insight`(IBK 재발 가능성·부서) · `our_action`(점검 제안) · `dept`/`related_depts` · `sanction_type` · `risk_grade`(상/중/하)
- **부서 배정:** IBK 공식 조직도 기준([knowledge/ibk-dept-mapping.md](knowledge/ibk-dept-mapping.md) · [knowledge/ibk_mapping_rules.md](knowledge/ibk_mapping_rules.md)). IBK 미존재 부서명 금지.
- **fallback:** API 키 없음/오류 시 키워드 템플릿으로 채우고 exitCode=1(계속).

### STEP 3 · briefV2.js — Word 보고서 생성

- **언어:** Node.js (`docx`)
- **레이아웃 정본:** [docs/SKILL.md](docs/SKILL.md) (수치 임의 변경 금지)
- **입출력:** `reports/{DATE}/{SLOT}/crawl_result.json` → `{DATE}_{morning|afternoon}_brief.docx` (+ tgMsg 기록)
- **폰트 위계:** 제목 18pt / 제재대상 헤더 13pt / 오프닝 11pt / 라벨·본문 10pt / 캡션 9pt (맑은 고딕)
- **항목 카드(전 건, Tier→위험도 정렬):** `제재대상(기관·계층·일자)` → `무슨 일이 있었나요?` → `IBK에도 발생 가능한가요?`(재발 가능성) → `무엇을 점검할까요?`
- **오프닝:** "오늘 금융감독원이 공개한 제재·경영유의는 N건이에요" (0건이면 안내 문구로 대체)
- **용어(📖):** term 존재 시. ※ 제재는 마감(D-day) 없음 → 마감 요약 섹션 없음.

### STEP 4 · validator.js — 품질 검증

| 그룹 | 항목 |
|---|---|
| A | 톤 8원칙(핵심선행·문장길이·금지표현·독자주어·숫자/날짜·동사종결·해요체 A7/A7b 등) |
| B | 절삭 — what_changes/our_action/summary/ctrl_insight 존재·최소길이 |
| C | tgMsg 출처·글자수·줄수(뉴스레터형이라 글자수·줄수는 info) |
| D | 보고서 구조 — 카드 라벨(제재대상/무슨 일이 있었나요?/IBK에도 발생 가능한가요?/무엇을 점검할까요?) 출력 여부 |

종료코드: 0=통과 / 1=경고(계속) / 2=오류.

### STEP 5 · archivist.js — 감사 아카이브

`run_meta.json` 생성 + `logs/run_manifest.jsonl` 누적 + 임시파일 정리 + 보관정책(docx 90일 / json 30일 / 로그 14일).

---

## 디렉토리 구조

```
ibk-FSS-brief/
├── .github/workflows/daily-brief.yml   ← 메인 클라우드 워크플로우 (수집~알림 단일 Job)
├── .github/workflows/diag-fss-access.yml ← FSS 해외 IP 접근 진단(1회성, 차단 없음 확인)
├── cloud-trigger/                      ← Cloudflare Workers Cron (08:00 KST 트리거) + 배포 README
├── fss_crawler.js                      ← STEP 1 수집기 (FSS 2소스 + seen_ids dedup)
├── analyst.js                          ← STEP 2 LLM 분석 (Tier기반 벤치마킹)
├── briefV2.js                          ← STEP 3 보고서 + tgMsg
├── validator.js                        ← STEP 4 검증
├── archivist.js                        ← STEP 5 아카이브
├── notify_telegram.js                  ← Telegram 알림 (시작·완료·오류)
├── runslot.js                          ← 런슬롯(am/pm) 폴더·파일명 규약
├── agents/analyst_system_prompt.md     ← 분석 시스템 프롬프트
├── docs/SKILL.md                       ← 보고서 레이아웃 정본 (변경 금지)
├── knowledge/fss_tier_methodology.md   ← 기관 계층(T0~T3)×위험도 표준 방법론 (정본)
├── knowledge/tone-guide.md             ← 라이팅 원칙 정본 (해요체 8원칙, analyst 주입)
├── knowledge/ibk_org_chart.md · ibk-dept-mapping.md · ibk_mapping_rules.md · ibk_action_rules.md ← 조직/부서 매핑 (analyst 주입)
├── workflow.md                         ← 이 파일 (현행 요약)
├── docs/workflow.md                    ← 단계별 상세 워크플로우
├── state/seen_ids.json                 ← 중복방지 ledger (영구, repo가 유일한 상태 저장소)
├── reports/{DATE}/{SLOT}/              ← SLOT ∈ {am, pm} · 런별 분리 보존
│   ├── {DATE}_{morning|afternoon}_brief.docx ← 최종 보고서 (90일)
│   ├── crawl_result.json               ← 수집+분석 데이터 (30일)
│   ├── run_meta.json / validation_result.json / (실패 시)failure_meta.json
├── logs/run_manifest.jsonl             ← 전체 실행 이력 (누적)
```

---

## 에러 핸들링 매트릭스

| 실패 지점 | 감지 | 대응 |
|---|---|---|
| 수집 실패 | failure_meta.json 존재 | 최대 3회 재시도 → 실패 시 중단(성공본 비파괴) → Telegram 오류 알림 |
| Analyst API 오류 | exitCode=1 | fallback(키워드) 모드로 계속 |
| Analyst 치명 오류 | exitCode=2 | 파이프라인 중단 → 오류 알림 |
| 검증 오류 | exitCode=2 | status=warn으로 계속 → archivist 기록 |
| API 키 미설정/크레딧 부족 | Anthropic 오류 | fallback 모드(exitCode=1) — 크레딧 충전 필요 |

---

## 실행 / 운영

**트리거 (자동):** Cloudflare Workers Cron → GitHub `workflow_dispatch` (매일 08:00 KST)

**수동 실행:**
```bash
gh workflow run "IBK FSS Sanction Brief" --ref main
# 또는 GitHub → Actions → IBK FSS Sanction Brief → Run workflow
```

**GitHub Secrets (3개):** `ANTHROPIC_API_KEY · TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID`
**Cloudflare Worker secret:** `GH_PAT` (workflow_dispatch 호출용, wrangler secret)

---

_last updated: 2026-07-02 (FSS 도메인·현행 구현 기준 전면 갱신)_
