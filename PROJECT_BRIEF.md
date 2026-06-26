# IBK FSS 제재 브리핑 — 프로젝트 기획안 (v0.1, 기획 단계)

> 작성일 2026-06-26 · 상태: **기획 확정 전** · 코드 미구현
> 자매 프로젝트: [Daily-Morning-brief](https://github.com/pyorocop-lang/Daily-Morning-brief) (FSC 입법예고 브리핑) — 아키텍처 원본

---

## 1. 목적 (한 줄)

금융감독원(FSS)이 **제재공시·경영유의사항**을 게시하면, 신규 건을 자동 수집하고 Claude LLM이 **IBK기업은행 업무와의 연관성**을 분석해 **Telegram 알림 + DOCX 보고서**를 생성하는 완전 클라우드 멀티에이전트 파이프라인.

---

## 2. 데이터 소스 (2종)

| 소스 | URL | 내용 |
|---|---|---|
| 제재공시 | https://www.fss.or.kr/fss/job/openInfo/list.do?menuNo=200476 | 금융회사·임직원 제재내역 (과징금·기관경고·영업정지 등) |
| 경영유의·개선사항 | https://www.fss.or.kr/fss/job/openInfoImpr/list.do?menuNo=200483 | 검사 결과 경영유의/개선 요구사항 |

---

## 3. FSC 프로젝트와의 핵심 차이 (★ 설계의 출발점)

| 구분 | FSC 입법예고 (기존) | **FSS 제재 (신규)** |
|---|---|---|
| 성격 | **예방** — 향후 규제 변화 | **사후** — 실제 위반·제재 사례 |
| LLM 분석 관점 | "법령 변경에 어떻게 대응할까" | **"이 제재사례에서 IBK도 같은 통제 미비점이 있나" (벤치마킹 자가점검)** |
| 핵심 가치 | 마감(D-day) 내 의견 제출·내규 반영 | 타행 제재 → IBK 동일 리스크 선제 점검 / IBK 직접 제재 → 즉시 대응 |
| 발행 주기 | 입법예고일 기준 명확 | **부정기적 — 매일 신규가 없을 수 있음** |
| 신규 판별 | 날짜 기반 | **누적 목록 ↔ 기수집 ID 비교(dedup) 필요** |
| 마감 캘린더(❹) | 있음 | 없음 → **제재 심도/유형 기반 중요도로 대체** |

> 결론: 크롤·dedup·분석 프롬프트·중요도 로직은 **신규 설계**, 보고서/검증/아카이브/알림 골격은 **FSC에서 재사용**.

---

## 4. 아키텍처 (FSC 미러 — 완전 클라우드)

```
Cloudflare Workers Cron (평일 08:00 KST*)
  → GitHub workflow_dispatch
  → 단일 GitHub Actions Job (ubuntu-latest):
      STEP0  시작 알림            notify_telegram.js
      STEP1  크롤(2소스)+신규추출  fss_crawler.js      → reports/{DATE}/fss_result.json
      STEP2  분석(Claude)         analyst.js          (제재유형 분류·IBK연관·부서·재발방지액션·tgMsg)
      STEP3  보고서(docx)         briefV2.js
      STEP4  검증                 validator.js
      STEP5  아카이브+ledger갱신   archivist.js        → state/seen_ids.json
      STEP6  감사 커밋·push        fss_result·run_meta·manifest·seen_ids
      STEP7  Artifact 업로드 + 완료 알림
```
\* 08:00 권장 이유: 기존 FSC 브리핑(07:30)과 알림·실행 충돌 회피. → §7 결정항목 (B)

**신규 제재 0건일 때:** "오늘 신규 제재 없음" 1줄 조용한 알림(또는 무알림). 오인 보고 금지.

---

## 5. 중복방지 ledger (★ 신규 핵심 모듈)

FSS 목록은 과거 건이 누적 노출되므로 날짜만으로 신규를 못 가린다.

- `state/seen_ids.json` 에 이미 보고한 제재건의 고유키(상세 URL/일련번호/제목해시) 저장
- 매 실행: 전체 목록 수집 → ledger에 없는 것만 **신규**로 분석·알림
- ledger는 git 커밋(감사추적 + 상태 지속성). 클라우드 실행이라 로컬 상태에 의존 불가 → repo가 유일한 상태 저장소

---

## 6. 중요도 판정 (FSS 버전 초안)

| 신호 | 가중 |
|---|---|
| 제재대상이 은행/유사 업권(시중·국책·중소금융) | + |
| 사유가 IBK 핵심업무: 여신·자금세탁(AML)·내부통제·불완전판매·전자금융·정보보호 | + |
| 제재 강도: 과징금 규모 / 기관경고 / 영업정지 | + |
| **IBK 직접 제재·언급** | 최상 🔴 |

→ 상(🔴) 즉시검토 / 중(🔶) 관심 / 하(🔹) 참고 — FSC와 동일한 3단계 표기 유지.

---

## 7. 확정 필요 결정사항 (새 창에서 합의 후 진행)

| # | 항목 | 권장안 | 비고 |
|---|---|---|---|
| **A** | Telegram 봇 | **신규 봇 분리** | 제재 알림이 FSC 법령 알림과 섞이지 않음. 간편 우선 시 기존 brief_bot 재사용도 가능 |
| **B** | 실행 시각 | **평일 08:00 KST** | 07:30 FSC와 충돌 회피 |
| **C** | FSS 해외 IP 차단 여부 | **최초 1회 클라우드 진단 필수** | FSC 때 교훈 — 미국 러너에서 크롤 가능한지 먼저 검증. 차단 시 OpenAPI/프록시 검토 |
| **D** | OpenAPI 우선 검토 | data.go.kr 금감원 제재 API 존재 시 **크롤보다 우선** | HTML 크롤보다 안정적 |

> A·B는 §10 Secrets·Cron에 반영. C·D는 **1단계 착수 작업**(아래 §9).

---

## 8. 재사용 vs 신규 작성 (FSC 자산 기준)

| 자산 | 처리 |
|---|---|
| `knowledge/` (조직도·부서매핑·키워드) | **복사** 후 제재 관점 키워드 보강 |
| `SKILL.md`(docx 레이아웃)·`tone-guide.md` | **복사** 후 섹션 명칭만 조정 |
| `briefV2.js`·`validator.js`·`archivist.js`·`notify_telegram.js` | **복사** + 경미한 조정 |
| `cloud-trigger/`(Cloudflare Worker) | **복사** + repo 타겟을 `ibk-FSS-brief`로 변경 |
| `.github/workflows/daily-brief.yml` | **복사** + STEP1 크롤러 교체, dedup 단계 추가 |
| `fss_crawler.js` | **신규** (FSS 사이트 구조 + 2소스 + dedup) |
| `analyst.js` 프롬프트 | **신규** (제재사례 벤치마킹 분석 관점) |
| `state/seen_ids.json` | **신규** (ledger) |

---

## 9. 단계별 실행 로드맵

- **1단계 — 타당성 검증 (착수 즉시)**: FSS OpenAPI 존재 확인(D) → 없으면 FSS 해외 IP 차단 1회 진단(C). 크롤 경로 확정.
- **2단계 — 골격 이식**: FSC에서 재사용 자산 복사, 워크플로우/cloud-trigger repo 타겟 변경.
- **3단계 — 신규 모듈**: `fss_crawler.js`(2소스+dedup), `analyst.js` 제재분석 프롬프트, `seen_ids.json` ledger.
- **4단계 — 통합·검증**: workflow_dispatch 수동 실행 → 신규/0건/IBK직접제재 3케이스 확인.
- **5단계 — 정시화**: Cloudflare Cron 08:00 KST, Secrets 등록, 운영 전환.

---

## 10. 운영 설정 (예정)

- **GitHub Secrets**: `ANTHROPIC_API_KEY` · `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` (봇 결정 A 후 확정)
- **Cloudflare Cron**: `0 23 * * 0-4` (= 08:00 KST, 결정 B 후 확정)
- **산출물**: `reports/{DATE}/{DATE}_fss_brief.docx`(90일) · `fss_result.json`(30일) · `state/seen_ids.json`(영구) · `logs/`

---

## 11. 리스크

| 리스크 | 대응 |
|---|---|
| FSS 해외 IP 차단 가능성(미검증) | 1단계 진단 필수. 차단 시 OpenAPI 우선, 그래도 안 되면 트리거 방식 재설계 |
| 제재 본문이 PDF·첨부 위주 | PDF 파싱(FSC의 pdf-parse 재사용) |
| 부정기 발행 → dedup 오류 시 중복/누락 알림 | ledger 키 설계 신중(상세 URL 우선), 감사 커밋으로 추적 |
| 제재사례 오분석(법적 민감) | 분석은 "점검 제안"형으로만, 단정 금지 (tone-guide 준수) |
