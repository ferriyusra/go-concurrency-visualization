import { environment } from '@/configs/environment';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CreateClientOptions = {
	isAdmin?: boolean;
};

export async function createClient({
	isAdmin = false,
}: CreateClientOptions = {}) {
	const cookieStore = await cookies();
	const { SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } =
		environment;

	return createServerClient(
		SUPABASE_URL!,
		isAdmin ? SUPABASE_SERVICE_ROLE_KEY! : SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return cookieStore.getAll();
				},
				setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
					try {
						cookiesToSet.forEach(({ name, value, options }) =>
							cookieStore.set(name, value, options)
						);
					} catch (error) {
						console.error('Error setting cookies:', cookiesToSet);
					}
				},
			},
		}
	);
}
