import { readFileSync } from 'node:fs';
import path from 'node:path';

const gatewayDir = __dirname;

function readGatewayFile(fileName: string): string {
  return readFileSync(path.join(gatewayDir, fileName), 'utf8');
}

describe('Social Agent fallback source boundary', () => {
  it('keeps LLM answers source-aware before route turn services emit them', () => {
    const llmService = readGatewayFile('social-agent-chat-llm.service.ts');
    const routeConversation = readGatewayFile(
      'social-agent-route-conversation-turn.service.ts',
    );
    const profileEnrichment = readGatewayFile(
      'social-agent-profile-enrichment.service.ts',
    );

    expect(llmService).toContain('generateConversationalAnswerWithSource');
    expect(llmService).toContain('generateAgentBrainReplyWithSource');
    expect(llmService).toContain("source: 'fallback'");
    expect(llmService).toContain("source: 'llm'");
    expect(llmService).toContain('socialAgentAnswerSource');
    expect(llmService).toContain('socialAgentAnswerSource(');
    expect(routeConversation).toContain(
      'generateConversationalAnswerWithSource',
    );
    expect(routeConversation).toContain('assistantMessageSource');
    expect(profileEnrichment).toContain('generateAgentBrainReplyWithSource');
    expect(profileEnrichment).toContain('assistantMessageSource');
  });

  it('does not stream fallback text as an LLM assistant response', () => {
    const controller = readGatewayFile('social-agent-chat.controller.ts');
    const streamingResponse = readGatewayFile(
      'social-agent-streaming-response.service.ts',
    );
    const sanitizer = readGatewayFile(
      'response-quality/user-facing-response-sanitizer.service.ts',
    );
    const routeCompletion = readGatewayFile(
      'social-agent-route-completion.service.ts',
    );

    expect(controller).toContain('writeFallbackAssistantText');
    expect(controller).toContain("source: 'fallback'");
    expect(controller).toContain("assistantMessageSource: 'fallback'");
    expect(controller).toContain("assistantMessageSource: 'llm'");
    expect(streamingResponse).toContain("source: 'fallback'");
    expect(streamingResponse).toContain("useCase: 'fallback_stream'");
    expect(sanitizer).toContain('readAssistantMessageSource');
    expect(routeCompletion).toContain('assistantMessageSource');
  });

  it('does not duplicate fallback stream chunks through SocialAgentEventV2 assistant.delta', () => {
    const controller = readGatewayFile('social-agent-chat.controller.ts');
    const helperStart = controller.indexOf('private async writeFallbackAssistantText');
    expect(helperStart).toBeGreaterThan(-1);
    const helperEnd = controller.indexOf(
      'private async writeLlmAssistantTextForResult',
      helperStart,
    );
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helperBody = controller.slice(helperStart, helperEnd);

    expect(helperBody).not.toContain('writeAssistantDelta');
    expect(helperBody).toContain("source: 'fallback'");
  });

  it('centralizes SocialAgentEventV2 assistant deltas and skips fallback chunks', () => {
    const controller = readGatewayFile('social-agent-chat.controller.ts');
    const helperStart = controller.indexOf(
      'private async writeSocialCodexAssistantDelta',
    );
    expect(helperStart).toBeGreaterThan(-1);
    const helperEnd = controller.indexOf(
      'private async hydrateFinalResponseContext',
      helperStart,
    );
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helperBody = controller.slice(helperStart, helperEnd);

    expect(helperBody).toContain("input.source === 'fallback'");
    expect(helperBody).toContain("'llm'");
    expect(
      [...controller.matchAll(/\.writeAssistantDelta\(/g)].length,
    ).toBe(1);
  });
});
