import { assistantRepositoryContract } from './assistant-repository.contract.js';
import { InMemoryAssistantRepository } from '../src/adapters/outbound/memory/assistant-repository.js';

assistantRepositoryContract(() => new InMemoryAssistantRepository());
