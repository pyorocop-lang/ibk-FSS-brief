# cloud-trigger — 신뢰성 있는 07:30 KST 트리거 (Cloudflare Workers Cron)

GitHub 자체 `schedule` cron은 이 레포에서 ~11시간 지연·누락이 확인됨(2026-06).
그래서 정시 발화를 **Cloudflare Workers Cron**이 담당하고, GitHub 워크플로우는
`workflow_dispatch`로만 깨운다. 완전 클라우드 — 로컬 PC 불필요.

```
[Cloudflare Workers Cron 07:30 KST] --POST workflow_dispatch--> [GitHub Actions: 크롤→분석→보고서→알림]
```

## 배포 절차 (최초 1회)

### 1. GitHub Fine-grained PAT 발급
- GitHub → Settings → Developer settings → Fine-grained tokens → Generate
- Repository access: **Daily-Morning-brief** 만 선택
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

### 3. 검증
```bash
# 즉시 트리거 테스트 (cron 안 기다리고):
wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=30+22+*+*+0-4"
# → GitHub Actions에 'IBK Morning Brief' 런이 떠야 함
```

## 동작 확인
- Cloudflare 대시보드 → Workers → ibk-brief-trigger → Logs 에서 "발화 성공" 확인
- 실패 시 GH_PAT 권한(Actions: write)·만료 확인

## 비고
- 비용: Cloudflare Workers 무료 플랜으로 충분 (cron 1일 1회).
- 백업: GitHub `schedule` cron(`30 22 * * 0-4`)도 워크플로우에 남겨둠(best-effort).
  둘 다 같은 날 발화하면 워크플로우의 `concurrency: morning-brief`가 직렬화함.
