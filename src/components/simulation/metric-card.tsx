'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { SimulationMetric } from '@/types/simulation';

export function MetricCard({ label, value, trend, color }: SimulationMetric) {
	const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
	const trendColor =
		trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400';

	return (
		<div className="rounded-lg border bg-card p-3">
			<p className="text-xs text-muted-foreground">{label}</p>
			<div className="flex items-center gap-2 mt-1">
				<span className={`text-xl font-bold ${color || ''}`}>{value}</span>
				{trend && <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />}
			</div>
		</div>
	);
}
