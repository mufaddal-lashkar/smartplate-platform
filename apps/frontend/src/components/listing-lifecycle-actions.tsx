import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2Icon, XCircleIcon } from "lucide-react"
import { useState } from "react"
import { apiPostIdempotent } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
import { Button } from "./ui/button"

type Status = "open" | "claimed" | "completed" | "expired" | "cancelled"

export const ListingLifecycleActions = ({
	listingId,
	status,
}: {
	listingId: string
	status: Status
}) => {
	const queryClient = useQueryClient()
	const [key] = useState(() => crypto.randomUUID())

	const cancel = useMutation({
		mutationFn: () =>
			apiPostIdempotent<{ listingId: string }>(`/v1/listings/${listingId}/cancel`, {}, key),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.listings() })
		},
	})

	const complete = useMutation({
		mutationFn: () =>
			apiPostIdempotent<{ listingId: string }>(`/v1/listings/${listingId}/complete`, {}, key),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.listings() })
		},
	})

	const noShow = useMutation({
		mutationFn: () =>
			apiPostIdempotent<{ listingId: string }>(`/v1/listings/${listingId}/no-show`, {}, key),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.listings() })
		},
	})

	if (status === "completed" || status === "cancelled" || status === "expired") return null

	return (
		<div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
			{status === "claimed" && (
				<>
					<Button
						variant="outline"
						size="sm"
						onClick={() => noShow.mutate()}
						disabled={noShow.isPending}
					>
						<XCircleIcon /> Report no-show
					</Button>
					<Button size="sm" onClick={() => complete.mutate()} disabled={complete.isPending}>
						<CheckCircle2Icon /> Mark collected
					</Button>
				</>
			)}
			{status === "open" && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => cancel.mutate()}
					disabled={cancel.isPending}
				>
					<XCircleIcon /> Cancel listing
				</Button>
			)}
		</div>
	)
}
