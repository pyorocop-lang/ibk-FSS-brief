"use strict";
/**
 * notify_telegram.js — Telegram Bot 알림 에이전트
 *
 * Usage:
 *   node notify_telegram.js --msg "메시지"         직접 메시지 전송
 *   node notify_telegram.js --from-crawl-result    crawl_result.json의 kakaoMsg 전송
 *
 * Env (GitHub Secrets → 환경변수):
 *   TELEGRAM_BOT_TOKEN   BotFather에서 발급 (영구 유효)
 *   TELEGRAM_CHAT_ID     수신자 chat_id (봇과 대화 후 getUpdates로 확인)
 *   REPORT_DATE          YYYYMMDD (기본값: 오늘)
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");
const { reportDir } = require("./runslot");

// ── CLI 파싱 ──
const argv      = process.argv.slice(2);
const msgIdx    = argv.indexOf("--msg");
const directMsg = msgIdx >= 0 ? argv[msgIdx + 1] : null;
const fromCrawl = argv.includes("--from-crawl-result");
const deltaIdx   = argv.indexOf("--delta-since");
const deltaSince = deltaIdx >= 0 ? argv[deltaIdx + 1] : null;  // 오후 델타 기준(오전 crawl_result.json)

// ── 환경변수 ──
const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID    = process.env.TELEGRAM_CHAT_ID;
const REPORT_DATE = process.env.REPORT_DATE || getTodayKST();

function getTodayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, "");
}

// ── Telegram sendMessage ──
function sendMessage(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: CHAT_ID, text });
    const req = https.request({
      hostname: "api.telegram.org",
      path:     `/bot${BOT_TOKEN}/sendMessage`,
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (!json.ok) return reject(new Error(`Telegram 오류: ${JSON.stringify(json)}`));
          resolve(json);
        } catch (e) {
          reject(new Error(`응답 파싱 실패: ${data.slice(0, 100)}`));
        }
      });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Telegram timeout")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── 메인 ──
async function main() {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("[TELEGRAM] 환경변수 누락 — TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 확인");
    process.exit(1);
  }

  let message = directMsg;

  if (fromCrawl) {
    const crawlPath = path.join(reportDir(__dirname, REPORT_DATE), "crawl_result.json");  // reports/{date}/{slot}
    let data;
    try {
      data = JSON.parse(fs.readFileSync(crawlPath, "utf8"));
    } catch (e) {
      console.error(`[TELEGRAM] crawl_result.json 읽기 실패: ${e.message}`);
      process.exit(1);
    }
    message = data.tgMsg || data.kakaoMsg;

    // 오후 델타 게이트: --delta-since <오전 crawl_result.json> 가 주어지면,
    //   오전본 대비 신규 IBK 관련(graded)이 있으면 [오후 추가 감지] 전체 알림,
    //   신규가 0이면 무음이 아니라 '오전 대비 변동 없음' 마감 알림을 보낸다.
    //   → 시작 알림만 있고 완료 알림이 없어 "죽었나?" 오인하는 것을 방지(시작→끝 짝 보장).
    //   오전본을 못 읽으면(오전 실패/미존재) 게이트 미적용 → 평소대로 전체 전송(놓침 방지).
    if (deltaSince) {
      let baseIds = null;
      try {
        const base = JSON.parse(fs.readFileSync(deltaSince, "utf8"));
        baseIds = new Set((base.items || []).map(i => String(i.noticeId)));
      } catch (e) {
        console.warn(`[TELEGRAM] 델타 기준(${deltaSince}) 읽기 실패 — 게이트 미적용, 평소대로 전송: ${e.message}`);
      }
      if (baseIds) {
        const newGraded = (data.graded || []).filter(i => !baseIds.has(String(i.noticeId)));
        if (newGraded.length === 0) {
          // 신규 없음 → '변동 없음' 마감 알림(항상 완료 알림). 보고서·기록은 이미 생성·보존됨.
          const n = (typeof data.totalFetched === "number") ? data.totalFetched : (data.items || []).length;
          const kst = new Date(Date.now() + 9 * 3600 * 1000);
          const hhmm = `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
          message = `🔔 내부통제 동향 알림 (${hhmm})\n${n}건 확인 · 신규 없음\n✅ 신규 제재·경영유의 없음 — 기존 점검 유지`;
          console.log("[TELEGRAM] 오후 델타: 오전 이후 신규 없음 — '변동 없음' 마감 알림 전송");
        } else {
          message = `🔔 [오후 추가 ${newGraded.length}건 감지]\n` + (message || "");
          console.log(`[TELEGRAM] 오후 델타: 신규 IBK 관련 ${newGraded.length}건 → 알림 전송`);
        }
      }
    }
  }

  if (!message) {
    console.error("[TELEGRAM] 전송할 메시지 없음 (--msg 또는 --from-crawl-result 필요)");
    process.exit(1);
  }

  try {
    await sendMessage(message);
    console.log("[TELEGRAM] 전송 완료");
    console.log("[TELEGRAM] 메시지:\n" + message);
  } catch (e) {
    console.error(`[TELEGRAM] 오류: ${e.message}`);
    process.exit(1);
  }
}

main();
