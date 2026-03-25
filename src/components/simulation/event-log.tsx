'use client';

import { useRef, useEffect } from 'react';
import type { SimulationEvent } from '@/types/simulation';

type EventLogProps = {
	events: SimulationEvent[];
	maxVisible?: number;
};

const EVENT_COLORS: Record<string, string> = {
	booked: 'text-green-500',
	complete: 'text-green-500',
	served: 'text-green-500',
	evacuated: 'text-green-500',
	failed: 'text-red-500',
	conflict: 'text-red-500',
	timeout: 'text-red-500',
	error: 'text-red-500',
	retry: 'text-yellow-500',
	locking: 'text-yellow-500',
	queued: 'text-blue-500',
	processing: 'text-blue-500',
	started: 'text-blue-500',
};

function getEventColor(type: string): string {
	for (const [key, color] of Object.entries(EVENT_COLORS)) {
		if (type.includes(key)) return color;
	}
	return 'text-muted-foreground';
}

export function EventLog({ events, maxVisible = 100 }: EventLogProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const visibleEvents = events.slice(-maxVisible);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [events.length]);

	return (
		<div className="rounded-lg border bg-card">
			<div className="px-3 py-2 border-b">
				<span className="text-xs font-medium text-muted-foreground">
					Event Log ({events.length})
				</span>
			</div>
			<div ref={scrollRef} className="h-40 overflow-auto font-mono text-xs p-2 space-y-0.5">
				{visibleEvents.length === 0 && (
					<p className="text-muted-foreground italic">No events yet. Start the simulation.</p>
				)}
				{visibleEvents.map((event) => (
					<div key={event.id} className="flex gap-2">
						<span className="text-muted-foreground shrink-0">
							{(event.timestamp / 1000).toFixed(2)}s
						</span>
						<span className={getEventColor(event.type)}>{event.type}</span>
						<span className="text-muted-foreground truncate">
							{JSON.stringify(event.data)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
