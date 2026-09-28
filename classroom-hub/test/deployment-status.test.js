'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { refreshDeploymentStatuses } = require('../deployment-status');

test('completed deployment survives a restart and an unavailable or removed lookup', async () => {
  let stored = { activities: [{ id: 'climate', last_deployment_id: 'deploy-1', deploy_status: 'warning' }] };
  const getState = async () => structuredClone(stored);
  const saveState = async state => { stored = structuredClone(state); };
  const first = await getState();
  await refreshDeploymentStatuses(first, async () => ({ status: 'SUCCESS' }), getState, saveState);
  assert.equal(first.activities[0].deploy_status, 'success');
  assert.equal((await getState()).activities[0].deploy_status, 'success');
  for (const result of [null, { status: 'REMOVED' }, { status: 'REMOVING' }]) {
    const restarted = await getState();
    await refreshDeploymentStatuses(restarted, async () => result, getState, saveState);
    assert.equal(restarted.activities[0].deploy_status, 'success');
    assert.equal((await getState()).activities[0].deploy_status, 'success');
  }
});

test('pending lookup stays in the response; completed failure is stored', async () => {
  let stored = { activities: [{ id: 'climate', last_deployment_id: 'deploy-1', deploy_status: 'warning' }] };
  const getState = async () => structuredClone(stored);
  const saveState = async state => { stored = structuredClone(state); };
  const pending = await getState();
  await refreshDeploymentStatuses(pending, async () => ({ status: 'DEPLOYING' }), getState, saveState);
  assert.equal(pending.activities[0].deploy_status, 'deploying');
  assert.equal((await getState()).activities[0].deploy_status, 'warning');
  await refreshDeploymentStatuses(await getState(), async () => ({ status: 'FAILED' }), getState, saveState);
  assert.equal((await getState()).activities[0].deploy_status, 'failed');
});

test('completion for an older deployment cannot overwrite a newer deployment', async () => {
  let stored = { activities: [{ id: 'climate', last_deployment_id: 'deploy-1', deploy_status: 'deploying' }] };
  const getState = async () => structuredClone(stored);
  const saveState = async state => { stored = structuredClone(state); };
  await refreshDeploymentStatuses(await getState(), async () => {
    stored.activities[0].last_deployment_id = 'deploy-2';
    return { status: 'SUCCESS' };
  }, getState, saveState);
  assert.equal((await getState()).activities[0].deploy_status, 'deploying');
});
