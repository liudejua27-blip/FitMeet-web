import * as fs from 'fs';
import * as path from 'path';

const controllerPath = path.resolve(
  __dirname,
  'social-agent-chat.controller.ts',
);

function readSource() {
  return fs.readFileSync(controllerPath, 'utf8');
}

function readMethodBody(source: string, methodName: string): string {
  const patterns = [
    `\n  async ${methodName}(`,
    `\n  private async ${methodName}(`,
    `\n  private ${methodName}(`,
    `\n  ${methodName}(`,
  ];
  const methodStart = patterns.reduce((found, pattern) => {
    if (found >= 0) return found;
    return source.indexOf(pattern);
  }, -1);
  expect(methodStart).toBeGreaterThanOrEqual(0);
  const parameterStart = source.indexOf('(', methodStart);
  expect(parameterStart).toBeGreaterThan(methodStart);
  let parenDepth = 0;
  let parameterEnd = -1;
  for (let index = parameterStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        parameterEnd = index;
        break;
      }
    }
  }
  expect(parameterEnd).toBeGreaterThan(parameterStart);
  const openBrace = source.indexOf('{', parameterEnd);
  expect(openBrace).toBeGreaterThan(parameterEnd);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace + 1, index);
    }
  }
  throw new Error(`Could not read method body for ${methodName}`);
}

describe('Social Agent stream entry context boundary', () => {
  const source = readSource();

  it('routes every user message stream entry through the unified user-facing stream path', () => {
    const routeMessageStream = readMethodBody(source, 'routeMessageStream');
    const handleMessageStream = readMethodBody(source, 'handleMessageStream');
    const handleTaskMessageStream = readMethodBody(
      source,
      'handleTaskMessageStream',
    );

    expect(routeMessageStream).toContain(
      'return this.streamUserFacingMessage(req, body ?? {}, res);',
    );
    expect(handleMessageStream).toContain(
      'return this.streamUserFacingMessage(req, body ?? {}, res);',
    );
    expect(handleTaskMessageStream).toContain(
      'return this.streamUserFacingMessage(',
    );
    expect(handleTaskMessageStream).toContain('taskId: id');
    expect(handleTaskMessageStream).not.toContain('this.chat.handleMessage');
    expect(handleTaskMessageStream).not.toContain(
      'this.chat.handleMessageStream',
    );
  });

  it('keeps the unified message stream on visible trace, context hydration, and LLM final response', () => {
    const streamUserFacingMessage = readMethodBody(
      source,
      'streamUserFacingMessage',
    );

    expect(streamUserFacingMessage).toContain(
      'socialCodexEvents.writeRunStarted',
    );
    expect(streamUserFacingMessage).toContain(
      'socialCodexEvents.writeHydrateContext',
    );
    expect(streamUserFacingMessage).toContain(
      'socialCodexEvents.writeEarlySlotInferenceEvents',
    );
    expect(streamUserFacingMessage).toContain(
      'socialCodexEvents.writeProfileGateIfNeeded',
    );
    expect(streamUserFacingMessage).toContain('this.chat.handleMessageStream');
    expect(streamUserFacingMessage).toContain(
      'this.writeLlmAssistantTextForResult',
    );
    expect(streamUserFacingMessage).toContain('body.clientContext?.threadId');
    expect(streamUserFacingMessage).toContain('result.taskId ?? body.taskId');
  });

  it('hydrates final DeepSeek replies with task memory, Life Graph, approvals, and candidate actions', () => {
    const writeLlmAssistantTextForResult = readMethodBody(
      source,
      'writeLlmAssistantTextForResult',
    );
    const tryWriteLlmAssistantText = readMethodBody(
      source,
      'tryWriteLlmAssistantText',
    );
    const hydrateFinalResponseContext = readMethodBody(
      source,
      'hydrateFinalResponseContext',
    );

    expect(writeLlmAssistantTextForResult).toContain(
      'await this.hydrateFinalResponseContext',
    );
    expect(tryWriteLlmAssistantText).toContain('conversationHistory');
    expect(tryWriteLlmAssistantText).toContain('memoryContext');
    expect(tryWriteLlmAssistantText).toContain('taskContext');
    expect(tryWriteLlmAssistantText).toContain('signal: input.signal');
    expect(tryWriteLlmAssistantText).toContain('onDelta');

    expect(hydrateFinalResponseContext).toContain('this.contextHydrator');
    expect(hydrateFinalResponseContext).toContain('hydrated.taskMemory');
    expect(hydrateFinalResponseContext).toContain('hydrated.taskSlots');
    expect(hydrateFinalResponseContext).toContain('hydrated.lifeGraphSummary');
    expect(hydrateFinalResponseContext).toContain('hydrated.pendingApprovals');
    expect(hydrateFinalResponseContext).toContain('hydrated.candidateActions');
  });
});
