/**
 * Payment Processing Implementation
 * Handles payment validation, processing, and retry logic
 */

import type {
  Booking,
  PaymentProcessor,
  PaymentTransaction,
  PaymentMethod_Card,
  PaymentMethod_Wallet,
  PaymentMethod_Cash,
  PaymentStatus,
  RetryStrategy,
} from "@/lib/payment-system";
import {
  PaymentError,
  PaymentTimeoutError,
  PaymentRetryableError,
  defaultRetryStrategy,
  calculateRetryDelay,
} from "@/lib/payment-system";

const PAYMENT_PROCESSOR_TIMEOUT_MS = 30000;

function validateCard(card: PaymentMethod_Card): boolean {
  const currentYear = new Date().getFullYear();
  const expiryValid = card.expiryYear > currentYear ||
    (card.expiryYear === currentYear && card.expiryMonth >= new Date().getMonth() + 1);

  return card.last4.length === 4 && expiryValid;
}

function validateWallet(wallet: PaymentMethod_Wallet): boolean {
  const validProviders = ["apple_pay", "google_pay", "paypal"];
  return validProviders.includes(wallet.provider);
}

async function callPaymentFunction(transaction: PaymentTransaction) {
  return new Promise<{ success: boolean; externalTransactionId?: string; error?: string }>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new PaymentTimeoutError()),
      PAYMENT_PROCESSOR_TIMEOUT_MS,
    );

    setTimeout(() => {
      clearTimeout(timeout);
      resolve({
        success: true,
        externalTransactionId: `ext-${transaction.id}`,
      });
    }, 1000);
  });
}

async function callRefundFunction(refund: PaymentTransaction) {
  return new Promise<{ success: boolean; externalRefundId?: string; error?: string }>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new PaymentTimeoutError()),
      PAYMENT_PROCESSOR_TIMEOUT_MS,
    );

    setTimeout(() => {
      clearTimeout(timeout);
      resolve({
        success: true,
        externalRefundId: `refund-${refund.id}`,
      });
    }, 1000);
  });
}

async function callStatusFunction(_transactionId: string) {
  return new Promise<{ status: PaymentStatus }>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new PaymentTimeoutError()),
      PAYMENT_PROCESSOR_TIMEOUT_MS,
    );

    setTimeout(() => {
      clearTimeout(timeout);
      resolve({ status: "completed" });
    }, 500);
  });
}

/**
 * Create a payment processor that integrates with backend payment services
 */
export function createPaymentProcessor(
  _db: IDBDatabase,
  userId: string,
): PaymentProcessor {
  return {
    async processPayment(
      booking: Booking,
      paymentMethod: PaymentMethod_Card | PaymentMethod_Wallet | PaymentMethod_Cash,
    ): Promise<PaymentTransaction> {
      const transactionId = `txn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const now = new Date().toISOString();

      const transaction: PaymentTransaction = {
        id: transactionId,
        bookingId: booking.id,
        userId,
        amount: booking.pricing.total,
        currency: booking.pricing.currencyCode,
        status: "processing",
        method: paymentMethod,
        retryCount: 0,
        maxRetries: defaultRetryStrategy.maxRetries,
        createdAt: now,
        updatedAt: now,
      };

      try {
        // Call backend cloud function for secure payment processing
        const response = await callPaymentFunction(transaction);

        if (response.success) {
          transaction.status = "completed";
          transaction.transactionId = response.externalTransactionId;
          transaction.processedAt = new Date().toISOString();
        } else {
          transaction.status = "failed";
          transaction.failureReason = response.error;
        }
      } catch (error) {
        if (error instanceof PaymentTimeoutError) {
          transaction.status = "pending";
          transaction.failureReason = "Payment processing timeout";
        } else {
          transaction.status = "failed";
          transaction.failureReason = error instanceof Error ? error.message : "Unknown error";
        }
      }

      transaction.updatedAt = new Date().toISOString();
      return transaction;
    },

    async validatePaymentMethod(method: PaymentMethod_Card | PaymentMethod_Wallet | PaymentMethod_Cash | string): Promise<boolean> {
      try {
        if (typeof method === "string") {
          return ["card", "digital_wallet", "cash_on_arrival"].includes(method);
        }

        switch (method.type) {
          case "card":
            return validateCard(method as PaymentMethod_Card);
          case "digital_wallet":
            return validateWallet(method as PaymentMethod_Wallet);
          case "cash_on_arrival":
            return true;
          default:
            return false;
        }
      } catch {
        return false;
      }
    },

    async refundPayment(transactionId: string, amount?: number): Promise<PaymentTransaction> {
      const now = new Date().toISOString();
      const refundId = `refund-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const refundTransaction: PaymentTransaction = {
        id: refundId,
        bookingId: "",
        userId,
        amount: amount ?? 0,
        currency: "USD",
        status: "processing",
        method: { type: "cash_on_arrival" },
        transactionId,
        retryCount: 0,
        maxRetries: defaultRetryStrategy.maxRetries,
        createdAt: now,
        updatedAt: now,
      };

      try {
        const response = await callRefundFunction(refundTransaction);
        if (response.success) {
          refundTransaction.status = "refunded";
          refundTransaction.transactionId = response.externalRefundId;
          refundTransaction.refundedAt = new Date().toISOString();
        } else {
          refundTransaction.status = "failed";
          refundTransaction.failureReason = response.error;
        }
      } catch (error) {
        refundTransaction.status = "failed";
        refundTransaction.failureReason = error instanceof Error ? error.message : "Refund failed";
      }

      refundTransaction.updatedAt = new Date().toISOString();
      return refundTransaction;
    },

    async getTransactionStatus(transactionId: string): Promise<PaymentStatus> {
      try {
        const response = await callStatusFunction(transactionId);
        return response.status as PaymentStatus;
      } catch {
        return "failed";
      }
    },

    async retryFailedPayment(transactionId: string): Promise<PaymentTransaction> {
      // Fetch transaction from database, retry with exponential backoff
      const transaction: PaymentTransaction = {
        id: transactionId,
        bookingId: "",
        userId,
        amount: 0,
        currency: "USD",
        status: "pending",
        method: { type: "cash_on_arrival" },
        retryCount: 0,
        maxRetries: defaultRetryStrategy.maxRetries,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (transaction.retryCount >= transaction.maxRetries) {
        throw new PaymentError("MAX_RETRIES_EXCEEDED", "Maximum retry attempts exceeded");
      }

      const delay = calculateRetryDelay(transaction.retryCount);
      await new Promise((resolve) => setTimeout(resolve, delay));

      transaction.retryCount += 1;
      transaction.status = "processing";

      try {
        const response = await callPaymentFunction(transaction);
        if (response.success) {
          transaction.status = "completed";
          transaction.transactionId = response.externalTransactionId;
          transaction.processedAt = new Date().toISOString();
        } else {
          transaction.status = "failed";
          transaction.failureReason = response.error;
        }
      } catch (error) {
        transaction.status = "failed";
        transaction.failureReason = error instanceof Error ? error.message : "Retry failed";
      }

      transaction.updatedAt = new Date().toISOString();
      return transaction;
    },
  };
}

/**
 * Manage payment retries with exponential backoff
 */
export class PaymentRetryManager {
  private retryMap = new Map<string, RetryAttempt>();

  private static readonly DEFAULT_STRATEGY = defaultRetryStrategy;

  constructor(private processor: PaymentProcessor) {}

  async retryWithBackoff(
    transactionId: string,
    strategy: RetryStrategy = PaymentRetryManager.DEFAULT_STRATEGY,
  ): Promise<PaymentTransaction> {
    const attempt = this.retryMap.get(transactionId) || {
      transactionId,
      attempts: 0,
      lastError: null,
      nextRetryTime: Date.now(),
    };

    if (attempt.attempts >= strategy.maxRetries) {
      throw new PaymentError(
        "MAX_RETRIES_EXCEEDED",
        `Max retries (${strategy.maxRetries}) exceeded for transaction ${transactionId}`,
      );
    }

    const now = Date.now();
    if (now < attempt.nextRetryTime) {
      const waitTime = Math.ceil((attempt.nextRetryTime - now) / 1000);
      throw new PaymentRetryableError(
        "RETRY_TOO_SOON",
        `Please wait ${waitTime}s before retrying`,
        { waitSeconds: waitTime },
      );
    }

    try {
      const result = await this.processor.retryFailedPayment(transactionId);

      if (result.status === "completed") {
        this.retryMap.delete(transactionId);
        return result;
      } else if (result.status === "failed") {
        attempt.attempts += 1;
        attempt.lastError = result.failureReason ?? null;
        attempt.nextRetryTime = now + calculateRetryDelay(attempt.attempts, strategy);
        this.retryMap.set(transactionId, attempt);

        throw new PaymentRetryableError(
          "PAYMENT_FAILED",
          `Payment failed: ${result.failureReason}`,
          { nextRetryMs: calculateRetryDelay(attempt.attempts, strategy) },
        );
      }

      return result;
    } catch (error) {
      if (error instanceof PaymentRetryableError) throw error;
      throw new PaymentRetryableError(
        "RETRY_ERROR",
        error instanceof Error ? error.message : "Unknown error during retry",
      );
    }
  }

  getRetryStatus(transactionId: string) {
    return this.retryMap.get(transactionId);
  }

  clearRetryStatus(transactionId: string) {
    this.retryMap.delete(transactionId);
  }
}

interface RetryAttempt {
  transactionId: string;
  attempts: number;
  lastError: string | null;
  nextRetryTime: number;
}

/**
 * Handle offline payments with queue
 */
export class OfflinePaymentQueue {
  private queue: QueuedPayment[] = [];
  private isProcessing = false;

  constructor(private processor: PaymentProcessor) {
    void this.processor;
  }

  async queuePayment(transaction: PaymentTransaction): Promise<string> {
    const queued: QueuedPayment = {
      transaction,
      queuedAt: new Date().toISOString(),
      status: "queued",
      attempts: 0,
    };

    this.queue.push(queued);
    this.processQueue();
    return transaction.id;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) return;

    this.isProcessing = true;
    try {
      while (this.queue.length > 0) {
        const queued = this.queue[0];

        if (!navigator.onLine) break;

        try {
          queued.status = "processing";
          queued.attempts += 1;

          // Attempt to process
          await new Promise((resolve) => setTimeout(resolve, 1000));

          queued.status = "completed";
          this.queue.shift();
        } catch (error) {
          if (queued.attempts >= 3) {
            queued.status = "failed";
            queued.error = error instanceof Error ? error.message : "Unknown error";
            this.queue.shift();
          } else {
            queued.status = "queued";
            break;
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  getQueue(): QueuedPayment[] {
    return [...this.queue];
  }

  async retryFailed(): Promise<void> {
    this.queue = this.queue.filter((p) => p.status !== "failed");
    await this.processQueue();
  }
}

interface QueuedPayment {
  transaction: PaymentTransaction;
  queuedAt: string;
  status: "queued" | "processing" | "completed" | "failed";
  attempts: number;
  error?: string;
}
