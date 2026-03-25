'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Code, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CodeViewer } from '@/components/simulation/code-viewer';
import { DIFFICULTY_COLORS, PATTERN_COLORS } from '@/constants/simulation-constant';
import type { SimulationConfig } from '@/types/simulation';
import { BookingRushSim } from './booking-rush-sim';

type SimComponentProps = {
	onHighlightChange?: (lines: [number, number] | null) => void;
	onActiveStrategyChange?: (strategy: string | null) => void;
	onNotableStrategiesChange?: (strategies: string[]) => void;
};

const SIMULATION_COMPONENTS: Record<string, React.ComponentType<SimComponentProps>> = {
	'booking-rush': BookingRushSim,
};

type Props = {
	simulation: SimulationConfig;
};

export function SimulationDetail({ simulation }: Props) {
	const [activeTab, setActiveTab] = useState<'viz' | 'code'>('viz');
	const [highlightedLines, setHighlightedLines] = useState<[number, number] | null>(null);
	const SimComponent = SIMULATION_COMPONENTS[simulation.id];

	const handleHighlightChange = useCallback((lines: [number, number] | null) => {
		setHighlightedLines(lines);
		// Auto-switch to code tab on mobile when stepping
		if (lines) setActiveTab('code');
	}, []);

	return (
		<div className="max-w-[1400px] mx-auto p-4 space-y-4">
			{/* Header */}
			<div className="flex items-start gap-4">
				<Link href="/simulations">
					<Button variant="ghost" size="icon" className="shrink-0 mt-1">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<span className="text-2xl">{simulation.icon}</span>
						<h1 className="text-2xl font-bold">{simulation.name}</h1>
						<span
							className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[simulation.difficulty]}`}
						>
							{simulation.difficulty}
						</span>
					</div>
					<p className="text-muted-foreground mt-1">{simulation.scenario}</p>
					<div className="flex flex-wrap gap-1.5 mt-2">
						{simulation.patterns.map((pattern, i) => (
							<Badge
								key={pattern}
								variant="secondary"
								className={`text-xs font-mono ${PATTERN_COLORS[i % PATTERN_COLORS.length]}`}
							>
								{pattern}
							</Badge>
						))}
					</div>
				</div>
			</div>

			{/* Tab toggle for mobile */}
			<div className="flex gap-1 rounded-lg border p-1 bg-muted/50 lg:hidden">
				<Button
					variant={activeTab === 'viz' ? 'default' : 'ghost'}
					size="sm"
					onClick={() => setActiveTab('viz')}
					className="flex-1 gap-1.5"
				>
					<Monitor className="h-3.5 w-3.5" />
					Visualization
				</Button>
				<Button
					variant={activeTab === 'code' ? 'default' : 'ghost'}
					size="sm"
					onClick={() => setActiveTab('code')}
					className="flex-1 gap-1.5"
				>
					<Code className="h-3.5 w-3.5" />
					Go Code
				</Button>
			</div>

			{/* Main content: side by side on desktop, tabbed on mobile */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				{/* Visualization */}
				<div className={activeTab === 'code' ? 'hidden lg:block' : ''}>
					{SimComponent ? (
						<SimComponent onHighlightChange={handleHighlightChange} />
					) : (
						<PlaceholderSim name={simulation.name} />
					)}
				</div>

				{/* Go Code */}
				<div className={activeTab === 'viz' ? 'hidden lg:block' : ''}>
					<CodeViewer
						code={simulation.goSnippet}
						title={`${simulation.icon} ${simulation.name} — Go Code`}
						highlightedLines={highlightedLines ?? undefined}
					/>

					{/* Visual triggers reference */}
					<div className="mt-4 rounded-lg border bg-card p-4">
						<h3 className="text-sm font-semibold mb-2">Visual Triggers</h3>
						<div className="space-y-1">
							{Object.entries(simulation.visualTriggers).map(([event, desc]) => (
								<div key={event} className="flex gap-2 text-xs">
									<code className="text-blue-500 font-mono shrink-0">{event}</code>
									<span className="text-muted-foreground">{desc}</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			{/* Concepts */}
			{simulation.concepts && simulation.concepts.length > 0 && (
				<div className="space-y-3">
					<h2 className="text-lg font-semibold">Concurrency Concepts Used</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
						{simulation.concepts.map((concept) => (
								<div
									key={concept.name}
									className="rounded-lg border bg-card p-4 space-y-2"
								>
									<div className="flex items-center gap-2">
										<h3 className="text-sm font-semibold">{concept.name}</h3>
										{concept.strategies && concept.strategies.length > 0 && (
											<div className="flex gap-1">
												{concept.strategies.map((s) => (
													<span
														key={s}
														className="text-[9px] px-1.5 py-0 rounded-full border border-border text-muted-foreground"
													>
														{s}
													</span>
												))}
											</div>
										)}
									</div>
									<p className="text-xs text-muted-foreground leading-relaxed">
										{concept.what}
									</p>
									<div className="space-y-1">
										<p className="text-xs font-medium">Why it matters here</p>
										<p className="text-xs text-muted-foreground leading-relaxed">
											{concept.why}
										</p>
									</div>
									<code className="block text-[11px] font-mono bg-muted px-2 py-1.5 rounded whitespace-pre-wrap">
										{concept.goSyntax}
									</code>
								</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function PlaceholderSim({ name }: { name: string }) {
	return (
		<div className="rounded-lg border bg-card p-8 flex items-center justify-center min-h-[400px]">
			<p className="text-muted-foreground text-center">
				{name} simulation coming soon.
			</p>
		</div>
	);
}
