# 반기 조직개편 반영 플레이북

## 목적

IBK기업은행의 1월·7월 조직개편을 코드·프롬프트·knowledge·과거 분석 산출물에 일관되게 반영한다. 실행 코드가 Markdown 서식이나 임의 추정에 의존하지 않도록 버전별 JSON 조직 정본을 단일 입력으로 사용한다.

## 단일 정본

| 경로 | 역할 | 직접 수정 |
|---|---|---|
| `knowledge/org/versions/{YYYY-Hn}.json` | 시행일·출처 해시·안정 ID·계층을 보존한 반기 조직 정본 | 검토 후 가능 |
| `knowledge/org/active.json` | 현재 활성 버전 포인터 | 시행 승인 시만 가능 |
| `knowledge/org/changes/{YYYY-Hn}.json` | 신설·명칭변경·이동·폐지 변경명세 | 검토 후 가능 |
| `knowledge/org/duty_mappings.json` | 직제변경과 분리된 업무승계 증거 | 확인 근거가 있을 때만 가능 |
| `knowledge/generated/ibk_current_org_registry.md` | 사람이 읽는 현행 조직표 | 금지(자동 생성) |

조직명은 표시값이며 시스템 식별자는 변경되지 않는 `org_id`다. 신규 분석 결과에는 `org_version`, `dept_id`, `dept`와 협조부서 ID를 함께 기록한다.

각 버전은 `expected_unit_count`와 `expected_assignable_count`를 선언한다. 조직 신설·폐지 시 JSON의 조직계층과 이 두 수치를 함께 변경하며 코드 상수는 수정하지 않는다. 책임자처럼 개인 역할인 노드는 현행 조직으로 보존하되 `assignable: false`로 두고 실제 업무부서로 배정한다.

## 증거등급

- `official`: 직제규정·직제도·개정 전후 대비표 또는 업무분장규정
- `user_confirmed`: 권한 있는 내부 확인
- `press_inferred`: 언론기사 기반 추정
- `pending`: 확인자료 대기
- `rejected`: 승계관계가 아닌 것으로 확인

자동 부서 배정에는 `official`, `user_confirmed`만 사용할 수 있다. `press_inferred`, `pending`은 후보로만 보존하며 `confirmed`로 저장하면 CI가 실패한다.

## 반기 일정

| 시점 | 처리 |
|---|---|
| D-30 | 직제규정·직제도·대비표·업무분장 자료 요청 |
| D-20 | 새 버전 JSON과 변경명세 초안 작성, 출처 SHA-256 등록 |
| D-15 | 승계 불명확 건을 `pending`으로 분리 |
| D-10 | 자동 생성·전역 감사 결과를 포함한 Draft PR 생성 |
| D-5 | 현업 확인자와 개발 검토자의 독립 교차검증 |
| D-1 | 새 버전을 `scheduled`로 승인하되 활성 포인터는 유지 |
| D-Day | `active.json` 전환, CI 통과 후 병합 |
| D+1 | 실제 fallback·LLM·validator 연계 결과 확인 |
| D+7 | 업무분장 후속자료와 보류 건 정리 |

## 표준 명령

```bash
npm run org:validate
npm run org:scaffold -- --version 2027-H1 --effective 2027-01-01
npm run org:generate
npm run org:generate:check
npm run org:audit
npm test
```

1. `org:scaffold`로 현재 계층을 복제한 다음 새 버전·변경명세·업무매핑을 작성한다. 복제본의 출처는 비워지므로 새 공식자료를 등록하기 전에는 활성화할 수 없다.
2. 조직을 신설·폐지했다면 버전 JSON의 `expected_unit_count`·`expected_assignable_count`를 실제 구조와 맞춘다.
3. `org:validate`로 ID·명칭·계층·시행일·출처·증거등급을 검증한다.
4. `org:generate`로 사람이 읽는 레지스트리를 갱신한다.
5. `org:audit`로 런타임 코드·workflow·프롬프트와 과거 분석 배정·생성서술의 비현행명을 탐지한다.
6. 테스트와 GitHub Actions가 모두 통과해야 병합한다.

## 실패 원칙

- 활성 버전 파일이 없거나 생성물이 정본과 다르면 일일 브리핑 PRECHECK에서 중단한다.
- 현재 조직에 없는 `dept`·`related_depts`는 Analyst와 Validator가 거부한다.
- 폐지부서 문자열의 원문 인용·변경이력·변경명세는 보존하지만 실행 필드에는 허용하지 않는다.
- 승계가 불명확하면 임의 부서를 선택하지 않고 `pending`으로 남긴다.
- 과거 보고서는 당시 표시명 증적을 보존하고, 정정이 필요한 생성 필드에는 `legacy_dept` 또는 별도 마이그레이션 기록을 둔다.

## PR 필수 증적

- 기준자료 파일명·SHA-256
- 공식 변경과 업무승계의 분리표
- 활성 조직 수와 변경 전후 차이
- `org:validate`, `org:generate:check`, `org:audit`, `npm test` 결과
- 보류·추정·승계 없음 목록
- 시행일과 롤백할 이전 `active.json` 버전
