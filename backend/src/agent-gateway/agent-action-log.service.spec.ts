import { Repository } from 'typeorm';
import { AgentActionLogService } from './agent-action-log.service';
import {
  AgentActionLog,
  AgentActionType,
} from './entities/agent-action-log.entity';

describe('AgentActionLogService', () => {
  it('requires a strong AgentEvent identity before deduping legacy rows', async () => {
    const query = jest
      .fn<Promise<unknown>, [string, unknown[]?]>()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);
    const service = new AgentActionLogService({
      query,
    } as unknown as Repository<AgentActionLog>);

    await service.list({
      ownerUserId: 1,
      actionType: AgentActionType.AgentEvent,
    });

    const sql = query.mock.calls[0][0];

    expect(sql).toContain('a."eventType" IS NOT DISTINCT FROM l."eventType"');
    expect(sql).toContain('a."status" IS NOT DISTINCT FROM l."status"');
    expect(sql).toContain('a."payload"->>\'eventId\'');
    expect(sql).toContain('l."payload"->>\'eventId\'');
    expect(sql).toContain('a."messageId" IS NOT DISTINCT FROM l."messageId"');
    expect(sql).toContain(
      'a."conversationId" IS NOT DISTINCT FROM l."conversationId"',
    );
    expect(sql).toContain('ELSE FALSE');
  });
});
