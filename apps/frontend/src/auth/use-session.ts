import type { MeResponse } from "@smartplate/contracts/auth"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiPost } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"

export const useSession = () => {
	const query = useQuery({
		queryKey: queryKeys.session(),
		queryFn: () => apiGet<MeResponse>("/v1/auth/me"),
		retry: false,
		staleTime: 30_000,
	})

	return {
		session: query.data ?? null,
		isPending: query.isPending,
		isAuthenticated: query.data != null,
	}
}

export const useLogout = () => {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: () => apiPost<{ signedOut: boolean }>("/v1/auth/logout"),
		onSuccess: () => {
			queryClient.setQueryData(queryKeys.session(), null)
			queryClient.clear()
		},
	})
}

export const homePathFor = (session: MeResponse | null): string => {
	if (session == null) return "/login"
	if (session.user.role === "super_admin") return "/admin"
	return session.tenant.type === "restaurant" ? "/app" : "/ngo"
}
