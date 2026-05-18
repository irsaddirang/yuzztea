import { describe, it, expect, vi } from 'vitest';

import {
  handlePayload,
  RealtimeTransactionPayloadSchema,
  RealtimeStockPayloadSchema,
  RealtimeMenuPayloadSchema,
  type RealtimeLogger,
} from '../realtimeReducer';

describe('realtimeReducer - handlePayload', () => {
  const createLogger = (): RealtimeLogger & { errorCalls: unknown[][] } => {
    const errorCalls: unknown[][] = [];
    return {
      errorCalls,
      error(...args: unknown[]) {
        errorCalls.push(args);
      },
    };
  };

  const createThrowingLogger = (): RealtimeLogger => ({
    error() {
      throw new Error('Logger crashed!');
    },
  });

  const initialState = { transactions: [], stock: {}, menu: [] };

  describe('invalid payload handling', () => {
    it('returns state unchanged for completely invalid payload', () => {
      const logger = createLogger();
      const result = handlePayload(
        initialState,
        'garbage',
        RealtimeTransactionPayloadSchema,
        logger,
      );

      expect(result).toBe(initialState);
    });

    it('returns state unchanged for null payload', () => {
      const logger = createLogger();
      const result = handlePayload(initialState, null, RealtimeTransactionPayloadSchema, logger);

      expect(result).toBe(initialState);
    });

    it('returns state unchanged for undefined payload', () => {
      const logger = createLogger();
      const result = handlePayload(initialState, undefined, RealtimeStockPayloadSchema, logger);

      expect(result).toBe(initialState);
    });

    it('returns state unchanged for payload missing required fields', () => {
      const logger = createLogger();
      const incompletePayload = { type: 'transaction', transactionId: 'not-a-uuid' };
      const result = handlePayload(
        initialState,
        incompletePayload,
        RealtimeTransactionPayloadSchema,
        logger,
      );

      expect(result).toBe(initialState);
    });

    it('returns state unchanged for payload with wrong type literal', () => {
      const logger = createLogger();
      const wrongType = {
        type: 'wrong',
        rawMaterialId: '550e8400-e29b-41d4-a716-446655440000',
        outletId: '550e8400-e29b-41d4-a716-446655440001',
        quantity: 100,
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const result = handlePayload(initialState, wrongType, RealtimeStockPayloadSchema, logger);

      expect(result).toBe(initialState);
    });

    it('calls logger.error exactly once for invalid payload', () => {
      const logger = createLogger();
      handlePayload(initialState, { bad: true }, RealtimeMenuPayloadSchema, logger);

      expect(logger.errorCalls).toHaveLength(1);
    });

    it('logger.error receives descriptive message and context', () => {
      const logger = createLogger();
      const badPayload = { type: 'menu', menuItemId: 'invalid' };
      handlePayload(initialState, badPayload, RealtimeMenuPayloadSchema, logger);

      expect(logger.errorCalls[0][0]).toBe('Invalid realtime payload received');
      expect(logger.errorCalls[0][1]).toHaveProperty('errors');
      expect(logger.errorCalls[0][1]).toHaveProperty('payload', badPayload);
    });
  });

  describe('logger failure resilience (Req 10.7)', () => {
    it('returns state unchanged when logger.error throws', () => {
      const throwingLogger = createThrowingLogger();
      const result = handlePayload(
        initialState,
        'invalid',
        RealtimeTransactionPayloadSchema,
        throwingLogger,
      );

      expect(result).toBe(initialState);
    });

    it('does NOT throw when logger.error throws', () => {
      const throwingLogger = createThrowingLogger();

      expect(() => {
        handlePayload(initialState, null, RealtimeStockPayloadSchema, throwingLogger);
      }).not.toThrow();
    });

    it('does NOT throw when logger.error throws with complex invalid payload', () => {
      const throwingLogger = createThrowingLogger();
      const complexInvalid = { type: 'stock', quantity: -1, extra: Symbol('bad') };

      expect(() => {
        handlePayload(initialState, complexInvalid, RealtimeStockPayloadSchema, throwingLogger);
      }).not.toThrow();
    });
  });

  describe('valid payload handling', () => {
    it('returns state unchanged for valid transaction payload', () => {
      const logger = createLogger();
      const validPayload = {
        type: 'transaction',
        transactionId: '550e8400-e29b-41d4-a716-446655440000',
        outletId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'confirmed',
        total: 50000,
        createdAt: '2024-01-15T10:30:00+07:00',
      };

      const result = handlePayload(
        initialState,
        validPayload,
        RealtimeTransactionPayloadSchema,
        logger,
      );

      expect(result).toBe(initialState);
      expect(logger.errorCalls).toHaveLength(0);
    });

    it('returns state unchanged for valid stock payload', () => {
      const logger = createLogger();
      const validPayload = {
        type: 'stock',
        rawMaterialId: '550e8400-e29b-41d4-a716-446655440000',
        outletId: '550e8400-e29b-41d4-a716-446655440001',
        quantity: 500.5,
        updatedAt: '2024-01-15T10:30:00+07:00',
      };

      const result = handlePayload(initialState, validPayload, RealtimeStockPayloadSchema, logger);

      expect(result).toBe(initialState);
      expect(logger.errorCalls).toHaveLength(0);
    });

    it('returns state unchanged for valid menu payload', () => {
      const logger = createLogger();
      const validPayload = {
        type: 'menu',
        menuItemId: '550e8400-e29b-41d4-a716-446655440000',
        outletId: '550e8400-e29b-41d4-a716-446655440001',
        price: 15000,
        active: true,
      };

      const result = handlePayload(initialState, validPayload, RealtimeMenuPayloadSchema, logger);

      expect(result).toBe(initialState);
      expect(logger.errorCalls).toHaveLength(0);
    });

    it('does not call logger.error for valid payloads', () => {
      const logger = createLogger();
      const validPayload = {
        type: 'transaction',
        transactionId: '550e8400-e29b-41d4-a716-446655440000',
        outletId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'pending',
        total: 0,
        createdAt: '2024-06-01T00:00:00Z',
      };

      handlePayload(initialState, validPayload, RealtimeTransactionPayloadSchema, logger);

      expect(logger.errorCalls).toHaveLength(0);
    });
  });

  describe('state identity preservation', () => {
    it('returns the exact same reference (===) for invalid payload', () => {
      const logger = createLogger();
      const state = Object.freeze({ data: [1, 2, 3] });
      const result = handlePayload(state, undefined, RealtimeMenuPayloadSchema, logger);

      expect(result).toBe(state);
    });

    it('returns the exact same reference (===) for valid payload', () => {
      const logger = createLogger();
      const state = Object.freeze({ data: [1, 2, 3] });
      const validPayload = {
        type: 'menu',
        menuItemId: '550e8400-e29b-41d4-a716-446655440000',
        outletId: '550e8400-e29b-41d4-a716-446655440001',
        price: 25000,
        active: false,
      };

      const result = handlePayload(state, validPayload, RealtimeMenuPayloadSchema, logger);

      expect(result).toBe(state);
    });
  });
});
