import { describe, it } from 'node:test';
import assert from 'node:assert';
import { hello, goodbye, Greeter } from './index.js';

describe('hello function', () => {
  it('should return default greeting', () => {
    const result = hello();
    assert.strictEqual(result, 'Hello, World!');
  });

  it('should greet a specific person', () => {
    const result = hello('Alice');
    assert.strictEqual(result, 'Hello, Alice!');
  });
});

describe('goodbye function', () => {
  it('should return default goodbye', () => {
    const result = goodbye();
    assert.strictEqual(result, 'Goodbye, World!');
  });

  it('should say goodbye to a specific person', () => {
    const result = goodbye('Bob');
    assert.strictEqual(result, 'Goodbye, Bob!');
  });
});

describe('Greeter class', () => {
  it('should greet with the configured name', () => {
    const greeter = new Greeter('Charlie');
    const result = greeter.greet();
    assert.strictEqual(result, 'Hello, Charlie!');
  });

  it('should say farewell with the configured name', () => {
    const greeter = new Greeter('Diana');
    const result = greeter.farewell();
    assert.strictEqual(result, 'Goodbye, Diana!');
  });

  it('should handle multiple instances independently', () => {
    const greeter1 = new Greeter('Eve');
    const greeter2 = new Greeter('Frank');

    assert.strictEqual(greeter1.greet(), 'Hello, Eve!');
    assert.strictEqual(greeter2.greet(), 'Hello, Frank!');
  });
});
