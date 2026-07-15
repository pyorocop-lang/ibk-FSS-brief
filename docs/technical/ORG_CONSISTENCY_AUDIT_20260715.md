# 조직정보 전역 정합성 점검 — 2026-07-15

> 조직 정본: `knowledge/ibk_org_chart.md`
> 업무 매핑 정본: `knowledge/ibk-dept-mapping.md`, `knowledge/ibk_mapping_rules.md`
> 점검 범위: 기존 추적파일 108개 전체(코드·프롬프트·문서·설정·테스트·과거 JSON 산출물)

## 결론

현행 조직 정본에서 자동배정 가능한 조직명 93개를 추출해 코드와 과거 분석 필드를 대조했다. 실행 경로의 상충 3종과 과거 생성 결과의 비현행 부서명 2종을 정정했으며, 새 회귀 테스트와 런타임 검증으로 재발을 차단했다.

## 확인·조치 결과

| 구분 | 발견사항 | 조치 |
|---|---|---|
| 분석 fallback | `데이터혁신부`, `WM사업부` 출력 | `AX데이터혁신부`, `자산관리사업부`로 교체하고 확인 매핑 8건 반영 |
| 분석 프롬프트 | 현행 `경영전략부`를 금지명칭으로 오기 | 금지목록에서 제거하고 현행 공식 부서임을 명시 |
| 검증기 | 부서명 검증을 문서에만 쓰고 실제 정본 대조는 미구현 | `dept`, `related_depts`를 93개 현행 조직명과 대조하는 B5 검증 추가 |
| LLM 결과 | 비현행 부서명을 반환해도 저장 가능 | 분석 병합 단계에서 거부해 fallback으로 전환 |
| 과거 산출물 | 2026-07-03 분석값에 `생명보험사업부`, `보험상품사업부` 생성 | `자산관리사업부`로 정정하고 원래 값은 `legacy_dept`에 보존 |

## 변경하지 않은 기록

금감원 원문을 보존한 `bodyText`에는 타 금융기관의 `재무회계부` 등 부서명이 포함될 수 있다. 이는 IBK 부서 배정값이 아니라 원문 증적이므로 수정하지 않았다. 조직 정합성 검증 대상은 생성 필드인 `dept`, `related_depts`, `our_action`, `ctrl_insight`, `tgMsg`다.

## 자동 검증

- `org_registry.js`: 조직 정본의 현행 구간만 읽어 부서명 집합 생성
- `analyst.js`: LLM·fallback 결과 저장 전 현행 조직명 확인
- `validator.js` B5: 보고서 데이터의 주담당·협조부서 재검증
- `test/org_consistency.test.js`: 확인 매핑 8건, 폐지부서 제외, 프롬프트 상충, 비현행 부서 차단 회귀검증

## 검증 명령

```text
node --check analyst.js
node --check validator.js
node --check org_registry.js
npm test
git diff --check
```

검증 결과: Node 문법검사 통과, 단위테스트 14/14 통과, Markdown·JSON 파싱 및 공백 오류 검사 통과.
