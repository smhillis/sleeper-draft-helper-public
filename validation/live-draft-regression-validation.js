const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('live-draft-safety.js', 'utf8');

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function testDraftedPlayerIdExclusion() {
  const state = {
    leagueId: null,
    draft: null,
    picks: [{ player_id: '100', metadata: {} }],
    players: {
      jamarrchase: { id: '100' },
      jahmyrgibbs: { id: '200' },
    },
  };
  const rows = [
    { name: "Ja'Marr Chase" },
    { name: 'Jahmyr Gibbs' },
  ];
  const engine = { state, recommendations: () => rows };
  const context = {
    window: null,
    SleeperDraftEngine: engine,
    recommendations: () => rows,
    document: { getElementById: () => null },
    fetch: async () => { throw new Error('unexpected fetch'); },
    setInterval: () => 1,
    clearInterval: () => {},
    Date,
    console,
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'live-draft-safety.js' });

  const available = context.SleeperDraftEngine.recommendations();
  assert.deepEqual(available.map((player) => player.name), ['Jahmyr Gibbs']);
}

async function testBackwardSnapshotFailsClosed() {
  const elements = {
    syncError: { textContent: '', style: { display: 'none' } },
    lastSync: { textContent: '' },
    pickCards: { innerHTML: '' },
  };
  const state = {
    leagueId: 'league-1',
    league: { league_id: 'league-1' },
    draft: { draft_id: 'draft-1', season: '2026', status: 'drafting' },
    rosters: [],
    picks: [
      { pick_no: 1, player_id: '100' },
      { pick_no: 2, player_id: '200' },
    ],
    players: {},
    timer: null,
  };
  const engine = { state, recommendations: () => [] };
  const responses = [
    { league_id: 'league-1' },
    [{ draft_id: 'draft-1', season: '2026', status: 'drafting' }],
    [],
    [{ pick_no: 1, player_id: '100' }],
  ];
  const requests = [];
  const context = {
    window: null,
    SleeperDraftEngine: engine,
    recommendations: () => [],
    resolveSlot: () => 1,
    render: () => {},
    document: { getElementById: (id) => elements[id] || null },
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      const body = responses.shift();
      return { ok: true, status: 200, json: async () => body };
    },
    setInterval: () => 1,
    clearInterval: () => {},
    Date,
    console,
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'live-draft-safety.js' });
  await flush();

  assert.equal(state.picks.length, 2, 'older pick snapshot must not replace newer live state');
  assert.equal(elements.syncError.style.display, 'block');
  assert.match(elements.pickCards.innerHTML, /Do not use stale recommendations/);
  assert.ok(requests.length >= 4);
  assert.ok(requests.every((request) => request.init?.cache === 'no-store'));
  assert.ok(requests.every((request) => request.url.includes('_=')));
}

(async () => {
  await testDraftedPlayerIdExclusion();
  await testBackwardSnapshotFailsClosed();
  console.log('Sleeper live-draft regression validation passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
