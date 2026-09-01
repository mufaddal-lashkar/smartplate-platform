import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HandHeartIcon, ShoppingBasketIcon, Undo2Icon } from "lucide-react"
import { useState } from "react"
import { apiPostIdempotent } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
import { Button } from "./ui/button"

type ClaimResponse = { listing: { id: string; claimedByTenantId: string | null } }

type ClaimButtonProps =
	| {
			mode: "claim"
			listingId: string
			channel: "b2b" | "ngo"
	  }
	| {
			mode: "release"
			listingId: string
	  }

export const ClaimButton = (props: ClaimButtonProps) => {
	const queryClient = useQueryClient()
	const [key] = useState(() => crypto.randomUUID())

	const claimMutation = useMutation({
		mutationFn: async () =>
			apiPostIdempotent<ClaimResponse>(`/v1/market/${props.listingId}/claim`, {}, key),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.marketBrowse() })
			queryClient.invalidateQueries({ queryKey: queryKeys.marketMine() })
			queryClient.invalidateQueries({ queryKey: queryKeys.marketPickups() })
			queryClient.invalidateQueries({ queryKey: queryKeys.listings() })
		},
	})

	const releaseMutation = useMutation({
		mutationFn: () =>
			apiPostIdempotent<{ released: true }>(`/v1/market/${props.listingId}/release`, {}, key),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.marketBrowse() })
			queryClient.invalidateQueries({ queryKey: queryKeys.marketMine() })
			queryClient.invalidateQueries({ queryKey: queryKeys.marketPickups() })
			queryClient.invalidateQueries({ queryKey: queryKeys.listings() })
		},
	})

	if (props.mode === "release") {
		return (
			<Button
				variant="outline"
				size="sm"
				onClick={(e) => {
					e.stopPropagation()
					releaseMutation.mutate()
				}}
				disabled={releaseMutation.isPending}
			>
				<Undo2Icon /> Release
			</Button>
		)
	}

	return (
		<Button
			size="sm"
			onClick={(e) => {
				e.stopPropagation()
				claimMutation.mutate()
			}}
			disabled={claimMutation.isPending}
		>
			{props.channel === "ngo" ? <HandHeartIcon /> : <ShoppingBasketIcon />}
			{props.channel === "ngo" ? "Reserve pickup" : "Claim"}
		</Button>
	)
}
