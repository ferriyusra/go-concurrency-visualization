export type SimulationStatus = 'idle' | 'running' | 'completed' | 'error';

export type SimulationDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type SimulationEvent = {
	id: number;
	type: string;
	timestamp: number;
	data: Record<string, unknown>;
};

export type SimulationMetric = {
	label: string;
	value: string | number;
	trend?: 'up' | 'down' | 'neutral';
	color?: string;
};

export type CodeStep = {
	id: number;
	strategy: 'setup' | 'no-lock' | 'mutex' | 'optimistic' | 'fanout';
	lineRange: [number, number];
	title: string;
	explanation: string;
	visualEffect?: {
		cellState: 'available' | 'locking' | 'booked' | 'conflict' | 'overwrite' | 'retry';
		row: number;
		col: number;
	};
};

export type ConceptInfo = {
	name: string;
	what: string;
	why: string;
	goSyntax: string;
	strategies?: string[];
};

export type SimulationConfig = {
	id: string;
	name: string;
	description: string;
	scenario: string;
	patterns: string[];
	difficulty: SimulationDifficulty;
	icon: string;
	goSnippet: string;
	visualTriggers: Record<string, string>;
	defaultParams: Record<string, number | boolean | string>;
	concepts?: ConceptInfo[];
};
