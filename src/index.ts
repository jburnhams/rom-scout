/**
 * A simple hello world library
 */

/**
 * Returns a greeting message
 * @param name - The name to greet (defaults to 'World')
 * @returns A greeting message
 */
export function hello(name: string = 'World'): string {
  return `Hello, ${name}!`;
}

/**
 * Returns a goodbye message
 * @param name - The name to say goodbye to (defaults to 'World')
 * @returns A goodbye message
 */
export function goodbye(name: string = 'World'): string {
  return `Goodbye, ${name}!`;
}

/**
 * A simple greeter class
 */
export class Greeter {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Greets with the configured name
   */
  greet(): string {
    return hello(this.name);
  }

  /**
   * Says goodbye with the configured name
   */
  farewell(): string {
    return goodbye(this.name);
  }
}
