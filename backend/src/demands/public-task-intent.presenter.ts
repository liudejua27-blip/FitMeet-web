import { PublicTaskIntent } from './public-task-intent.entity';
import { TaskIntentApplication } from './task-intent-application.entity';

export function serializePublicTaskIntent(intent: PublicTaskIntent) {
  return {
    id: intent.id,
    userId: intent.userId,
    demandId: intent.demandId,
    source: intent.source,
    mode: intent.mode,
    requestType: intent.requestType,
    category: intent.category,
    title: intent.title,
    summary: intent.summary,
    fields: Array.isArray(intent.fields) ? intent.fields.slice(0, 6) : [],
    city: intent.city,
    loc: intent.loc,
    lat: intent.lat,
    lng: intent.lng,
    timePreference: intent.timePreference,
    budgetText: intent.budgetText,
    urgencyText: intent.urgencyText,
    riskLevel: intent.riskLevel,
    applicationPolicy: intent.applicationPolicy,
    applicantCount: intent.applicantCount,
    acceptedApplicantId: intent.acceptedApplicantId,
    status: intent.status,
    metadata: intent.metadata ?? {},
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

export function serializeTaskIntentApplication(
  application: TaskIntentApplication,
) {
  return {
    id: application.id,
    taskIntentId: application.taskIntentId,
    ownerUserId: application.ownerUserId,
    applicantUserId: application.applicantUserId,
    status: application.status,
    message: application.message,
    resolvedAt: application.resolvedAt,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}
