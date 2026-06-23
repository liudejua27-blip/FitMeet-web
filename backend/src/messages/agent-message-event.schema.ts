import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AgentMessageEventType =
  | 'profile.match.recommended'
  | 'social_request.match.recommended'
  | 'match.completed'
  | 'message.received'
  | 'message.created'
  | 'agent.reply.sent'
  | 'agent.message.updated'
  | 'contact.request.received'
  | 'contact.request.accepted'
  | 'contact.request.declined';

@Schema({ timestamps: true })
export class AgentMessageEvent extends Document {
  @Prop({ required: true, index: true })
  agentConnectionId: number;

  @Prop({ required: true, index: true })
  ownerUserId: number;

  @Prop({ required: true, index: true })
  eventType: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    default: null,
    index: true,
  })
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

export const AgentMessageEventSchema =
  SchemaFactory.createForClass(AgentMessageEvent);

AgentMessageEventSchema.index({
  agentConnectionId: 1,
  unread: 1,
  eventType: 1,
  createdAt: -1,
});
AgentMessageEventSchema.index({
  ownerUserId: 1,
  unread: 1,
  eventType: 1,
  createdAt: -1,
});
