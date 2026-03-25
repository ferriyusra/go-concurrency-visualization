'use client';

import { Play, Square, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { SimulationStatus } from '@/types/simulation';

type ControlPanelProps = {
	status: SimulationStatus;
	speed: number;
	elapsed: number;
	onStart: () => void;
	onStop: () => void;
	onReset: () => void;
	onSpeedChange: (speed: number) => void;
};

export function ControlPanel({
	status,
	speed,
	elapsed,
	onStart,
	onStop,
	onReset,
	onSpeedChange,
}: ControlPanelProps) {
	const statusColors: Record<SimulationStatus, string> = {
		idle: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
		running: 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200',
		completed: 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
		error: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200',
	};

	return (
		<div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
			<div className="flex items-center gap-2">
				{status === 'idle' || status === 'completed' ? (
					<Button size="sm" onClick={onStart} className="gap-1.5">
						<Play className="h-3.5 w-3.5" />
						Start
					</Button>
				) : (
					<Button size="sm" variant="destructive" onClick={onStop} className="gap-1.5">
						<Square className="h-3.5 w-3.5" />
						Stop
					</Button>
				)}
				<Button size="sm" variant="outline" onClick={onReset} className="gap-1.5">
					<RotateCcw className="h-3.5 w-3.5" />
					Reset
				</Button>
			</div>

			<div className="flex items-center gap-2 min-w-[180px]">
				<span className="text-xs text-muted-foreground whitespace-nowrap">Speed:</span>
				<Slider
					value={[speed]}
					onValueChange={([v]) => onSpeedChange(v)}
					min={0.5}
					max={10}
					step={0.5}
					className="w-24"
				/>
				<span className="text-xs font-mono w-8">{speed}x</span>
			</div>

			<div className="flex items-center gap-3 ml-auto">
				<span className="text-xs text-muted-foreground font-mono">
					{(elapsed / 1000).toFixed(1)}s
				</span>
				<span
					className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}
				>
					{status}
				</span>
			</div>
		</div>
	);
}
