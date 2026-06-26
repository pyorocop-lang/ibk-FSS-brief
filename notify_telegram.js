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

// ── CLI 파싱 ──
const argv      = process.argv.slice(2);
const msgIdx    = argv.indexOf("--msg");
const directMsg = msgIdx >= 0 ? argv[msgIdx + 1] : null;
const fromCrawl = argv.includes("--from-crawl-result");

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
    const crawlPath = path.join(__dirname, "reports", REPORT_DATE, "crawl_result.json");
    try {
      const data = JSON.parse(fs.readFileSync(crawlPath, "utf8"));
      message = data.tgMsg || data.kakaoMsg;
    } catch (e) {
      console.error(`[TELEGRAM] crawl_result.json 읽기 실패: ${e.message}`);
      process.exit(1);
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
