export interface Clock {
  now(): Date;
}
export interface IdGenerator {
  next(): string;
}
export interface RandomGenerator {
  /** Uniform float in [0, 1). */
  next(): number;
}
