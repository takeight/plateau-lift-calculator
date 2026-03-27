import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Mode = 'weightlifting' | 'running';
export type Unit = 'metric' | 'imperial';

export interface Session {
  id: string;
  sessionNumber: number;
  date: number; // timestamp
  value: number; // weight or seconds
}

export interface Exercise {
  id: string;
  name: string;
  mode: Mode;
  targetValue: number;
  sessions: Session[];
}

interface AppState {
  mode: Mode;
  unit: Unit;
  exercises: Exercise[];
  activeExerciseId: string | null;
  setMode: (mode: Mode) => void;
  setUnit: (unit: Unit) => void;
  addExercise: (name: string, mode: Mode, defaultTarget: number) => void;
  setActiveExercise: (id: string) => void;
  addSession: (exerciseId: string, session: Omit<Session, 'id'>) => void;
  updateSession: (exerciseId: string, sessionId: string, newValue: number) => void;
  deleteSession: (exerciseId: string, sessionId: string) => void;
  setTargetValue: (exerciseId: string, val: number) => void;
  deleteExercise: (id: string) => void;
}

const defaultExercises: Exercise[] = [
  {
    id: 'ex1',
    name: 'Barbell Squat',
    mode: 'weightlifting',
    targetValue: 120,
    sessions: [
      { id: '1', sessionNumber: 1, date: new Date('2025-10-01').getTime(), value: 100 },
      { id: '2', sessionNumber: 2, date: new Date('2025-10-15').getTime(), value: 102 },
      { id: '3', sessionNumber: 3, date: new Date('2025-11-01').getTime(), value: 105 },
      { id: '4', sessionNumber: 4, date: new Date('2025-11-15').getTime(), value: 108 },
      { id: '5', sessionNumber: 5, date: new Date('2025-12-01').getTime(), value: 110 },
    ]
  },
  {
    id: 'ex2',
    name: '5k Run',
    mode: 'running',
    targetValue: 1200,
    sessions: []
  }
];

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      mode: 'weightlifting',
      unit: 'metric',
      exercises: defaultExercises,
      activeExerciseId: 'ex1',
      setMode: (mode) => set((state) => {
        const firstExerciseOfMode = state.exercises.find(e => e.mode === mode);
        return { 
          mode, 
          activeExerciseId: firstExerciseOfMode ? firstExerciseOfMode.id : null 
        };
      }),
      setUnit: (newUnit) => set((state) => {
        if (state.unit === newUnit) return state;
        
        const isToImperial = newUnit === 'imperial';
        const weightFactor = 2.20462;
        const paceFactor = 1.60934;
        
        const newExercises = state.exercises.map(ex => {
          const factor = ex.mode === 'weightlifting' 
            ? (isToImperial ? weightFactor : 1 / weightFactor)
            : (isToImperial ? paceFactor : 1 / paceFactor);

          return {
            ...ex,
            targetValue: ex.targetValue * factor,
            sessions: ex.sessions.map(s => ({
              ...s,
              value: s.value * factor
            }))
          };
        });
        
        return {
          unit: newUnit,
          exercises: newExercises,
        };
      }),
      addExercise: (name, mode, defaultTarget) => set((state) => {
        const newEx: Exercise = {
          id: Math.random().toString(36).substring(2, 9),
          name,
          mode,
          targetValue: defaultTarget,
          sessions: []
        };
        return {
          exercises: [...state.exercises, newEx],
          activeExerciseId: newEx.id,
          mode: newEx.mode
        };
      }),
      setActiveExercise: (id) => set((state) => {
        const ex = state.exercises.find(e => e.id === id);
        if (ex) {
          return { activeExerciseId: id, mode: ex.mode };
        }
        return state;
      }),
      addSession: (exerciseId, session) => set((state) => ({
        exercises: state.exercises.map(ex => 
          ex.id === exerciseId 
            ? { ...ex, sessions: [...ex.sessions, { ...session, id: Math.random().toString(36).substring(2, 9) }] }
            : ex
        )
      })),
      updateSession: (exerciseId, sessionId, newValue) => set((state) => ({
        exercises: state.exercises.map(ex => 
          ex.id === exerciseId 
            ? { ...ex, sessions: ex.sessions.map(s => s.id === sessionId ? { ...s, value: newValue } : s) }
            : ex
        )
      })),
      deleteSession: (exerciseId, sessionId) => set((state) => ({
        exercises: state.exercises.map(ex => 
          ex.id === exerciseId 
            ? { ...ex, sessions: ex.sessions.filter(s => s.id !== sessionId) }
            : ex
        )
      })),
      setTargetValue: (exerciseId, targetValue) => set((state) => ({
        exercises: state.exercises.map(ex => 
          ex.id === exerciseId ? { ...ex, targetValue } : ex
        )
      })),
      deleteExercise: (id) => set((state) => {
        const newExercises = state.exercises.filter(e => e.id !== id);
        let newActiveId = state.activeExerciseId;
        if (state.activeExerciseId === id) {
          const remainingOfMode = newExercises.filter(e => e.mode === state.mode);
          newActiveId = remainingOfMode.length > 0 ? remainingOfMode[0].id : null;
        }
        return {
          exercises: newExercises,
          activeExerciseId: newActiveId
        };
      }),
    }),
    {
      name: 'plateau-breaker-storage-v2', // change name to reset state
    }
  )
);
