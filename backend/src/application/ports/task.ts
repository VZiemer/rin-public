import type { Task } from '../../domain/model/contracts.js';
export interface TaskRepository {
  get(userId: string, id: string): Promise<Task | null>;
  list(userId: string, limit?: number): Promise<Task[]>;
  create(task: Task): Promise<void>;
  update(task: Task, expectedStatus: Task['status']): Promise<boolean>;
}
