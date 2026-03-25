'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
	ListOrdered,
	X,
	Info,
	ChevronDown,
	ChevronUp,
	Filter,
	Clock,
	Zap,
	ShieldAlert,
	ShieldCheck,
	AlertTriangle,
	RotateCcw,
} from 'lucide-react';
import { useGoSimulation } from '@/hooks/use-go-simulation';
import { useCodeStepper } from '@/hooks/use-code-stepper';
import { useReplayMode } from '@/hooks/use-replay-mode';
import { ControlPanel } from '@/components/simulation/control-panel';
import { EventLog } from '@/components/simulation/event-log';
import { CodeStepper } from '@/components/simulation/code-stepper';
import { CellStoryPanel } from '@/components/simulation/cell-story-panel';
import { MutexQueueViz } from '@/components/simulation/mutex-queue-viz';
import { ReplayControls } from '@/components/simulation/replay-controls';
import { BOOKING_RUSH_STEPS } from '@/constants/simulation-constant';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import type { SimulationEvent } from '@/types/simulation';

type CellState =
	| 'available'
	| 'locking'
	| 'booked'
	| 'conflict'
	| 'overwrite'
	| 'retry';

const CELL_COLORS: Record<CellState, string> = {
	available: 'bg-gray-100 dark:bg-gray-800',
	locking: 'bg-yellow-400 dark:bg-yellow-600',
	booked: 'bg-green-400 dark:bg-green-600',
	conflict: 'bg-red-400 dark:bg-red-600',
	overwrite: 'bg-purple-500 dark:bg-purple-600',
	retry: 'bg-orange-400 dark:bg-orange-600',
};

const STRATEGY_LABELS: Record<
	string,
	{ icon: string; name: string; description: string }
> = {
	'no-lock': {
		icon: '❌',
		name: 'No Lock',
		description: 'No synchronization — real race conditions',
	},
	mutex: {
		icon: '🔒',
		name: 'Mutex',
		description: 'Global lock — safe but serial bottleneck',
	},
	optimistic: {
		icon: '⚡',
		name: 'Optimistic',
		description: 'CAS retry — fast + correct',
	},
};

type Preset = {
	label: string;
	icon: string;
	rows: number;
	cols: number;
	users: number;
	delayMs: number;
	expect: string;
};

const PRESETS: Preset[] = [
	{
		label: 'Silent Corruption',
		icon: '💀',
		rows: 4,
		cols: 4,
		users: 200,
		delayMs: 5,
		expect: 'High overwrites & lost bookings in No Lock. 200 users on 16 seats = 12.5 per seat.',
	},
	{
		label: 'Mutex Bottleneck',
		icon: '🐌',
		rows: 4,
		cols: 4,
		users: 100,
		delayMs: 30,
		expect: 'Mutex takes ~3000ms while Optimistic finishes in ~30ms. Extreme time difference.',
	},
	{
		label: 'No Contention',
		icon: '😌',
		rows: 16,
		cols: 20,
		users: 20,
		delayMs: 10,
		expect: '20 users on 320 seats — almost no conflicts. All strategies look similar.',
	},
	{
		label: 'CAS Stress Test',
		icon: '🔥',
		rows: 4,
		cols: 4,
		users: 500,
		delayMs: 15,
		expect: 'Hundreds of CAS retries. Some goroutines exhaust all retry attempts.',
	},
	{
		label: 'Perfect Ratio',
		icon: '⚖️',
		rows: 10,
		cols: 10,
		users: 100,
		delayMs: 10,
		expect: '100 users for 100 seats. 1:1 ratio — conflicts appear even without oversubscription.',
	},
];

type CellInfo = {
	state: CellState;
	user?: number;
	retries?: number;
};

type StrategyState = {
	grid: CellState[][];
	cellInfo: CellInfo[][];
	booked: number;
	conflicts: number;
	overwrites: number;
	lostBookings: number;
	retries: number;
	time: number;
};

function createGrid(rows: number, cols: number): CellState[][] {
	return Array.from({ length: rows }, () => Array(cols).fill('available'));
}

function createCellInfo(rows: number, cols: number): CellInfo[][] {
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => ({ state: 'available' as CellState })),
	);
}

function createInitialStrategies(
	rows: number,
	cols: number,
): Record<string, StrategyState> {
	return {
		'no-lock': {
			grid: createGrid(rows, cols),
			cellInfo: createCellInfo(rows, cols),
			booked: 0,
			conflicts: 0,
			overwrites: 0,
			lostBookings: 0,
			retries: 0,
			time: 0,
		},
		mutex: {
			grid: createGrid(rows, cols),
			cellInfo: createCellInfo(rows, cols),
			booked: 0,
			conflicts: 0,
			overwrites: 0,
			lostBookings: 0,
			retries: 0,
			time: 0,
		},
		optimistic: {
			grid: createGrid(rows, cols),
			cellInfo: createCellInfo(rows, cols),
			booked: 0,
			conflicts: 0,
			overwrites: 0,
			lostBookings: 0,
			retries: 0,
			time: 0,
		},
	};
}

// Process Go backend SSE events into strategy grid state.
function applyGoEvent(
	prev: Record<string, StrategyState>,
	evt: SimulationEvent,
): Record<string, StrategyState> {
	const d = evt.data as Record<string, any>;
	const strategy = d.strategy as string;
	if (!strategy || !prev[strategy]) return prev;

	const row = d.row as number;
	const col = d.col as number;

	switch (evt.type) {
		case 'seat_booked': {
			const s = prev[strategy];
			const g = s.grid.map((r) => [...r]);
			const ci = s.cellInfo.map((r) => r.map((c) => ({ ...c })));
			g[row][col] = 'booked';
			ci[row][col] = {
				state: 'booked',
				user: d.user as number,
				retries: d.retries as number,
			};
			return {
				...prev,
				[strategy]: { ...s, grid: g, cellInfo: ci, booked: s.booked + 1 },
			};
		}
		case 'seat_conflict': {
			const s = prev[strategy];
			const g = s.grid.map((r) => [...r]);
			const ci = s.cellInfo.map((r) => r.map((c) => ({ ...c })));
			g[row][col] = 'conflict';
			ci[row][col] = { state: 'conflict', user: d.user as number };
			return {
				...prev,
				[strategy]: { ...s, grid: g, cellInfo: ci, conflicts: s.conflicts + 1 },
			};
		}
		case 'seat_overwrite': {
			const s = prev[strategy];
			const g = s.grid.map((r) => [...r]);
			const ci = s.cellInfo.map((r) => r.map((c) => ({ ...c })));
			g[row][col] = 'overwrite';
			ci[row][col] = { state: 'overwrite', user: d.user as number };
			return {
				...prev,
				[strategy]: {
					...s,
					grid: g,
					cellInfo: ci,
					overwrites: s.overwrites + 1,
				},
			};
		}
		case 'seat_locking': {
			const s = prev[strategy];
			const g = s.grid.map((r) => [...r]);
			if (g[row][col] === 'available') g[row][col] = 'locking';
			return { ...prev, [strategy]: { ...s, grid: g } };
		}
		case 'seat_retry': {
			const s = prev[strategy];
			const g = s.grid.map((r) => [...r]);
			g[row][col] = 'retry';
			return { ...prev, [strategy]: { ...s, grid: g, retries: s.retries + 1 } };
		}
		case 'strategy_complete': {
			const s = prev[strategy];
			return {
				...prev,
				[strategy]: {
					...s,
					booked: (d.booked as number) ?? s.booked,
					conflicts: (d.conflicts as number) ?? s.conflicts,
					overwrites: (d.overwrites as number) ?? s.overwrites,
					lostBookings: (d.lostBookings as number) ?? s.lostBookings,
					retries: (d.retries as number) ?? s.retries,
					time: (d.elapsedMs as number) ?? s.time,
				},
			};
		}
		default:
			return prev;
	}
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StrategyGridCard({
	strategy,
	state,
	cols,
	isCompleted,
	isActive,
	hoveredCell,
	onHover,
	onLeave,
	onCellClick,
}: {
	strategy: string;
	state: StrategyState;
	cols: number;
	isCompleted: boolean;
	isActive: boolean;
	hoveredCell: { strategy: string; row: number; col: number } | null;
	onHover: (s: string, r: number, c: number) => void;
	onLeave: () => void;
	onCellClick: (s: string, r: number, c: number) => void;
}) {
	const label = STRATEGY_LABELS[strategy];
	const hasIssues = state.conflicts > 0 || state.overwrites > 0;

	return (
		<div className={`rounded-lg border bg-card p-3 space-y-2 transition-all ${isActive ? 'ring-2 ring-primary shadow-md' : ''}`}>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-2'>
					<h3 className='text-sm font-semibold'>
						{label.icon} {label.name}
					</h3>
					{isCompleted && (
						<Badge
							variant={hasIssues ? 'destructive' : 'outline'}
							className='text-[10px] px-1.5 py-0'>
							{hasIssues ? 'UNSAFE' : 'SAFE'}
						</Badge>
					)}
				</div>
				{state.time > 0 && (
					<div className='flex items-center gap-1 text-xs text-muted-foreground font-mono'>
						<Clock className='h-3 w-3' />
						{state.time}ms
					</div>
				)}
			</div>

			{/* Description */}
			<p className='text-[10px] text-muted-foreground leading-tight'>
				{label.description}
			</p>

			{/* Grid */}
			<div
				className='grid gap-0.5 relative'
				style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
				{state.grid.flat().map((cell, i) => {
					const r = Math.floor(i / cols);
					const c = i % cols;
					const isHovered =
						hoveredCell?.strategy === strategy &&
						hoveredCell.row === r &&
						hoveredCell.col === c;
					return (
						<motion.div
							key={i}
							className={`aspect-square rounded-[2px] ${CELL_COLORS[cell]} ${
								isHovered ? 'ring-2 ring-blue-500 z-10' : ''
							} cursor-pointer`}
							animate={{ scale: cell !== 'available' ? [1, 1.3, 1] : 1 }}
							transition={{ duration: 0.2 }}
							onMouseEnter={() => onHover(strategy, r, c)}
							onMouseLeave={onLeave}
							onClick={() => onCellClick(strategy, r, c)}
						/>
					);
				})}
			</div>

			{/* Stats row */}
			<div className='grid grid-cols-3 gap-1 text-[10px]'>
				<div className='text-center'>
					<div className='font-mono font-bold text-green-500'>
						{state.booked}
					</div>
					<div className='text-muted-foreground'>booked</div>
				</div>
				<div className='text-center'>
					<div
						className={`font-mono font-bold ${state.conflicts > 0 || state.overwrites > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
						{state.conflicts + state.overwrites}
					</div>
					<div className='text-muted-foreground'>issues</div>
				</div>
				<div className='text-center'>
					<div
						className={`font-mono font-bold ${state.retries > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
						{state.retries}
					</div>
					<div className='text-muted-foreground'>retries</div>
				</div>
			</div>
		</div>
	);
}

function TimeComparisonBar({
	items,
}: {
	items: {
		key: string;
		icon: string;
		name: string;
		time: number;
		booked: number;
		totalSeats: number;
	}[];
}) {
	const maxTime = Math.max(...items.map((i) => i.time), 1);
	const fastest = Math.min(...items.map((i) => i.time));

	const barColors: Record<string, string> = {
		'no-lock': 'bg-red-400 dark:bg-red-500',
		mutex: 'bg-yellow-400 dark:bg-yellow-500',
		optimistic: 'bg-blue-400 dark:bg-blue-500',
	};

	// Use log scale when the difference is extreme (>10x)
	const useLogScale = maxTime / Math.max(fastest, 1) > 10;

	const getBarWidth = (time: number) => {
		if (useLogScale) {
			const logMax = Math.log10(maxTime + 1);
			const logVal = Math.log10(time + 1);
			return Math.max((logVal / logMax) * 100, 4); // min 4% so tiny bars are visible
		}
		return Math.max((time / maxTime) * 100, 4);
	};

	return (
		<div className='space-y-3'>
			{useLogScale && (
				<p className='text-[10px] text-muted-foreground italic'>
					Log scale — linear would make fast strategies invisible
				</p>
			)}
			{items.map((item) => {
				const barWidth = getBarWidth(item.time);
				const isFastest = item.time === fastest;
				const multiplier = isFastest ? null : Math.round(item.time / fastest);
				return (
					<div key={item.key} className='space-y-1.5'>
						<div className='flex items-center justify-between text-xs'>
							<div className='flex items-center gap-1.5'>
								<span className='font-medium'>
									{item.icon} {item.name}
								</span>
								{isFastest && (
									<Badge
										variant='outline'
										className='text-[9px] px-1.5 py-0 text-green-500 border-green-500/30'>
										<Zap className='h-2.5 w-2.5 mr-0.5' />
										fastest
									</Badge>
								)}
								{multiplier && multiplier > 1 && (
									<span className='text-[10px] text-muted-foreground'>
										({multiplier}x slower)
									</span>
								)}
							</div>
							<div className='flex items-center gap-3 text-muted-foreground'>
								<span className='font-mono text-[11px]'>
									{item.booked}/{item.totalSeats} seats
								</span>
								<span
									className={`font-mono font-bold text-sm tabular-nums ${isFastest ? 'text-green-500' : 'text-foreground'}`}>
									{item.time}ms
								</span>
							</div>
						</div>
						<div className='h-6 bg-muted rounded-md overflow-hidden'>
							<motion.div
								className={`h-full rounded-md ${barColors[item.key] || 'bg-gray-400'}`}
								initial={{ width: 0 }}
								animate={{ width: `${barWidth}%` }}
								transition={{ duration: 0.6, ease: 'easeOut' }}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function ComparisonTable({
	items,
}: {
	items: {
		key: string;
		icon: string;
		name: string;
		booked: number;
		conflicts: number;
		overwrites: number;
		lostBookings: number;
		retries: number;
		time: number;
		successRate: number;
	}[];
}) {
	const colClass = 'text-right py-2 px-2 font-mono tabular-nums';

	return (
		<div className='overflow-x-auto rounded-md border'>
			<table className='w-full text-xs'>
				<thead>
					<tr className='bg-muted/50 text-muted-foreground'>
						<th className='text-left py-2 px-2 font-medium'>Strategy</th>
						<th className='text-right py-2 px-2 font-medium'>Booked</th>
						<th className='text-right py-2 px-2 font-medium'>Conflicts</th>
						<th className='text-right py-2 px-2 font-medium'>Overwrites</th>
						<th className='text-right py-2 px-2 font-medium'>Lost</th>
						<th className='text-right py-2 px-2 font-medium'>Retries</th>
						<th className='text-right py-2 px-2 font-medium'>Time</th>
						<th className='text-right py-2 px-2 font-medium'>Fill</th>
					</tr>
				</thead>
				<tbody>
					{items.map((item) => (
						<tr
							key={item.key}
							className='border-t hover:bg-muted/30 transition-colors'>
							<td className='py-2 px-2 font-medium whitespace-nowrap'>
								<span className='mr-1'>{item.icon}</span>
								{item.name}
							</td>
							<td className={colClass}>{item.booked}</td>
							<td
								className={`${colClass} ${item.conflicts > 0 ? 'text-red-500 font-bold' : ''}`}>
								{item.conflicts}
							</td>
							<td
								className={`${colClass} ${item.overwrites > 0 ? 'text-purple-500 font-bold' : ''}`}>
								{item.overwrites}
							</td>
							<td
								className={`${colClass} ${item.lostBookings > 0 ? 'text-purple-500 font-bold' : ''}`}>
								{item.lostBookings}
							</td>
							<td
								className={`${colClass} ${item.retries > 0 ? 'text-orange-500' : ''}`}>
								{item.retries}
							</td>
							<td className={`${colClass} font-bold`}>{item.time}ms</td>
							<td className={colClass}>{item.successRate}%</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function TakeawayCard({
	icon,
	iconColor,
	borderColor,
	title,
	children,
}: {
	icon: React.ReactNode;
	iconColor: string;
	borderColor: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div
			className={`rounded-md border border-l-2 ${borderColor} bg-muted/30 px-4 py-3.5 space-y-1.5`}>
			<div className='flex items-center gap-2'>
				<span className={iconColor}>{icon}</span>
				<span className='text-xs font-semibold'>{title}</span>
			</div>
			<p className='text-[11px] text-muted-foreground leading-relaxed pl-5.5'>
				{children}
			</p>
		</div>
	);
}

function KeyTakeaways({
	strategies,
	users,
	totalSeats,
}: {
	strategies: Record<string, StrategyState>;
	users: number;
	totalSeats: number;
}) {
	const noLock = strategies['no-lock'];
	const mutex = strategies.mutex;
	const optimistic = strategies.optimistic;
	const hasNoLockIssues = noLock.conflicts > 0 || noLock.overwrites > 0;

	return (
		<div className='space-y-3'>
			<p className='text-[10px] text-muted-foreground uppercase tracking-wide font-medium'>
				Key Takeaways
			</p>

			<div className='grid gap-3'>
				{/* No-Lock */}
				{hasNoLockIssues ? (
					<TakeawayCard
						icon={<ShieldAlert className='h-3.5 w-3.5' />}
						iconColor='text-red-500'
						borderColor='border-red-500'
						title='No Lock — Data Corruption Detected'>
						Detected{' '}
						<span className='text-red-500 font-bold font-mono'>
							{noLock.conflicts}
						</span>{' '}
						conflict{noLock.conflicts !== 1 ? 's' : ''} (seat changed during
						work).
						{noLock.overwrites > 0 && (
							<>
								{' '}
								Plus{' '}
								<span className='text-purple-500 font-bold font-mono'>
									{noLock.overwrites}
								</span>{' '}
								silent overwrite{noLock.overwrites !== 1 ? 's' : ''} &mdash; two
								goroutines wrote to the same seat, one booking silently lost.
							</>
						)}
						{noLock.lostBookings > 0 && (
							<>
								{' '}
								Post-check found{' '}
								<span className='text-purple-500 font-bold font-mono'>
									{noLock.lostBookings}
								</span>{' '}
								lost booking{noLock.lostBookings !== 1 ? 's' : ''}.
							</>
						)}
					</TakeawayCard>
				) : (
					<TakeawayCard
						icon={<AlertTriangle className='h-3.5 w-3.5' />}
						iconColor='text-yellow-500'
						borderColor='border-yellow-500'
						title='No Lock — No Issues This Run'>
						Zero detected issues &mdash; but that doesn&apos;t mean it&apos;s
						safe. Race conditions are non-deterministic.
					</TakeawayCard>
				)}

				{/* Mutex vs Optimistic */}
				{mutex.time > 0 && optimistic.time > 0 && (
					<TakeawayCard
						icon={<Clock className='h-3.5 w-3.5' />}
						iconColor='text-blue-500'
						borderColor='border-blue-500'
						title='Mutex vs Optimistic — Performance'>
						Mutex took{' '}
						<span className='font-mono font-bold'>{mutex.time}ms</span> vs
						Optimistic&apos;s{' '}
						<span className='font-mono font-bold'>{optimistic.time}ms</span>
						{mutex.time > optimistic.time * 2 && (
							<>
								{' '}
								&mdash;{' '}
								<span className='font-bold'>
									{Math.round(mutex.time / optimistic.time)}x slower
								</span>
								. The global lock serializes all goroutines even when they
								target different seats.
							</>
						)}
						{mutex.time > optimistic.time &&
							mutex.time <= optimistic.time * 2 && (
								<>
									{' '}
									&mdash; the global lock creates a bottleneck under contention.
								</>
							)}
						{mutex.time <= optimistic.time && (
							<>
								{' '}
								&mdash; with low contention, mutex overhead is minimal. Try more
								users.
							</>
						)}{' '}
						Both have{' '}
						<span className='text-green-500 font-bold'>
							zero conflicts
						</span>{' '}
						&mdash; correct synchronization.
					</TakeawayCard>
				)}

				{/* Optimistic retries */}
				{optimistic.retries > 0 && (
					<TakeawayCard
						icon={<RotateCcw className='h-3.5 w-3.5' />}
						iconColor='text-orange-500'
						borderColor='border-orange-500'
						title='Optimistic — CAS Retries'>
						<span className='font-mono font-bold text-orange-500'>
							{optimistic.retries}
						</span>{' '}
						CAS {optimistic.retries !== 1 ? 'retries' : 'retry'} &mdash; real{' '}
						<code className='text-[10px] bg-muted px-1 py-0.5 rounded font-mono'>
							CompareAndSwapInt64
						</code>{' '}
						failures. The version changed between read and commit, so the
						goroutine safely retried.
					</TakeawayCard>
				)}

				{/* Contention */}
				<TakeawayCard
					icon={
						users > totalSeats ? (
							<AlertTriangle className='h-3.5 w-3.5' />
						) : (
							<ShieldCheck className='h-3.5 w-3.5' />
						)
					}
					iconColor={users > totalSeats ? 'text-yellow-500' : 'text-green-500'}
					borderColor={
						users > totalSeats ? 'border-yellow-500' : 'border-green-500'
					}
					title={users > totalSeats ? 'High Contention' : 'Low Contention'}>
					<span className='font-bold'>{users} users</span> competing for{' '}
					<span className='font-bold'>{totalSeats} seats</span>
					{users > totalSeats
						? '. Try reducing users to see how strategies differ under low load.'
						: '. Try increasing users beyond seat count to see more conflicts.'}
				</TakeawayCard>
			</div>
		</div>
	);
}

function FilterableEventLog({ events }: { events: SimulationEvent[] }) {
	const [expanded, setExpanded] = useState(false);
	const [filter, setFilter] = useState<string | null>(null);

	const strategies = ['no-lock', 'mutex', 'optimistic'] as const;
	const eventTypes = [
		'seat_booked',
		'seat_conflict',
		'seat_overwrite',
		'seat_locking',
		'seat_retry',
		'strategy_complete',
	] as const;

	const filteredEvents = useMemo(() => {
		if (!filter) return events;
		return events.filter((e) => {
			const d = e.data as Record<string, any>;
			if (strategies.includes(filter as any)) return d.strategy === filter;
			return e.type === filter;
		});
	}, [events, filter]);

	return (
		<div className='rounded-lg border bg-card'>
			<button
				className='w-full px-3 py-2 border-b flex items-center justify-between hover:bg-muted/50 transition-colors'
				onClick={() => setExpanded(!expanded)}>
				<span className='text-xs font-medium text-muted-foreground'>
					Event Log ({filteredEvents.length}
					{filter ? ` / ${events.length}` : ''})
				</span>
				{expanded ? (
					<ChevronUp className='h-3.5 w-3.5 text-muted-foreground' />
				) : (
					<ChevronDown className='h-3.5 w-3.5 text-muted-foreground' />
				)}
			</button>

			<AnimatePresence>
				{expanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2 }}
						className='overflow-hidden'>
						{/* Filters */}
						<div className='px-3 py-2 border-b flex flex-wrap gap-1.5'>
							<Filter className='h-3 w-3 text-muted-foreground mt-0.5' />
							<button
								className={`text-[10px] px-1.5 py-0.5 rounded ${!filter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
								onClick={() => setFilter(null)}>
								All
							</button>
							{strategies.map((s) => (
								<button
									key={s}
									className={`text-[10px] px-1.5 py-0.5 rounded ${filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
									onClick={() => setFilter(filter === s ? null : s)}>
									{STRATEGY_LABELS[s].icon} {STRATEGY_LABELS[s].name}
								</button>
							))}
							<span className='text-muted-foreground text-[10px] mx-1'>|</span>
							{eventTypes.map((t) => (
								<button
									key={t}
									className={`text-[10px] px-1.5 py-0.5 rounded ${filter === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
									onClick={() => setFilter(filter === t ? null : t)}>
									{t.replace('seat_', '').replace('strategy_', '')}
								</button>
							))}
						</div>

						<EventLog events={filteredEvents} maxVisible={200} />
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type BookingRushSimProps = {
	onHighlightChange?: (lines: [number, number] | null) => void;
	onActiveStrategyChange?: (strategy: string | null) => void;
	onNotableStrategiesChange?: (strategies: string[]) => void;
};

export function BookingRushSim({ onHighlightChange, onActiveStrategyChange, onNotableStrategiesChange }: BookingRushSimProps) {
	// Tunable parameters
	const [rows, setRows] = useState(8);
	const [cols, setCols] = useState(12);
	const [users, setUsers] = useState(150);
	const [delayMs, setDelayMs] = useState(10);

	const [strategies, setStrategies] = useState<Record<string, StrategyState>>(
		() => createInitialStrategies(rows, cols),
	);
	const [hoveredCell, setHoveredCell] = useState<{
		strategy: string;
		row: number;
		col: number;
	} | null>(null);
	const [selectedCell, setSelectedCell] = useState<{
		strategy: string;
		row: number;
		col: number;
	} | null>(null);

	// Feature 1: Active strategy indicator
	const [activeStrategy, setActiveStrategy] = useState<string | null>(null);

	// Feature 2: Per-cell event history index
	const [cellHistory, setCellHistory] = useState<Map<string, SimulationEvent[]>>(new Map());

	// Feature 4: Mutex queue
	const [mutexQueue, setMutexQueue] = useState<number[]>([]);
	const [mutexHolder, setMutexHolder] = useState<number | null>(null);

	const [stepMode, setStepMode] = useState(false);
	const stepper = useCodeStepper(BOOKING_RUSH_STEPS);

	// Feature 3: Replay mode
	const replay = useReplayMode();

	// Go backend engine
	const goEngine = useGoSimulation();

	// Process Go SSE events into grid state + features
	const lastProcessedRef = useState({ current: 0 })[0];
	useEffect(() => {
		const newEvents = goEngine.events.slice(lastProcessedRef.current);
		if (newEvents.length === 0) return;
		lastProcessedRef.current = goEngine.events.length;

		setStrategies((prev) => {
			let next = prev;
			for (const evt of newEvents) {
				next = applyGoEvent(next, evt);
			}
			return next;
		});

		// Feature 1: Track active strategy
		for (const evt of newEvents) {
			const d = evt.data as Record<string, any>;
			if (evt.type === 'strategy_start') setActiveStrategy(d.strategy as string);
			if (evt.type === 'strategy_complete') setActiveStrategy(null);
			if (evt.type === 'simulation_done') setActiveStrategy(null);
		}

		// Feature 2: Build per-cell event history
		setCellHistory((prev) => {
			const next = new Map(prev);
			for (const evt of newEvents) {
				const d = evt.data as Record<string, any>;
				if (d.strategy && d.row !== undefined && d.col !== undefined) {
					const key = `${d.strategy}:${d.row}:${d.col}`;
					if (!next.has(key)) next.set(key, []);
					next.get(key)!.push(evt);
				}
			}
			return next;
		});

		// Feature 4: Track mutex queue
		for (const evt of newEvents) {
			const d = evt.data as Record<string, any>;
			if (d.strategy !== 'mutex') continue;
			const user = d.user as number;
			if (evt.type === 'seat_locking' && user) {
				setMutexQueue((q) => [...q, user]);
			}
			if (evt.type === 'seat_lock_acquired' && user) {
				setMutexHolder(user);
				setMutexQueue((q) => {
					const idx = q.indexOf(user);
					return idx >= 0 ? [...q.slice(0, idx), ...q.slice(idx + 1)] : q;
				});
			}
			if ((evt.type === 'seat_booked' || evt.type === 'strategy_complete') && d.strategy === 'mutex') {
				if (evt.type === 'strategy_complete') {
					setMutexQueue([]);
					setMutexHolder(null);
				}
			}
		}
	}, [goEngine.events, lastProcessedRef]);

	const stepGrid = (() => {
		const grid = createGrid(rows, cols);
		if (stepMode && stepper.currentStep.visualEffect) {
			const { row, col, cellState } = stepper.currentStep.visualEffect;
			if (row < rows && col < cols) {
				grid[row][col] = cellState;
			}
		}
		return grid;
	})();

	useEffect(() => {
		if (stepMode) {
			onHighlightChange?.(stepper.currentStep.lineRange);
		} else {
			onHighlightChange?.(null);
		}
	}, [stepMode, stepper.currentStep, onHighlightChange]);

	// Feature 5: Propagate active strategy to parent for concept highlighting
	useEffect(() => {
		onActiveStrategyChange?.(activeStrategy);
	}, [activeStrategy, onActiveStrategyChange]);

	const isRunning = goEngine.status === 'running';
	const isCompleted = goEngine.status === 'completed';

	// Clear active strategy when simulation finishes
	useEffect(() => {
		if (isCompleted || goEngine.status === 'idle') {
			setActiveStrategy(null);
		}
	}, [isCompleted, goEngine.status]);

	// Compute which strategies had notable results and propagate to parent
	useEffect(() => {
		if (!isCompleted) {
			onNotableStrategiesChange?.([]);
			return;
		}
		const notable: string[] = [];
		if (strategies['no-lock'].conflicts > 0 || strategies['no-lock'].overwrites > 0) {
			notable.push('no-lock');
		}
		if (strategies.mutex.time > 0) {
			notable.push('mutex');
		}
		if (strategies.optimistic.retries > 0) {
			notable.push('optimistic');
		}
		onNotableStrategiesChange?.(notable);
	}, [isCompleted, strategies, onNotableStrategiesChange]);
	const totalSeats = rows * cols;

	const handleStart = useCallback(() => {
		setStepMode(false);
		stepper.reset();
		replay.exit();
		lastProcessedRef.current = 0;
		setStrategies(createInitialStrategies(rows, cols));
		setCellHistory(new Map());
		setMutexQueue([]);
		setMutexHolder(null);
		setActiveStrategy(null);
		setSelectedCell(null);
		goEngine.start({ rows, cols, users, delayMs });
	}, [rows, cols, users, delayMs, goEngine, stepper, lastProcessedRef, replay]);

	const handleStop = useCallback(() => {
		goEngine.stop();
	}, [goEngine]);

	const handleReset = useCallback(() => {
		goEngine.reset();
		setStepMode(false);
		stepper.reset();
		replay.exit();
		lastProcessedRef.current = 0;
		setStrategies(createInitialStrategies(rows, cols));
		setCellHistory(new Map());
		setMutexQueue([]);
		setMutexHolder(null);
		setActiveStrategy(null);
		setSelectedCell(null);
	}, [rows, cols, goEngine, stepper, lastProcessedRef, replay]);

	// Comparison data
	const comparison = useMemo(() => {
		if (!isCompleted) return null;
		const items = (['no-lock', 'mutex', 'optimistic'] as const).map((s) => ({
			key: s,
			...STRATEGY_LABELS[s],
			booked: strategies[s].booked,
			conflicts: strategies[s].conflicts,
			overwrites: strategies[s].overwrites,
			lostBookings: strategies[s].lostBookings,
			retries: strategies[s].retries,
			time: strategies[s].time,
			successRate:
				totalSeats > 0
					? Math.round((strategies[s].booked / totalSeats) * 100)
					: 0,
		}));
		return items;
	}, [isCompleted, strategies, totalSeats]);

	const tooltipInfo = useMemo(() => {
		if (!hoveredCell) return null;
		const { strategy, row, col } = hoveredCell;
		const info = strategies[strategy].cellInfo[row]?.[col];
		if (!info) return null;
		return { ...info, row, col, strategy };
	}, [hoveredCell, strategies]);

	const handleCellHover = useCallback((s: string, r: number, c: number) => {
		setHoveredCell({ strategy: s, row: r, col: c });
	}, []);

	const handleCellLeave = useCallback(() => {
		setHoveredCell(null);
	}, []);

	const handleCellClick = useCallback((s: string, r: number, c: number) => {
		setSelectedCell((prev) =>
			prev?.strategy === s && prev.row === r && prev.col === c ? null : { strategy: s, row: r, col: c },
		);
	}, []);

	// Get cell events for the selected cell across all strategies
	const selectedCellEvents = useMemo(() => {
		if (!selectedCell) return { events: [], allStrategyEvents: {} as Record<string, SimulationEvent[]> };
		const { strategy, row, col } = selectedCell;
		const key = `${strategy}:${row}:${col}`;
		const events = cellHistory.get(key) || [];
		const allStrategyEvents: Record<string, SimulationEvent[]> = {};
		for (const s of ['no-lock', 'mutex', 'optimistic']) {
			allStrategyEvents[s] = cellHistory.get(`${s}:${row}:${col}`) || [];
		}
		return { events, allStrategyEvents };
	}, [selectedCell, cellHistory]);

	// Replay: process visible events into strategy state
	const replayStrategies = useMemo(() => {
		if (!replay.isReplaying) return null;
		let state = createInitialStrategies(rows, cols);
		for (const evt of replay.visibleEvents) {
			state = applyGoEvent(state, evt);
		}
		return state;
	}, [replay.isReplaying, replay.visibleEvents, rows, cols]);

	// Use replay state when replaying, otherwise live state
	const displayStrategies = replayStrategies || strategies;

	return (
		<div className='space-y-4'>
			{/* Engine badge */}
			<div className='flex items-center gap-2 rounded-lg border bg-card p-2'>
				<span className='text-xs font-medium text-muted-foreground px-1'>
					Go Backend
				</span>
				<span className='text-[10px] text-muted-foreground ml-auto'>
					Real goroutines, mutex, atomic CAS via SSE
				</span>
			</div>

			{/* Tunable Parameters */}
			{!isRunning && !stepMode && (
				<div className='rounded-lg border bg-card p-3 space-y-3'>
					<div className='flex items-center gap-2'>
						<Info className='h-3.5 w-3.5 text-muted-foreground' />
						<span className='text-xs font-medium text-muted-foreground'>
							Simulation Parameters
						</span>
					</div>
					{/* Presets */}
					<div className='space-y-1.5'>
						<span className='text-[10px] text-muted-foreground uppercase tracking-wide font-medium'>
							Try a scenario
						</span>
						<div className='flex flex-wrap gap-1.5'>
							{PRESETS.map((preset) => {
								const isActive =
									rows === preset.rows &&
									cols === preset.cols &&
									users === preset.users &&
									delayMs === preset.delayMs;
								return (
									<button
										key={preset.label}
										className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors ${
											isActive
												? 'bg-primary text-primary-foreground border-primary'
												: 'bg-card text-muted-foreground border-border hover:bg-muted/80 hover:text-foreground'
										}`}
										onClick={() => {
											setRows(preset.rows);
											setCols(preset.cols);
											setUsers(preset.users);
											setDelayMs(preset.delayMs);
											setStrategies(createInitialStrategies(preset.rows, preset.cols));
										}}
										disabled={isRunning}
									>
										{preset.icon} {preset.label}
									</button>
								);
							})}
						</div>
						{/* Show expected outcome for active preset */}
						{PRESETS.find(
							(p) =>
								p.rows === rows &&
								p.cols === cols &&
								p.users === users &&
								p.delayMs === delayMs,
						) && (
							<p className='text-[10px] text-muted-foreground italic leading-relaxed'>
								{
									PRESETS.find(
										(p) =>
											p.rows === rows &&
											p.cols === cols &&
											p.users === users &&
											p.delayMs === delayMs,
									)!.expect
								}
							</p>
						)}
					</div>

					<div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
						<div className='space-y-1'>
							<div className='flex justify-between'>
								<span className='text-xs text-muted-foreground'>Grid Rows</span>
								<span className='text-xs font-mono'>{rows}</span>
							</div>
							<Slider
								value={[rows]}
								onValueChange={([v]) => {
									setRows(v);
									setStrategies(createInitialStrategies(v, cols));
								}}
								min={4}
								max={16}
								step={1}
								disabled={isRunning}
							/>
						</div>
						<div className='space-y-1'>
							<div className='flex justify-between'>
								<span className='text-xs text-muted-foreground'>Grid Cols</span>
								<span className='text-xs font-mono'>{cols}</span>
							</div>
							<Slider
								value={[cols]}
								onValueChange={([v]) => {
									setCols(v);
									setStrategies(createInitialStrategies(rows, v));
								}}
								min={4}
								max={20}
								step={1}
								disabled={isRunning}
							/>
						</div>
						<div className='space-y-1'>
							<div className='flex justify-between'>
								<span className='text-xs text-muted-foreground'>Users</span>
								<span className='text-xs font-mono'>{users}</span>
							</div>
							<Slider
								value={[users]}
								onValueChange={([v]) => setUsers(v)}
								min={10}
								max={500}
								step={10}
								disabled={isRunning}
							/>
						</div>
						<div className='space-y-1'>
							<div className='flex justify-between'>
								<span className='text-xs text-muted-foreground'>
									Delay (ms)
								</span>
								<span className='text-xs font-mono'>{delayMs}ms</span>
							</div>
							<Slider
								value={[delayMs]}
								onValueChange={([v]) => setDelayMs(v)}
								min={1}
								max={50}
								step={1}
								disabled={isRunning}
							/>
						</div>
					</div>
					<p className='text-[11px] text-muted-foreground leading-relaxed'>
						<strong>{totalSeats}</strong> seats, <strong>{users}</strong>{' '}
						concurrent goroutines
						{users > totalSeats && (
							<span className='text-yellow-600 dark:text-yellow-400'>
								{' '}
								&mdash; more users than seats! Expect high contention.
							</span>
						)}
						{users <= totalSeats * 0.5 && (
							<span className='text-green-600 dark:text-green-400'>
								{' '}
								&mdash; low contention. Fewer conflicts expected.
							</span>
						)}
					</p>
				</div>
			)}

			<ControlPanel
				status={goEngine.status}
				speed={1}
				elapsed={goEngine.elapsed}
				onStart={handleStart}
				onStop={handleStop}
				onReset={handleReset}
				onSpeedChange={() => {}}
			/>

			{/* Feature 1: Active strategy indicator */}
			{isRunning && activeStrategy && (
				<motion.div
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
				>
					<span className="relative flex h-2 w-2">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
						<span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
					</span>
					<span className="text-xs font-medium">
						Running: {STRATEGY_LABELS[activeStrategy]?.icon} {STRATEGY_LABELS[activeStrategy]?.name}
					</span>
					<span className="text-[10px] text-muted-foreground ml-auto">
						{STRATEGY_LABELS[activeStrategy]?.description}
					</span>
				</motion.div>
			)}

			{/* Feature 4: Mutex queue visualization */}
			{isRunning && activeStrategy === 'mutex' && (
				<MutexQueueViz queue={mutexQueue} activeUser={mutexHolder} />
			)}

			{/* Step-through & Replay toggles */}
			{isCompleted && !stepMode && !replay.isReplaying && (
				<div className="flex gap-2">
					<Button
						className='flex-1 gap-2'
						variant='outline'
						onClick={() => {
							setStepMode(true);
							stepper.reset();
						}}>
						<ListOrdered className='h-4 w-4' />
						Step Through Code
					</Button>
					<Button
						className='flex-1 gap-2'
						variant='outline'
						onClick={() => replay.enter(goEngine.events)}>
						<RotateCcw className='h-4 w-4' />
						Replay Simulation
					</Button>
				</div>
			)}

			{/* Feature 3: Replay mode controls */}
			{replay.isReplaying && (
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold">Replay Mode</h3>
						<Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => replay.exit()}>
							<X className="h-3.5 w-3.5" />
						</Button>
					</div>
					<ReplayControls
						isPlaying={replay.isPlaying}
						speed={replay.speed}
						currentIndex={replay.currentIndex}
						totalEvents={goEngine.events.length}
						currentTimestamp={Math.round(replay.currentTimestamp)}
						totalDuration={Math.round(replay.totalDuration)}
						onPlay={replay.play}
						onPause={replay.pause}
						onSpeedChange={replay.setSpeed}
						onSeek={replay.seekTo}
						onReset={replay.reset}
					/>
				</div>
			)}

			{/* Step mode UI */}
			{stepMode && (
				<div className='space-y-3'>
					<div className='flex items-center justify-between'>
						<h3 className='text-sm font-semibold'>Step-by-Step Execution</h3>
						<Button
							size='icon'
							variant='ghost'
							className='h-7 w-7'
							onClick={() => setStepMode(false)}>
							<X className='h-3.5 w-3.5' />
						</Button>
					</div>

					<CodeStepper
						step={stepper.currentStep}
						currentIndex={stepper.currentIndex}
						totalSteps={stepper.totalSteps}
						isFirst={stepper.isFirst}
						isLast={stepper.isLast}
						isAutoPlaying={stepper.isAutoPlaying}
						onNext={stepper.next}
						onPrev={stepper.prev}
						onToggleAutoPlay={stepper.toggleAutoPlay}
						onReset={stepper.reset}
					/>

					{stepper.currentStep.visualEffect && (
						<div className='rounded-lg border bg-card p-3'>
							<h4 className='text-xs font-medium text-muted-foreground mb-2'>
								Visual Preview &mdash; {stepper.currentStep.strategy}
							</h4>
							<div
								className='grid gap-0.5'
								style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
								{stepGrid.flat().map((cell, i) => (
									<motion.div
										key={i}
										className={`aspect-square rounded-[2px] ${CELL_COLORS[cell]}`}
										animate={{ scale: cell !== 'available' ? [1, 1.4, 1] : 1 }}
										transition={{ duration: 0.3 }}
									/>
								))}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Three strategy grids side by side */}
			{!stepMode && (
				<div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
					{(['no-lock', 'mutex', 'optimistic'] as const).map((strategy) => (
						<StrategyGridCard
							key={strategy}
							strategy={strategy}
							state={displayStrategies[strategy]}
							cols={cols}
							isCompleted={isCompleted}
							isActive={activeStrategy === strategy}
							hoveredCell={hoveredCell}
							onHover={handleCellHover}
							onLeave={handleCellLeave}
							onCellClick={handleCellClick}
						/>
					))}
				</div>
			)}

			{/* Cell tooltip */}
			{tooltipInfo && tooltipInfo.state !== 'available' && (
				<div className='rounded-lg border bg-card px-3 py-2 text-xs flex items-center gap-3'>
					<div
						className={`w-3 h-3 rounded-[2px] ${CELL_COLORS[tooltipInfo.state]}`}
					/>
					<span className='font-mono text-muted-foreground'>
						[{tooltipInfo.row},{tooltipInfo.col}]
					</span>
					<span className='capitalize font-medium'>{tooltipInfo.state}</span>
					{tooltipInfo.user && <span>User #{tooltipInfo.user}</span>}
					{tooltipInfo.retries !== undefined && tooltipInfo.retries > 0 && (
						<span className='text-orange-500'>
							{tooltipInfo.retries} retries
						</span>
					)}
					<span className='text-muted-foreground'>
						via {STRATEGY_LABELS[tooltipInfo.strategy]?.name}
					</span>
				</div>
			)}

			{/* Feature 2 + 6 + 7: Cell story panel with race timeline and cross-strategy comparison */}
			{selectedCell && (
				<CellStoryPanel
					strategy={selectedCell.strategy}
					row={selectedCell.row}
					col={selectedCell.col}
					events={selectedCellEvents.events}
					allStrategyEvents={selectedCellEvents.allStrategyEvents}
					onClose={() => setSelectedCell(null)}
				/>
			)}

			{/* Legend */}
			<div className='flex flex-wrap gap-3 text-xs'>
				{Object.entries(CELL_COLORS).map(([state, color]) => (
					<div key={state} className='flex items-center gap-1.5'>
						<div className={`w-3 h-3 rounded-[2px] ${color}`} />
						<span className='capitalize'>{state}</span>
					</div>
				))}
			</div>

			{/* Strategy Comparison — appears after simulation completes */}
			{isCompleted && !stepMode && comparison && (
				<div className='rounded-lg border bg-card p-4 space-y-5'>
					<h3 className='text-sm font-semibold flex items-center gap-2'>
						Strategy Comparison
						<Badge
							variant='outline'
							className='text-[9px] px-1.5 py-0 font-normal'>
							real Go goroutines
						</Badge>
					</h3>

					{/* Time comparison bars */}
					<div>
						<p className='text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-3'>
							Execution Time
						</p>
						<TimeComparisonBar
							items={comparison.map((i) => ({
								key: i.key,
								icon: i.icon,
								name: i.name,
								time: i.time,
								booked: i.booked,
								totalSeats,
							}))}
						/>
					</div>

					<div className='border-t' />

					{/* Detailed metrics table */}
					<div>
						<p className='text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-3'>
							Detailed Metrics
						</p>
						<ComparisonTable items={comparison} />
					</div>

					<div className='border-t' />

					{/* Key Takeaways */}
					<KeyTakeaways
						strategies={strategies}
						users={users}
						totalSeats={totalSeats}
					/>
				</div>
			)}

			{/* Filterable Event Log — collapsed by default */}
			{!stepMode && goEngine.events.length > 0 && (
				<FilterableEventLog events={goEngine.events} />
			)}
		</div>
	);
}
