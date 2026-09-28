'use strict';

const COMPLETED = new Set(['success', 'active', 'completed', 'failed', 'crashed']);

async function refreshDeploymentStatuses(state, lookup, getState, saveState) {
  const completed = [];
  for (const activity of state.activities) {
    if (!activity.last_deployment_id) continue;
    const deploymentId = activity.last_deployment_id;
    const result = await lookup(deploymentId);
    const status = String(result?.status || '').toLowerCase();
    // An old deployment is removed when its replacement starts. Its state is not
    // the service's current state; an unavailable lookup also changes nothing.
    if (!status || status === 'removed' || status === 'removing') continue;
    activity.deploy_status = status;
    if (COMPLETED.has(status)) completed.push({ id: activity.id, deploymentId, status });
  }
  if (completed.length) {
    const latest = await getState();
    let changed = false;
    for (const item of completed) {
      const activity = latest.activities.find(a => a.id === item.id);
      if (activity?.last_deployment_id !== item.deploymentId || activity.deploy_status === item.status) continue;
      activity.deploy_status = item.status;
      changed = true;
    }
    if (changed) await saveState(latest);
  }
  return state;
}

module.exports = { refreshDeploymentStatuses };
