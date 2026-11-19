import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesContent = fs.readFileSync('firestore.rules', 'utf8');

test('firestore.rules enforces deny-by-default and authentication', () => {
  assert.match(rulesContent, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  assert.match(rulesContent, /function isOwner\(userId\)/);
  assert.match(rulesContent, /request\.auth != null/);
});

test('firestore.rules enforces liveTradingEnabled == false and blocks role escalation', () => {
  assert.match(rulesContent, /data\.liveTradingEnabled == false/);
  assert.match(rulesContent, /data\.activeEnvironment in \['SIMULATION', 'MT5_DEMO'\]/);
  assert.match(rulesContent, /!\('role' in data\) \|\| data\.role == 'trader'/);
});

test('firestore.rules blocks storing broker passwords in Firestore', () => {
  assert.match(rulesContent, /!\('brokerPassword' in data\)/);
});

test('firestore.rules enforces trade ticket schema and terminal state lock', () => {
  assert.match(rulesContent, /match \/tickets\/\{ticketId\}/);
  assert.match(rulesContent, /function isValidTradeTicket\(data\)/);
  assert.match(rulesContent, /resource\.data\.status in \['PROPOSED', 'RISK_PASS', 'RISK_REJECT', 'APPROVED'\]/);
  assert.match(rulesContent, /isValidId\(ticketId\)/);
});
