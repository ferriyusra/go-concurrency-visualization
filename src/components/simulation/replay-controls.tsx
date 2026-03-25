'use client';

import { Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

type ReplayControlsProps = {
	isPlaying: boolean;
	speed: number;
	currentIndex: number;
	totalEvents: number;
	currentTimestamp: number;
	totalDuration: number;
	onPlay: () => void;
	onPause: () => void;
	onSpeedChange: (speed: number) => void;
	onSeek: (index: number) => void;
	onReset: () => void;
};

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5, 10];

export function ReplayControls({
	isPlaying,
	speed,
	currentIndex,
	totalEvents,
	currentTimestamp,
	totalDuration,
	onPlay,
	onPause,
	onSpeedChange,
	onSeek,
	onReset,
}: ReplayControlsProps) {
	return (
		<div className="rounded-lg border bg-card p-3 space-y-3">
			<div className="flex items-center gap-2">
				<span className="text-xs font-medium">Replay Mode</span>
				<span className="text-[10px] text-muted-foreground ml-auto font-mono">
					{currentIndex}/{totalEvents} events
				</span>
			</div>

			{/* Timeline scrubber */}
			<div className="space-y-1">
				<Slider
					value={[currentIndex]}
					onValueChange={([v]) => onSeek(v)}
					min={0}
					max={totalEvents}
					step={1}
				/>
				<div className="flex justify-between text-[10px] font-mono text-muted-foreground">
					<span>0ms</span>
					<span>{currentTimestamp}ms</span>
					<span>{totalDuration}ms</span>
				</div>
			</div>

			{/* Controls row */}
			<div className="flex items-center gap-2">
				{isPlaying ? (
					<Button size="sm" variant="outline" onClick={onPause} className="gap-1.5">
						<Pause className="h-3 w-3" />
						Pause
					</Button>
				) : (
					<Button size="sm" onClick={onPlay} className="gap-1.5">
						<Play className="h-3 w-3" />
						Play
					</Button>
				)}
				<Button size="sm" variant="outline" onClick={onReset} className="gap-1.5">
					<RotateCcw className="h-3 w-3" />
				</Button>

				{/* Speed selector */}
				<div className="flex items-center gap-1 ml-auto">
					<span className="text-[10px] text-muted-foreground">Speed:</span>
					{SPEED_OPTIONS.map((s) => (
						<button
							key={s}
							className={`text-[10px] px-1.5 py-0.5 rounded ${
								speed === s
									? 'bg-primary text-primary-foreground'
									: 'bg-muted text-muted-foreground hover:bg-muted/80'
							}`}
							onClick={() => onSpeedChange(s)}
						>
							{s}x
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
