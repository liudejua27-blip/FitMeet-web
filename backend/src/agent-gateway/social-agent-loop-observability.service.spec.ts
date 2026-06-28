import { ApprovalStatus } from './entities/agent-approval-request.entity';
import { AgentSideEffectLedgerStatus } from './entities/agent-side-effect-ledger.entity';
import { AgentTaskStatus } from './entities/agent-task.entity';
import { MatchingJobStatus } from './entities/matching-job.entity';
import { SafetyEventType, Severity } from './entities/safety-event.entity';
import { SocialAgentLoopObservabilityService } from './social-agent-loop-observability.service';
import { SocialRequestStatus } from './entities/social-request.entity';
import { SocialActivityStatus } from '../activities/entities/activity.entity';

function repo<T>(rows: T[]) {
  return {
    find: jest.fn().mockResolvedValue(rows),
  };
}

describe('SocialAgentLoopObservabilityService', () => {
  it('summarizes loop trace links, coverage, and business metrics from existing tables', async () => {
    const now = new Date('2026-06-28T01:00:00.000Z');
    const service = new SocialAgentLoopObservabilityService(
      repo([
        {
          id: 11,
          status: AgentTaskStatus.Succeeded,
          result: {
            runId: 'run_1',
            threadId: 'thread_1',
            socialRequestId: 101,
            publicIntentId: 'pi_101',
          },
          memory: {},
          input: {},
          updatedAt: now,
        },
      ]) as never,
      repo([
        {
          id: 'pi_101',
          mode: 'public',
          status: SocialRequestStatus.Searching,
          linkedSocialRequestId: 101,
          createdAt: new Date('2026-06-28T00:00:00.000Z'),
          updatedAt: now,
        },
      ]) as never,
      repo([
        {
          id: 201,
          publicIntentId: 'pi_101',
          linkedSocialRequestId: 101,
          status: MatchingJobStatus.CandidatesReady,
          candidateCount: 2,
          createdAt: new Date('2026-06-28T00:00:00.000Z'),
          completedAt: new Date('2026-06-28T00:00:03.000Z'),
          updatedAt: now,
        },
        {
          id: 202,
          publicIntentId: 'pi_102',
          linkedSocialRequestId: 102,
          status: MatchingJobStatus.NoCandidates,
          candidateCount: 0,
          createdAt: new Date('2026-06-28T00:00:00.000Z'),
          completedAt: new Date('2026-06-28T00:00:05.000Z'),
          updatedAt: now,
        },
      ]) as never,
      repo([
        {
          id: 301,
          taskId: 11,
          socialRequestId: 101,
          publicIntentId: 'pi_101',
          matchingJobId: 201,
          candidateCount: 2,
          createdAt: now,
        },
      ]) as never,
      repo([
        {
          id: 401,
          taskId: 11,
          socialRequestId: 101,
          publicIntentId: 'pi_101',
          matchingJobId: 201,
          candidateRecordId: 501,
          eventType: 'candidate_impression',
          createdAt: now,
        },
        {
          id: 402,
          taskId: 11,
          socialRequestId: 101,
          publicIntentId: 'pi_101',
          matchingJobId: 201,
          candidateRecordId: 501,
          eventType: 'candidate_viewed',
          createdAt: now,
        },
        {
          id: 403,
          taskId: 11,
          socialRequestId: 101,
          publicIntentId: 'pi_101',
          matchingJobId: 201,
          candidateRecordId: 501,
          eventType: 'opener_previewed',
          createdAt: now,
        },
        {
          id: 404,
          taskId: 11,
          socialRequestId: 101,
          publicIntentId: 'pi_101',
          matchingJobId: 201,
          candidateRecordId: 501,
          eventType: 'invite_approval_requested',
          createdAt: now,
        },
        {
          id: 405,
          taskId: 11,
          socialRequestId: 101,
          publicIntentId: 'pi_101',
          matchingJobId: 201,
          candidateRecordId: 501,
          eventType: 'invite_sent',
          createdAt: now,
        },
        {
          id: 406,
          taskId: 11,
          socialRequestId: 101,
          publicIntentId: 'pi_101',
          matchingJobId: 201,
          candidateRecordId: 501,
          eventType: 'candidate_replied',
          createdAt: now,
        },
        {
          id: 407,
          taskId: 11,
          socialRequestId: 101,
          publicIntentId: 'pi_101',
          matchingJobId: 201,
          candidateRecordId: 501,
          eventType: 'activity_completed',
          createdAt: now,
        },
        {
          id: 408,
          taskId: 11,
          socialRequestId: 101,
          publicIntentId: 'pi_101',
          matchingJobId: 201,
          candidateRecordId: 501,
          eventType: 'review_submitted',
          createdAt: now,
        },
      ]) as never,
      repo([
        {
          id: 601,
          publicIntentId: 'pi_101',
          status: 'accepted',
          meetId: 701,
          updatedAt: now,
        },
      ]) as never,
      repo([
        {
          id: 801,
          agentTaskId: 11,
          status: ApprovalStatus.Approved,
          updatedAt: now,
        },
      ]) as never,
      repo([
        {
          id: 901,
          agentTaskId: 11,
          actionType: 'publish_to_discover',
          status: AgentSideEffectLedgerStatus.Succeeded,
          attemptCount: 0,
          result: { reused: true },
          metadata: {},
          updatedAt: now,
        },
      ]) as never,
      repo([
        {
          id: 1001,
          status: 'completed',
          payload: {
            applicationId: 601,
            publicIntentId: 'pi_101',
            meetId: 701,
          },
          updatedAt: now,
        },
      ]) as never,
      repo([
        {
          id: 1101,
          socialRequestId: 101,
          meetId: 701,
          status: SocialActivityStatus.Completed,
          updatedAt: now,
        },
      ]) as never,
      repo([
        {
          id: 1201,
          eventType: SafetyEventType.ContactBypass,
          severity: Severity.High,
          updatedAt: now,
        },
      ]) as never,
      repo([
        {
          id: 1301,
          reasonCode: 'good_fit',
          createdAt: now,
        },
      ]) as never,
      repo([
        {
          id: 1401,
          value: 'positive',
          updatedAt: now,
        },
      ]) as never,
    );

    const snapshot = await service.snapshot(20);

    expect(snapshot.identifiers).toContain('candidateSnapshotId');
    expect(snapshot.counts.matchingJobsByStatus).toMatchObject({
      candidates_ready: 1,
      no_candidates: 1,
    });
    expect(snapshot.recentTraceLinks[0]).toMatchObject({
      taskId: 11,
      runId: 'run_1',
      threadId: 'thread_1',
      publicIntentId: 'pi_101',
      socialRequestId: 101,
      matchingJobId: 201,
      candidateSnapshotId: 301,
      candidateRecordId: 501,
      applicationId: 601,
      activityId: 1101,
      approvalId: 801,
    });
    expect(snapshot.traceCoverage.publicIntentId.coverage).toBe(1);
    expect(snapshot.businessMetrics.matchingJobP95LatencyMs).toBe(5000);
    expect(snapshot.businessMetrics.noCandidateRate).toMatchObject({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
    expect(snapshot.businessMetrics.openerSendConfirmationRate).toMatchObject({
      numerator: 1,
      denominator: 1,
      rate: 1,
    });
    expect(snapshot.businessMetrics.duplicateSideEffectInterceptions).toBe(1);
  });
});
