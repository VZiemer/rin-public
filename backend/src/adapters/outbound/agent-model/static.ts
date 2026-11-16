import type {
  AgentModelGateway,
  ModelRequest,
  ModelResponse,
} from '../../../application/ports/model.js';
export class StaticAgentModelGateway implements AgentModelGateway {
  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (request.message === 'simulate:time' && !request.results.length)
      return {
        type: 'tool_call',
        call: { id: 'static-time', name: 'get_current_time', input: {} },
      };
    return {
      type: 'final',
      output: {
        message: request.results.length
          ? `Resultado: ${JSON.stringify(request.results[request.results.length - 1]?.output)}`
          : 'Estou pronta para ajudar. O modelo está em modo estático.',
        avatarState: 'NEUTRAL',
        priority: 'NORMAL',
        actions: [],
      },
    };
  }
}
