import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Notification extends Document {
  /** Recipient user id */
  @Prop({ required: true })
  userId!: number;

  /** 'like' | 'comment' | 'follow' | 'meet' | 'system' */
  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  text!: string;

  /** The user who triggered the notification */
  @Prop({ default: 0 })
  fromUserId!: number;

  @Prop({ default: '系统' })
  fromUsername!: string;

  @Prop({ default: 'S' })
  fromAvatar!: string;

  @Prop({ default: '#38BDF8' })
  fromColor!: string;

  @Prop({ default: false })
  read!: boolean;

  @Prop()
  targetId!: number;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
