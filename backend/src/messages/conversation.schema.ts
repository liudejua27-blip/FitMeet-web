import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Conversation extends Document {
  @Prop({
    type: String,
    default: null,
    unique: true,
    sparse: true,
    index: true,
  })
  directKey: string | null;

  @Prop({ required: true })
  participantIds: number[];

  @Prop({ type: [Number], default: [] })
  participantAgentIds: number[];

  @Prop({ type: Number, default: null, index: true })
  agentConnectionId: number | null;

  @Prop({ type: Number, default: null })
  ownerUserId: number | null;

  @Prop({ type: Number, default: null })
  actorUserId: number | null;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: 'direct', index: true })
  source: string;

  @Prop({ default: 'open', enum: ['open', 'pending', 'archived', 'blocked'] })
  status: 'open' | 'pending' | 'archived' | 'blocked';

  @Prop({ type: [String], default: [], index: true })
  labels: string[];

  @Prop({ type: String, default: null, index: true })
  relatedPublicIntentId: string | null;

  @Prop({ type: Number, default: null, index: true })
  relatedSocialRequestId: number | null;

  @Prop({ type: Number, default: null, index: true })
  relatedCandidateId: number | null;

  @Prop({ type: Date, default: null })
  lastActionAt: Date | null;

  @Prop({ default: '' })
  lastMessage: string;

  @Prop()
  lastMessageTime: Date;

  @Prop({ type: Object, default: {} })
  unreadCount: Record<string, number>; // { "userId": count }

  @Prop({ type: Object, default: {} })
  unreadAgentCount: Record<string, number>; // { "agentProfileId": count }
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ participantIds: 1, lastMessageTime: -1 });
ConversationSchema.index({ agentConnectionId: 1, lastMessageTime: -1 });
ConversationSchema.index({ participantAgentIds: 1, lastMessageTime: -1 });
ConversationSchema.index({ ownerUserId: 1, lastMessageTime: -1 });
ConversationSchema.index({ source: 1, status: 1, lastMessageTime: -1 });
ConversationSchema.index({ relatedPublicIntentId: 1, lastMessageTime: -1 });
ConversationSchema.index({ relatedSocialRequestId: 1, lastMessageTime: -1 });
