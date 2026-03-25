'use client';

import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Profile } from '@/types/auth';
import { ReactNode, useEffect } from 'react';

export default function AuthStoreProvider({
	children,
	profile,
}: {
	children: ReactNode;
	profile: Profile;
}) {
	useEffect(() => {
		const supabase = createClient();
		supabase.auth.getUser().then(({ data: { user } }) => {
			useAuthStore.getState().setUser(user);
			useAuthStore.getState().setProfile(profile);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [profile.id, profile.name, profile.avatar_url, profile.role]);

	return <>{children}</>;
}
