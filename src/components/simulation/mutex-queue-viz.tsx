'use client';

import { motion, AnimatePresence } from 'framer-motion';

type MutexQueueVizProps = {
	queue: number[];
	activeUser: number | null;
};

export function MutexQueueViz({ queue, activeUser }: MutexQueueVizProps) {
	if (queue.length === 0 && !activeUser) return null;

	return (
		<div className="rounded-lg border bg-card p-3 space-y-2">
			<div className="flex items-center gap-2">
				<span className="text-xs font-medium">Mutex Queue</span>
				<span className="text-[10px] text-muted-foreground">
					{queue.length} waiting{activeUser ? ' + 1 holding lock' : ''}
				</span>
			</div>

			<div className="flex items-center gap-1 overflow-x-auto pb-1">
				{/* Lock holder */}
				<AnimatePresence mode="popLayout">
					{activeUser && (
						<motion.div
							key={`active-${activeUser}`}
							initial={{ scale: 0, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0, opacity: 0 }}
							className="flex items-center gap-1 shrink-0"
						>
							<div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px] font-mono font-bold ring-2 ring-green-500/30">
								{activeUser}
							</div>
							<span className="text-[9px] text-green-500 font-medium mr-1">LOCK</span>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Divider */}
				{activeUser && queue.length > 0 && (
					<div className="w-px h-5 bg-border mx-1 shrink-0" />
				)}

				{/* Queue */}
				<AnimatePresence mode="popLayout">
					{queue.slice(0, 20).map((userId, i) => (
						<motion.div
							key={`q-${userId}-${i}`}
							initial={{ scale: 0, x: 20, opacity: 0 }}
							animate={{ scale: 1, x: 0, opacity: 1 }}
							exit={{ scale: 0, x: -20, opacity: 0 }}
							transition={{ type: 'spring', stiffness: 300, damping: 25 }}
							className="w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-600 dark:text-yellow-400 flex items-center justify-center text-[9px] font-mono shrink-0"
						>
							{userId}
						</motion.div>
					))}
				</AnimatePresence>

				{queue.length > 20 && (
					<span className="text-[10px] text-muted-foreground shrink-0 ml-1">
						+{queue.length - 20} more
					</span>
				)}
			</div>

			{/* Explanation */}
			<p className="text-[10px] text-muted-foreground leading-relaxed">
				Each goroutine waits in line. Only the green one holds the lock — all others are blocked,
				even if they target different seats.
			</p>
		</div>
	);
}
