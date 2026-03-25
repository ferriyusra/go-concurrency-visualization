'use client';

import { ReactNode, useState } from 'react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

export default function ReactQueryProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [client] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						refetchOnWindowFocus: false,
						refetchOnReconnect: false,
						refetchOnMount: false,
						retry: false,
					},
				},
			})
	);
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
