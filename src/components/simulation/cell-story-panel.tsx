'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SimulationEvent } from '@/types/simulation';

type CellStoryPanelProps = {
	strategy: string;
	row: number;
	col: number;
	events: SimulationEvent[];
	allStrategyEvents: Record<string, SimulationEvent[]>;
	onClose: () => void;
};

const EVENT_ICONS: Record<string, string> = {
	seat_locking: '🔒',
	seat_lock_acquired: '🔓',
	seat_booked: '✅',
	seat_conflict: '💥',
	seat_overwrite: '💀',
	seat_retry: '🔄',
};

const EVENT_COLORS: Record<string, string> = {
	seat_locking: 'border-yellow-500 bg-yellow-500/10',
	seat_lock_acquired: 'border-yellow-500 bg-yellow-500/10',
	seat_booked: 'border-green-500 bg-green-500/10',
	seat_conflict: 'border-red-500 bg-red-500/10',
	seat_overwrite: 'border-purple-500 bg-purple-500/10',
	seat_retry: 'border-orange-500 bg-orange-500/10',
};

function describeEvent(event: SimulationEvent): string {
	const d = event.data as Record<string, any>;
	const user = d.user as number;
	switch (event.type) {
		case 'seat_locking':
			return `User #${user} is waiting to acquire the mutex lock`;
		case 'seat_lock_acquired':
			return `User #${user} acquired the lock — now has exclusive access`;
		case 'seat_booked':
			return `User #${user} successfully booked this seat${d.retries > 0 ? ` (after ${d.retries} retries)` : ''}`;
		case 'seat_conflict':
			return `User #${user} found the seat already taken — detected conflict`;
		case 'seat_overwrite':
			return `User #${user} silently overwrote User #${d.prevUser}'s booking — data corruption!`;
		case 'seat_retry':
			return `User #${user} CAS failed (attempt #${(d.retry ?? 0) + 1}) — version changed, retrying...`;
		default:
			return event.type;
	}
}

const STRATEGY_LABELS: Record<string, string> = {
	'no-lock': '❌ No Lock',
	mutex: '🔒 Mutex',
	optimistic: '⚡ Optimistic',
};

export function CellStoryPanel({
	strategy,
	row,
	col,
	events,
	allStrategyEvents,
	onClose,
}: CellStoryPanelProps) {
	// Group events by user for the race timeline
	const userLanes = useMemo(() => {
		const lanes = new Map<number, SimulationEvent[]>();
		for (const evt of events) {
			const user = (evt.data as Record<string, any>).user as number;
			if (!user) continue;
			if (!lanes.has(user)) lanes.set(user, []);
			lanes.get(user)!.push(evt);
		}
		return lanes;
	}, [events]);

	// Cross-strategy comparison for this seat
	const crossStrategy = useMemo(() => {
		const strategies = ['no-lock', 'mutex', 'optimistic'] as const;
		return strategies.map((s) => ({
			key: s,
			label: STRATEGY_LABELS[s],
			events: allStrategyEvents[s] || [],
		}));
	}, [allStrategyEvents]);

	const minTs = events.length > 0 ? Math.min(...events.map((e) => e.timestamp)) : 0;
	const maxTs = events.length > 0 ? Math.max(...events.map((e) => e.timestamp)) : 1;
	const timeSpan = Math.max(maxTs - minTs, 1);

	return (
		<div className="rounded-lg border bg-card p-4 space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<h3 className="text-sm font-semibold">
						Seat [{row},{col}]
					</h3>
					<Badge variant="outline" className="text-[10px]">
						{STRATEGY_LABELS[strategy]}
					</Badge>
					<span className="text-[10px] text-muted-foreground">
						{events.length} event{events.length !== 1 ? 's' : ''}
					</span>
				</div>
				<Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
					<X className="h-3.5 w-3.5" />
				</Button>
			</div>

			{/* Event timeline */}
			{events.length === 0 ? (
				<p className="text-xs text-muted-foreground italic py-4 text-center">
					No goroutine targeted this seat — random selection missed it.
				</p>
			) : (
				<div className="space-y-1.5">
					<p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
						Event Timeline
					</p>
					<div className="space-y-1">
						{events.map((evt, i) => (
							<div
								key={i}
								className={`flex items-start gap-2 rounded-md border-l-2 px-3 py-2 ${EVENT_COLORS[evt.type] || 'border-gray-300 bg-muted/30'}`}
							>
								<span className="text-sm shrink-0">{EVENT_ICONS[evt.type] || '•'}</span>
								<div className="flex-1 min-w-0">
									<p className="text-[11px] leading-relaxed">{describeEvent(evt)}</p>
									<span className="text-[10px] text-muted-foreground font-mono">
										{evt.timestamp}ms
									</span>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Race timeline (Gantt) — only show if multiple users interacted */}
			{userLanes.size > 1 && (
				<div className="space-y-1.5">
					<p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
						Race Timeline — {userLanes.size} goroutines overlapped
					</p>
					<div className="rounded-md border bg-muted/20 p-3 space-y-1">
						{Array.from(userLanes.entries()).map(([userId, userEvents]) => (
							<div key={userId} className="flex items-center gap-2 h-6">
								<span className="text-[10px] font-mono text-muted-foreground w-12 shrink-0 text-right">
									#{userId}
								</span>
								<div className="flex-1 relative h-4 bg-muted/50 rounded">
									{userEvents.map((evt, i) => {
										const left = ((evt.timestamp - minTs) / timeSpan) * 100;
										const dotColor =
											evt.type === 'seat_booked'
												? 'bg-green-500'
												: evt.type === 'seat_conflict'
													? 'bg-red-500'
													: evt.type === 'seat_overwrite'
														? 'bg-purple-500'
														: evt.type === 'seat_retry'
															? 'bg-orange-500'
															: 'bg-yellow-500';
										return (
											<div
												key={i}
												className={`absolute top-1 w-2 h-2 rounded-full ${dotColor}`}
												style={{ left: `${Math.min(left, 96)}%` }}
												title={`${evt.type} at ${evt.timestamp}ms`}
											/>
										);
									})}
								</div>
							</div>
						))}
						<div className="flex justify-between text-[9px] font-mono text-muted-foreground mt-1 pl-14">
							<span>{minTs}ms</span>
							<span>{maxTs}ms</span>
						</div>
					</div>
				</div>
			)}

			{/* Cross-strategy comparison (What If) */}
			<div className="space-y-1.5">
				<p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
					Same Seat Across All Strategies
				</p>
				<div className="grid grid-cols-3 gap-2">
					{crossStrategy.map((s) => {
						const booked = s.events.filter((e) => e.type === 'seat_booked').length;
						const conflicts = s.events.filter(
							(e) => e.type === 'seat_conflict' || e.type === 'seat_overwrite',
						).length;
						const retries = s.events.filter((e) => e.type === 'seat_retry').length;
						const isCurrentStrategy = s.key === strategy;
						return (
							<div
								key={s.key}
								className={`rounded-md border p-2 space-y-1 ${isCurrentStrategy ? 'ring-1 ring-primary' : ''}`}
							>
								<p className="text-[10px] font-medium truncate">{s.label}</p>
								{s.events.length === 0 ? (
									<p className="text-[9px] text-muted-foreground italic">No events</p>
								) : (
									<div className="text-[10px] font-mono space-y-0.5">
										{booked > 0 && (
											<div className="text-green-500">
												{booked} booked
											</div>
										)}
										{conflicts > 0 && (
											<div className="text-red-500">
												{conflicts} issue{conflicts !== 1 ? 's' : ''}
											</div>
										)}
										{retries > 0 && (
											<div className="text-orange-500">
												{retries} retries
											</div>
										)}
										{booked === 0 && conflicts === 0 && retries === 0 && (
											<div className="text-muted-foreground">
												{s.events.length} event{s.events.length !== 1 ? 's' : ''}
											</div>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
				{/* Educational annotation */}
				{(() => {
					const noLockIssues = (allStrategyEvents['no-lock'] || []).filter(
						(e) => e.type === 'seat_overwrite' || e.type === 'seat_conflict',
					).length;
					const mutexIssues = (allStrategyEvents['mutex'] || []).filter(
						(e) => e.type === 'seat_overwrite' || e.type === 'seat_conflict',
					).length;
					if (noLockIssues > 0 && mutexIssues === 0) {
						return (
							<p className="text-[10px] text-muted-foreground italic leading-relaxed">
								The mutex prevented the conflict seen in No Lock by serializing access to this seat.
							</p>
						);
					}
					return null;
				})()}
			</div>
		</div>
	);
}
