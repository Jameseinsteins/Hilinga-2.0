/**
 * Arrival State Machine
 *
 * Manages the state transitions during trip navigation and stop tracking.
 * Handles auto-advance logic, manual overrides, and edge cases like lingering.
 */

export type ArrivalState =
  | "IDLE"
  | "APPROACHING"
  | "IN_GEOFENCE"
  | "ARRIVED"
  | "COMPLETED"
  | "LINGERING";

export type ArrivalEvent =
  | "START_TRACKING"
  | "STOP_TRACKING"
  | "ENTER_GEOFENCE"
  | "EXIT_GEOFENCE"
  | "CONFIRM_ARRIVAL"
  | "PROCEED_TO_NEXT"
  | "MANUAL_OVERRIDE"
  | "SKIP_STOP"
  | "LINGER_TIMEOUT"
  | "PAYMENT_COMPLETED"
  | "PAYMENT_FAILED";

export type ArrivalContext = {
  tripId: string;
  currentStopId: string;
  currentStopIndex: number;
  totalStops: number;
  targetLatitude: number;
  targetLongitude: number;
  currentDistance: number;
  confidence: number; // 0-1
  geofenceRadius: number;
  autoAdvanceEnabled: boolean;
  paymentRequired: boolean;
  paymentCompleted: boolean;
  enteredGeofenceAt: number; // timestamp
  lingeringStartedAt: number | null; // timestamp
};

export type StateTransition = {
  from: ArrivalState;
  to: ArrivalState;
  event: ArrivalEvent;
  timestamp: string;
  distance?: number;
  reason?: string;
};

export const LINGER_TIMEOUT_MS = 30000; // 30 seconds before resetting LINGERING state
const ARRIVAL_CONFIRMATION_TIME_MS = 5000; // 5 second window for confirmed arrival

/**
 * Arrival State Machine
 *
 * Handles all state transitions and validation logic
 */
export class ArrivalStateMachine {
  private state: ArrivalState = "IDLE";
  private context: ArrivalContext | null = null;
  private transitionHistory: StateTransition[] = [];
  private stateChangeCallbacks: Map<ArrivalState, () => void> = new Map();
  private lingeringTimer: NodeJS.Timeout | null = null;
  private confirmationTimeout: NodeJS.Timeout | null = null;

  /**
   * Get current state
   */
  getState(): ArrivalState {
    return this.state;
  }

  /**
   * Get current context
   */
  getContext(): ArrivalContext | null {
    return this.context ? { ...this.context } : null;
  }

  /**
   * Register callback for state changes
   */
  onStateChange(state: ArrivalState, callback: () => void): () => void {
    if (!this.stateChangeCallbacks.has(state)) {
      this.stateChangeCallbacks.set(state, callback);
    }

    return () => {
      if (this.stateChangeCallbacks.get(state) === callback) {
        this.stateChangeCallbacks.delete(state);
      }
    };
  }

  /**
   * Handle incoming event and perform state transition
   */
  handleEvent(
    event: ArrivalEvent,
    context?: Partial<ArrivalContext>,
    metadata?: { distance?: number; reason?: string },
  ): { success: boolean; newState: ArrivalState; reason: string } {
    // Update context if provided
    if (context && this.context) {
      this.context = { ...this.context, ...context };
    }

    const previousState = this.state;
    let newState: ArrivalState | null = null;
    let reason = "";

    // State machine transition logic
    switch (this.state) {
      case "IDLE":
        if (event === "START_TRACKING") {
          newState = "APPROACHING";
          reason = "Started tracking trip";
          this.context = {
            tripId: context?.tripId || "",
            currentStopId: context?.currentStopId || "",
            currentStopIndex: context?.currentStopIndex || 0,
            totalStops: context?.totalStops || 0,
            targetLatitude: context?.targetLatitude || 0,
            targetLongitude: context?.targetLongitude || 0,
            currentDistance: context?.currentDistance || Infinity,
            confidence: 0,
            geofenceRadius: context?.geofenceRadius || 100,
            autoAdvanceEnabled: context?.autoAdvanceEnabled ?? true,
            paymentRequired: context?.paymentRequired ?? false,
            paymentCompleted: context?.paymentCompleted ?? false,
            enteredGeofenceAt: 0,
            lingeringStartedAt: null,
          };
        }
        break;

      case "APPROACHING":
        if (event === "STOP_TRACKING") {
          newState = "IDLE";
          reason = "Stopped tracking";
          this.clearTimers();
        } else if (event === "ENTER_GEOFENCE" && this.context) {
          newState = "IN_GEOFENCE";
          reason = "Entered geofence zone";
          this.context.enteredGeofenceAt = Date.now();
        }
        break;

      case "IN_GEOFENCE":
        if (event === "STOP_TRACKING") {
          newState = "IDLE";
          reason = "Stopped tracking";
          this.clearTimers();
        } else if (event === "EXIT_GEOFENCE") {
          newState = "APPROACHING";
          reason = "Exited geofence zone";
        } else if (event === "CONFIRM_ARRIVAL" && this.context) {
          newState = "ARRIVED";
          reason = "Confirmed arrival (2+ consecutive checks in geofence)";

          // Start confirmation timeout
          if (this.confirmationTimeout) clearTimeout(this.confirmationTimeout);
          this.confirmationTimeout = setTimeout(() => {
            if (this.state === "ARRIVED") {
              this.handleEvent("LINGER_TIMEOUT");
            }
          }, ARRIVAL_CONFIRMATION_TIME_MS);
        }
        break;

      case "ARRIVED":
        if (event === "STOP_TRACKING") {
          newState = "IDLE";
          reason = "Stopped tracking";
          this.clearTimers();
        } else if (event === "EXIT_GEOFENCE") {
          newState = "APPROACHING";
          reason = "User left geofence after arrival";
        } else if (event === "PAYMENT_COMPLETED" && this.context) {
          this.context.paymentCompleted = true;
          reason = "Payment processed";
          // Don't change state, payment is prerequisite for proceed
        } else if (event === "PAYMENT_FAILED" && this.context) {
          this.context.paymentCompleted = false;
          reason = "Payment failed, cannot proceed";
          // Stay in ARRIVED state
        } else if (event === "PROCEED_TO_NEXT") {
          // Check if payment is required and not completed
          if (this.context?.paymentRequired && !this.context?.paymentCompleted) {
            reason = "Cannot proceed: payment required but not completed";
            return { success: false, newState: this.state, reason };
          }

          newState = "COMPLETED";
          reason = "Proceeded to next stop";
          this.clearTimers();
        } else if (event === "MANUAL_OVERRIDE") {
          // Allow skipping payment requirement
          newState = "COMPLETED";
          reason = "Manual override to next stop";
          this.clearTimers();
        } else if (event === "LINGER_TIMEOUT") {
          // After staying in ARRIVED state without proceeding, enter LINGERING
          newState = "LINGERING";
          reason = "User lingering at stop (30s+ without proceeding)";
          if (this.context) {
            this.context.lingeringStartedAt = Date.now();
          }
        }
        break;

      case "LINGERING":
        if (event === "STOP_TRACKING") {
          newState = "IDLE";
          reason = "Stopped tracking";
          this.clearTimers();
        } else if (event === "EXIT_GEOFENCE") {
          newState = "APPROACHING";
          reason = "User left geofence while lingering";
        } else if (event === "PROCEED_TO_NEXT") {
          if (this.context?.paymentRequired && !this.context?.paymentCompleted) {
            reason = "Cannot proceed: payment required but not completed";
            return { success: false, newState: this.state, reason };
          }

          newState = "COMPLETED";
          reason = "Proceeded from lingering state";
          this.clearTimers();
        } else if (event === "MANUAL_OVERRIDE") {
          newState = "COMPLETED";
          reason = "Manual override to next stop from lingering";
          this.clearTimers();
        } else if (event === "SKIP_STOP") {
          newState = "COMPLETED";
          reason = "Skipped stop while lingering";
          this.clearTimers();
        }
        break;

      case "COMPLETED":
        if (event === "START_TRACKING") {
          newState = "APPROACHING";
          reason = "Started tracking next stop";
          if (context && this.context) {
            this.context.currentStopId = context.currentStopId || "";
            this.context.currentStopIndex = (context.currentStopIndex || 0) + 1;
            this.context.targetLatitude = context.targetLatitude || 0;
            this.context.targetLongitude = context.targetLongitude || 0;
            this.context.currentDistance = Infinity;
            this.context.confidence = 0;
            this.context.paymentRequired = context.paymentRequired ?? false;
            this.context.paymentCompleted = false;
            this.context.enteredGeofenceAt = 0;
            this.context.lingeringStartedAt = null;
          }
        } else if (event === "STOP_TRACKING") {
          newState = "IDLE";
          reason = "Stopped tracking";
          this.clearTimers();
        }
        break;
    }

    // Perform state transition if valid
    if (newState && newState !== previousState) {
      this.state = newState;

      // Record transition
      const transition: StateTransition = {
        from: previousState,
        to: newState,
        event,
        timestamp: new Date().toISOString(),
        distance: metadata?.distance,
        reason,
      };

      this.transitionHistory.push(transition);

      // Keep only last 100 transitions
      if (this.transitionHistory.length > 100) {
        this.transitionHistory.shift();
      }

      // Trigger callback
      const callback = this.stateChangeCallbacks.get(newState);
      if (callback) callback();

      return { success: true, newState, reason };
    }

    return {
      success: false,
      newState: this.state,
      reason: reason || `Event '${event}' not valid in state '${this.state}'`,
    };
  }

  /**
   * Update distance/confidence without changing state
   */
  updateContext(context: Partial<ArrivalContext>): void {
    if (this.context) {
      this.context = { ...this.context, ...context };
    }
  }

  /**
   * Check if arrival detection should trigger auto-advance
   * Returns true if all conditions are met
   */
  shouldAutoAdvance(): boolean {
    if (!this.context) return false;

    return (
      this.state === "ARRIVED" &&
      this.context.autoAdvanceEnabled &&
      (!this.context.paymentRequired || this.context.paymentCompleted) &&
      this.context.currentStopIndex < this.context.totalStops - 1
    );
  }

  /**
   * Get transition history
   */
  getTransitionHistory(): StateTransition[] {
    return [...this.transitionHistory];
  }

  /**
   * Reset to IDLE state
   */
  reset(): void {
    this.state = "IDLE";
    this.context = null;
    this.transitionHistory = [];
    this.clearTimers();
  }

  /**
   * Private: Clear any active timers
   */
  private clearTimers(): void {
    if (this.lingeringTimer) {
      clearTimeout(this.lingeringTimer);
      this.lingeringTimer = null;
    }
    if (this.confirmationTimeout) {
      clearTimeout(this.confirmationTimeout);
      this.confirmationTimeout = null;
    }
  }

  /**
   * Get diagnostic info
   */
  getDiagnostics(): {
    state: ArrivalState;
    context: ArrivalContext | null;
    transitionCount: number;
    lastTransition: StateTransition | null;
  } {
    return {
      state: this.state,
      context: this.getContext(),
      transitionCount: this.transitionHistory.length,
      lastTransition: this.transitionHistory[this.transitionHistory.length - 1] || null,
    };
  }
}
