import { IsString } from 'class-validator';

export class WechatLoginDto {
  @IsString()
  code: string;
}
