'use client';

import { useState, useRef, useCallback } from 'react';
import type { SimulationStatus, SimulationEvent } from '@/types/simulation';

type GoSimulationParams = {
	rows: number;
	cols: number;
	users: number;
	delayMs: number;
};

type GoSimulationEngine = {
	status: SimulationStatus;
	events: SimulationEvent[];
	elapsed: number;
	start: (params: GoSimulationParams) => void;
	stop: () => void;
	reset: () => void;
};

const GO_SERVER_URL = process.env.NEXT_PUBLIC_GO_SERVER_URL || 'http://localhost:4000';

export function useGoSimulation(): GoSimulationEngine {
	const [status, setStatus] = useState<SimulationStatus>('idle');
	const [events, setEvents] = useState<SimulationEvent[]>([]);
	const [elapsed, setElapsed] = useState(0);
	const eventSourceRef = useRef<EventSource | null>(null);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const startTimeRef = useRef(0);
	const eventIdRef = useRef(0);

	const stop = useCallback(() => {
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		setStatus('idle');
	}, []);

	const reset = useCallback(() => {
		stop();
		setEvents([]);
		setElapsed(0);
		eventIdRef.current = 0;
	}, [stop]);

	const start = useCallback(
		(params: GoSimulationParams) => {
			// Clean up any existing connection.
			stop();
			setEvents([]);
			eventIdRef.current = 0;
			setStatus('running');
			startTimeRef.current = Date.now();
			setElapsed(0);

			timerRef.current = setInterval(() => {
				setElapsed(Date.now() - startTimeRef.current);
			}, 100);

			const qs = new URLSearchParams({
				rows: String(params.rows),
				cols: String(params.cols),
				users: String(params.users),
				delayMs: String(params.delayMs),
			});

			const es = new EventSource(`${GO_SERVER_URL}/api/simulate/booking-rush?${qs}`);
			eventSourceRef.current = es;

			es.onmessage = (msg) => {
				try {
					const parsed = JSON.parse(msg.data);
					const id = ++eventIdRef.current;
					const simEvent: SimulationEvent = {
						id,
						type: parsed.type,
						timestamp: parsed.timestamp ?? Date.now() - startTimeRef.current,
						data: parsed.data ?? {},
					};

					setEvents((prev) => [...prev, simEvent]);

					// End of simulation.
					if (parsed.type === 'simulation_done') {
						setStatus('completed');
						if (timerRef.current) clearInterval(timerRef.current);
						setElapsed(Date.now() - startTimeRef.current);
						es.close();
						eventSourceRef.current = null;
					}
				} catch {
					// Ignore malformed messages.
				}
			};

			es.onerror = () => {
				// SSE connection closed (normal after simulation ends).
				if (eventSourceRef.current) {
					setStatus((prev) => (prev === 'running' ? 'error' : prev));
					es.close();
					eventSourceRef.current = null;
					if (timerRef.current) clearInterval(timerRef.current);
				}
			};
		},
		[stop],
	);

	return { status, events, elapsed, start, stop, reset };
}
