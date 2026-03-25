'use client';

import { useState, useRef, useCallback } from 'react';
import type { SimulationEvent } from '@/types/simulation';

type ReplayState = {
	isReplaying: boolean;
	isPlaying: boolean;
	speed: number;
	currentIndex: number;
	visibleEvents: SimulationEvent[];
	currentTimestamp: number;
	totalDuration: number;
};

type ReplayEngine = ReplayState & {
	enter: (events: SimulationEvent[]) => void;
	exit: () => void;
	play: () => void;
	pause: () => void;
	setSpeed: (speed: number) => void;
	seekTo: (index: number) => void;
	reset: () => void;
};

export function useReplayMode(): ReplayEngine {
	const [state, setState] = useState<ReplayState>({
		isReplaying: false,
		isPlaying: false,
		speed: 1,
		currentIndex: 0,
		visibleEvents: [],
		currentTimestamp: 0,
		totalDuration: 0,
	});
	const allEventsRef = useRef<SimulationEvent[]>([]);
	const rafRef = useRef<number | null>(null);
	const lastTickRef = useRef(0);

	const cancelAnimation = useCallback(() => {
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
	}, []);

	const enter = useCallback((events: SimulationEvent[]) => {
		allEventsRef.current = events;
		const duration = events.length > 0 ? events[events.length - 1].timestamp : 0;
		setState({
			isReplaying: true,
			isPlaying: false,
			speed: 1,
			currentIndex: 0,
			visibleEvents: [],
			currentTimestamp: 0,
			totalDuration: duration,
		});
	}, []);

	const exit = useCallback(() => {
		cancelAnimation();
		allEventsRef.current = [];
		setState({
			isReplaying: false,
			isPlaying: false,
			speed: 1,
			currentIndex: 0,
			visibleEvents: [],
			currentTimestamp: 0,
			totalDuration: 0,
		});
	}, [cancelAnimation]);

	const seekTo = useCallback((index: number) => {
		const events = allEventsRef.current;
		const clamped = Math.max(0, Math.min(index, events.length));
		const visible = events.slice(0, clamped);
		const ts = clamped > 0 ? events[clamped - 1].timestamp : 0;
		setState((prev) => ({
			...prev,
			currentIndex: clamped,
			visibleEvents: visible,
			currentTimestamp: ts,
		}));
	}, []);

	const tick = useCallback(() => {
		const now = performance.now();
		const delta = now - lastTickRef.current;
		lastTickRef.current = now;

		setState((prev) => {
			if (!prev.isPlaying) return prev;

			const events = allEventsRef.current;
			if (prev.currentIndex >= events.length) {
				return { ...prev, isPlaying: false };
			}

			// Advance simulation time by delta * speed
			const simDelta = delta * prev.speed;
			const newTimestamp = prev.currentTimestamp + simDelta;

			// Find events up to new timestamp
			let newIndex = prev.currentIndex;
			while (newIndex < events.length && events[newIndex].timestamp <= newTimestamp) {
				newIndex++;
			}

			if (newIndex >= events.length) {
				return {
					...prev,
					isPlaying: false,
					currentIndex: events.length,
					visibleEvents: events,
					currentTimestamp: prev.totalDuration,
				};
			}

			return {
				...prev,
				currentIndex: newIndex,
				visibleEvents: events.slice(0, newIndex),
				currentTimestamp: newTimestamp,
			};
		});

		rafRef.current = requestAnimationFrame(tick);
	}, []);

	const play = useCallback(() => {
		cancelAnimation();
		lastTickRef.current = performance.now();
		setState((prev) => {
			// If at the end, restart from beginning
			if (prev.currentIndex >= allEventsRef.current.length) {
				return { ...prev, isPlaying: true, currentIndex: 0, visibleEvents: [], currentTimestamp: 0 };
			}
			return { ...prev, isPlaying: true };
		});
		rafRef.current = requestAnimationFrame(tick);
	}, [cancelAnimation, tick]);

	const pause = useCallback(() => {
		cancelAnimation();
		setState((prev) => ({ ...prev, isPlaying: false }));
	}, [cancelAnimation]);

	const setSpeed = useCallback((speed: number) => {
		setState((prev) => ({ ...prev, speed }));
	}, []);

	const reset = useCallback(() => {
		cancelAnimation();
		setState((prev) => ({
			...prev,
			isPlaying: false,
			currentIndex: 0,
			visibleEvents: [],
			currentTimestamp: 0,
		}));
	}, [cancelAnimation]);

	return {
		...state,
		enter,
		exit,
		play,
		pause,
		setSpeed,
		seekTo,
		reset,
	};
}
