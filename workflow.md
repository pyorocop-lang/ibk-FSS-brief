# IBK AI 법령 모니터링 — 워크플로우

> 평일 오전 07:30 KST 자동 실행 (완전 클라우드 — 로컬 PC 불필요)
> 담당: 내부통제점검팀 / 관리: 내부통제총괄부 AI TF
> 크롤링 대상: **금융위원회** 입법예고·규정변경예고 (https://www.fsc.go.kr/po040301)

> 이 문서는 현행 클라우드 워크플로우의 **간결 요약**입니다.
> 단계별 상세·타임라인·오류 대응 절차는 **`docs/workflow.md`** 를 참조하세요.

---

## 아키텍처 한눈에 보기

- **완전 클라우드 자동화** — 크롤부터 알림까지 GitHub Actions에서 전부 실행. 로컬 스케줄러·로컬 listener 없음.
- **트리거:** 외부 **Cloudflare Workers Cron**(`cloud-trigger/`)이 평일 07:30 KST에 GitHub `workflow_dispatch` 호출.
  (과거 Windows 작업 스케줄러 → `run_pipeline.vbs` 방식은 폐지. GitHub 자체 schedule cron은 백업용으로만.)
- **파이프라인:** 단일 GitHub Actions Job — `.github/workflows/daily-brief.yml`.
- **메신저:** Telegram (봇 1개: brief_bot / `@briefcoworkbot`). 알림 메시지 필드명 `tgMsg`.
- **FSC 해외 IP 비차단 검증됨** — 미국 러너에서 크롤 정상 동작하므로 크롤까지 클라우드에서 실행 (최대 3회 재시도).

---

## 전체 파이프라인

```
[Trigger] 평일 07:30 KST
    Cloudflare Workers Cron → GitHub workflow_dispatch
    (수동: gh workflow run "IBK Morning Brief" --ref main)
    │
    ▼
[GitHub Actions 단일 Job — .github/workflows/daily-brief.yml]
    │
    ├─ STEP 0  notify_telegram.js  ─── 시작 알림 (Telegram)
    │             "⚙️ {DATE} 브리핑 생성 시작합니다."
    │
    ├─ STEP 1  fsc_crawler.js ──────── 금융위원회 입법예고 수집 (클라우드 직접, 최대 3회 재시도)
    │             출력: reports/{YYYYMMDD}/crawl_result.json
    │             exitCode 0=정상 / 비0=중단
    │
    ├─ STEP 2  analyst.js ──────────── Claude Haiku LLM 분석
    │             8원칙 적용 · IBK 부서 배정 · Telegram 메시지 생성
    │             출력: crawl_result.json 갱신 (graded[] + tgMsg)
    │             exitCode 0=정상 / 1=fallback(계속) / 2=치명(중단)
    │
    ├─ STEP 3  briefV2.js ──────────── Word 보고서 생성 (+ tgMsg 기록)
    │             출력: reports/{YYYYMMDD}/{YYYYMMDD}_morning_brief.docx
    │             exitCode 0=정상 / 비0=중단
    │
    ├─ STEP 4  validator.js ────────── 품질 검증 (8원칙 · 알림 형식 · 부서명)
    │             출력: reports/{YYYYMMDD}/validation_result.json
    │             exitCode 0=통과 / 1=경고(계속) / 2=오류→status=warn
    │
    ├─ STEP 5  archivist.js ────────── 로그 정리 + 감사 메타 기록 (항상 실행)
    │             출력: logs/{YYYYMMDD}/pipeline.log
    │                   reports/{YYYYMMDD}/run_meta.json
    │                   logs/run_manifest.jsonl (누적)
    │
    ├─ STEP 6  감사 커밋 ───────────── crawl_result.json · run_meta.json · run_manifest.jsonl
    │             git commit + push (audit trail)
    │
    └─ STEP 7  Artifact 업로드(docx+pdf, 90일) + 완료 알림
                  node notify_telegram.js --from-crawl-result
                  완료 기준: {YYYYMMDD}_morning_brief.docx + Artifact morning-brief-{DATE}

[STEP ERR] 오류 발생 시 (워크플로우 if: failure())
    node notify_telegram.js --msg "❌ 브리핑 오류 발생 ({DATE}) — GitHub Actions 로그 확인 필요"
```

---

## Telegram 알림 포맷 (출처: crawl_result.json의 tgMsg)

**IBK 영향 있을 때 (5줄 이내):**
```
🔔 내부통제 동향 알림 (HH:MM)
소관부처: 금융위원회 | 신규N건·IBK영향M건 🚨   ← 🚨는 '상' 있을 때만
🔴/🔶/🔹 {법령명약칭}: {핵심변경 20자}
📋 내부통제 인사이트: {최우선 실무액션 1건 — 40자, 제안형}
📅 D-N 마감: {법령명약칭}
```

**IBK 영향 없을 때:**
```
🔔 내부통제 동향 알림 (HH:MM)
소관부처: 금융위원회 | 신규N건 수집
✅ IBK 영향 없음 — 추가 조치 불필요
```

---

## 단계별 상세

### STEP 1 · fsc_crawler.js — 금융위원회 크롤러

- **URL:** `https://www.fsc.go.kr/po040301`
- **언어:** Node.js (https 모듈)
- **실행 위치:** GitHub Actions 러너(클라우드) — FSC 해외 IP 비차단 검증됨, 한국 IP 불필요
- **재시도:** 일시 실패 시 최대 3회 재시도
- **분류:** 입법예고 / 규정변경예고 자동 판별
- **점수 산정:** Tier1 키워드 +3 / Tier2 +1 / D-14이내 +2 / D-30이내 +1
- **등급:** 상(≥4) 🔴 / 중(≥2) 🔶 / 하(≥1) 🔹 / score=0 제외

**출력 스키마 (crawl_result.json):**
```json
{
  "date": "20260625",
  "ministry": "금융위원회",
  "totalFetched": 10,
  "total": 6,
  "graded": [
    {
      "id": "4147",
      "title": "전자금융거래법 시행령 일부개정령안",
      "grade": "중",
      "score": 3,
      "notice_date": "2026-06-10",
      "deadline": "2026-06-30",
      "enforce_date": "2026-07-01",
      "deadline_status": "D-11",
      "summary": "...",
      "keyMsg": "전자금융거래법 시행령",
      "what_changes": ["..."],
      "our_action": ["..."],
      "ctrl_insight": "...",
      "dept": "IT내부통제부",
      "tg_key": "전자금융거래법 시행령"
    }
  ],
  "tgMsg": "🔔 내부통제 동향 알림 ...",
  "analyzeMode": "llm"
}
```

**실패 처리:**
- HTML 파싱 실패 → PDF 첨부파일 추출 시도
- PDF 실패 → 통합입법예고센터 검색 시도
- 전체 실패 → summary 원본 유지, 계속 진행

---

### STEP 2 · analyst.js — Claude Haiku LLM 분석 에이전트

- **모델:** `claude-haiku-4-5-20251001`
- **API 키:** GitHub Secret `ANTHROPIC_API_KEY` (러너 환경변수)
- **처리 방식:** 순차 처리 (rate-limit 안전, 300ms 간격)

**LLM 생성 필드:**

| 필드 | 설명 | 길이 제한 |
|---|---|---|
| `what_changes` | 변경 내용 배열 ("~바뀌어요" 형태) | 항목당 30자 |
| `our_action` | 실무 액션 배열 ("[부서명] 담당자라면 ~해 보세요") | 항목당 60자 |
| `ctrl_insight` | IBK 중요성 1문장 | 40자 |
| `dept` | 주담당 부서명 (IBK 공식 조직도 기준) | — |
| `tg_key` | 법령 약칭 (Telegram 줄3용) | 18자 |

**부서 배정 기준 (ibk-dept-mapping.md 참조):**

| 법령 영역 | 배정 부서 |
|---|---|
| 여신·대출·LTV·DSR·보증 | 여신기획부 |
| 채권관리·추심·채무조정 | 여신관리부 |
| 자금세탁·KYC·CDD·AML | 자금세탁방지부 |
| 신용정보·개인정보·마이데이터 | 준법지원부 |
| 전자금융·IT보안·사이버 | IT내부통제부 |
| 내부통제·지배구조·준법감시 | 내부통제총괄부 |
| 금융복합기업집단·ESG | 전략기획부 |
| 금융소비자보호·불완전판매 | 금융소비자보호부 |
| 투자일임·펀드·신탁·WM | 자산관리사업부 |
| 카드 | 카드사업부 |
| 기타 | 내부통제총괄부 |

**❌ 금지 부서명 (IBK 미존재):**
`법무실, 법무팀, 개인정보보호팀, AML팀, IT운영부, 경영전략부, 소비자보호부, 준법감시팀`

**라이팅 톤 기준 (tone-guide.md):**
- 제안형: "[부서명] 담당자라면 ~꼭 확인해 보세요"
- 강요형 금지: "~해야 합니다", "~하세요" 지양
- 공감 우선: "이게 왜 중요한지"를 먼저 설명

**fallback 모드 (API 키 없거나 오류):**
- 키워드 기반 템플릿으로 필드 채움
- exitCode=1 반환 → 파이프라인 계속 진행

---

### STEP 3 · briefV2.js — Word 보고서 생성

- **언어:** Node.js (`docx` 라이브러리)
- **레이아웃:** SKILL.md v2.3 실측값 기준 (**수치 임의 변경 금지**)
- **입력:** `reports/{YYYYMMDD}/crawl_result.json`
- **출력:** `reports/{YYYYMMDD}/{YYYYMMDD}_morning_brief.docx` (+ crawl_result.json에 tgMsg 기록)

**디자인 상수 (변경 금지):**

| 항목 | 값 |
|---|---|
| 폰트 | 맑은 고딕 (전체) |
| 본문폭 | 9866 DXA |
| 여백 | top/bottom 850 · left/right 1020 DXA |
| ibkBlue | #0D2F8B |
| skyBlue | #1E88BC |
| red | #C0392B |
| lightBlue | #D0E4F5 |

**섹션 출력 규칙 (❶~❺ 항상 고정 출력):**

| 섹션 | 빈 경우 안내 문구 |
|---|---|
| ❶ 오늘의 요약 | — |
| ❷ 법령 브리핑 | "오늘은 IBK 관련 법령 브리핑이 없습니다." |
| ❸ 체크 포인트 | "오늘은 즉시 검토가 필요한 항목이 없습니다." |
| ❹ 마감 캘린더 | "향후 30일 이내 의견 제출 마감 건이 없습니다." |
| ❺ 규제 용어 | — |
| 마무리 | — |

---

### STEP 4 · validator.js — 품질 검증 에이전트

**검증 항목:**

| 코드 | 항목 | 기준 |
|---|---|---|
| A1 | what_changes 존재 | 1건 이상 |
| A2 | our_action 길이 | 60자 이하 |
| A3 | ctrl_insight 존재 | 비어있지 않음 |
| A4 | dept 정확성 | IBK 공식 부서명 |
| B1 | what_changes 최소 길이 | 15자 이상 |
| B2 | 하등급 our_action | 비어있어도 INFO |
| C1 | Telegram 글자 수 | 200자 이하 |
| C2 | Telegram 줄 수 | 5줄 이하 |
| C3 | Telegram 줄1 패턴 | 🔔 포함 |
| C4 | Telegram 줄2 패턴 | 소관부처 포함 |

**Telegram 메시지 출처:** `crawl_result.json`의 `tgMsg` (Analyst LLM 생성).

---

### STEP 5 · archivist.js — 감사 대응 아카이브 에이전트

**역할:**
1. `pipeline_run.log` → `logs/{YYYYMMDD}/pipeline.log` 이동 (감사 헤더 추가)
2. `reports/{YYYYMMDD}/run_meta.json` 생성
3. `logs/run_manifest.jsonl` 누적 기록
4. Word 임시 파일 (`~$*.docx`) 자동 삭제
5. 보관 정책 적용

**보관 정책:**

| 파일 유형 | 보관 기간 |
|---|---|
| 보고서 .docx | 90일 |
| 수집·분석 데이터 .json | 30일 |
| 로그 | 14일 |

---

## 디렉토리 구조

```
ibk-morning-brief/
├── .github/workflows/daily-brief.yml  ← 메인 클라우드 워크플로우 (크롤~알림 단일 Job)
├── cloud-trigger/                     ← Cloudflare Workers Cron (07:30 KST 트리거) + 배포 README
├── fsc_crawler.js                     ← STEP 1 크롤러
├── analyst.js                         ← STEP 2 LLM 분석
├── briefV2.js                         ← STEP 3 보고서 생성
├── validator.js                       ← STEP 4 검증
├── archivist.js                       ← STEP 5 아카이브
├── notify_telegram.js                 ← Telegram 알림 (시작·완료·오류)
├── SKILL.md                           ← 보고서 레이아웃 (변경 금지)
├── tone-guide.md                      ← 라이팅 원칙 (제안형 톤)
├── ibk-keywords.md                    ← 키워드 사전 (Tier1/Tier2)
├── ibk-dept-mapping.md                ← IBK 공식 부서 매핑 (2026.06.02)
├── workflow.md                        ← 이 파일 (현행 요약)
├── docs/workflow.md                   ← 단계별 상세 워크플로우
├── run_pipeline.vbs                   ← (레거시) 로컬 수동 실행용 — 운영은 클라우드 워크플로우 사용
├── reports/{YYYYMMDD}/
│   ├── {YYYYMMDD}_morning_brief.docx   ← 최종 보고서 (90일)
│   ├── crawl_result.json               ← 수집+분석 데이터 (30일)
│   ├── run_meta.json                   ← 실행 메타데이터 (30일)
│   └── validation_result.json          ← 검증 결과 (30일)
├── logs/{YYYYMMDD}/
│   └── pipeline.log                    ← 실행 로그 (14일)
├── logs/run_manifest.jsonl             ← 전체 실행 이력 (누적)
└── _deprecated/                        ← 구버전 스크립트 보관 (운영 불사용)
```

---

## 에러 핸들링 매트릭스

| 실패 지점 | 감지 방법 | 대응 |
|---|---|---|
| 크롤링 실패 | HTTP 오류 / exitCode≠0 | 최대 3회 재시도 → 실패 시 워크플로우 중단 → Telegram 오류 알림 |
| Analyst API 오류 | exitCode=1 | fallback 모드로 계속 진행 |
| Analyst 치명 오류 | exitCode=2 | 파이프라인 중단 → Telegram 오류 알림 |
| 보고서 생성 실패 | exitCode≠0 또는 .docx 미생성 | 파이프라인 중단 → Telegram 오류 알림 |
| 검증 오류 | exitCode=2 | status=warn으로 계속 → archivist 기록 |
| API 키 미설정 | ANTHROPIC_API_KEY 없음 | fallback 모드 (exitCode=1) |

---

## 실행 / 운영

**트리거 (자동):** Cloudflare Workers Cron → GitHub `workflow_dispatch` (평일 07:30 KST)

**수동 실행:**
```bash
gh workflow run "IBK Morning Brief" --ref main
# 또는 GitHub → Actions → IBK Morning Brief → Run workflow
```

**GitHub Secrets (5개):**
`ANTHROPIC_API_KEY · TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID · TRIGGER_BOT_TOKEN · TELEGRAM_GROUP_ID`

**로컬 개발용 클론:** `D:\projects\ibk-morning-brief` (개별 단계 수동 실행 등 개발·디버그용. 운영은 클라우드.)

> `run_pipeline.vbs`는 레거시 로컬 수동 실행용으로만 남아 있으며, 운영 진입점이 아닙니다.

---

_last updated: 2026-06-25 (완전 클라우드 아키텍처 반영)_
