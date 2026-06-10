import 'reflect-metadata';

import dataSource from '../database/data-source';

const workerId =
  process.env.FITMEET_SUBAGENT_WORKER_ID ?? 'compose-subagent-worker';
const maxAgeMs = positiveInt(
  process.env.FITMEET_SUBAGENT_WORKER_HEALTH_MAX_AGE_MS,
  90_000,
);
const queues = (
  process.env.FITMEET_SUBAGENT_WORKER_QUEUE ??
  'fitmeet.subagent.life-graph-agent,fitmeet.subagent.social-match-agent,fitmeet.subagent.meet-loop-agent,fitmeet.subagent.math-agent'
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

type HeartbeatRow = {
  queueName: string;
  status: string;
  lastSeenAt: Date | string;
};

async function main() {
  await dataSource.initialize();
  try {
    const rawRows: unknown = await dataSource.query(
      `
      SELECT "queueName", status, "lastSeenAt"
      FROM subagent_worker_heartbeats
      WHERE "workerId" = $1 AND "queueName" = ANY($2::text[])
      `,
      [workerId, queues],
    );
    const rows = Array.isArray(rawRows) ? (rawRows as HeartbeatRow[]) : [];

    const now = Date.now();
    const stale = rows.filter(
      (row) => now - new Date(row.lastSeenAt).getTime() > maxAgeMs,
    );
    const seenQueues = new Set(rows.map((row) => row.queueName));
    const missingQueues = queues.filter((queue) => !seenQueues.has(queue));

    if (rows.length === 0 || stale.length > 0 || missingQueues.length > 0) {
      throw new Error(
        [
          `worker heartbeat unhealthy for ${workerId}`,
          missingQueues.length ? `missing=${missingQueues.join(',')}` : '',
          stale.length
            ? `stale=${stale.map((row) => row.queueName).join(',')}`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
    }

    console.log(
      JSON.stringify({
        status: 'ok',
        workerId,
        queues,
      }),
    );
  } finally {
    await dataSource.destroy();
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
