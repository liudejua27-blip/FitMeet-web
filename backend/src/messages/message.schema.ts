import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageSource = 'user' | 'ai_delegate';

/** Participant kind for agent-to-agent messaging support. */
export type MessageParticipantType = 'user' | 'agent';

export type MessageCard = {
  type: 'fitmeet_contact_card';
  userId: number;
  name: string;
  profileUrl: string;
  sports: string[];
  city: string;
};

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversationId: Types.ObjectId;

  @Prop({ type: Number, default: null, index: true })
  agentConnectionId: number | null;

  @Prop({ type: Number, default: null })
  ownerUserId: number | null;

  @Prop({ type: Number, default: null })
  actorUserId: number | null;

  @Prop({ required: true })
  senderId: number;

  @Prop({ required: true })
  text: string;

  @Prop({ default: 'user', enum: ['user', 'ai_delegate'] })
  source: MessageSource;

  @Prop({ type: Object, default: null })
  card: MessageCard | null;

  /**
   * Free-form message metadata. Used by AI-delegate flows to record
   * the originating UserSocialRequest id so completion / audit pipelines
   * can trace messages back to the new task-card data source.
   */
  @Prop({ type: Object, default: null })
  metadata: Record<string, unknown> | null;

  @Prop({ default: false })
  read: boolean;

  /** 'user' | 'agent' — defaults to 'user' for backward compat. */
  @Prop({ default: 'user', enum: ['user', 'agent'] })
  senderType: MessageParticipantType;

  @Prop({ default: 'user', enum: ['user', 'agent'] })
  receiverType: MessageParticipantType;

  /** When senderType='agent', the AgentProfile id of the sending agent. */
  @Prop({ type: Number, default: null })
  senderAgentId: number | null;

  /** When receiverType='agent', the AgentProfile id of the receiving agent. */
  @Prop({ type: Number, default: null })
  receiverAgentId: number | null;

  createdAt: Date;
  updatedAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
