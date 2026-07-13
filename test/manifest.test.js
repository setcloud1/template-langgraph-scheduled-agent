import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../setcloud.template.json' with { type: 'json' };

test('manifest declares the SetCloud serverless contract', () => {
  assert.equal(manifest.default.runtime, 'serverless');
  assert.equal(manifest.default.buildCommand, 'pnpm run build:set');
  assert.equal(manifest.default.healthCheckPath, '/set/v1/health');
  assert.ok(manifest.platformSecrets.includes('SET_AGENT_POSTGRES_URL'));
  assert.ok(!manifest.platformSecrets.includes('WORKFLOW_POSTGRES_URL'));
  assert.ok(!manifest.capabilities.includes('workflow'));
});
