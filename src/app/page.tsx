import Link from 'next/link';

export default function Home() {
	return (
		<div className='min-h-screen flex flex-col items-center justify-center p-8'>
			<h1 className='text-4xl font-bold mb-4'>Go Concurrency Visualization</h1>
			<p className='text-muted-foreground text-lg mb-8 text-center max-w-xl'>
				Learn Go concurrency patterns through interactive cinema simulations.
				Watch goroutines, channels, mutexes, and more come to life.
			</p>
			<Link
				href='/simulations'
				className='px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition'>
				Enter Simulations
			</Link>
		</div>
	);
}
