/**
 * Reconciliation is the provenance contract: seen records get dates, missing
 * records from a complete fetch become unavailable, nothing is deleted, and
 * first_seen_at is never guessed from added_at. Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyNew,
  applySeen,
  markMissing,
  recordSourceStatus,
  verifiedFieldsChanged,
} from './reconcile.mjs';

const today = '2026-09-07';

function theme(over = {}) {
  return {
    id: 'nord',
    name: 'Nord',
    author: 'Omarchy',
    official: true,
    bundled: true,
    added_at: '2026-01-01',
    ...over,
  };
}

describe('applySeen', () => {
  it('sets first_seen_at to today when absent, not to added_at', () => {
    const next = applySeen(theme(), { name: 'Nord' }, today);
    assert.equal(next.first_seen_at, today);
    assert.equal(next.added_at, '2026-01-01');
    assert.equal(next.last_seen_at, today);
    assert.equal(next.status, 'active');
  });

  it('does not overwrite an existing first_seen_at', () => {
    const next = applySeen(theme({ first_seen_at: '2025-12-01' }), { name: 'Nord' }, today);
    assert.equal(next.first_seen_at, '2025-12-01');
    assert.equal(next.last_seen_at, today);
  });

  it('bumps last_changed_at when a verified field changes', () => {
    const next = applySeen(theme({ name: 'Old' }), { name: 'Nord' }, today);
    assert.equal(next.name, 'Nord');
    assert.equal(next.last_changed_at, today);
  });

  it('does not bump last_changed_at when verified fields are unchanged', () => {
    const next = applySeen(theme({ name: 'Nord', last_changed_at: '2026-02-01' }), { name: 'Nord' }, today);
    assert.equal(next.last_changed_at, '2026-02-01');
  });

  it('revives an unavailable record to active and stamps last_changed_at', () => {
    const next = applySeen(theme({ status: 'unavailable' }), { name: 'Nord' }, today);
    assert.equal(next.status, 'active');
    assert.equal(next.last_changed_at, today);
  });
});

describe('applyNew', () => {
  it('stamps first and last seen on a new record', () => {
    const next = applyNew(theme(), today);
    assert.equal(next.first_seen_at, today);
    assert.equal(next.last_seen_at, today);
    assert.equal(next.status, 'active');
  });
});

describe('markMissing', () => {
  it('marks in-scope unseen records unavailable on a complete fetch without deleting them', () => {
    const records = [theme({ id: 'nord' }), theme({ id: 'gruvbox' })];
    const { records: next, stats } = markMissing(records, {
      seenIds: ['nord'],
      complete: true,
      today,
    });
    assert.equal(next.length, 2);
    assert.notEqual(next[0].status, 'unavailable');
    assert.equal(next[1].id, 'gruvbox');
    assert.equal(next[1].status, 'unavailable');
    assert.equal(next[1].last_changed_at, today);
    assert.equal(stats.upstream_count, 1);
    assert.equal(stats.indexed_count, 1);
    assert.equal(stats.excluded_count, 1);
  });

  it('does not mark records unavailable when the fetch was not complete', () => {
    const records = [theme({ id: 'nord' }), theme({ id: 'gruvbox' })];
    const { records: next, stats } = markMissing(records, {
      seenIds: ['nord'],
      complete: false,
      today,
    });
    assert.equal(next[1].status, undefined);
    assert.equal(stats.excluded_count, 0);
  });

  it('leaves out-of-scope records alone even on a complete fetch', () => {
    const records = [theme({ id: 'nord', bundled: true }), theme({ id: 'dracula', bundled: false })];
    const { records: next } = markMissing(records, {
      seenIds: ['nord'],
      complete: true,
      today,
      inScope: (record) => record.bundled,
    });
    assert.equal(next[1].status, undefined);
    assert.equal(next[1].id, 'dracula');
  });
});

describe('recordSourceStatus', () => {
  it('writes a keyed diagnostic without dropping other sources', () => {
    const next = recordSourceStatus({ 'omarchy-hub': { note: 'keep' } }, 'omarchy-plugins', {
      last_attempt_at: today,
      last_success_at: today,
      upstream_count: 10,
      indexed_count: 8,
      excluded_count: 2,
    });
    assert.equal(next['omarchy-hub'].note, 'keep');
    assert.equal(next['omarchy-plugins'].upstream_count, 10);
    assert.equal(next['omarchy-plugins'].last_success_at, today);
  });
});

describe('verifiedFieldsChanged', () => {
  it('ignores keys the update did not send', () => {
    assert.equal(verifiedFieldsChanged({ name: 'Nord', stars: 1 }, { name: 'Nord' }), false);
  });
});
