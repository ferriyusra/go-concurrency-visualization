'use client';

import { useState, useRef, useCallback } from 'react';
import type { SimulationStatus, SimulationEvent } from '@/types/simulation';

type SimulationEngine = {
	status: SimulationStatus;
	events: SimulationEvent[];
	speed: number;
	elapsed: number;
	start: () => void;
	stop: () => void;
	reset: () => void;
	setSpeed: (speed: number) => void;
	pushEvent: (type: string, data: Record<string, unknown>) => void;
};

export function useSimulationEngine(
	runFn: (ctx: {
		pushEvent: (type: string, data: Record<string, unknown>) => void;
		delay: (ms: number) => Promise<boolean>;
		isStopped: () => boolean;
	}) => Promise<void>,
): SimulationEngine {
	const [status, setStatus] = useState<SimulationStatus>('idle');
	const [events, setEvents] = useState<SimulationEvent[]>([]);
	const [speed, setSpeed] = useState(1);
	const [elapsed, setElapsed] = useState(0);
	const eventIdRef = useRef(0);
	const stoppedRef = useRef(false);
	const startTimeRef = useRef(0);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const speedRef = useRef(1);

	speedRef.current = speed;

	const pushEvent = useCallback((type: string, data: Record<string, unknown>) => {
		const id = ++eventIdRef.current;
		const timestamp = Date.now() - startTimeRef.current;
		setEvents((prev) => [...prev, { id, type, timestamp, data }]);
	}, []);

	const delay = useCallback(
		(ms: number): Promise<boolean> => {
			return new Promise((resolve) => {
				const actualMs = ms / speedRef.current;
				const timeout = setTimeout(() => {
					if (stoppedRef.current) {
						resolve(false);
					} else {
						resolve(true);
					}
				}, actualMs);

				const checkStop = setInterval(() => {
					if (stoppedRef.current) {
						clearTimeout(timeout);
						clearInterval(checkStop);
						resolve(false);
					}
				}, 50);

				setTimeout(() => clearInterval(checkStop), actualMs + 100);
			});
		},
		[],
	);

	const start = useCallback(() => {
		stoppedRef.current = false;
		setStatus('running');
		setEvents([]);
		eventIdRef.current = 0;
		startTimeRef.current = Date.now();
		setElapsed(0);

		timerRef.current = setInterval(() => {
			setElapsed(Date.now() - startTimeRef.current);
		}, 100);

		const ctx = {
			pushEvent,
			delay,
			isStopped: () => stoppedRef.current,
		};

		runFn(ctx)
			.then(() => {
				if (!stoppedRef.current) {
					setStatus('completed');
				}
			})
			.catch(() => {
				setStatus('error');
			})
			.finally(() => {
				if (timerRef.current) clearInterval(timerRef.current);
				setElapsed(Date.now() - startTimeRef.current);
			});
	}, [runFn, pushEvent, delay]);

	const stop = useCallback(() => {
		stoppedRef.current = true;
		setStatus('idle');
		if (timerRef.current) clearInterval(timerRef.current);
	}, []);

	const reset = useCallback(() => {
		stoppedRef.current = true;
		setStatus('idle');
		setEvents([]);
		setElapsed(0);
		eventIdRef.current = 0;
		if (timerRef.current) clearInterval(timerRef.current);
	}, []);

	return {
		status,
		events,
		speed,
		elapsed,
		start,
		stop,
		reset,
		setSpeed,
		pushEvent,
	};
}
