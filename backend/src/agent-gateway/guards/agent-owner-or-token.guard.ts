import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AgentTokenGuard } from './agent-token.guard';

@Injectable()
export class AgentOwnerOrTokenGuard
  extends AuthGuard('jwt')
  implements CanActivate
{
  constructor(private readonly agentTokenGuard: AgentTokenGuard) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    if (req.headers['x-agent-token']) {
      return this.agentTokenGuard.canActivate(context);
    }

    try {
      const jwtResult = await super.canActivate(context);
      return jwtResult === true;
    } catch (jwtError) {
      try {
        return await this.agentTokenGuard.canActivate(context);
      } catch {
        throw jwtError;
      }
    }
  }
}
