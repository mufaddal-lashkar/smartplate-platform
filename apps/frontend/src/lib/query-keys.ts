export const queryKeys = {
	session: () => ["session"] as const,
	dishes: () => ["dishes"] as const,
	leftovers: (serviceDate: string) => ["leftovers", serviceDate] as const,
	dispositionSuggestion: (leftoverId: string) => ["leftovers", "suggestion", leftoverId] as const,
	listings: () => ["listings"] as const,
	dashboard: (from: string, to: string) => ["dashboard", from, to] as const,
}
