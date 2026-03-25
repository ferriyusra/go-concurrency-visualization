'use client';

import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CodeStep } from '@/types/simulation';

const STRATEGY_BADGES: Record<string, { label: string; className: string }> = {
	setup: { label: 'Setup', className: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
	'no-lock': { label: 'No Lock', className: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200' },
	mutex: { label: 'Mutex', className: 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
	optimistic: { label: 'Optimistic', className: 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
	fanout: { label: 'Fan-Out', className: 'bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
};

type CodeStepperProps = {
	step: CodeStep;
	currentIndex: number;
	totalSteps: number;
	isFirst: boolean;
	isLast: boolean;
	isAutoPlaying: boolean;
	onNext: () => void;
	onPrev: () => void;
	onToggleAutoPlay: () => void;
	onReset: () => void;
};

export function CodeStepper({
	step,
	currentIndex,
	totalSteps,
	isFirst,
	isLast,
	isAutoPlaying,
	onNext,
	onPrev,
	onToggleAutoPlay,
	onReset,
}: CodeStepperProps) {
	const badge = STRATEGY_BADGES[step.strategy] ?? STRATEGY_BADGES.setup;

	return (
		<div className="rounded-lg border bg-card p-4 space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Button size="icon" variant="outline" className="h-8 w-8" onClick={onPrev} disabled={isFirst}>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-sm font-mono text-muted-foreground">
						{currentIndex + 1} / {totalSteps}
					</span>
					<Button size="icon" variant="outline" className="h-8 w-8" onClick={onNext} disabled={isLast}>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
				<div className="flex items-center gap-1.5">
					<Button size="sm" variant="outline" className="gap-1.5" onClick={onToggleAutoPlay}>
						{isAutoPlaying ? (
							<Pause className="h-3.5 w-3.5" />
						) : (
							<Play className="h-3.5 w-3.5" />
						)}
						{isAutoPlaying ? 'Pause' : 'Auto'}
					</Button>
					<Button size="icon" variant="ghost" className="h-8 w-8" onClick={onReset}>
						<RotateCcw className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
						{badge.label}
					</span>
					<span className="text-xs text-muted-foreground font-mono">
						L{step.lineRange[0]}–{step.lineRange[1]}
					</span>
				</div>
				<h4 className="text-sm font-semibold">{step.title}</h4>
				<p className="text-xs text-muted-foreground leading-relaxed">{step.explanation}</p>
			</div>

			{step.visualEffect && (
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>Visual:</span>
					<span className="capitalize font-medium">{step.visualEffect.cellState}</span>
					<span>
						at row {step.visualEffect.row}, col {step.visualEffect.col}
					</span>
				</div>
			)}
		</div>
	);
}
