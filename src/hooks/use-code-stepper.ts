'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CodeStep } from '@/types/simulation';

type UseCodeStepper = {
	currentStep: CodeStep;
	currentIndex: number;
	totalSteps: number;
	isFirst: boolean;
	isLast: boolean;
	isAutoPlaying: boolean;
	next: () => void;
	prev: () => void;
	goTo: (index: number) => void;
	toggleAutoPlay: () => void;
	reset: () => void;
};

export function useCodeStepper(steps: CodeStep[], autoPlayIntervalMs = 2500): UseCodeStepper {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isAutoPlaying, setIsAutoPlaying] = useState(false);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const next = useCallback(() => {
		setCurrentIndex((i) => Math.min(i + 1, steps.length - 1));
	}, [steps.length]);

	const prev = useCallback(() => {
		setCurrentIndex((i) => Math.max(i - 1, 0));
	}, []);

	const goTo = useCallback(
		(index: number) => {
			setCurrentIndex(Math.max(0, Math.min(index, steps.length - 1)));
		},
		[steps.length],
	);

	const toggleAutoPlay = useCallback(() => {
		setIsAutoPlaying((v) => !v);
	}, []);

	const reset = useCallback(() => {
		setCurrentIndex(0);
		setIsAutoPlaying(false);
	}, []);

	useEffect(() => {
		if (isAutoPlaying) {
			intervalRef.current = setInterval(() => {
				setCurrentIndex((i) => {
					if (i >= steps.length - 1) {
						setIsAutoPlaying(false);
						return i;
					}
					return i + 1;
				});
			}, autoPlayIntervalMs);
		}

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [isAutoPlaying, steps.length, autoPlayIntervalMs]);

	return {
		currentStep: steps[currentIndex],
		currentIndex,
		totalSteps: steps.length,
		isFirst: currentIndex === 0,
		isLast: currentIndex === steps.length - 1,
		isAutoPlaying,
		next,
		prev,
		goTo,
		toggleAutoPlay,
		reset,
	};
}
