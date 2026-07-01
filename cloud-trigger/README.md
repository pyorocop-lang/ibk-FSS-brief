# cloud-trigger — 신뢰성 있는 08:00 KST 트리거 (Cloudflare Workers Cron)

GitHub 자체 `schedule` cron은 ~11시간 지연·누락이 확인됨(2026-06).
그래서 정시 발화를 **Cloudflare Workers Cron**이 담당하고, GitHub 워크플로우는
`workflow_dispatch`로만 깨운다. 완전 클라우드 — 로컬 PC 불필요.

```
[Cloudflare Workers Cron 08:00 KST 평일] --POST workflow_dispatch--> [GitHub Actions: 수집+dedup→분석→보고서→검증→알림]
```

## 배포 절차 (최초 1회)

### 1. GitHub Fine-grained PAT 발급
- GitHub → Settings → Developer settings → Fine-grained tokens → Generate
- Repository access: **ibk-FSS-brief** 만 선택
- Permissions → **Actions: Read and write** (workflow_dispatch 호출에 필요)
- 토큰 복사 (한 번만 보임)

### 2. Cloudflare Workers 배포
```bash
cd cloud-trigger
npm install -g wrangler        # 또는 npx wrangler
wrangler login                 # Cloudflare 계정 로그인(무료 플랜 가능)
wrangler secret put GH_PAT     # ← 1번 PAT 붙여넣기 (코드/깃에 저장 안 됨)
wrangler deploy
```
> Cron 스케줄(`0 23 * * 0-4` = 08:00 KST 평일)은 wrangler 쓰기가 막혀 있어
> Cloudflare 대시보드 → Workers → Triggers 에서 직접 추가/확인한다.

### 3. 검증
```bash
# 즉시 트리거 테스트 (cron 안 기다리고):
wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+23+*+*+0-4"
# → GitHub Actions에 'IBK FSS Sanction Brief' 런이 떠야 함
```

## /diag — egress 점검 엔드포인트 (선택)
Worker 배포 후 `https://<worker>/diag?url=https://www.fss.or.kr/fss/job/openInfo/list.do?menuNo=200476`
로 Cloudflare 엣지에서의 FSS 접근 상태(status·ms·bytes·colo)를 확인한다.
오픈 프록시화 방지를 위해 대상 host는 allowlist(`www.fss.or.kr`)로 제한된다.

## 동작 확인
- Cloudflare 대시보드 → Workers → **ibk-fss-brief-trigger** → Logs 에서 "발화 성공" 확인
- 실패 시 GH_PAT 권한(Actions: write)·만료 확인

## 비고
- 비용: Cloudflare Workers 무료 플랜으로 충분 (cron 1일 1회, 평일).
- 워크플로우 `concurrency: fss-brief`로 중복 발화 직렬화.
