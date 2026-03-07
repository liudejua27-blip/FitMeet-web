import { IsString, Matches } from 'class-validator';

export class SendSmsDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入有效的中国手机号' })
  phone!: string;
}
