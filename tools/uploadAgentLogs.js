const { execSync } = require('child_process');

const logs = `
[Agent 14] CRASHED. Resetting gen 2 score=-163.80 best=-163.80
[Agent 15] CRASHED. Resetting gen 2 score=-172.08 best=-172.08
[Agent 17] CRASHED. Resetting gen 2 score=-188.59 best=-188.59
[Agent 18] CRASHED. Resetting gen 2 score=-180.33 best=-180.33
[Agent 19] CRASHED. Resetting gen 2 score=-172.08 best=-172.08
[Agent 3] CRASHED. Resetting gen 2 score=-219.19 best=-219.19
[Agent 12] CRASHED. Resetting gen 2 score=-173.01 best=-173.01
[Agent 6] CRASHED. Resetting gen 2 score=-431.08 best=-431.08
[Agent 10] CRASHED. Resetting gen 3 score=-172.55 best=-172.55
[Agent 5] CRASHED. Resetting gen 3 score=-88.13 best=-88.13
[Agent 7] CRASHED. Resetting gen 3 score=-188.30 best=-180.36
[Agent 11] CRASHED. Resetting gen 3 score=-180.10 best=-180.10
[Agent 14] CRASHED. Resetting gen 3 score=-180.09 best=-163.80
[Agent 15] CRASHED. Resetting gen 3 score=-163.68 best=-163.68
[Agent 17] CRASHED. Resetting gen 3 score=-171.72 best=-171.72
`;

const lines = logs.trim().split('\n');
const values = [];

const regex = /\[Agent (\d+)\] (CRASHED)\. Resetting gen (\d+) score=([-\d.]+) best=([-\d.]+)/;

for (const line of lines) {
  const match = line.match(regex);
  if (match) {
    const [_, agentId, event, gen, score, best] = match;
    values.push(`(${agentId}, '${event}', ${gen}, ${score}, ${best})`);
  }
}

if (values.length === 0) {
  console.log('No valid logs matched.');
  process.exit(0);
}

const sql = `
  INSERT INTO agent_logs (agent_id, event, generation, score, best_score) VALUES
  ${values.join(', ')}
`;

console.log(`Inserting ${values.length} log rows...`);
try {
  const cmd = `npx @insforge/cli db query "${sql.replace(/"/g, '\\"')}"`;
  execSync(cmd);
  console.log('✓ Successfully uploaded all logs to the agent_logs table.');
} catch (error) {
  console.error('Failed to upload logs:', error.message);
  process.exit(1);
}
