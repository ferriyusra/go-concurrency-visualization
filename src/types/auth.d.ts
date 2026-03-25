export type AuthFormState = {
	status?: string;
	role?: string;
	errors?: {
		email?: string[];
		password?: string[];
		name?: string[];
		role?: string[];
		avatar_url?: string[];
		_form?: string[];
		[key: string]: string[] | undefined;
	};
};

export type Profile = {
	id?: string;
	name: string;
	avatar_url: string;
	role: string;
};
