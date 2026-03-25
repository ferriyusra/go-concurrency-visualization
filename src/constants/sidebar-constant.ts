import {
	LayoutDashboard,
	Users,
	PlayCircle,
} from 'lucide-react';

export const SIDEBAR_MENU_LIST = {
	admin: [
		{
			title: 'Dashboard',
			url: '/admin',
			icon: LayoutDashboard,
		},
		{
			title: 'Users',
			url: '/admin/user',
			icon: Users,
		},
		{
			title: 'Simulations',
			url: '/simulations',
			icon: PlayCircle,
		},
	],
	user: [
		{
			title: 'Dashboard',
			url: '/dashboard',
			icon: LayoutDashboard,
		},
	],
};

export type SidebarMenuKey = keyof typeof SIDEBAR_MENU_LIST;
