import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AgentConnection } from './agent-connection.entity';

/** Every individual capability the agent may request */
export enum AgentAction {
  CreateSocialRequest = 'create_social_request',
  SearchProfiles = 'search_profiles',
  GeneratePost = 'generate_post',
  GenerateMessage = 'generate_message',
  SendMessage = 'send_message',
  ContactRequest = 'contact_request',
  LabChat = 'lab_chat',
  CreateActivity = 'create_activity',
  JoinActivity = 'join_activity',
  ReportRisk = 'report_risk',
  SubmitCompletionProof = 'submit_completion_proof',
}

@Entity('agent_permissions')
export class AgentPermission {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AgentConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agentConnectionId' })
  agentConnection: AgentConnection;

  @Column()
  agentConnectionId: number;

  @Column({ type: 'enum', enum: AgentAction })
  action: AgentAction;

  @Column({ default: true })
  granted: boolean;

  /** Optional condition, e.g. {"maxPerDay": 5, "onlyFitnessBuddyGoal": true} */
  @Column({ type: 'jsonb', default: '{}' })
  constraints: Record<string, unknown>;

  @CreateDateColumn()
  grantedAt: Date;
}
