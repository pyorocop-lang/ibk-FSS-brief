// IBK FSS Sanction Brief — 신뢰성 있는 08:00 KST 클라우드 트리거
// Cloudflare Workers Cron Trigger → GitHub workflow_dispatch 호출
// (GitHub 자체 schedule cron은 지연·누락이 잦아 대체)
//
// 배포: cloud-trigger/README.md 참고
//   - wrangler secret put GH_PAT   (fine-grained PAT, Actions: Read and write)

const OWNER = "pyorocop-lang";
const REPO = "ibk-FSS-brief";
const WORKFLOW = "daily-brief.yml";

// Diagnostic endpoint for egress checks. Keep this allowlisted so the Worker
// cannot become an open proxy.
const DIAG_ALLOW = ["www.fss.or.kr"];

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

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/diag") {
      return new Response(
        "ibk-fss-brief-trigger - use /diag?url=https://www.fss.or.kr/fss/job/openInfo/list.do?menuNo=200476",
        { status: 200 },
      );
    }

    const colo = (request.cf && request.cf.colo) || "?";
    let target;
    try {
      target = new URL(url.searchParams.get("url"));
    } catch (error) {
      return Response.json({ error: "bad url", colo }, { status: 400 });
    }

    if (!DIAG_ALLOW.includes(target.hostname)) {
      return Response.json({ error: "host not allowed", allow: DIAG_ALLOW, colo }, { status: 403 });
    }

    const start = Date.now();
    try {
      const response = await fetch(target.href, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept-Encoding": "identity",
        },
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      const body = await response.arrayBuffer();
      return Response.json({
        ok: true,
        status: response.status,
        ms: Date.now() - start,
        bytes: body.byteLength,
        colo,
      });
    } catch (error) {
      return Response.json(
        { ok: false, ms: Date.now() - start, err: String(error), colo },
        { status: 502 },
      );
    }
  },
};
