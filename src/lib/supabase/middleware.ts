import { environment } from '@/configs/environment';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
	let supabaseResponse = NextResponse.next({
		request,
	});

	const { SUPABASE_ANON_KEY, SUPABASE_URL } = environment;

	const supabase = createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
				cookiesToSet.forEach(({ name, value }) =>
					request.cookies.set(name, value)
				);
				supabaseResponse = NextResponse.next({ request });
				cookiesToSet.forEach(({ name, value, options }) =>
					supabaseResponse.cookies.set(name, value, options)
				);
			},
		},
	});

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user && request.nextUrl.pathname !== '/login') {
		const url = request.nextUrl.clone();
		url.pathname = '/login';
		return NextResponse.redirect(url);
	}

	return supabaseResponse;
}
