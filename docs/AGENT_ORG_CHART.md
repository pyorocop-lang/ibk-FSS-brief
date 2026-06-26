# 에이전트 조직도

> 단일 GitHub Actions Job을 구성하는 6개 클라우드 에이전트의 역할, 위계, 데이터 인계 관계
> (완전 클라우드 — 로컬 PC 불필요)

---

## 에이전트 계층도

```mermaid
flowchart TD
    subgraph TRIGGER["⏰ 외부 트리거 레이어"]
        TRG1["☁️ Cloudflare Workers Cron\n(cloud-trigger/)\n평일 07:30 KST\n→ GitHub workflow_dispatch"]
    end

    subgraph ORCHESTRATOR["🎼 오케스트레이터 레이어"]
        ORC1["📋 daily-brief.yml\nGitHub Actions 단일 Job\n(크롤~알림 전부 클라우드 실행)"]
    end

    subgraph AGENTS["🤖 에이전트 레이어 (실행 순서)"]
        A0["⚙️ 시작 알림\nnotify_telegram.js --msg\n──────────────\n출력: Telegram 시작 알림"]
        A1["① 수집 에이전트\nfsc_crawler.js\n──────────────\n입력: FSC 웹사이트\n출력: crawl_result.json\n       pdfs/"]
        A2["② 분석 에이전트\nanalyst.js\n──────────────\n입력: crawl_result.json\n출력: graded[] 갱신\n       tgMsg"]
        A3["③ 보고서 에이전트\nbriefV2.js\n──────────────\n입력: crawl_result.json (갱신)\n출력: YYYYMMDD_morning_brief.docx\n       tgMsg"]
        A4["④ 검증 에이전트\nvalidator.js\n──────────────\n입력: crawl_result.json\n출력: validation_result.json"]
        A5["⑤ 아카이브 에이전트\narchivist.js\n──────────────\n입력: 전체 산출물\n출력: run_meta.json\n       run_manifest.jsonl"]
        A6["⑥ 알림 에이전트\nnotify_telegram.js\n──────────────\n입력: crawl_result.json (tgMsg)\n출력: Telegram 완료/오류 알림"]
    end

    subgraph KNOWLEDGE["📚 지식 베이스 레이어"]
        K1["analyst_system_prompt.md\nLLM 글쓰기 원칙"]
        K2["ibk-dept-mapping.md\nIBK 부서 매핑"]
        K3["ibk_org_chart.md\nIBK 조직도"]
        K4["ibk_mapping_rules.md\n법령-내규 매핑"]
        K5["ibk-keywords.md\nTier1·Tier2 키워드"]
        K6["tone-guide.md\n라이팅 8원칙"]
    end

    subgraph EXTERNAL["🌐 외부 서비스"]
        EXT1["Claude API\nHaiku 4.5"]
        EXT2["FSC 웹사이트\nfsc.go.kr"]
        EXT3["Telegram API\n(brief_bot / @briefcoworkbot)"]
    end

    TRG1 -->|"workflow_dispatch"| ORC1

    ORC1 -->|"STEP 0"| A0
    ORC1 -->|"STEP 1 (클라우드 직접 크롤)"| A1
    ORC1 -->|"STEP 2"| A2
    ORC1 -->|"STEP 3"| A3
    ORC1 -->|"STEP 4"| A4
    ORC1 -->|"STEP 5 (--status ok|error)"| A5
    ORC1 -->|"STEP 7 / ERR"| A6

    A1 -->|"crawl_result.json"| A2
    A2 -->|"crawl_result.json 갱신"| A3
    A2 -->|"crawl_result.json"| A4
    A3 -->|"DOCX + tgMsg"| A5
    A4 -->|"validation_result.json"| A5
    A3 -->|"tgMsg"| A6

    K1 -->|"System Prompt"| A2
    K2 -->|"부서 배정"| A2
    K3 -->|"조직도"| A2
    K4 -->|"법령 매핑"| A2
    K5 -->|"점수 산정"| A1
    K6 -->|"글쓰기 원칙"| A2

    A1 <-->|"HTML·PDF 수집"| EXT2
    A2 <-->|"LLM 추론"| EXT1
    A0 -->|"시작 알림"| EXT3
    A6 -->|"완료/오류 알림"| EXT3

    classDef trigger fill:#FFE0B2,stroke:#E65100,color:#3E2723
    classDef orch fill:#FFF9C4,stroke:#F57F17,color:#333
    classDef agent fill:#E8EAF6,stroke:#3949AB,color:#1A237E
    classDef knowledge fill:#F1F8E9,stroke:#558B2F,color:#1B5E20
    classDef external fill:#FCE4EC,stroke:#C62828,color:#880E4F

    class TRG1 trigger
    class ORC1 orch
    class A0,A1,A2,A3,A4,A5,A6 agent
    class K1,K2,K3,K4,K5,K6 knowledge
    class EXT1,EXT2,EXT3 external
```

---

## 실행 트리거 (완전 클라우드)

| 항목 | 내용 |
|---|---|
| 정시 트리거 | 외부 Cloudflare Workers Cron (`cloud-trigger/`) — 평일 07:30 KST |
| 트리거 방식 | GitHub `workflow_dispatch` 호출 |
| 백업 | GitHub schedule cron (지연·누락 잦음 → 백업용, `'30 22 * * 0-4'`) |
| 수동 | `gh workflow run "IBK Morning Brief" --ref main` |
| 워크플로우 | `.github/workflows/daily-brief.yml` (단일 Job) |

> FSC가 해외 IP를 차단하지 않음이 검증되어(미국 러너에서 크롤 정상) 크롤까지 클라우드에서 실행한다.
> 과거의 로컬 `telegram_listener.js`·`trigger_bot`(EXECUTE 릴레이)·공유 그룹·`run_pipeline.vbs`·카카오 알림은 모두 폐지(은퇴).

---

## 에이전트별 상세 명세

### ⓪ notify_telegram.js — 시작 알림 (STEP 0)

**위치:** GitHub Actions (ubuntu-latest)

| 항목 | 내용 |
|---|---|
| 런타임 | Node.js |
| 동작 | `--msg "⚙️ {DATE} 브리핑 생성 시작합니다."` |
| 출력 | Telegram 시작 알림 |

---

### ① fsc_crawler.js — 수집 에이전트 (STEP 1)

**위치:** GitHub Actions (ubuntu-latest) — 클라우드 직접 실행 (한국 IP 불필요)

| 항목 | 내용 |
|---|---|
| 런타임 | Node.js (CommonJS) |
| 입력 | FSC 입법예고 목록 페이지 (HTTP GET) |
| 출력 | `reports/DATE/crawl_result.json`, `reports/DATE/pdfs/*.pdf` |
| 실행 주체 | daily-brief.yml (워크플로우 직접 호출) |
| 재시도 | 최대 3회 재시도 |
| 실패 처리 | HTML 실패 → PDF fallback → 통합입법예고센터 fallback |

**핵심 알고리즘 — 점수 산정:**
```
score = Tier1 키워드 (+3) + Tier2 키워드 (+1) + D-14이내 (+2) + D-30이내 (+1)
등급: 상(score≥4 🔴) / 중(score≥2 🔶) / 하(score≥1 🔹) / 미해당(score=0, 제외)
```

---

### ② analyst.js — 분석 에이전트 (STEP 2)

**위치:** GitHub Actions (ubuntu-latest)

| 항목 | 내용 |
|---|---|
| 런타임 | Node.js (ES Module) |
| 모델 | claude-haiku-4-5-20251001 |
| 입력 | crawl_result.json (graded 배열) |
| 출력 | crawl_result.json 갱신 (what_changes, our_action, dept, tgMsg 등) |
| 처리 방식 | 순차 처리, 항목 간 300ms 지연 |
| 종료 코드 | 0=정상 / 1=fallback / 2=치명중단 |
| fallback | API 키 없거나 오류 시 키워드 기반 템플릿으로 대체 |

**LLM이 생성하는 필드:**

| 필드 | 제약 |
|---|---|
| `what_changes[]` | 35자 이하, 최대 2개, "~바뀌어요" 형태 |
| `our_action[]` | 60자 이하, 최대 3개, "[부서명] 담당자라면 ~" 형태 |
| `ctrl_insight` | 40자 이하, 부서명 + 구체 업무 포함 |
| `dept` | IBK 공식 조직도 부서명 1개 |
| `tg_key` | 18자 이하, 법령 약칭 |
| `term` | 신입 담당자 대상 용어 해설 1개 |

---

### ③ briefV2.js — 보고서 에이전트 (STEP 3)

**위치:** GitHub Actions (ubuntu-latest)

| 항목 | 내용 |
|---|---|
| 런타임 | Node.js (ES Module, docx 라이브러리) |
| 입력 | crawl_result.json (analyst 갱신 후) |
| 출력 | `reports/DATE/DATE_morning_brief.docx` + crawl_result.json 에 `tgMsg` 기록 |
| 레이아웃 기준 | docs/SKILL.md v2.3 실측값 (수치 변경 금지) |

**5개 고정 섹션:**

| 섹션 | 내용 |
|---|---|
| ❶ 오늘의 요약 | 전체 건수, 등급별 분류 |
| ❷ 법령 브리핑 | 등급순 정렬, 🔴 항목은 풀 구조 |
| ❸ 체크 포인트 | D-14 이내 마감 항목 |
| ❹ 마감 캘린더 | 향후 30일 의견 제출 마감 |
| ❺ 규제 용어 | 신입 담당자용 용어 1개 해설 |

---

### ④ validator.js — 검증 에이전트 (STEP 4)

**위치:** GitHub Actions (ubuntu-latest)

| 항목 | 내용 |
|---|---|
| 런타임 | Node.js (ES Module) |
| 입력 | crawl_result.json |
| 출력 | `reports/DATE/validation_result.json` |
| 종료 코드 | 0=통과 / 1=경고(계속) / 2=오류 |

**10개 검증 항목:**

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

---

### ⑤ archivist.js — 아카이브 에이전트 (STEP 5)

**위치:** GitHub Actions (ubuntu-latest), `--status {ok|error}`

| 항목 | 내용 |
|---|---|
| 런타임 | Node.js (ES Module) |
| 입력 | 전체 산출물 (DOCX, JSON, 로그) |
| 출력 | run_meta.json, run_manifest.jsonl 누적 |
| 보관 정책 | DOCX 90일 / JSON 30일 / 로그 14일 |

---

### ⑥ notify_telegram.js — 알림 에이전트 (STEP 7 / ERR)

**위치:** GitHub Actions (ubuntu-latest)

| 항목 | 내용 |
|---|---|
| 런타임 | Node.js |
| 메신저 | Telegram (봇 1개 — brief_bot / @briefcoworkbot) |
| 완료 알림 | `--from-crawl-result` — crawl_result.json 의 `tgMsg` 발송 |
| 오류 알림 | 워크플로우 `if: failure()` → `--msg "❌ 브리핑 오류 발생 ({DATE})..."` |
| 출력 | Telegram 완료/오류 알림 |

---

## 에이전트 간 데이터 인계 요약

```mermaid
flowchart LR
    TRG["☁️ Cloudflare Worker Cron"] -->|"workflow_dispatch"| A1["① fsc_crawler.js"]
    A1 -->|"crawl_result.json\n{date, graded[], totalFetched}"| A2["② analyst.js"]
    A2 -->|"crawl_result.json 갱신\n{graded[].what_changes\n graded[].our_action\n graded[].dept}"| A3["③ briefV2.js"]
    A2 -->|"동일 파일"| A4["④ validator.js"]
    A3 -->|"DOCX + tgMsg 기록"| A5["⑤ archivist.js"]
    A4 -->|"validation_result.json"| A5
    A3 -->|"tgMsg"| A6["⑥ notify_telegram.js"]
    A5 -->|"GitHub Artifact\n(DOCX + PDF, 90일)"| END["📦 배포 완료"]
    A6 -->|"Telegram 완료 알림"| END
```

---

_last updated: 2026-06-26_
