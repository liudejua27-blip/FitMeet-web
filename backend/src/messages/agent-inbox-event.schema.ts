import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AgentInboxEventType =
  | 'profile.match.recommended'
  | 'match.completed'
  | 'message.received'
  | 'message.created'
  | 'agent.reply.sent'
  | 'agent.inbox.updated';

@Schema({ timestamps: true })
export class AgentInboxEvent extends Document {
  @Prop({ required: true, index: true })
  agentConnectionId: number;

  @Prop({ required: true, index: true })
  ownerUserId: number;

  @Prop({ required: true, index: true })
  eventType: AgentInboxEventType | string;

  @Prop({ type: Types.ObjectId, ref: 'Conversation', default: null, index: true })
  conversationId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null, index: true })
  messageId: Types.ObjectId | null;

  @Prop({ type: Number, default: null, index: true })
  requestId: number | null;

  @Prop({ type: Number, default: null })
  candidateRecordId: number | null;

  @Prop({ type: Number, default: null })
  fromUserId: number | null;

  @Prop({ type: String, default: '' })
  contentPreview: string;

  @Prop({ type: Boolean, default: true, index: true })
  unread: boolean;

  @Prop({ type: String, required: true, unique: true })
  dedupeKey: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const AgentInboxEventSchema =
  SchemaFactory.createForClass(AgentInboxEvent);
