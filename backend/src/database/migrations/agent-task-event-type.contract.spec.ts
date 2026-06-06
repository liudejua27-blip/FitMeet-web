import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { AgentTaskEventType } from '../../agent-gateway/entities/agent-task.entity';

function readAgentTaskEventTypeMigrationLabels(): Set<string> {
  const migrationsDir = join(process.cwd(), 'src/database/migrations');
  const labels = new Set<string>();

  for (const filename of readdirSync(migrationsDir)) {
    if (!filename.endsWith('.ts')) continue;
    const source = readFileSync(join(migrationsDir, filename), 'utf8');
    if (!source.includes('agent_task_event_type_enum')) continue;

    for (const match of source.matchAll(/'([^']+)'/g)) {
      labels.add(match[1]);
    }
  }

  return labels;
}

describe('agent task event type migrations', () => {
  it('cover every AgentTaskEventType enum value used by the runtime entity', () => {
    const migrationLabels = readAgentTaskEventTypeMigrationLabels();

    expect(
      Object.values(AgentTaskEventType).filter(
        (eventType) => !migrationLabels.has(eventType),
      ),
    ).toEqual([]);
  });
});
