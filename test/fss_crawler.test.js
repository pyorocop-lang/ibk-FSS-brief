const test = require('node:test');
const assert = require('node:assert/strict');
const { buildScanWindow, classifyRow, daysBetween, WINDOW_FALLBACK_DEPTH } = require('../fss_crawler');

// 직전 실행의 scanAudit → 소스별 관측 창(본 key 집합 + 훑은 깊이)
const PREV = {
  scanAudit: [
    { source: '제재공시', page: 1, keys: ['A_1', 'B_1'] },
    { source: '제재공시', page: 2, keys: ['C_1', 'D_1'] },
    { source: '경영유의', page: 1, keys: ['X_11'] },
  ],
};

test('scanAudit에서 소스별 key 집합과 관측 깊이를 복원한다', () => {
  const win = buildScanWindow(PREV);
  assert.deepEqual([...win['제재공시'].keys].sort(), ['A_1', 'B_1', 'C_1', 'D_1']);
  assert.equal(win['제재공시'].depth, 2);
  assert.equal(win['경영유의'].depth, 1);
});

test('scanAudit이 없으면 빈 창 — 판정 근거 없음', () => {
  assert.deepEqual(buildScanWindow(null), {});
  assert.deepEqual(buildScanWindow({ items: [{ key: 'A_1' }] }), {});   // items는 신규분만 담겨 창이 될 수 없다
});

test('레저에 있으면 known — 재알림 차단', () => {
  const win = buildScanWindow(PREV)['제재공시'];
  assert.equal(classifyRow('A_1', 1, { A_1: { seenDate: '20260709' } }, win, false), 'known');
});

// ★ 회귀: 2026-07-10 DB손해보험(202500415_1) — 조치요구일 07-02(8일 전)이지만
//   직전 실행이 본 page1 안에 없다가 새로 삽입됐다. 조치요구일로 판정하면 놓친다.
test('직전에 본 깊이 안에서 새로 나타난 행은 new — 조치요구일이 과거여도', () => {
  const win = buildScanWindow(PREV)['제재공시'];
  assert.equal(classifyRow('NEW_1', 1, {}, win, false), 'new');
  assert.equal(classifyRow('NEW_1', 2, {}, win, false), 'new');
});

// ★ 회귀: 2026-07-09 아이비케이신용정보(202200546_3) — 조치요구일 06-25.
//   구 REPORT_SINCE(2026-07-02) 앵커는 이 건을 조용히 폐기했다. 이제 new여야 한다.
test('조치요구일이 옛 앵커(2026-07-02)보다 과거여도 신규 게시면 new', () => {
  const win = buildScanWindow(PREV)['제재공시'];
  assert.equal(classifyRow('202200546_3', 1, {}, win, false), 'new');
});

test('직전에 훑지 않은 깊이의 행은 backfill — --pages 확장 시 과거 누적분 범람 방지', () => {
  const win = buildScanWindow(PREV)['제재공시'];   // depth = 2
  assert.equal(classifyRow('OLD_1', 3, {}, win, false), 'backfill');
});

test('최초 시드(레저 빔)는 전부 backfill — 목록 전체가 과거 누적분', () => {
  const win = buildScanWindow(PREV)['제재공시'];
  assert.equal(classifyRow('NEW_1', 1, {}, win, true), 'backfill');
});

test('직전 창 유실 시 fallback 깊이까지만 레저로 판정한다', () => {
  assert.equal(classifyRow('NEW_1', WINDOW_FALLBACK_DEPTH, {}, undefined, false), 'new');
  assert.equal(classifyRow('NEW_1', WINDOW_FALLBACK_DEPTH + 1, {}, undefined, false), 'backfill');
});

test('직전 창에 있는데 레저에서 유실된 행은 known으로 방어한다', () => {
  const win = buildScanWindow(PREV)['제재공시'];
  assert.equal(classifyRow('A_1', 1, {}, win, false), 'known');
});

test('daysBetween — 조치요구일과 최초 등장일의 간격(목록 정렬 지연)', () => {
  assert.equal(daysBetween('2026-07-02', '20260710'), 8);   // DB손해보험 실측
  assert.equal(daysBetween('2026-07-10', '20260710'), 0);   // 당일 조치요구 → 목록 최상단
  assert.equal(daysBetween('', '20260710'), 0);             // 파싱 실패 안전값
});
