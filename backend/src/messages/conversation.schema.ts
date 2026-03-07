import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Conversation extends Document {
  @Prop({ required: true })
  participantIds: number[];

  @Prop({ default: '' })
  lastMessage: string;

  @Prop()
  lastMessageTime: Date;

  @Prop({ type: Object, default: {} })
  unreadCount: Record<string, number>; // { "userId": count }
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
