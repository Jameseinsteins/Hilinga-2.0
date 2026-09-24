/**
 * useItineraryEditor Hook - Manages itinerary editing state, undo/redo, and previews
 * Handles stop insertion, deletion, and reordering with automatic persistence
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ItineraryDay,
  ItineraryStop,
  insertStopAtPosition,
  removeStopFromDay,
  reorderStops,
  validateStopInsertion,
  type InsertionResult,
} from '@/lib/itinerary-utils';
import { isSupabaseConfigured, supabase, withSupabaseTimeout } from '@/lib/supabase';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface EditState {
  isEditing: boolean;
  targetDay: ItineraryDay | null;
  editHistory: ItineraryDay[];
  historyIndex: number;
  previewMode: boolean;
  selectedStopIndex: number | null;
  pendingChanges: ItineraryDay | null;
}

export interface NewStopData {
  title: string;
  note: string;
  icon: string;
  location: {
    latitude: number;
    longitude: number;
  };
  duration?: number;
  price?: number;
  category?: string;
  tags?: string[];
}

export interface EditorActions {
  openEditor: (day: ItineraryDay) => void;
  closeEditor: () => void;
  updateNewStop: (stop: Partial<NewStopData>) => void;
  addStop: (stop: NewStopData, position: number) => InsertionResult;
  removeStop: (stopIndex: number) => InsertionResult;
  reorderStop: (fromIndex: number, toIndex: number) => InsertionResult;
  previewChanges: () => void;
  cancelEdit: () => void;
  commitChanges: (userId: string, tripPlanId: string) => Promise<boolean>;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  selectStop: (index: number | null) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const createInitialEditState = (): EditState => ({
  isEditing: false,
  targetDay: null,
  editHistory: [],
  historyIndex: -1,
  previewMode: false,
  selectedStopIndex: null,
  pendingChanges: null,
});

// ============================================================================
// Hook Implementation
// ============================================================================

export function useItineraryEditor(): [EditState, EditorActions] {
  const [state, setState] = useState<EditState>(createInitialEditState());
  const newStopRef = useRef<NewStopData | null>(null);
  const commitAbortRef = useRef<AbortController | null>(null);

  /**
   * Open editor for a day
   */
  const openEditor = useCallback((day: ItineraryDay) => {
    setState(prev => ({
      ...prev,
      isEditing: true,
      targetDay: day,
      editHistory: [day],
      historyIndex: 0,
      pendingChanges: day,
      previewMode: false,
    }));

    newStopRef.current = null;
  }, []);

  /**
   * Close editor without saving
   */
  const closeEditor = useCallback(() => {
    setState(createInitialEditState());
    newStopRef.current = null;
  }, []);

  /**
   * Update new stop being added
   */
  const updateNewStop = useCallback((stop: Partial<NewStopData>) => {
    if (!newStopRef.current) {
      newStopRef.current = {
        title: '',
        note: '',
        icon: 'location',
        location: { latitude: 0, longitude: 0 },
      };
    }

    newStopRef.current = {
      ...newStopRef.current,
      ...stop,
    };
  }, []);

  /**
   * Add a new stop to the itinerary
   */
  const addStop = useCallback(
    (stop: NewStopData, position: number): InsertionResult => {
      if (!state.pendingChanges) {
        return {
          success: false,
          error: 'No itinerary loaded',
        };
      }

      // Validate input
      const validation = validateStopInsertion(
        { ...stop, id: 'temp' } as ItineraryStop,
        state.pendingChanges,
        position
      );

      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors[0],
          warnings: validation.warnings,
        };
      }

      // Insert stop
      const result = insertStopAtPosition(
        state.pendingChanges,
        {
          time: '09:00 AM',
          title: stop.title,
          note: stop.note,
          icon: stop.icon,
        } as ItineraryStop,
        position,
        'after'
      );

      if (result.success && result.updatedDay) {
        // Add to history
        setState(prev => {
          const newHistory = prev.editHistory.slice(0, prev.historyIndex + 1);
          newHistory.push(result.updatedDay!);

          return {
            ...prev,
            editHistory: newHistory,
            historyIndex: newHistory.length - 1,
            pendingChanges: result.updatedDay ?? null,
            selectedStopIndex: position + 1,
          };
        });

        newStopRef.current = null;
      }

      return result;
    },
    [state.pendingChanges, state.editHistory, state.historyIndex]
  );

  /**
   * Remove a stop from the itinerary
   */
  const removeStop = useCallback(
    (stopIndex: number): InsertionResult => {
      if (!state.pendingChanges) {
        return {
          success: false,
          error: 'No itinerary loaded',
        };
      }

      const result = removeStopFromDay(state.pendingChanges, stopIndex);

      if (result.success && result.updatedDay) {
        setState(prev => {
          const newHistory = prev.editHistory.slice(0, prev.historyIndex + 1);
          newHistory.push(result.updatedDay!);

          return {
            ...prev,
            editHistory: newHistory,
            historyIndex: newHistory.length - 1,
            pendingChanges: result.updatedDay ?? null,
            selectedStopIndex: null,
          };
        });
      }

      return result;
    },
    [state.pendingChanges, state.editHistory, state.historyIndex]
  );

  /**
   * Reorder stops via drag and drop
   */
  const reorderStop = useCallback(
    (fromIndex: number, toIndex: number): InsertionResult => {
      if (!state.pendingChanges) {
        return {
          success: false,
          error: 'No itinerary loaded',
        };
      }

      const result = reorderStops(state.pendingChanges, fromIndex, toIndex);

      if (result.success && result.updatedDay) {
        setState(prev => {
          const newHistory = prev.editHistory.slice(0, prev.historyIndex + 1);
          newHistory.push(result.updatedDay!);

          return {
            ...prev,
            editHistory: newHistory,
            historyIndex: newHistory.length - 1,
            pendingChanges: result.updatedDay ?? null,
            selectedStopIndex: toIndex,
          };
        });
      }

      return result;
    },
    [state.pendingChanges, state.editHistory, state.historyIndex]
  );

  /**
   * Preview changes
   */
  const previewChanges = useCallback(() => {
    setState(prev => ({
      ...prev,
      previewMode: !prev.previewMode,
    }));
  }, []);

  /**
   * Cancel editing and revert changes
   */
  const cancelEdit = useCallback(() => {
    setState(createInitialEditState());
    newStopRef.current = null;
  }, []);

  /**
   * Commit changes — Supabase trip_plans itinerary patch (no Firestore)
   * Fetches the current trip_plans row, replaces itinerary[day-1], and upserts via Supabase.
   */
  const commitChanges = useCallback(
    async (userId: string, tripPlanId: string): Promise<boolean> => {
      if (!state.pendingChanges || !state.targetDay) {
        return false;
      }
      if (!isSupabaseConfigured || !supabase) {
        console.error('[useItineraryEditor] Supabase is not configured.');
        return false;
      }

      // Cancel any existing request
      if (commitAbortRef.current) {
        commitAbortRef.current.abort();
      }

      commitAbortRef.current = new AbortController();

      try {
        // Fetch the current trip_plans row, replace itinerary[day-1], upsert on (user_id,id)
        const { data, error: fetchError } = await withSupabaseTimeout(
          supabase.from('trip_plans').select('itinerary, title, preferences').eq('user_id', userId).eq('id', tripPlanId).maybeSingle(),
          'Supabase trip_plans fetch timed out.',
        );
        if (fetchError) throw new Error(fetchError.message);
        // If row missing, create a minimal one using pending day (covers legacy useItineraryEditor demo paths)
        const currentItinerary: unknown[] = Array.isArray((data as Record<string, unknown> | null)?.itinerary)
          ? ((data as Record<string, unknown>).itinerary as unknown[])
          : [];
        const nextItinerary = [...currentItinerary];
        // Fill gaps if day index beyond length
        while (nextItinerary.length < state.targetDay.day) nextItinerary.push(null);
        nextItinerary[state.targetDay.day - 1] = state.pendingChanges;
        const nowIso = new Date().toISOString();
        const row: Record<string, unknown> = {
          id: tripPlanId,
          user_id: userId,
          title: (data as Record<string, unknown> | null)?.title ?? state.targetDay.title ?? 'Trip',
          preferences: (data as Record<string, unknown> | null)?.preferences ?? null,
          itinerary: nextItinerary as unknown,
          updated_at: nowIso,
        };
        // Ensure created_at is set on insert
        if (!(data as Record<string, unknown> | null)?.title) row.created_at = nowIso;
        const { error: upsertError } = await withSupabaseTimeout(
          supabase.from('trip_plans').upsert(row as never, { onConflict: 'user_id,id' }),
          'Supabase trip_plans upsert timed out.',
        );
        if (upsertError) throw new Error(upsertError.message);

        // Clear edit state
        setState(createInitialEditState());
        newStopRef.current = null;

        return true;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Commit cancelled');
        } else {
          console.error('Failed to commit changes:', error);
        }

        return false;
      }
    },
    [state.pendingChanges, state.targetDay]
  );

  /**
   * Undo last change
   */
  const undo = useCallback(() => {
    setState(prev => {
      if (prev.historyIndex <= 0) return prev;

      const newIndex = prev.historyIndex - 1;

      return {
        ...prev,
        historyIndex: newIndex,
        pendingChanges: prev.editHistory[newIndex],
        selectedStopIndex: null,
      };
    });
  }, []);

  /**
   * Redo last undone change
   */
  const redo = useCallback(() => {
    setState(prev => {
      if (prev.historyIndex >= prev.editHistory.length - 1) return prev;

      const newIndex = prev.historyIndex + 1;

      return {
        ...prev,
        historyIndex: newIndex,
        pendingChanges: prev.editHistory[newIndex],
        selectedStopIndex: null,
      };
    });
  }, []);

  /**
   * Check if undo is available
   */
  const canUndo = useCallback((): boolean => {
    return state.historyIndex > 0;
  }, [state.historyIndex]);

  /**
   * Check if redo is available
   */
  const canRedo = useCallback((): boolean => {
    return state.historyIndex < state.editHistory.length - 1;
  }, [state.historyIndex, state.editHistory.length]);

  /**
   * Select a stop
   */
  const selectStop = useCallback((index: number | null) => {
    setState(prev => ({
      ...prev,
      selectedStopIndex: index,
    }));
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (commitAbortRef.current) {
        commitAbortRef.current.abort();
      }
    };
  }, []);

  return [
    state,
    {
      openEditor,
      closeEditor,
      updateNewStop,
      addStop,
      removeStop,
      reorderStop,
      previewChanges,
      cancelEdit,
      commitChanges,
      undo,
      redo,
      canUndo,
      canRedo,
      selectStop,
    },
  ];
}

// ============================================================================
// Helper Hook: Itinerary Validation
// ============================================================================

export function useItineraryValidation() {
  const validateDay = useCallback((day: ItineraryDay): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!day || !day.stops || day.stops.length === 0) {
      errors.push('Day must have at least one stop');
    }

    for (let i = 0; i < (day.stops?.length || 0); i++) {
      const stop = day.stops[i];

      if (!stop.title || stop.title.trim().length === 0) {
        errors.push(`Stop ${i + 1}: Title cannot be empty`);
      }

      if (!stop.time || !/^\d{2}:\d{2}$/.test(stop.time)) {
        errors.push(`Stop ${i + 1}: Invalid time format`);
      }

      if (!stop.location || typeof stop.location.latitude !== 'number' || typeof stop.location.longitude !== 'number') {
        errors.push(`Stop ${i + 1}: Invalid location`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }, []);

  return { validateDay };
}

// ============================================================================
// Helper Hook: Diff Tracking
// ============================================================================

export interface DiffEntry {
  type: 'added' | 'removed' | 'modified';
  stopIndex: number;
  stop?: ItineraryStop;
  changes?: { field: string; oldValue: any; newValue: any }[];
}

export function useItineraryDiff() {
  const calculateDiff = useCallback(
    (originalDay: ItineraryDay, modifiedDay: ItineraryDay): DiffEntry[] => {
      const diffs: DiffEntry[] = [];

      // Check for removed stops
      for (let i = 0; i < originalDay.stops.length; i++) {
        const original = originalDay.stops[i];
        const found = modifiedDay.stops.find(s => s.id === original.id);

        if (!found) {
          diffs.push({
            type: 'removed',
            stopIndex: i,
            stop: original,
          });
        }
      }

      // Check for added and modified stops
      for (let i = 0; i < modifiedDay.stops.length; i++) {
        const modified = modifiedDay.stops[i];
        const original = originalDay.stops.find(s => s.id === modified.id);

        if (!original) {
          diffs.push({
            type: 'added',
            stopIndex: i,
            stop: modified,
          });
        } else {
          // Check for changes
          const changes: DiffEntry['changes'] = [];

          Object.keys(modified).forEach(key => {
            const oldValue = (original as any)[key];
            const newValue = (modified as any)[key];

            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
              changes.push({
                field: key,
                oldValue,
                newValue,
              });
            }
          });

          if (changes.length > 0) {
            diffs.push({
              type: 'modified',
              stopIndex: i,
              changes,
            });
          }
        }
      }

      return diffs;
    },
    []
  );

  return { calculateDiff };
}
