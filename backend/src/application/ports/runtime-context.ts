export interface RuntimeContext {
  currentTime: string;
  timezone: string;
}
export interface RuntimeContextProvider {
  get(userId: string): Promise<RuntimeContext>;
}
