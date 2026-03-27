import React, { useState, useMemo, useRef, useEffect } from 'react';
import { format, addDays, startOfMonth, endOfMonth, eachMonthOfInterval, isSameMonth, eachDayOfInterval, startOfWeek, isSameDay } from 'date-fns';
import { ClipboardEdit, X, Plus, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore, Mode } from './store/useStore';
import { calculateLinearRegression, formatSecondsToTime, parseTimeToSeconds } from './lib/math';
import { cn } from './lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

const COMMON_EXERCISES = {
  weightlifting: ['Barbell Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row'],
  running: ['1 Mile Run', '5k Run', '10k Run', 'Half Marathon', 'Marathon']
};

export default function App() {
  const { mode, unit, exercises, activeExerciseId, setMode, setUnit, addSession, updateSession, deleteSession, setTargetValue, addExercise, setActiveExercise, deleteExercise, clearAllData } = useStore();

  const activeExercise = exercises.find(e => e.id === activeExerciseId);
  const sessions = activeExercise ? activeExercise.sessions : [];
  const targetValue = activeExercise ? activeExercise.targetValue : 0;

  const [dateInput, setDateInput] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [metricInput, setMetricInput] = useState('');
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(targetValue.toString());
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [isNewExerciseModalOpen, setIsNewExerciseModalOpen] = useState(false);
  const [exerciseToDelete, setExerciseToDelete] = useState<string | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(exercises.length === 0);
  const [pendingExerciseName, setPendingExerciseName] = useState<string | null>(null);
  
  const [editingNode, setEditingNode] = useState<{ id: string, x: number, y: number, value: number, dateLabel: string, timestamp?: number } | null>(null);
  const [editNodeValue, setEditNodeValue] = useState('');
  
  // Consolidated hover state for zero-lag performance
  const [hoverState, setHoverState] = useState<{
    timestamp: number | null;
    dateLabel: string | null;
    x: number;
    y: number;
    isExisting: boolean;
    isActive: boolean;
  }>({
    timestamp: null,
    dateLabel: null,
    x: 0,
    y: 0,
    isExisting: false,
    isActive: false
  });

  const [isHoveringTargetDate, setIsHoveringTargetDate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Refs for high-frequency DOM updates (performance optimization)
  const verticalLineRef = useRef<HTMLDivElement>(null);
  const floatingLabelRef = useRef<HTMLDivElement>(null);
  const followDotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setIsEditingTarget(false);
    setTargetInput(mode === 'running' ? formatSecondsToTime(targetValue) : targetValue.toString());
  }, [mode, activeExerciseId, targetValue]);

  const dataPoints = useMemo(() => {
    return sessions.map((s) => ({
      x: s.date / (1000 * 60 * 60 * 24),
      y: s.value,
    }));
  }, [sessions]);

  const { slope, intercept } = useMemo(() => calculateLinearRegression(dataPoints), [dataPoints]);

  const velocityPerWeek = slope * 7;

  const projectedDateTimestamp = useMemo(() => {
    if (Math.abs(slope) > 0.00001) {
      const projectedDays = (targetValue - intercept) / slope;
      const ts = projectedDays * (1000 * 60 * 60 * 24);
      return (isNaN(ts) || !isFinite(ts)) ? null : ts;
    }
    return null;
  }, [slope, intercept, targetValue]);

  const formatProjectedDate = (timestamp: number) => {
    const date = new Date(timestamp);
    if (date.getFullYear() !== new Date().getFullYear()) {
      return format(date, 'MMM d, yyyy');
    }
    return format(date, 'MMMM d');
  };

  const isUnreachable =
    (mode === 'weightlifting' && slope <= 0 && targetValue > (sessions[sessions.length - 1]?.value || 0)) ||
    (mode === 'running' && slope >= 0 && targetValue < (sessions[sessions.length - 1]?.value || 0));

  const handleAddSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!metricInput) return;

    let value = 0;
    if (mode === 'running') {
      value = parseTimeToSeconds(metricInput);
      if (value === 0) return;
    } else {
      value = parseFloat(metricInput);
      if (isNaN(value)) return;
    }

    const [y, m, d] = dateInput.split('-').map(Number);
    const date = new Date(y, m - 1, d).getTime();
    const sessionNumber = sessions.length + 1;

    if (!activeExerciseId) return;
    addSession(activeExerciseId, { sessionNumber, date, value });
    setMetricInput('');
  };

  const handleTargetSubmit = (e: React.FormEvent | React.FocusEvent) => {
    e.preventDefault();
    if (!activeExerciseId) return;
    let val = 0;
    if (mode === 'running') {
      val = parseTimeToSeconds(targetInput);
    } else {
      val = parseFloat(targetInput);
    }
    if (!isNaN(val) && val > 0) {
      setTargetValue(activeExerciseId, val);
    }
    setIsEditingTarget(false);
  };

  const targetTimeRemaining = useMemo(() => {
    if (!projectedDateTimestamp || isUnreachable) return '';
    const now = Date.now();
    const diffDays = Math.ceil((projectedDateTimestamp - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Overdue';
    if (diffDays < 15) return `${diffDays} d`;
    if (diffDays < 63) return `${Math.round(diffDays / 7)} wk`;
    return `${Math.round(diffDays / 30)} mo`;
  }, [projectedDateTimestamp, isUnreachable]);

  const formatMetric = (val: number) => {
    if (mode === 'running') return formatSecondsToTime(val);
    return val.toFixed(2);
  };

  const unitLabel = mode === 'weightlifting' ? (unit === 'metric' ? 'kg' : 'lbs') : (unit === 'metric' ? 'min/km' : 'min/mi');

  // Chart Data Preparation
  const chartData = useMemo(() => {
    if (sessions.length === 0) return [];

    const sortedSessions = [...sessions].sort((a, b) => a.date - b.date);
    const firstDate = new Date(sortedSessions[0].date).setHours(0,0,0,0);
    const lastSession = sortedSessions[sortedSessions.length - 1];
    const lastDate = new Date(lastSession.date).setHours(0,0,0,0);
    
    let endDate = lastDate;
    let projDate: number | null = null;
    if (projectedDateTimestamp && !isUnreachable && projectedDateTimestamp > lastSession.date) {
      projDate = new Date(projectedDateTimestamp).setHours(0,0,0,0);
      endDate = projDate;
    }

    const timelineStart = new Date(firstDate);
    timelineStart.setMonth(timelineStart.getMonth() - 1);
    const timelineEnd = new Date(endDate);
    timelineEnd.setMonth(timelineEnd.getMonth() + 1);

    const daysInInterval = eachDayOfInterval({
      start: timelineStart,
      end: timelineEnd
    });

    return daysInInterval.map(day => {
      const timestamp = day.getTime();
      const isMonthMarker = day.getDate() === 1;
      const daySessions = sortedSessions.filter(s => new Date(s.date).setHours(0,0,0,0) === timestamp);
      const actual = daySessions.length > 0 ? daySessions[daySessions.length - 1].value : null;
      const sessionId = daySessions.length > 0 ? daySessions[daySessions.length - 1].id : null;

      let lineYValue = null;
      let projectedYValue = null;
      let isProjected = false;

      if (timestamp >= firstDate && timestamp <= lastDate) {
          const prevSession = sortedSessions.slice().reverse().find(s => new Date(s.date).setHours(0,0,0,0) <= timestamp);
          const nextSession = sortedSessions.find(s => new Date(s.date).setHours(0,0,0,0) >= timestamp);
          if (prevSession && nextSession) {
              const prevTs = new Date(prevSession.date).setHours(0,0,0,0);
              const nextTs = new Date(nextSession.date).setHours(0,0,0,0);
              if (prevTs === nextTs) {
                  lineYValue = prevSession.value;
              } else {
                  const ratio = (timestamp - prevTs) / (nextTs - prevTs);
                  lineYValue = prevSession.value + ratio * (nextSession.value - prevSession.value);
              }
          }
      } else if (projDate && timestamp > lastDate && timestamp <= projDate) {
          const ratio = (timestamp - lastDate) / (projDate - lastDate);
          lineYValue = lastSession.value + ratio * (targetValue - lastSession.value);
          projectedYValue = lineYValue;
          isProjected = true;
      }

      let timeRemaining = '';
      if (projDate === timestamp) {
          const now = Date.now();
          const diffDays = Math.ceil((projectedDateTimestamp! - now) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) timeRemaining = 'Overdue';
          else if (diffDays < 15) timeRemaining = `in ${diffDays} d`;
          else if (diffDays < 63) timeRemaining = `in ${Math.round(diffDays / 7)} wk`;
          else timeRemaining = `in ${Math.round(diffDays / 30)} mo`;
      }

      return {
          timestamp,
          dateLabel: format(day, 'MMM d').toUpperCase(),
          monthLabel: format(day, 'MMM').toUpperCase(),
          actual,
          sessionId,
          isMonthMarker,
          lineYValue,
          projectedYValue,
          isProjected,
          isProjectedGoal: projDate === timestamp,
          timeRemaining: timeRemaining.toUpperCase()
      };
    });
  }, [sessions, projectedDateTimestamp, isUnreachable, targetValue]);

  const prevAvg = sessions.length > 1 ? sessions.slice(-3, -1).reduce((acc, s) => acc + s.value, 0) / Math.min(2, sessions.length - 1) : 0;
  const lastValue = sessions.length > 0 ? sessions[sessions.length - 1].value : 0;
  const delta = prevAvg > 0 ? ((lastValue - prevAvg) / prevAvg) * 100 : 0;

  const peakValue = useMemo(() => {
    if (sessions.length === 0) return 0;
    if (mode === 'running') {
      return Math.min(...sessions.map(s => s.value));
    }
    return Math.max(...sessions.map(s => s.value));
  }, [sessions, mode]);

  const currentLoadRatio = useMemo(() => {
    if (sessions.length === 0 || peakValue === 0) return 0;
    const current = sessions[sessions.length - 1].value;
    if (mode === 'running') {
      return peakValue / current;
    }
    return current / peakValue;
  }, [sessions, peakValue, mode]);

  const loadSegments = Math.max(1, Math.min(5, Math.round(currentLoadRatio * 5)));

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];
    const vals = chartData.map(d => d.lineYValue).filter((v): v is number => v !== null);
    const actualVals = sessions.map(s => s.value);
    const all = [...vals, ...actualVals, targetValue];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const padding = (max - min) * 0.15 || 20;
    return [min - padding, max + padding];
  }, [chartData, sessions, targetValue]);

  // Efficient lookup for hover interaction
  const chartLookup = useMemo(() => {
    const lookup: Record<number, any> = {};
    chartData.forEach(d => {
      lookup[d.timestamp] = d;
    });
    return lookup;
  }, [chartData]);

  useEffect(() => {
    if (hoverState.isActive && hoverState.timestamp && !editingNode) {
      setDateInput(format(new Date(hoverState.timestamp), 'yyyy-MM-dd'));
    }
  }, [hoverState.isActive, hoverState.timestamp, editingNode]);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-8 font-sans text-black">
      <style dangerouslySetInnerHTML={{ __html: `
        svg, .recharts-surface, .recharts-wrapper { outline: none !important; -webkit-tap-highlight-color: transparent !important; }
        .recharts-active-dot circle { filter: none !important; }
      `}} />
      <div className="w-full max-w-[1216px] flex flex-col gap-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-light tracking-tight flex items-center gap-2">
              Plateau Breaker 
              <div className="relative flex items-center" ref={dropdownRef}>
                <button 
                  onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                  className="text-[#D4D4D8] flex items-center gap-1 hover:text-[#A1A1AA] transition-colors"
                >
                  / {mode === 'weightlifting' ? 'Weight Training' : 'Running'}
                  <svg className="w-6 h-6 md:w-[30px] md:h-[30px] xl:w-9 xl:h-9" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 9L12 15L18 9H6Z" />
                  </svg>
                </button>
                {isModeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-full min-w-[200px] bg-white border border-[#F4F4F5] rounded-xl shadow-lg overflow-hidden z-50">
                    <button 
                      className={cn("w-full text-left px-4 py-3 text-xs md:text-sm hover:bg-[#FAFAFA] transition-colors tracking-wide", mode === 'weightlifting' ? "font-normal text-black" : "font-light text-[#A1A1AA]")}
                      onClick={() => { setMode('weightlifting'); setIsModeDropdownOpen(false); }}
                    >
                      Weight Training
                    </button>
                    <button 
                      className={cn("w-full text-left px-4 py-3 text-xs md:text-sm hover:bg-[#FAFAFA] transition-colors tracking-wide", mode === 'running' ? "font-normal text-black" : "font-light text-[#A1A1AA]")}
                      onClick={() => { setMode('running'); setIsModeDropdownOpen(false); }}
                    >
                      Running
                    </button>
                    <div className="border-t border-[#F4F4F5] mt-1" />
                    <button 
                      className="w-full text-left px-4 py-3 text-xs md:text-sm hover:bg-red-50 text-red-500 transition-colors tracking-wide font-light"
                      onClick={() => { 
                        clearAllData(); 
                        setIsModeDropdownOpen(false); 
                        setIsOnboarding(true);
                      }}
                    >
                      Clear Data
                    </button>
                  </div>
                )}
              </div>
            </h1>
            <p className="text-[#A1A1AA] text-xs md:text-sm">
              Precision-focused session analysis and trajectory projection for fitness tracking.
            </p>
          </div>
          
          <div className="flex bg-[#F4F4F5] p-1 rounded-lg shrink-0">
            <button 
              onClick={() => setUnit('metric')}
              className={cn("px-3 py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-colors", unit === 'metric' ? "bg-white text-black shadow-sm" : "text-[#A1A1AA] hover:text-black")}
            >
              Metric
            </button>
            <button 
              onClick={() => setUnit('imperial')}
              className={cn("px-3 py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-colors", unit === 'imperial' ? "bg-white text-black shadow-sm" : "text-[#A1A1AA] hover:text-black")}
            >
              Imperial
            </button>
          </div>
        </div>

        {/* Top Metrics Card */}
        <div className="bg-white rounded-xl border border-[#F4F4F5] p-5 flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-[84px]">
          <button 
            onClick={() => setIsNewExerciseModalOpen(true)}
            className="w-full lg:w-[240px] bg-black text-white px-8 py-4 rounded-xl font-light flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors text-sm md:text-base shrink-0"
          >
            + New Exercise
          </button>

          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-8 w-full justify-between flex-1">
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className={cn("text-lg md:text-xl xl:text-2xl font-light", slope <= 0 && mode === 'weightlifting' ? "text-red-500" : "")}>
                  {velocityPerWeek > 0 ? '+' : ''}{formatMetric(velocityPerWeek)}
                </span>
                <span className="text-[#A1A1AA] text-[10px] md:text-xs font-mono uppercase">{unitLabel} / Week</span>
              </div>
              <span className="text-[9px] md:text-[10px] text-[#A1A1AA] font-mono uppercase tracking-widest">Velocity Index</span>
            </div>

            <div className="hidden lg:block w-[1px] h-12 bg-[#F4F4F5]" />

            <div 
              className="flex flex-col gap-1 cursor-default group"
              onMouseEnter={() => setIsHoveringTargetDate(true)}
              onMouseLeave={() => setIsHoveringTargetDate(false)}
            >
              <span className="text-lg md:text-xl xl:text-2xl font-light text-black group-hover:text-[#FF4C00] transition-colors">
                {isUnreachable
                  ? 'Unreachable'
                  : projectedDateTimestamp
                    ? (isHoveringTargetDate ? targetTimeRemaining : formatProjectedDate(projectedDateTimestamp))
                    : 'N/A'}
              </span>
              <span className="text-[9px] md:text-[10px] text-[#A1A1AA] group-hover:text-[#FF4C00] font-mono uppercase tracking-widest transition-colors">Projected Goal Date</span>
            </div>

            <div className="hidden lg:block w-[1px] h-12 bg-[#F4F4F5]" />

            <div className="flex flex-col gap-2 flex-1 w-full max-w-[419px]">
              <div className="flex justify-between items-baseline">
                <span className="text-lg md:text-xl xl:text-2xl font-light tracking-tighter">Training Load</span>
                <span className="text-lg md:text-xl xl:text-2xl font-light tracking-tighter">{loadSegments >= 4 ? 'High' : loadSegments >= 2 ? 'Medium' : 'Low'}</span>
              </div>
              <div className="h-3 w-full bg-gradient-to-r from-[#FFDBCC] to-[#FF4C00] rounded-lg relative overflow-hidden">
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-white/90 transition-all duration-500" 
                  style={{ width: `${100 - (currentLoadRatio * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Split */}
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
          
          {/* Sidebar */}
          <div className={cn(
            "w-full lg:w-[280px] shrink-0 bg-white rounded-xl border p-5 flex flex-col h-fit transition-all duration-500",
            sessions.length === 0 ? "border-[#FF4C00] shadow-[0_0_20px_rgba(255,76,0,0.1)] ring-1 ring-[#FF4C00]/20" : "border-[#F4F4F5]"
          )}>
            <div className="flex items-center justify-between mb-6">
              <span className="text-[10px] md:text-xs font-mono text-[#A1A1AA] uppercase tracking-widest">Session Entry</span>
              <ClipboardEdit className="w-4 h-4 text-[#D4D4D8]" />
            </div>

            <form onSubmit={handleAddSession} className="flex flex-col gap-4 flex-1">
              <div className={cn(
                "flex flex-col gap-1.5 p-2 -m-2 rounded-lg border transition-colors",
                (hoverState.isActive || !!editingNode) ? "border-[#FF4C00]" : "border-transparent"
              )}>
                <label className={cn(
                  "text-[9px] md:text-[10px] font-mono font-medium uppercase tracking-wider transition-colors",
                  (hoverState.isActive || !!editingNode) ? "text-[#FF4C00]" : "text-black"
                )}>Date</label>
                <input 
                  type="date" 
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className={cn(
                    "bg-[#FAFAFA] border-none rounded-md px-3 py-2.5 text-[10px] md:text-xs outline-none transition-colors",
                    (hoverState.isActive || !!editingNode) ? "text-[#FF4C00]" : "text-[#D4D4D8] focus:text-black focus:ring-1 focus:ring-[#F4F4F5]"
                  )}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] md:text-[10px] font-mono font-medium text-black uppercase tracking-wider">Session #</label>
                <input 
                  type="number" 
                  value={sessions.length + 1}
                  readOnly
                  className="bg-[#FAFAFA] border-none rounded-md px-3 py-2.5 text-[10px] md:text-xs text-[#D4D4D8] outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] md:text-[10px] font-mono font-medium text-black uppercase tracking-wider">Metric ({unitLabel})</label>
                <input 
                  type="text" 
                  value={metricInput}
                  onChange={(e) => setMetricInput(e.target.value)}
                  placeholder={mode === 'running' ? "MM:SS" : `e.g. ${unit === 'metric' ? '100.0' : '225'}`}
                  className="bg-[#FAFAFA] border-none rounded-md px-3 py-2.5 text-[10px] md:text-xs text-black placeholder:text-[#D4D4D8] focus:ring-1 focus:ring-[#F4F4F5] outline-none transition-colors"
                  required
                />
              </div>

              <div className="mt-4 pt-4 border-t border-[#FAFAFA] flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] md:text-xs text-[#A1A1AA]">Prev Avg</span>
                  <span className="text-xs md:text-sm font-medium text-[#52525B]">{formatMetric(prevAvg)} {unitLabel}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] md:text-xs text-[#A1A1AA]">Delta</span>
                  <span className={cn("text-xs md:text-sm font-medium", delta > 0 ? "text-[#059669]" : delta < 0 ? "text-red-500" : "text-[#52525B]")}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                  </span>
                </div>
              </div>
              
              <button type="submit" className="w-full mt-2 bg-black text-white py-3 rounded-md font-mono text-[9px] md:text-[10px] font-light flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors uppercase tracking-wider">
                Log Performance &rarr;
              </button>
            </form>
          </div>

          {/* Chart Area Wrapper */}
          <div className="flex-1 flex flex-col min-w-0 min-h-[400px]">
            {/* Horizontal Tabs */}
            <div className="flex items-end gap-0.5 -mb-[1px] z-10 relative flex-wrap">
              <div className="w-[45px] h-[45px] flex items-center justify-center shrink-0">
                <button
                  onClick={() => setIsNewExerciseModalOpen(true)}
                  className="w-8 h-8 bg-[#FAFAFA] border-[#F4F4F5] text-[#A1A1AA] hover:bg-gray-50 hover:text-black rounded-lg border transition-colors flex items-center justify-center"
                  aria-label="Add new exercise"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {exercises.filter(e => e.mode === mode).length > 0 && exercises.filter(e => e.mode === mode).map((ex) => (
                <div key={ex.id} className="relative group flex items-center">
                  <button
                    onClick={() => setActiveExercise(ex.id)}
                    className={cn(
                      "px-4 py-3 text-xs md:text-sm font-medium rounded-t-xl border transition-all duration-200 whitespace-nowrap flex items-center",
                      activeExerciseId === ex.id 
                        ? "bg-white border-[#F4F4F5] border-b-white text-black" 
                        : "bg-[#FAFAFA] border-[#F4F4F5] border-b-[#F4F4F5] text-[#A1A1AA] hover:bg-gray-50 hover:text-black"
                    )}
                  >
                    <span>{ex.name}</span>
                    <div className="w-0 overflow-hidden opacity-0 group-hover:w-4 group-hover:ml-2 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center">
                      <X 
                        className="w-3.5 h-3.5 cursor-pointer hover:text-red-500 shrink-0" 
                        onClick={(e) => { e.stopPropagation(); setExerciseToDelete(ex.id); }}
                      />
                    </div>
                  </button>
                  
                  {/* Modal for deletion */}
                  {exerciseToDelete === ex.id && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-white border border-[#F4F4F5] rounded-xl shadow-xl p-3 z-[100]">
                      <p className="text-xs text-center mb-3 text-black whitespace-normal">Delete this view and its data?</p>
                      <div className="flex gap-2">
                        <button onClick={() => setExerciseToDelete(null)} className="flex-1 px-2 py-1.5 bg-[#FAFAFA] text-black text-xs rounded-md hover:bg-gray-100 border border-[#F4F4F5]">Cancel</button>
                        <button onClick={() => { deleteExercise(ex.id); setExerciseToDelete(null); }} className="flex-1 px-2 py-1.5 bg-red-50 text-red-600 text-xs rounded-md hover:bg-red-100 font-medium">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Chart Area */}
            <div className="flex-1 w-full bg-white rounded-xl border border-[#F4F4F5] p-4 md:p-8 flex flex-col shadow-sm relative z-0 min-h-[400px] md:min-h-[500px]">
              {sessions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#FAFAFA] rounded-xl border border-dashed border-[#E4E4E7]">
                  <p className="text-sm md:text-base font-mono text-[#A1A1AA] uppercase tracking-widest">Awaiting Session Entry</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 md:mb-12 gap-4">
                    <h2 className="text-lg md:text-xl xl:text-2xl font-light capitalize tracking-tighter">Performance Projection</h2>
                    <div className="flex flex-col items-start sm:items-end">
                      <span className="text-[8px] md:text-[9px] font-mono font-medium text-[#FF4C00] uppercase tracking-widest mb-1">Target {mode === 'weightlifting' ? 'Weight' : 'Pace'}</span>
                      {isEditingTarget ? (
                        <form onSubmit={handleTargetSubmit} className="flex items-baseline gap-1">
                          <input
                            type="text"
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                            className="text-2xl md:text-3xl xl:text-4xl font-light w-24 md:w-32 text-right outline-none border-b border-[#D4D4D8] focus:border-[#FF4C00]"
                            autoFocus
                            onBlur={handleTargetSubmit}
                          />
                          <span className="text-[10px] md:text-xs font-mono font-light text-[#A1A1AA]">{unitLabel}</span>
                        </form>
                      ) : (
                        <div 
                          className="flex items-baseline gap-1 cursor-pointer group"
                          onClick={() => {
                            setTargetInput(mode === 'running' ? formatSecondsToTime(targetValue) : targetValue.toString());
                            setIsEditingTarget(true);
                          }}
                        >
                          <span className="text-2xl md:text-3xl xl:text-4xl font-light group-hover:text-[#FF4C00] transition-colors">{formatMetric(targetValue)}</span>
                          <span className="text-[10px] md:text-xs font-mono font-light text-[#A1A1AA]">{unitLabel}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cn("flex-1 w-full min-h-[300px] relative select-none", hoverState.isActive ? "cursor-crosshair" : "cursor-default")}>
                    {/* Custom Target Label */}
                    <div className="absolute left-0 top-0 -mt-6 text-[13px] text-[#FF5400] z-10 pointer-events-none select-none">Target</div>
                    
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeExerciseId + mode}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="w-full h-full absolute inset-0 z-20 outline-none"
                      >
                        {/* Hover Visuals (Ref-based for Performance) */}
                        <div 
                          ref={verticalLineRef}
                          className="absolute top-0 bottom-[30px] w-[1px] bg-[#F4F4F5] z-[25] pointer-events-none opacity-0 transition-opacity duration-150"
                        />
                        <div 
                          ref={floatingLabelRef}
                          className="absolute bg-white border border-[#F4F4F5] px-2 py-1 rounded shadow-sm text-[9px] font-mono text-[#A1A1AA] z-[40] pointer-events-none whitespace-nowrap opacity-0 transition-opacity duration-150"
                          style={{ transform: 'translateY(-50%)' }}
                        >
                          {hoverState.dateLabel}
                        </div>
                        <div 
                          ref={followDotRef}
                          className={cn(
                            "absolute border border-white rounded-full z-[35] pointer-events-none opacity-0 transition-opacity duration-150",
                            hoverState.isExisting ? "w-[14px] h-[14px] bg-[#FF4C00]" : "w-[8px] h-[8px] bg-black"
                          )}
                          style={{ transform: 'translate(-50%, -50%)' }}
                        />

                        {/* Event Capture Overlay */}
                        <div 
                          className="absolute inset-0 z-[30] cursor-crosshair"
                          onMouseMove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const chartWidth = rect.width - 10;
                            const percent = Math.min(Math.max(x / chartWidth, 0), 1);
                            
                            const index = Math.round(percent * (chartData.length - 1));
                            const payload = chartData[index];

                            if (payload) {
                              const date = new Date(payload.timestamp);
                              const start = startOfWeek(date);
                              const end = addDays(start, 6);
                              const weekRange = `${format(start, 'MMM d')} - ${format(end, 'd')}`;
                              
                              // Corrected Y Snapping Math (Accounting for 10px top margin and 30px XAxis)
                              const yVal = payload.lineYValue ?? payload.actual ?? yDomain[0];
                              const plotHeight = rect.height - 40;
                              const yPos = 10 + (1 - (yVal - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotHeight;

                              // Direct DOM updates for zero-lag high-frequency motion
                              if (verticalLineRef.current) {
                                verticalLineRef.current.style.opacity = '1';
                                verticalLineRef.current.style.left = `${x}px`;
                              }
                              if (floatingLabelRef.current) {
                                floatingLabelRef.current.style.opacity = '1';
                                floatingLabelRef.current.style.left = `${x + 12}px`;
                                floatingLabelRef.current.style.top = `${yPos - 24}px`;
                                floatingLabelRef.current.innerText = weekRange.toUpperCase();
                              }
                              if (followDotRef.current) {
                                followDotRef.current.style.opacity = '1';
                                followDotRef.current.style.left = `${x}px`;
                                followDotRef.current.style.top = `${yPos}px`;
                                // Update class for size/color if state changed
                                followDotRef.current.className = cn(
                                  "absolute border border-white rounded-full z-[35] pointer-events-none transition-all duration-75",
                                  payload.actual !== null ? "w-[14px] h-[14px] bg-[#FF4C00]" : "w-[8px] h-[8px] bg-black"
                                );
                              }

                              // Only trigger React re-render when the day actually changes
                              if (hoverState.timestamp !== payload.timestamp || !hoverState.isActive) {
                                setHoverState({
                                  isActive: true,
                                  timestamp: payload.timestamp,
                                  dateLabel: weekRange.toUpperCase(),
                                  x: x,
                                  y: yPos,
                                  isExisting: payload.actual !== null
                                });
                              }
                            }
                          }}
                          onMouseLeave={() => {
                            if (verticalLineRef.current) verticalLineRef.current.style.opacity = '0';
                            if (floatingLabelRef.current) floatingLabelRef.current.style.opacity = '0';
                            if (followDotRef.current) followDotRef.current.style.opacity = '0';
                            setHoverState(prev => ({ ...prev, isActive: false }));
                          }}
                          onMouseDown={() => {
                            if (editingNode) {
                              setEditingNode(null);
                              return;
                            }

                            if (hoverState.isActive && hoverState.timestamp) {
                              const payload = chartLookup[hoverState.timestamp];
                              if (payload) {
                                if (payload.actual !== null) {
                                  setEditingNode({
                                    id: payload.sessionId,
                                    x: hoverState.x,
                                    y: hoverState.y,
                                    value: payload.actual,
                                    dateLabel: payload.dateLabel,
                                    timestamp: payload.timestamp
                                  });
                                  setEditNodeValue(mode === 'running' ? formatSecondsToTime(payload.actual) : payload.actual.toString());
                                } else {
                                  setEditingNode({
                                    id: 'new',
                                    x: hoverState.x,
                                    y: hoverState.y,
                                    value: payload.lineYValue !== null ? payload.lineYValue : 0,
                                    dateLabel: payload.dateLabel,
                                    timestamp: payload.timestamp
                                  });
                                  const initialVal = payload.lineYValue !== null ? payload.lineYValue : 0;
                                  setEditNodeValue(mode === 'running' ? formatSecondsToTime(initialVal) : initialVal.toFixed(1));
                                }
                              }
                            }
                          }}
                        />
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart 
                            data={chartData} 
                            className="outline-none"
                            style={{ outline: 'none' }}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="0" vertical={true} horizontal={false} stroke="#F4F4F5" style={{ pointerEvents: 'none' }} />
                            <XAxis 
                              dataKey="timestamp" 
                              type="number"
                              domain={['dataMin', 'dataMax']}
                              scale="time"
                              height={30}
                              axisLine={false} 
                              tickLine={false} 
                              ticks={chartData.filter(d => d.isMonthMarker).map(d => d.timestamp)}
                              style={{ pointerEvents: 'none' }}
                              tick={(props: any) => {
                                const { x, y, payload } = props;
                                const dataPoint = chartData.find(d => d.timestamp === payload.value && d.isMonthMarker);
                                if (!dataPoint) return null;
                                return (
                                  <text x={x} y={y + 15} fill="#D4D4D8" fontSize={10} fontFamily="JetBrains Mono" fontWeight={700} letterSpacing="1px" textAnchor="middle" className="pointer-events-none">
                                    {dataPoint.monthLabel}
                                  </text>
                                );
                              }}
                            />
                            <YAxis domain={yDomain} hide />
                            <Tooltip shared={true} wrapperStyle={{ display: 'none' }} />
                            <ReferenceLine y={targetValue} stroke="#FF5400" strokeWidth={2} strokeDasharray="24 8" style={{ pointerEvents: 'none' }} />
                            
                            <Line type="linear" dataKey="lineYValue" stroke="transparent" strokeWidth={60} dot={false} activeDot={false} isAnimationActive={false} />

                            <Line 
                              type="linear" 
                              dataKey="actual" 
                              stroke="#000000" 
                              strokeWidth={3} 
                              isAnimationActive={false}
                              connectNulls={true}
                              dot={(props: any) => {
                                const { cx, cy, payload } = props;
                                if (payload.actual !== null && !payload.isMonthMarker) {
                                  return <circle key={`dot-${payload.timestamp}`} cx={cx} cy={cy} r={3} fill="#000" stroke="#fff" strokeWidth={2} className="pointer-events-none" />;
                                }
                                return <g key={`empty-${payload.timestamp}`}></g>;
                              }}
                              activeDot={false}
                            />
                            
                            <Line 
                              type="linear" 
                              dataKey="projectedYValue" 
                              stroke="#C9C9C9" 
                              strokeWidth={3} 
                              connectNulls={true}
                              style={{ pointerEvents: 'none' }}
                              dot={(props: any) => {
                                const { cx, cy, payload } = props;
                                if (payload.isProjectedGoal) {
                                  return (
                                    <g key={`proj-dot-${payload.timestamp}`} className="group cursor-pointer" style={{ pointerEvents: 'all' }}>
                                      <circle cx={cx} cy={cy} r={6} fill="#000" stroke="#FF5400" strokeWidth={3} />
                                      <text x={cx} y={cy + 24} className="fill-black group-hover:fill-[#FF4C00] transition-colors duration-300" fontSize={10} fontFamily="JetBrains Mono" fontWeight="light" textAnchor="middle">{payload.dateLabel}</text>
                                      <text x={cx} y={cy + 38} className="fill-black group-hover:fill-[#FF4C00] transition-colors duration-300" fontSize={9} fontFamily="JetBrains Mono" fontWeight="light" textAnchor="middle">{payload.timeRemaining}</text>
                                    </g>
                                  );
                                }
                                return <g key={`empty-proj-${payload.timestamp}`}></g>;
                              }}
                              activeDot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </motion.div>
                    </AnimatePresence>

                    {/* Temporary New Dot Overlay */}
                    {editingNode && editingNode.id === 'new' && (
                      <div 
                        className="absolute w-3.5 h-3.5 bg-[#FF5400] border-2 border-white rounded-full pointer-events-none z-20 shadow-sm"
                        style={{ left: editingNode.x, top: editingNode.y, transform: 'translate(-50%, -50%)' }} 
                      />
                    )}

                    {/* Recursive Editing Modal */}
                    <AnimatePresence>
                      {editingNode && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 10 }}
                          className="absolute z-50 bg-white border border-[#F4F4F5] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] p-4 flex flex-col gap-3 w-[220px]"
                          style={{ 
                            left: Math.min(Math.max(editingNode.x, 110), window.innerWidth - 110),
                            top: editingNode.y,
                            transform: editingNode.y < 240 ? 'translate(-50%, 0%)' : 'translate(-50%, -100%)',
                            marginTop: editingNode.y < 240 ? '24px' : '-24px'
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono font-medium text-[#A1A1AA] uppercase tracking-widest">{editingNode.dateLabel}</span>
                            <button onClick={() => setEditingNode(null)} className="text-[#A1A1AA] hover:text-black transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {editingNode.id === 'new' && editingNode.timestamp && (
                            <div className="flex flex-col gap-2 border-b border-[#F4F4F5] pb-3 mb-1">
                              <span className="text-[9px] text-[#A1A1AA] uppercase tracking-widest font-mono">Select Day</span>
                              <div className="flex justify-between">
                                {(() => {
                                  const start = startOfWeek(new Date(editingNode.timestamp));
                                  return Array.from({ length: 7 }).map((_, i) => {
                                    const day = addDays(start, i);
                                    const isSelected = isSameDay(day, new Date(editingNode.timestamp));
                                    return (
                                      <button
                                        key={i}
                                        onClick={() => {
                                          const newTs = day.getTime();
                                          setDateInput(format(day, 'yyyy-MM-dd'));
                                          setEditingNode({
                                            ...editingNode,
                                            timestamp: newTs,
                                            dateLabel: format(day, 'MMM d').toUpperCase()
                                          });
                                        }}
                                        className={cn(
                                          "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-mono transition-all",
                                          isSelected ? "bg-[#FF4C00] text-white" : "bg-[#FAFAFA] text-black hover:bg-[#F4F4F5]"
                                        )}
                                      >
                                        {format(day, 'd')}
                                      </button>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          )}

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-[#A1A1AA] uppercase tracking-wider">Value ({unitLabel})</label>
                            <input 
                              type="text" 
                              value={editNodeValue}
                              onChange={(e) => setEditNodeValue(e.target.value)}
                              className="w-full text-sm font-medium border border-[#E4E4E7] rounded-md px-3 py-2 outline-none focus:border-black transition-colors"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  let val = 0;
                                  if (mode === 'running') val = parseTimeToSeconds(editNodeValue);
                                  else val = parseFloat(editNodeValue);
                                  if (!isNaN(val) && val > 0 && activeExerciseId) {
                                    if (editingNode.id === 'new' && editingNode.timestamp) {
                                      const sessionNumber = sessions.length + 1;
                                      addSession(activeExerciseId, { sessionNumber, date: editingNode.timestamp, value: val });
                                    } else updateSession(activeExerciseId, editingNode.id, val);
                                    setEditingNode(null);
                                  }
                                }
                              }}
                            />
                          </div>
                          <div className="flex gap-2 mt-1">
                            <button 
                              onClick={() => {
                                let val = 0;
                                if (mode === 'running') val = parseTimeToSeconds(editNodeValue);
                                else val = parseFloat(editNodeValue);
                                if (!isNaN(val) && val > 0 && activeExerciseId) {
                                  if (editingNode.id === 'new' && editingNode.timestamp) {
                                    const sessionNumber = sessions.length + 1;
                                    addSession(activeExerciseId, { sessionNumber, date: editingNode.timestamp, value: val });
                                  } else updateSession(activeExerciseId, editingNode.id, val);
                                  setEditingNode(null);
                                }
                              }}
                              className="flex-1 bg-black text-white text-[10px] font-medium py-2 rounded-md hover:bg-zinc-800 transition-colors uppercase tracking-wider"
                            >
                              {editingNode.id === 'new' ? 'Add' : 'Save'}
                            </button>
                            {editingNode.id !== 'new' && (
                              <button 
                                onClick={() => {
                                  if (activeExerciseId) {
                                    deleteSession(activeExerciseId, editingNode.id);
                                    setEditingNode(null);
                                  }
                                }}
                                className="flex-1 bg-red-50 text-red-600 text-[10px] font-medium py-2 rounded-md hover:bg-red-100 transition-colors uppercase tracking-wider"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding Modal */}
      {isOnboarding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-[#F4F4F5]"
          >
            <div className="p-10 flex flex-col items-center text-center gap-8">
              <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-light tracking-tight">Welcome to Plateau Breaker</h2>
                <p className="text-[#A1A1AA] text-sm font-mono uppercase tracking-widest">Select your primary training focus</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 w-full">
                <button 
                  onClick={() => {
                    setMode('weightlifting');
                    setIsOnboarding(false);
                    setIsNewExerciseModalOpen(true);
                  }}
                  className="group flex flex-col items-center gap-4 p-8 rounded-xl border border-[#F4F4F5] hover:border-black hover:bg-[#FAFAFA] transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-full bg-[#FAFAFA] group-hover:bg-black group-hover:text-white flex items-center justify-center transition-colors">
                    <ClipboardEdit className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-sm">Weight Training</span>
                    <span className="text-[10px] text-[#A1A1AA] uppercase tracking-wider">Lifting & Strength</span>
                  </div>
                </button>

                <button 
                  onClick={() => {
                    setMode('running');
                    setIsOnboarding(false);
                    setIsNewExerciseModalOpen(true);
                  }}
                  className="group flex flex-col items-center gap-4 p-8 rounded-xl border border-[#F4F4F5] hover:border-black hover:bg-[#FAFAFA] transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-full bg-[#FAFAFA] group-hover:bg-black group-hover:text-white flex items-center justify-center transition-colors">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 4v16M17 4v16M21 4v16M1 4h4l3 3h7l3-3h4" />
                    </svg>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-sm">Running</span>
                    <span className="text-[10px] text-[#A1A1AA] uppercase tracking-wider">Pace & Distance</span>
                  </div>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* New Exercise Modal */}
      {isNewExerciseModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-[#F4F4F5]">
            <div className="flex items-center justify-between p-6 border-b border-[#F4F4F5]">
              <h3 className="text-lg md:text-xl font-medium">
                {pendingExerciseName ? `Set Target for ${pendingExerciseName}` : 'Add New Exercise'}
              </h3>
              <button 
                onClick={() => {
                  setIsNewExerciseModalOpen(false);
                  setPendingExerciseName(null);
                }}
                className="text-[#A1A1AA] hover:text-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {!pendingExerciseName ? (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-[10px] md:text-xs font-mono text-[#A1A1AA] uppercase tracking-widest mb-2 block">Select Mode</label>
                    <div className="flex bg-[#F4F4F5] p-1 rounded-lg">
                      <button onClick={() => setMode('weightlifting')} className={cn("flex-1 py-2 text-xs md:text-sm font-medium rounded-md transition-colors", mode === 'weightlifting' ? "bg-white text-black shadow-sm" : "text-[#A1A1AA] hover:text-black")}>Weight Training</button>
                      <button onClick={() => setMode('running')} className={cn("flex-1 py-2 text-xs md:text-sm font-medium rounded-md transition-colors", mode === 'running' ? "bg-white text-black shadow-sm" : "text-[#A1A1AA] hover:text-black")}>Running</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] md:text-xs font-mono text-[#A1A1AA] uppercase tracking-widest mb-2 block">Common Exercises</label>
                    <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
                      {COMMON_EXERCISES[mode].map((exName) => {
                        const isAlreadyAdded = exercises.some(e => e.name === exName && e.mode === mode);
                        return (
                          <button
                            key={exName}
                            disabled={isAlreadyAdded}
                            onClick={() => {
                              setPendingExerciseName(exName);
                              let defaultVal = mode === 'weightlifting' ? '100' : '08:00';
                              setTargetInput(defaultVal);
                            }}
                            className={cn("text-left px-4 py-3 rounded-lg border transition-colors flex justify-between items-center text-sm md:text-base", isAlreadyAdded ? "bg-[#FAFAFA] border-[#F4F4F5] text-[#D4D4D8] cursor-not-allowed" : "bg-white border-[#E4E4E7] hover:border-black text-black")}
                          >
                            <span>{exName}</span>
                            {isAlreadyAdded && <span className="text-[10px] font-mono uppercase tracking-widest">Added</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col items-center gap-2 py-4">
                    <label className="text-[10px] md:text-xs font-mono text-[#A1A1AA] uppercase tracking-widest">Goal {mode === 'weightlifting' ? 'Weight' : 'Pace'}</label>
                    <div className="flex items-baseline gap-2">
                      <input 
                        type="text"
                        value={targetInput}
                        onChange={(e) => setTargetInput(e.target.value)}
                        className="text-5xl md:text-6xl font-light text-center w-full max-w-[240px] outline-none border-b-2 border-transparent focus:border-black transition-colors pb-2"
                        autoFocus
                        placeholder={mode === 'running' ? "00:00" : "0"}
                      />
                      <span className="text-xl text-[#A1A1AA] font-mono font-light">{unitLabel}</span>
                    </div>
                    <p className="text-[10px] text-[#A1A1AA] mt-4 max-w-[280px] text-center uppercase tracking-wider leading-relaxed">
                      This is the performance level you want to achieve.
                    </p>
                  </div>
                  
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setPendingExerciseName(null)}
                      className="flex-1 py-4 rounded-xl border border-[#F4F4F5] text-xs font-mono uppercase tracking-widest hover:bg-[#FAFAFA] transition-colors"
                    >
                      Back
                    </button>
                    <button 
                      onClick={() => {
                        let val = 0;
                        if (mode === 'running') val = parseTimeToSeconds(targetInput);
                        else val = parseFloat(targetInput);
                        
                        if (!isNaN(val) && val > 0) {
                          addExercise(pendingExerciseName, mode, val);
                          setIsNewExerciseModalOpen(false);
                          setPendingExerciseName(null);
                        }
                      }}
                      className="flex-[2] bg-black text-white py-4 rounded-xl text-xs font-mono uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-xl shadow-black/10 active:scale-[0.98]"
                    >
                      Start Tracking
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
