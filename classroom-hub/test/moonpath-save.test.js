'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KEY = 'moonpath-home-v3';
const html = fs.readFileSync(path.join(__dirname, '../apps/moonpath-dev/index.html'), 'utf8');
const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(script => script.includes(`const KEY="${KEY}"`));
assert.ok(source, 'HOME script must be present');
const clone = value => JSON.parse(JSON.stringify(value));

// Execute the real HOME script and its UI handlers without browser dependencies.
class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.classList = { add() {}, remove() {} };
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  append(...children) {
    children.forEach(child => { child.parent = this; });
    this.children.push(...children);
  }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  replaceWith(next) {
    const siblings = this.parent.children;
    siblings[siblings.indexOf(this)] = next;
    next.parent = this.parent;
  }
  get firstElementChild() { return this.children[0]; }
  querySelectorAll(selector) {
    const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    return selector === '*' ? descendants : descendants.filter(child =>
      (child.className || '').split(' ').includes(selector.slice(1)));
  }
  click() { if (!this.disabled) this.listeners.click(); }
}

function harness(storage = new Map()) {
  const elements = new Map();
  const events = [];
  const control = { error: null, confirm: true };
  const el = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const window = { confirm: () => control.confirm };
  const context = vm.createContext({
    window,
    confirm: window.confirm,
    document: {
      getElementById: el,
      createElement: () => new Element(),
      dispatchEvent: event => events.push({ type: event.type, detail: clone(event.detail) })
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => {
        if (control.error) throw new DOMException('Storage write rejected', control.error);
        storage.set(key, String(value));
      }
    }
  });
  vm.runInContext(source, context, { filename: 'moonpath-dev/index.html' });
  const api = window.GameHomeV41;
  return {
    api, control, events, storage,
    data: () => clone(api.getData()),
    message: () => el('game-popup-message').textContent,
    all: selector => el('game-popup-content').querySelectorAll(selector),
    slots: () => el('game-popup-content').querySelectorAll('.popup-slot'),
    // A fresh context discards all session memory, retaining only persisted bytes.
    reload: () => harness(storage)
  };
}

function existingData() {
  return {
    slots: [
      { chapter: 3, playTime: '24:15', updatedAt: '기존 저장 시각', journal: ['보존할 일지'], progress: { keys: 2 } },
      null,
      { chapter: 2, playTime: '10:00', updatedAt: '이전 저장', journal: ['세 번째 슬롯'] }
    ],
    settings: { bgm: true, sfx: false, effects: true, textSpeed: 'slow' }
  };
}

function withExistingData() {
  return harness(new Map([[KEY, JSON.stringify(existingData())]]));
}

test('new adventures persist in slots I–III with the existing v3 schema and reload correctly', () => {
  const h = harness();
  h.api.open('new');
  assert.deepEqual(h.all('.popup-slot-number').map(el => el.textContent), ['I', 'II', 'III']);
  for (let i = 0; i < 3; i++) {
    h.slots()[i].click();
    assert.match(h.message(), /새 탐험을 준비했습니다/);
    const stored = JSON.parse(h.storage.get(KEY));
    assert.deepEqual(Object.keys(stored).sort(), ['settings', 'slots']);
    assert.equal(stored.slots.length, 3);
    assert.deepEqual(Object.keys(stored.slots[i]).sort(), ['chapter', 'journal', 'playTime', 'updatedAt']);
    assert.equal(stored.slots[i].chapter, 1);
    assert.equal(stored.slots[i].playTime, '00:00');
    assert.deepEqual(stored.slots[i].journal, ['달빛 마도 탐험을 시작했습니다.']);
    assert.ok(stored.slots[i].updatedAt);
    assert.deepEqual(h.reload().data(), stored);
  }
  assert.deepEqual([...h.storage.keys()], [KEY]);
  assert.deepEqual(h.events.map(event => [event.type, event.detail.slot]),
    [['game-start', 1], ['game-start', 2], ['game-start', 3]]);
  const reloaded = h.reload();
  reloaded.api.open('continue');
  assert.ok(reloaded.slots().every(slot => !slot.disabled));
});

test('settings and existing slot records survive a fresh page context', () => {
  const h = withExistingData();
  h.api.open('settings');
  h.all('.popup-switch')[0].click();
  const speed = h.all('.popup-select')[0];
  speed.value = 'fast';
  speed.listeners.change();
  h.all('.popup-save')[0].click();
  assert.equal(h.message(), '설정을 저장했습니다.');
  const expected = existingData();
  expected.settings.bgm = false;
  expected.settings.textSpeed = 'fast';
  assert.deepEqual(h.data(), expected);
  assert.deepEqual(h.reload().data(), expected);
  assert.deepEqual(h.events, [{ type: 'game-settings-change', detail: { settings: expected.settings } }]);
});

for (const error of ['QuotaExceededError', 'SecurityError']) {
  test(`${error}: failed slot creation/overwrite preserves storage, UI and reload; retry succeeds`, () => {
    const h = withExistingData();
    const original = h.storage.get(KEY);
    h.control.error = error;
    h.api.open('new');
    for (const index of [0, 1]) {
      h.slots()[index].click();
      assert.match(h.message(), /새 탐험을 저장하지 못했습니다/);
      assert.doesNotMatch(h.message(), /준비했습니다/);
      assert.equal(h.slots()[index].dataset.selected, 'false');
      assert.deepEqual(h.data(), existingData());
      assert.equal(h.storage.get(KEY), original);
      assert.deepEqual(h.reload().data(), existingData());
    }
    assert.equal(h.events.length, 0);
    h.api.open('continue');
    assert.equal(h.slots()[1].disabled, true);
    assert.equal(h.all('.popup-slot-title')[0].textContent, '챕터 3');
    h.control.error = null;
    h.api.open('new');
    h.slots()[1].click();
    assert.match(h.message(), /새 탐험을 준비했습니다/);
    assert.deepEqual(h.reload().data(), h.data());
    assert.deepEqual(h.events.map(event => event.type), ['game-start']);
  });

  test(`${error}: settings show failure and reload warning, suppress success event and permit retry`, () => {
    const h = withExistingData();
    const original = h.storage.get(KEY);
    h.api.open('settings');
    h.all('.popup-switch')[0].click();
    h.control.error = error;
    h.all('.popup-save')[0].click();
    assert.match(h.message(), /설정을 저장하지 못했습니다/);
    assert.match(h.message(), /새로고침하면 변경 사항이 사라질 수 있습니다/);
    assert.doesNotMatch(h.message(), /설정을 저장했습니다/);
    assert.equal(h.events.length, 0);
    assert.equal(h.storage.get(KEY), original);
    assert.equal(h.data().settings.bgm, false, 'keep the unsaved choice available for retry');
    assert.deepEqual(h.reload().data(), existingData());
    h.control.error = null;
    h.all('.popup-save')[0].click();
    assert.equal(h.message(), '설정을 저장했습니다.');
    assert.deepEqual(h.reload().data(), h.data());
    assert.deepEqual(h.events.map(event => event.type), ['game-settings-change']);
  });

  test(`${error}: continue cannot announce success or change the last-save timestamp`, () => {
    const h = withExistingData();
    h.control.error = error;
    h.api.open('continue');
    h.slots()[0].click();
    assert.match(h.message(), /탐험 기록을 저장하지 못했습니다/);
    assert.doesNotMatch(h.message(), /불러왔습니다/);
    assert.equal(h.events.length, 0);
    assert.deepEqual(h.data(), existingData());
    assert.deepEqual(h.reload().data(), existingData());
    h.control.error = null;
    h.slots()[0].click();
    assert.match(h.message(), /불러왔습니다/);
    assert.notEqual(h.data().slots[0].updatedAt, existingData().slots[0].updatedAt);
    assert.deepEqual(h.data().slots[0].progress, { keys: 2 });
    assert.deepEqual(h.reload().data(), h.data());
    assert.deepEqual(h.events.map(event => event.type), ['game-continue']);
  });

  test(`${error}: reset returns false and preserves data; successful reset returns true and persists`, () => {
    const h = withExistingData();
    h.control.error = error;
    h.api.open('new');
    assert.equal(h.api.reset(), false);
    assert.match(h.message(), /초기화 내용을 저장하지 못했습니다/);
    assert.equal(h.events.length, 0);
    assert.deepEqual(h.data(), existingData());
    assert.deepEqual(h.reload().data(), existingData());
    h.control.error = null;
    assert.equal(h.api.reset(), true);
    assert.deepEqual(h.data().slots, [null, null, null]);
    assert.deepEqual(h.reload().data(), h.data());
    assert.deepEqual(h.events.map(event => event.type), ['game-data-reset']);
  });
}

test('a rejected first-ever save leaves no phantom slot after reload', () => {
  const h = harness();
  h.control.error = 'SecurityError';
  h.api.open('new');
  h.slots()[0].click();
  assert.match(h.message(), /저장하지 못했습니다/);
  assert.equal(h.storage.has(KEY), false);
  assert.deepEqual(h.data().slots, [null, null, null]);
  assert.deepEqual(h.reload().data(), h.data());
  assert.equal(h.events.length, 0);
});

test('cancelling an overwrite leaves the saved record untouched', () => {
  const h = withExistingData();
  h.control.confirm = false;
  h.api.open('new');
  h.slots()[0].click();
  assert.equal(h.events.length, 0);
  assert.equal(h.message(), '');
  assert.deepEqual(h.data(), existingData());
  assert.deepEqual(h.reload().data(), existingData());
});
