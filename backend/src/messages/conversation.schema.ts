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
