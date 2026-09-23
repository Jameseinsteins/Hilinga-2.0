# Hilinga Triple Feature Integration Guide

## Overview

This guide provides complete integration specifications for three features in MapScreen.tsx:
1. **Payment Integration** - Payment processing before trip starts
2. **Stop Insertion** - Edit itinerary with mid-route stop addition
3. **Arrival Detection** - Automatic location-based progression

---

## 1. Payment Integration

### State Management

**New hook: `usePaymentState.ts`**

```typescript
import { useState, useCallback } from "react";

export type PaymentStatus = "pending" | "processing" | "completed" | "failed";
export type PaymentMethod = "card" | "digital_wallet" | "cash_on_arrival";

export interface PaymentInfo {
  tripId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  errorMessage?: string;
  createdAt: number;
  completedAt?: number;
}

export interface UsePaymentStateResult {
  paymentInfo: PaymentInfo | null;
  isProcessing: boolean;
  paymentMethod: PaymentMethod;
  
  initializePayment: (tripId: string, amount: number) => void;
  processPayment: (method: PaymentMethod) => Promise<boolean>;
  handlePaymentFailure: (error: string) => void;
  resetPayment: () => void;
  setPaymentMethod: (method: PaymentMethod) => void;
}

export function usePaymentState(): UsePaymentStateResult {
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");

  const initializePayment = useCallback((tripId: string, amount: number) => {
    setPaymentInfo({
      tripId,
      amount,
      currency: "PHP",
      method: paymentMethod,
      status: "pending",
      createdAt: Date.now(),
    });
  }, [paymentMethod]);

  const processPayment = useCallback(async (method: PaymentMethod): Promise<boolean> => {
    if (!paymentInfo) return false;
    
    setIsProcessing(true);
    setPaymentMethod(method);

    try {
      // Integrate with payment provider (Stripe, PayMongo, etc.)
      const result = await fetch("/api/payments/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: paymentInfo.tripId,
          amount: paymentInfo.amount,
          method,
          currency: paymentInfo.currency,
        }),
      });

      if (!result.ok) throw new Error("Payment processing failed");
      
      const data = await result.json();
      setPaymentInfo(prev => prev ? {
        ...prev,
        status: "completed",
        transactionId: data.transactionId,
        completedAt: Date.now(),
      } : null);
      
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment failed";
      setPaymentInfo(prev => prev ? {
        ...prev,
        status: "failed",
        errorMessage: message,
      } : null);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [paymentInfo]);

  const handlePaymentFailure = useCallback((error: string) => {
    setPaymentInfo(prev => prev ? {
      ...prev,
      status: "failed",
      errorMessage: error,
    } : null);
  }, []);

  const resetPayment = useCallback(() => {
    setPaymentInfo(null);
    setIsProcessing(false);
  }, []);

  return {
    paymentInfo,
    isProcessing,
    paymentMethod,
    initializePayment,
    processPayment,
    handlePaymentFailure,
    resetPayment,
    setPaymentMethod,
  };
}
```

### MapScreen Integration Points

**State additions:**
```typescript
const [paymentState, paymentActions] = usePaymentState();
const [showPaymentModal, setShowPaymentModal] = useState(false);

// Initialize payment when trip starts (non-test trips)
useEffect(() => {
  if (selectedPlan && !selectedPlan.isTestTrip) {
    const estimatedCost = calculateTripCost(selectedPlan);
    paymentActions.initializePayment(selectedPlan.id, estimatedCost);
  }
}, [selectedPlan, paymentActions]);
```

**Component JSX additions (in map-controls):**
```typescript
{/* Payment Status Header */}
{paymentState.paymentInfo && !paymentState.paymentInfo.completedAt && (
  <div className="payment-status-header">
    <div className="payment-info">
      <Icon name="payments" size={18} color="var(--c-primary)" />
      <span>Trip Cost: ₱{paymentState.paymentInfo.amount.toLocaleString()}</span>
    </div>
    <button 
      onClick={() => setShowPaymentModal(true)}
      className="btn btn-primary"
      disabled={paymentState.isProcessing}
    >
      {paymentState.isProcessing ? "Processing..." : "Complete Payment"}
    </button>
  </div>
)}

{/* Payment Completed Badge */}
{paymentState.paymentInfo?.status === "completed" && (
  <div className="payment-completed-badge">
    <Icon name="check_circle" size={18} color="var(--c-success)" />
    <span>Payment Confirmed</span>
  </div>
)}

{/* Payment Error */}
{paymentState.paymentInfo?.status === "failed" && (
  <div className="error-message">
    <p>Payment failed: {paymentState.paymentInfo.errorMessage}</p>
    <button onClick={() => setShowPaymentModal(true)}>Retry</button>
  </div>
)}
```

**Payment Modal Component:**
```typescript
<PaymentModal
  visible={showPaymentModal}
  paymentInfo={paymentState.paymentInfo}
  isProcessing={paymentState.isProcessing}
  selectedMethod={paymentState.paymentMethod}
  onMethodChange={paymentActions.setPaymentMethod}
  onProcess={paymentActions.processPayment}
  onClose={() => setShowPaymentModal(false)}
/>
```

---

## 2. Stop Insertion Integration

### State Management

**New hook: `useItineraryEditor.ts`**

```typescript
import { useState, useCallback } from "react";
import type { MapRouteStop } from "@/components/openstreet-map";
import type { ItineraryDay } from "@/lib/database";

export interface ItineraryEditState {
  isEditing: boolean;
  editingDay: number | null;
  insertMode: "before" | "after";
  targetStopIndex: number | null;
  newStopTitle: string;
  newStopNotes: string;
  previewStops: MapRouteStop[] | null;
  pendingChanges: ItineraryDay[] | null;
}

export interface UseItineraryEditorResult {
  editState: ItineraryEditState;
  
  openEditor: (day: number, stopIndex: number, mode: "before" | "after") => void;
  updateNewStop: (title: string, notes: string) => void;
  previewChanges: (stops: MapRouteStop[]) => void;
  commitChanges: (updatedItinerary: ItineraryDay[]) => Promise<void>;
  cancelEdit: () => void;
  clearPreview: () => void;
}

export function useItineraryEditor(): UseItineraryEditorResult {
  const [editState, setEditState] = useState<ItineraryEditState>({
    isEditing: false,
    editingDay: null,
    insertMode: "after",
    targetStopIndex: null,
    newStopTitle: "",
    newStopNotes: "",
    previewStops: null,
    pendingChanges: null,
  });

  const openEditor = useCallback((day: number, stopIndex: number, mode: "before" | "after") => {
    setEditState(prev => ({
      ...prev,
      isEditing: true,
      editingDay: day,
      targetStopIndex: stopIndex,
      insertMode: mode,
      newStopTitle: "",
      newStopNotes: "",
    }));
  }, []);

  const updateNewStop = useCallback((title: string, notes: string) => {
    setEditState(prev => ({
      ...prev,
      newStopTitle: title,
      newStopNotes: notes,
    }));
  }, []);

  const previewChanges = useCallback((stops: MapRouteStop[]) => {
    setEditState(prev => ({
      ...prev,
      previewStops: stops,
    }));
  }, []);

  const commitChanges = useCallback(async (updatedItinerary: ItineraryDay[]) => {
    setEditState(prev => ({
      ...prev,
      pendingChanges: updatedItinerary,
      isEditing: false,
    }));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditState(prev => ({
      ...prev,
      isEditing: false,
      newStopTitle: "",
      newStopNotes: "",
      previewStops: null,
    }));
  }, []);

  const clearPreview = useCallback(() => {
    setEditState(prev => ({
      ...prev,
      previewStops: null,
    }));
  }, []);

  return {
    editState,
    openEditor,
    updateNewStop,
    previewChanges,
    commitChanges,
    cancelEdit,
    clearPreview,
  };
}
```

### MapScreen Integration Points

**State addition:**
```typescript
const [itineraryEditor, editorActions] = useItineraryEditor();

// Add Edit Itinerary button to control panel
<div className="itinerary-actions">
  <button
    className="btn btn-secondary"
    onClick={() => {
      // Trigger edit mode
      setShowEditItinerary(true);
    }}
  >
    <Icon name="edit_itinerary" size={18} />
    Edit Itinerary
  </button>
</div>

// Insert stop modal (in render)
{showEditItinerary && (
  <EditItineraryModal
    visible={true}
    routeStops={visibleRouteStops}
    editState={itineraryEditor.editState}
    onOpenEditor={editorActions.openEditor}
    onUpdateStop={editorActions.updateNewStop}
    onPreview={editorActions.previewChanges}
    onCommit={handleCommitItineraryChanges}
    onCancel={editorActions.cancelEdit}
    onClose={() => setShowEditItinerary(false)}
  />
)}
```

**Stop insertion logic (helper function):**
```typescript
function buildUpdatedItinerary(
  currentItinerary: ItineraryDay[],
  day: number,
  stopIndex: number,
  newStopTitle: string,
  newStopNotes: string,
  insertMode: "before" | "after"
): ItineraryDay[] {
  return currentItinerary.map(dayPlan => {
    if (dayPlan.day !== day) return dayPlan;

    const newStops = [...dayPlan.stops];
    const insertIndex = insertMode === "before" ? stopIndex : stopIndex + 1;
    
    newStops.splice(insertIndex, 0, {
      id: `stop-${Date.now()}`,
      title: newStopTitle,
      notes: newStopNotes,
      time: null,
      place: { id: "", name: newStopTitle, latitude: 0, longitude: 0 },
    });

    return { ...dayPlan, stops: newStops };
  });
}

async function handleCommitItineraryChanges() {
  if (!selectedPlan || !user?.uid) return;

  try {
    const updated = buildUpdatedItinerary(
      selectedPlan.itinerary || [],
      itineraryEditor.editState.editingDay!,
      itineraryEditor.editState.targetStopIndex!,
      itineraryEditor.editState.newStopTitle,
      itineraryEditor.editState.newStopNotes,
      itineraryEditor.editState.insertMode
    );

    await updateTripPlan(db, user.uid, selectedPlan.id, { itinerary: updated });
    
    // Reload plan
    const updatedPlans = await getTripPlans(db, user.uid);
    actions.setPlans(updatedPlans);
    
    editorActions.clearPreview();
    setShowEditItinerary(false);
    actions.setNavToast("Itinerary updated successfully");
  } catch (error) {
    actions.setRouteError("Failed to update itinerary");
  }
}
```

---

## 3. Arrival Detection Integration

### New Hook: `useArrivalDetection.ts`

```typescript
import { useEffect, useRef, useCallback, useState } from "react";

export interface ArrivalDetectionConfig {
  geofenceRadiusMeters: number;
  checkIntervalMs: number;
  minAccuracyMeters: number;
}

const DEFAULT_CONFIG: ArrivalDetectionConfig = {
  geofenceRadiusMeters: 100,
  checkIntervalMs: 5000,
  minAccuracyMeters: 50,
};

export interface UseArrivalDetectionResult {
  isTracking: boolean;
  arrivedAt: string | null;
  arrivalCountdown: number;
  
  startTracking: (targetLocation: { latitude: number; longitude: number }) => void;
  stopTracking: () => void;
  markAsArrived: () => void;
}

export function useArrivalDetection(
  onArrived: (location: { latitude: number; longitude: number }) => void,
  config = DEFAULT_CONFIG
): UseArrivalDetectionResult {
  const [isTracking, setIsTracking] = useState(false);
  const [arrivedAt, setArrivedAt] = useState<string | null>(null);
  const [arrivalCountdown, setArrivalCountdown] = useState(0);
  
  const watchIdRef = useRef<number | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const targetRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const calculateDistance = (
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number => {
    const R = 6371000; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const startTracking = useCallback(
    (targetLocation: { latitude: number; longitude: number }) => {
      targetRef.current = targetLocation;
      setIsTracking(true);
      setArrivedAt(null);

      if (!("geolocation" in navigator)) {
        console.error("Geolocation not supported");
        return;
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        ({ coords }) => {
          if (!targetRef.current) return;

          const distance = calculateDistance(
            coords.latitude,
            coords.longitude,
            targetRef.current.latitude,
            targetRef.current.longitude
          );

          // Check if arrived
          if (
            distance <= config.geofenceRadiusMeters &&
            coords.accuracy <= config.minAccuracyMeters
          ) {
            setArrivedAt(new Date().toISOString());
            setArrivalCountdown(5); // 5 second auto-advance

            // Start countdown
            if (countdownRef.current) clearInterval(countdownRef.current);
            countdownRef.current = setInterval(() => {
              setArrivalCountdown(prev => {
                if (prev <= 1) {
                  onArrived(targetRef.current!);
                  if (countdownRef.current) clearInterval(countdownRef.current);
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
          }
        },
        (error) => {
          console.error("Geolocation error:", error);
          setIsTracking(false);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000,
        }
      );
    },
    [config, onArrived]
  );

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (countdownRef.current) clearInterval(countdownRef.current);
    setIsTracking(false);
    setArrivedAt(null);
    setArrivalCountdown(0);
  }, []);

  const markAsArrived = useCallback(() => {
    if (targetRef.current) {
      onArrived(targetRef.current);
    }
    stopTracking();
  }, [onArrived, stopTracking]);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    isTracking,
    arrivedAt,
    arrivalCountdown,
    startTracking,
    stopTracking,
    markAsArrived,
  };
}
```

### MapScreen Integration Points

**State addition:**
```typescript
const arrival = useArrivalDetection(
  (location) => {
    // Auto-advance to next stop
    handleAdvanceNavStop();
  },
  {
    geofenceRadiusMeters: 100,
    checkIntervalMs: 5000,
    minAccuracyMeters: 50,
  }
);

// Start tracking when navigation begins
useEffect(() => {
  if (state.isNavigating && visibleRouteStops[state.currentNavStopIndex]) {
    const currentStop = visibleRouteStops[state.currentNavStopIndex];
    arrival.startTracking({
      latitude: currentStop.place.latitude,
      longitude: currentStop.place.longitude,
    });
  } else {
    arrival.stopTracking();
  }
}, [state.isNavigating, state.currentNavStopIndex, visibleRouteStops, arrival]);

// Clean up on unmount
useEffect(() => {
  return () => arrival.stopTracking();
}, [arrival]);
```

**Arrival notification in JSX:**
```typescript
{arrival.arrivedAt && (
  <div className="arrival-notification">
    <div className="arrival-content">
      <Icon name="location_on" size={24} color="var(--c-success)" />
      <div className="arrival-text">
        <strong>You've arrived!</strong>
        <span>Auto-advancing in {arrival.arrivalCountdown}s</span>
      </div>
    </div>
    <div className="arrival-actions">
      <button 
        onClick={arrival.markAsArrived}
        className="btn btn-primary"
      >
        Continue Now
      </button>
      <button 
        onClick={arrival.stopTracking}
        className="btn btn-secondary"
      >
        Cancel
      </button>
    </div>
  </div>
)}
```

---

## Data Flow Architecture

```
MapScreen Component
├── useMapState (existing)
├── usePaymentState (NEW)
├── useItineraryEditor (NEW)
├── useArrivalDetection (NEW)
└── State Management Layer
    ├── selectedPlan → determines payment amount
    ├── isNavigating → triggers arrival tracking
    ├── activeDay + currentNavStopIndex → current stop for geofencing
    └── routeStops → available stops for insertion

UI Layer
├── Payment UI
│   ├── Status header (shows cost, payment button)
│   ├── Payment modal (selects method, processes)
│   └── Completion badge
├── Itinerary UI
│   ├── Edit button (in control panel)
│   ├── Insert modal (before/after selection)
│   ├── Live preview (updated route)
│   └── Save/Cancel
└── Arrival UI
    ├── Geofence detection (background)
    ├── Arrival notification (shows countdown)
    ├── Auto-advance button
    └── Manual override

Data Persistence
├── Firebase: paymentInfo (optional archival)
├── Firebase: updatedItinerary (via updateTripPlan)
└── Browser: arrival timestamp (localStorage)
```

---

## Error Handling & Edge Cases

### Payment Errors
```typescript
// Network failure → Retry with exponential backoff
async function retryPayment(maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await paymentActions.processPayment(paymentState.paymentMethod);
    } catch (error) {
      if (i === maxAttempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}

// Insufficient funds → User selects different payment method
if (error.code === "INSUFFICIENT_FUNDS") {
  setShowPaymentModal(true);
  paymentActions.handlePaymentFailure("Insufficient funds. Try another payment method.");
}

// Test trips bypass payment
if (selectedPlan?.isTestTrip) {
  paymentActions.initializePayment(selectedPlan.id, 0);
  // Mark as completed immediately
  setPaymentState(prev => ({ ...prev, status: "completed" }));
}
```

### Itinerary Errors
```typescript
// Validation: Stop can't be inserted without title
if (!itineraryEditor.editState.newStopTitle.trim()) {
  actions.setRouteError("Stop title cannot be empty");
  return;
}

// Conflicting edits: Another user modified itinerary
async function handleCommitItineraryChanges() {
  try {
    const freshPlan = await getTripPlans(db, user.uid);
    const current = freshPlan.find(p => p.id === selectedPlan.id);
    
    // Check if itinerary changed since load
    if (JSON.stringify(current.itinerary) !== JSON.stringify(selectedPlan.itinerary)) {
      actions.setRouteError("Itinerary was modified. Reload and try again.");
      return;
    }
    
    // Proceed with update
    await updateTripPlan(...);
  } catch (error) {
    actions.setRouteError("Failed to update itinerary");
  }
}

// Undo: Maintain previous state
const previousItinerary = useRef(selectedPlan?.itinerary);
```

### Arrival Detection Errors
```typescript
// Geolocation denied → Ask for permission
if (error.code === error.PERMISSION_DENIED) {
  actions.setLocationError(
    "Location permission denied. Enable location in browser settings to use arrival detection."
  );
  arrival.stopTracking();
}

// Low accuracy → Warn user
if (coords.accuracy > config.minAccuracyMeters) {
  console.warn(`Location accuracy: ${coords.accuracy}m (target: ${config.minAccuracyMeters}m)`);
  // Don't trigger arrival yet, wait for better signal
}

// Manual override: User can manually mark as arrived
<button onClick={arrival.markAsArrived}>
  Mark as Arrived
</button>
```

---

## Testing Checklist

### Payment Integration
- [ ] Payment modal opens when trip starts (non-test)
- [ ] Test trip skips payment completely
- [ ] Payment method selection (card, wallet, cash on arrival)
- [ ] Success flow: payment completes, badge shows, navigation allowed
- [ ] Retry flow: failed payment allows retry
- [ ] Offline: pending payment persists until network returns
- [ ] Network error handling and exponential backoff
- [ ] Transaction ID persists in plan metadata
- [ ] Payment status displays correctly in trip header

### Stop Insertion
- [ ] "Edit Itinerary" button appears in control panel
- [ ] Insert before/after selection works
- [ ] Modal shows current stop and insertion point
- [ ] New stop title validation (non-empty)
- [ ] Preview shows updated route with new stop
- [ ] Commit saves to Firebase
- [ ] Route updates live after commit
- [ ] Cancel discards changes
- [ ] Undo support (maintain previous state)
- [ ] Handle concurrent edits gracefully

### Arrival Detection
- [ ] Location tracking starts when navigation begins
- [ ] Geofence detection at 100m radius
- [ ] Arrival notification shows countdown (5 seconds)
- [ ] Auto-advance to next stop after countdown
- [ ] Manual "Continue Now" button works
- [ ] "Cancel" stops tracking and dismisses notification
- [ ] Low accuracy warning (>50m)
- [ ] Permission denied error handling
- [ ] Works with mock locations in dev
- [ ] Stops tracking when navigation ends
- [ ] No battery drain (reasonable check interval)

### Integration Points
- [ ] Payment must complete before navigation enabled
- [ ] Stop insertion doesn't interfere with active navigation
- [ ] Arrival detection respects manual "mark done" override
- [ ] All three features work together seamlessly
- [ ] No state conflicts between features
- [ ] Proper cleanup on component unmount

---

## Implementation Timeline

**Phase 1 (Payment):** 2-3 days
- Payment state hook
- Modal UI
- API integration (mock/real)
- Error handling

**Phase 2 (Stop Insertion):** 2-3 days
- Editor hook
- Modal UI with preview
- Itinerary update logic
- Firebase sync

**Phase 3 (Arrival Detection):** 1-2 days
- Geolocation hook
- Notification UI
- Auto-advance logic
- Battery optimization

**Phase 4 (Integration & QA):** 2-3 days
- Feature interaction testing
- Edge case handling
- Performance optimization
- Documentation update

---

## API Contract Requirements

### Payment API Endpoint
```
POST /api/payments/process
{
  "tripId": "string",
  "amount": "number",
  "method": "card|digital_wallet|cash_on_arrival",
  "currency": "PHP"
}

Response:
{
  "success": boolean,
  "transactionId": "string",
  "status": "completed|failed",
  "errorMessage": "string (if failed)"
}
```

### No changes needed for:
- Trip plan CRUD (existing `updateTripPlan` works)
- Location data (browser geolocation API)
- Route calculation (existing OpenStreetMap integration)

---

## Notes for Implementation

1. **Payment Provider Choice**: Decide between Stripe, PayMongo, or GCash. Update `usePaymentState` accordingly.

2. **Geofence Radius**: Default 100m is conservative. Adjust based on GPS accuracy testing in Philippines region.

3. **Concurrent Edits**: Consider adding version stamps to itineraries to prevent conflicts.

4. **Battery**: Arrival detection uses `enableHighAccuracy: true`. Consider adding user warning about battery impact.

5. **Offline Support**: Payment status should persist in localStorage until network returns.

6. **Accessibility**: Ensure arrival notification is announce-able for screen readers.

7. **Mobile**: Test on actual devices with real GPS, not just browser dev tools.
