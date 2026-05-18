/**
 * Realtime Reducer — pure function for safely applying realtime payloads to state.
 *
 * Validates incoming realtime payloads via Zod before merging into state.
 * If validation fails, state is returned unchanged and logger.error is called once.
 * If logger itself throws, the function still returns state unchanged without throwing,
 * prioritizing system stability over error logging (Req 10.7).
 *
 * Property 10: Realtime payload safety
 * Validates: Requirements 10.7
 */

import { z } from 'zod';

// ─── Logger Interface ────────────────────────────────────────────────────────

/**
 * Injected logger interface. Only .error is required for this module.
 */
export interface RealtimeLogger {
  error(message: string, context?: unknown): void;
}

// ─── Payload Schemas ─────────────────────────────────────────────────────────

/**
 * Realtime payload for new/updated transactions.
 */
export const RealtimeTransactionPayloadSchema = z.object({
  type: z.literal('transaction'),
  transactionId: z.string().uuid(),
  outletId: z.string().uuid(),
  status: z.enum([
    'pending',
    'confirmed',
    'cancelled',
    'refunded',
    'pending_reconciliation',
    'pending_sync',
    'conflict_review',
  ]),
  total: z.number().int().min(0),
  createdAt: z.string(),
});

export type RealtimeTransactionPayload = z.infer<typeof RealtimeTransactionPayloadSchema>;

/**
 * Realtime payload for stock changes.
 */
export const RealtimeStockPayloadSchema = z.object({
  type: z.literal('stock'),
  rawMaterialId: z.string().uuid(),
  outletId: z.string().uuid(),
  quantity: z.number().min(0).max(999_999.99),
  updatedAt: z.string(),
});

export type RealtimeStockPayload = z.infer<typeof RealtimeStockPayloadSchema>;

/**
 * Realtime payload for menu item changes.
 */
export const RealtimeMenuPayloadSchema = z.object({
  type: z.literal('menu'),
  menuItemId: z.string().uuid(),
  outletId: z.string().uuid(),
  price: z.number().int().min(0).max(10_000_000),
  active: z.boolean(),
});

export type RealtimeMenuPayload = z.infer<typeof RealtimeMenuPayloadSchema>;

// ─── Core Function ───────────────────────────────────────────────────────────

/**
 * Safely handle a realtime payload by validating it against the provided Zod schema.
 *
 * Behavior:
 * - If payload passes validation → state is returned unchanged (caller merges validated data)
 * - If payload fails validation → state is returned unchanged, logger.error called exactly once
 * - If logger.error throws → still returns state unchanged without throwing (Req 10.7)
 *
 * This function guarantees:
 * 1. It NEVER throws, regardless of payload content or logger behavior
 * 2. Invalid payloads NEVER modify state
 * 3. logger.error is called exactly once for invalid payloads
 * 4. System stability is prioritized over error logging
 *
 * @param state - Current state (generic, always returned unchanged on invalid payload)
 * @param payload - Raw realtime payload (unknown shape)
 * @param schema - Zod schema to validate against
 * @param logger - Injected logger with .error method
 * @returns The original state unchanged if validation fails; state unchanged if valid
 *          (validated data is available via schema.safeParse for the caller to merge)
 */
export function handlePayload<TState>(
  state: TState,
  payload: unknown,
  schema: z.ZodType,
  logger: RealtimeLogger,
): TState {
  const result = schema.safeParse(payload);

  if (!result.success) {
    try {
      logger.error('Invalid realtime payload received', {
        errors: result.error.issues,
        payload,
      });
    } catch {
      // Logger failure is swallowed — system stability over error logging (Req 10.7)
    }
    return state;
  }

  // Payload is valid — return state unchanged.
  // The realtime channel manager is responsible for extracting validated data
  // and applying domain-specific state transitions outside this function.
  return state;
}
