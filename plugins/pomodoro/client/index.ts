import type { ClientPluginAPI } from '../../../types/client';

const { React } = window.__krytonPluginDeps;
const { createElement: h, useState, useEffect } = React;

// ---------------------------------------------------------------------------
// Timer constants
// ---------------------------------------------------------------------------

const WORK_DURATION = 25 * 60;       // 25 minutes in seconds
const SHORT_BREAK = 5 * 60;          // 5 minutes
const LONG_BREAK = 15 * 60;          // 15 minutes
const POMODOROS_BEFORE_LONG = 4;

type TimerState = 'idle' | 'work' | 'break';

// ---------------------------------------------------------------------------
// Shared timer state (module-level so status bar item can subscribe)
// ---------------------------------------------------------------------------

interface PomodoroState {
  timerState: TimerState;
  secondsLeft: number;
  pomodorosCompleted: number;
  isBreak: boolean;
}

let sharedState: PomodoroState = {
  timerState: 'idle',
  secondsLeft: WORK_DURATION,
  pomodorosCompleted: 0,
  isBreak: false,
};

let listeners: Array<(s: PomodoroState) => void> = [];
let intervalId: ReturnType<typeof setInterval> | null = null;
let notifyRef: ClientPluginAPI['notify'] | null = null;

function setState(next: Partial<PomodoroState>): void {
  sharedState = { ...sharedState, ...next };
  listeners.forEach((fn) => fn(sharedState));
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startBreak(isLong: boolean): void {
  setState({
    timerState: 'break',
    isBreak: true,
    secondsLeft: isLong ? LONG_BREAK : SHORT_BREAK,
  });
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(tick, 1000);
}

function tick(): void {
  const next = sharedState.secondsLeft - 1;
  if (next <= 0) {
    if (sharedState.isBreak) {
      // Break finished — go idle
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      setState({ timerState: 'idle', secondsLeft: WORK_DURATION, isBreak: false });
      notifyRef?.info('Break over! Ready for the next session.');
    } else {
      // Work session finished
      const completed = sharedState.pomodorosCompleted + 1;
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      setState({ pomodorosCompleted: completed, secondsLeft: 0, timerState: 'idle' });
      const isLong = completed % POMODOROS_BEFORE_LONG === 0;
      notifyRef?.info('Work session complete! Take a break.');
      startBreak(isLong);
    }
    return;
  }
  setState({ secondsLeft: next });
}

function startWork(): void {
  if (intervalId) clearInterval(intervalId);
  setState({ timerState: 'work', isBreak: false, secondsLeft: WORK_DURATION });
  intervalId = setInterval(tick, 1000);
}

function stopTimer(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  setState({ timerState: 'idle', secondsLeft: WORK_DURATION, isBreak: false });
}

function usePomodoroState(): PomodoroState {
  const [state, setLocalState] = useState<PomodoroState>(sharedState);
  useEffect(() => {
    listeners.push(setLocalState);
    return () => {
      listeners = listeners.filter((fn) => fn !== setLocalState);
    };
  }, []);
  return state;
}

// ---------------------------------------------------------------------------
// Status bar component
// ---------------------------------------------------------------------------

function PomodoroStatusItem(): any {
  const state = usePomodoroState();

  const label = `\uD83C\uDF45 ${formatTime(state.secondsLeft)}`;

  const color =
    state.timerState === 'idle'
      ? '#9ca3af'          // gray
      : state.timerState === 'work'
      ? '#22c55e'          // green
      : '#3b82f6';         // blue (break)

  const title =
    state.timerState === 'idle'
      ? 'Click to start a 25-min work session'
      : state.timerState === 'work'
      ? `Working — ${formatTime(state.secondsLeft)} left. Click to stop.`
      : `Break — ${formatTime(state.secondsLeft)} left. Click to skip.`;

  function handleClick(): void {
    if (state.timerState === 'idle') {
      startWork();
    } else {
      stopTimer();
    }
  }

  return h('button', {
    onClick: handleClick,
    title,
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '12px',
      fontFamily: 'monospace',
      color,
      padding: '0 8px',
      lineHeight: '1',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      transition: 'color 0.2s',
    },
  }, label);
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

export function activate(api: ClientPluginAPI): void {
  notifyRef = api.notify;

  api.ui.registerStatusBarItem(PomodoroStatusItem, {
    id: 'pomodoro-timer',
    position: 'right',
    order: 10,
  });
}

export function deactivate(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  listeners = [];
  notifyRef = null;
  sharedState = {
    timerState: 'idle',
    secondsLeft: WORK_DURATION,
    pomodorosCompleted: 0,
    isBreak: false,
  };
}
