import { notFound } from 'next/navigation';
import { SIMULATIONS } from '@/constants/simulation-constant';
import { SimulationDetail } from './_components/simulation-detail';

type Props = {
	params: Promise<{ id: string }>;
};

export default async function SimulationPage({ params }: Props) {
	const { id } = await params;
	const simulation = SIMULATIONS.find((s) => s.id === id);

	if (!simulation) {
		notFound();
	}

	return <SimulationDetail simulation={simulation} />;
}
