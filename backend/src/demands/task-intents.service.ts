import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DomainOutboxEvent } from '../social-loop/domain-outbox-event.entity';
import { ApiIdempotencyService } from '../social-loop/api-idempotency.service';
import { ContactPolicyService } from '../social-loop/contact-policy.service';
import { User } from '../users/user.entity';
import {
  serializePublicTaskIntent,
  serializeTaskIntentApplication,
} from './public-task-intent.presenter';
import { PublicTaskIntent } from './public-task-intent.entity';
import {
  TaskIntentApplication,
  TaskIntentApplicationStatus,
} from './task-intent-application.entity';

type TaskListFilters = {
  page?: number;
  limit?: number;
  q?: string;
  city?: string;
  category?: string;
  requestType?: string;
  status?: string;
};

type CreateTaskApplicationBody = {
  message?: string;
};

type ResolveTaskApplicationBody = {
  reason?: string;
};

@Injectable()
export class TaskIntentsService {
  constructor(
    private readonly idempotency: ApiIdempotencyService,
    private readonly contactPolicy: ContactPolicyService,
    @InjectRepository(PublicTaskIntent)
    private readonly taskRepo: Repository<PublicTaskIntent>,
    @InjectRepository(TaskIntentApplication)
    private readonly applicationRepo: Repository<TaskIntentApplication>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async listPublicTaskIntents(filters: TaskListFilters = {}) {
    const page = this.positiveInt(filters.page, 1);
    const take = Math.min(this.positiveInt(filters.limit, 30), 50);
    const query = this.taskRepo
      .createQueryBuilder('task')
      .where('task.mode = :mode', { mode: 'public' })
      .andWhere("COALESCE(task.metadata ->> 'tombstoned', 'false') <> 'true'")
      .orderBy('task.createdAt', 'DESC')
      .take(take)
      .skip((page - 1) * take);

    if (filters.status) {
      query.andWhere('task.status = :status', { status: filters.status });
    } else {
      query.andWhere('task.status IN (:...statuses)', {
        statuses: ['open', 'in_progress'],
      });
    }
    if (filters.city?.trim()) {
      query.andWhere('LOWER(task.city) LIKE LOWER(:city)', {
        city: `%${filters.city.trim()}%`,
      });
    }
    if (filters.category?.trim()) {
      query.andWhere('task.category = :category', {
        category: filters.category.trim(),
      });
    }
    if (filters.requestType?.trim()) {
      query.andWhere('task.requestType = :requestType', {
        requestType: filters.requestType.trim(),
      });
    }
    if (filters.q?.trim()) {
      query.andWhere(
        `(
          LOWER(task.title) LIKE LOWER(:q)
          OR LOWER(task.summary) LIKE LOWER(:q)
          OR LOWER(task.city) LIKE LOWER(:q)
          OR LOWER(task.loc) LIKE LOWER(:q)
          OR LOWER(task.requestType) LIKE LOWER(:q)
          OR LOWER(task.category) LIKE LOWER(:q)
          OR LOWER(CAST(task.fields AS TEXT)) LIKE LOWER(:q)
        )`,
        { q: `%${filters.q.trim()}%` },
      );
    }

    const [data, total] = await query.getManyAndCount();
    return {
      data: data.map(serializePublicTaskIntent),
      metadata: {
        total,
        page,
        lastPage: Math.ceil(total / take),
        limit: take,
        filters: {
          q: filters.q ?? null,
          city: filters.city ?? null,
          category: filters.category ?? null,
          requestType: filters.requestType ?? null,
          status: filters.status ?? null,
        },
      },
    };
  }

  async getPublicTaskIntent(id: string) {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (
      !task ||
      task.mode !== 'public' ||
      task.metadata?.tombstoned === true
    ) {
      throw new NotFoundException('Task intent not found');
    }
    return serializePublicTaskIntent(task);
  }

  async createApplication(
    applicantUserId: number,
    taskIntentId: string,
    body: CreateTaskApplicationBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      applicantUserId,
      'task-intent-applications.create',
      idempotencyKey,
      { taskIntentId, message: body.message ?? '' },
      (manager) =>
        this.createApplicationOnce(
          applicantUserId,
          taskIntentId,
          body.message ?? '',
          manager,
        ),
    );
  }

  async listMine(userId: number, role: 'owner' | 'applicant' = 'applicant') {
    const where =
      role === 'owner' ? { ownerUserId: userId } : { applicantUserId: userId };
    const applications = await this.applicationRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return applications.map(serializeTaskIntentApplication);
  }

  async acceptApplication(
    ownerUserId: number,
    applicationId: number,
    body: ResolveTaskApplicationBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      ownerUserId,
      'task-intent-applications.accept',
      idempotencyKey,
      { applicationId, ...body },
      (manager) =>
        this.acceptApplicationOnce(ownerUserId, applicationId, manager),
    );
  }

  async rejectApplication(
    ownerUserId: number,
    applicationId: number,
    body: ResolveTaskApplicationBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      ownerUserId,
      'task-intent-applications.reject',
      idempotencyKey,
      { applicationId, ...body },
      (manager) =>
        this.resolveApplicationOnce(
          ownerUserId,
          applicationId,
          'rejected',
          manager,
        ),
    );
  }

  async cancelApplication(
    applicantUserId: number,
    applicationId: number,
    body: ResolveTaskApplicationBody,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      applicantUserId,
      'task-intent-applications.cancel',
      idempotencyKey,
      { applicationId, ...body },
      (manager) =>
        this.resolveApplicationOnce(
          applicantUserId,
          applicationId,
          'cancelled',
          manager,
        ),
    );
  }

  private async createApplicationOnce(
    applicantUserId: number,
    taskIntentId: string,
    message: string,
    manager: EntityManager,
  ) {
    const task = await this.lockTaskIntent(taskIntentId, manager);
    this.assertTaskCanReceiveApplications(task, applicantUserId);
    await this.assertUserExists(applicantUserId);
    await this.contactPolicy.assertNotBlocked(applicantUserId, task.userId!);

    const duplicate = await manager
      .getRepository(TaskIntentApplication)
      .findOne({
        where: [
          { taskIntentId, applicantUserId, status: 'pending' },
          { taskIntentId, applicantUserId, status: 'accepted' },
        ],
        order: { createdAt: 'DESC' },
      });
    if (duplicate) {
      throw new BadRequestException('Already applied to this task.');
    }

    const application = await manager
      .getRepository(TaskIntentApplication)
      .save(
        manager.getRepository(TaskIntentApplication).create({
          taskIntentId,
          ownerUserId: task.userId!,
          applicantUserId,
          status: 'pending',
          message: message.trim().slice(0, 500),
          resolvedAt: null,
        }),
      );
    task.applicantCount += 1;
    await manager.getRepository(PublicTaskIntent).save(task);
    return serializeTaskIntentApplication(application);
  }

  private async acceptApplicationOnce(
    ownerUserId: number,
    applicationId: number,
    manager: EntityManager,
  ) {
    const application = await this.lockApplication(applicationId, manager);
    if (application.ownerUserId !== ownerUserId) {
      throw new NotFoundException('Task application not found');
    }
    const task = await this.lockTaskIntent(application.taskIntentId, manager);
    if (application.status === 'accepted') {
      return this.acceptedResponse(application);
    }
    if (application.status !== 'pending') {
      throw new BadRequestException('Task application already resolved');
    }
    this.assertTaskActive(task);
    await this.contactPolicy.assertNotBlocked(
      ownerUserId,
      application.applicantUserId,
    );

    application.status = 'accepted';
    application.resolvedAt = new Date();
    await manager.getRepository(TaskIntentApplication).save(application);

    task.status = 'in_progress';
    task.acceptedApplicantId = application.applicantUserId;
    await manager.getRepository(PublicTaskIntent).save(task);

    const permission = await this.contactPolicy.grantOpenAccess(
      ownerUserId,
      application.applicantUserId,
      'task_intent_application',
      application.id,
      ownerUserId,
      manager,
    );
    await this.writeConversationOutbox(application, task, manager);
    return {
      applicationId: application.id,
      status: 'accepted',
      conversation: {
        status: permission.conversationId ? 'ready' : 'provisioning',
        conversationId: permission.conversationId,
      },
    };
  }

  private async resolveApplicationOnce(
    userId: number,
    applicationId: number,
    status: 'rejected' | 'cancelled',
    manager: EntityManager,
  ) {
    const application = await this.lockApplication(applicationId, manager);
    const allowed =
      status === 'rejected'
        ? application.ownerUserId === userId
        : application.applicantUserId === userId;
    if (!allowed) {
      throw new NotFoundException('Task application not found');
    }
    if (application.status === status) {
      return serializeTaskIntentApplication(application);
    }
    if (application.status !== 'pending') {
      throw new BadRequestException('Task application already resolved');
    }
    application.status = status;
    application.resolvedAt = new Date();
    return serializeTaskIntentApplication(
      await manager.getRepository(TaskIntentApplication).save(application),
    );
  }

  private async writeConversationOutbox(
    application: TaskIntentApplication,
    task: PublicTaskIntent,
    manager: EntityManager,
  ) {
    const dedupeKey = `task_intent_application:${application.id}:conversation`;
    await manager
      .getRepository(DomainOutboxEvent)
      .createQueryBuilder()
      .insert()
      .values({
        eventType: 'conversation.provision_requested',
        aggregateType: 'task_intent_application',
        aggregateId: String(application.id),
        dedupeKey,
        payload: {
          applicationId: application.id,
          taskIntentId: application.taskIntentId,
          demandId: task.demandId,
          ownerUserId: application.ownerUserId,
          applicantUserId: application.applicantUserId,
          title: task.title,
        },
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(),
        processedAt: null,
        lastError: '',
      })
      .orIgnore()
      .execute();
  }

  private async acceptedResponse(application: TaskIntentApplication) {
    const relationship = await this.contactPolicy.getRelationshipState(
      application.ownerUserId,
      application.applicantUserId,
    );
    return {
      applicationId: application.id,
      status: 'accepted',
      conversation: {
        status: relationship.conversationId ? 'ready' : 'provisioning',
        conversationId: relationship.conversationId,
      },
    };
  }

  private async lockTaskIntent(taskIntentId: string, manager: EntityManager) {
    const task = await manager.getRepository(PublicTaskIntent).findOne({
      where: { id: taskIntentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!task) throw new NotFoundException('Task intent not found');
    return task;
  }

  private async lockApplication(applicationId: number, manager: EntityManager) {
    const application = await manager
      .getRepository(TaskIntentApplication)
      .findOne({
        where: { id: applicationId },
        lock: { mode: 'pessimistic_write' },
      });
    if (!application) throw new NotFoundException('Task application not found');
    return application;
  }

  private assertTaskCanReceiveApplications(
    task: PublicTaskIntent,
    applicantUserId: number,
  ) {
    this.assertTaskActive(task);
    if (!task.userId) throw new NotFoundException('Task intent not found');
    if (task.userId === applicantUserId) {
      throw new BadRequestException('Cannot apply to your own task.');
    }
  }

  private assertTaskActive(task: PublicTaskIntent) {
    if (
      task.mode !== 'public' ||
      task.status !== 'open' ||
      task.metadata?.tombstoned === true
    ) {
      throw new BadRequestException('Task intent is not accepting applications.');
    }
  }

  private async assertUserExists(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found.');
  }

  private positiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
