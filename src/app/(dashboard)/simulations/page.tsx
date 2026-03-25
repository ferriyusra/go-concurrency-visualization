import Link from 'next/link';
import { SIMULATIONS, DIFFICULTY_COLORS, PATTERN_COLORS } from '@/constants/simulation-constant';

export default function SimulationsPage() {
	return (
		<div className="max-w-7xl mx-auto p-6">
			<div className="mb-8">
				<h1 className="text-3xl font-bold">Go Concurrency Cinema Simulator</h1>
				<p className="text-muted-foreground mt-2">
					Interactive simulation that teaches Go concurrency patterns through a real cinema
					scenario. See the Go code alongside a live visualization.
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{SIMULATIONS.map((sim, index) => (
					<Link
						key={sim.id}
						href={`/simulations/${sim.id}`}
						className="group block rounded-xl border bg-card p-5 transition-all hover:shadow-lg hover:border-primary/50"
					>
						<div className="flex items-start justify-between mb-3">
							<span className="text-3xl">{sim.icon}</span>
							<span
								className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[sim.difficulty]}`}
							>
								{sim.difficulty}
							</span>
						</div>

						<h2 className="text-lg font-semibold group-hover:text-primary transition-colors">
							<span className="text-muted-foreground text-sm font-normal mr-1.5">
								#{index + 1}
							</span>
							{sim.name}
						</h2>

						<p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
							{sim.description}
						</p>

						<div className="flex flex-wrap gap-1.5 mt-3">
							{sim.patterns.map((pattern, i) => (
								<span
									key={pattern}
									className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${PATTERN_COLORS[i % PATTERN_COLORS.length]}`}
								>
									{pattern}
								</span>
							))}
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}
