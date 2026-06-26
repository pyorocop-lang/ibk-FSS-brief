// IBK FSS Sanction Brief — 신뢰성 있는 08:00 KST 클라우드 트리거
// Cloudflare Workers Cron Trigger → GitHub workflow_dispatch 호출
// (GitHub 자체 schedule cron은 지연·누락이 잦아 대체)
//
// 배포: cloud-trigger/README.md 참고
//   - wrangler secret put GH_PAT   (fine-grained PAT, Actions: Read and write)

const OWNER = "pyorocop-lang";
const REPO = "ibk-FSS-brief";
const WORKFLOW = "daily-brief.yml";

export default {
  async scheduled(event, env, ctx) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GH_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ibk-fss-brief-cron",
      },
      body: JSON.stringify({ ref: "main" }),
    });
    if (res.status !== 204) {
      const body = await res.text();
      console.error(`dispatch 실패 status=${res.status} body=${body}`);
    } else {
      console.log("workflow_dispatch 발화 성공");
    }
  },
};
