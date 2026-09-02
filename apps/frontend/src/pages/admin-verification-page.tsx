import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2Icon, ShieldCheckIcon, XCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Skeleton } from "../components/ui/skeleton"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table"
import { ApiClientError, apiGet, apiPost, fieldError } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"

type PendingNgo = {
	id: string
	tenantId: string
	name: string
	contactPhone: string
	activeFrom: string
	activeTo: string
	serviceRadiusKm: string
	latitude: string
	longitude: string
	registrationNo: string
	verificationStatus: "pending" | "approved" | "rejected"
	verificationSubmittedAt: string | null
	verifiedAt: string | null
	rejectionReason: string
}

const formatDate = (value: string | null): string => {
	if (value == null) return "—"
	const parsed = new Date(value)
	if (Number.isNaN(parsed.valueOf())) return "—"
	return parsed.toLocaleString("en-IN", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	})
}

const messageFor = (error: Error): string => {
	if (error instanceof ApiClientError) return error.message
	return "Something went wrong."
}

export const AdminVerificationPage = () => {
	const queryClient = useQueryClient()
	const [searchParams] = useSearchParams()
	const focusId = searchParams.get("focus") ?? ""

	const allTenants = useQuery({
		queryKey: queryKeys.adminTenants(),
		queryFn: () =>
			apiGet<
				{
					id: string
					name: string
					type: "restaurant" | "ngo"
					verificationStatus: "pending" | "approved" | "rejected" | "n/a"
					verifiedAt: string | null
				}[]
			>("/v1/admin/tenants"),
	})

	const ngoDetail = useQuery({
		queryKey: ["admin", "ngo", focusId],
		queryFn: () => apiGet<PendingNgo>(`/v1/admin/tenants/${focusId}`),
		enabled: focusId !== "",
	})

	const [rejectOpen, setRejectOpen] = useState(false)
	const [rejectionReason, setRejectionReason] = useState("")

	const decide = useMutation({
		mutationFn: (input: { decision: "approve" | "reject"; rejectionReason?: string }) =>
			apiPost<PendingNgo>(`/v1/admin/tenants/${focusId}/verify`, input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.adminTenants() })
			queryClient.invalidateQueries({ queryKey: ["admin", "ngo", focusId] })
			setRejectOpen(false)
			setRejectionReason("")
		},
	})

	useEffect(() => {
		if (focusId === "") setRejectOpen(false)
	}, [focusId])

	const pending = (allTenants.data ?? []).filter(
		(t) => t.type === "ngo" && t.verificationStatus === "pending",
	)

	return (
		<section className="w-full space-y-8">
			<header>
				<h1 className="font-display text-2xl font-semibold tracking-tight">NGO verification</h1>
				<p className="mt-1 text-muted-foreground">
					Review the documents and approve or reject each pending NGO.
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Pending queue</CardTitle>
					<CardDescription>
						{pending.length} {pending.length === 1 ? "NGO is" : "NGOs are"} waiting for your review.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{allTenants.isPending && (
						<div className="space-y-3">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					)}
					{allTenants.error != null && (
						<p className="text-sm text-critical">{messageFor(allTenants.error)}</p>
					)}
					{allTenants.data != null && pending.length === 0 && (
						<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
							<ShieldCheckIcon className="size-5 text-muted-foreground" aria-hidden="true" />
							<p className="text-sm font-medium">Queue is empty</p>
							<p className="text-xs text-muted-foreground">
								Every NGO has been reviewed. Refresh to see new submissions.
							</p>
						</div>
					)}
					{pending.length > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Submitted</TableHead>
									<TableHead className="text-right">Action</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{pending.map((ngo) => (
									<TableRow key={ngo.id}>
										<TableCell className="font-medium">{ngo.name}</TableCell>
										<TableCell className="text-muted-foreground">—</TableCell>
										<TableCell className="text-right">
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													const url = new URL(window.location.href)
													url.searchParams.set("focus", ngo.id)
													window.history.pushState({}, "", url)
													window.dispatchEvent(new PopStateEvent("popstate"))
												}}
											>
												Review
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			{focusId !== "" && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Detail</CardTitle>
						<CardDescription>
							SmartPlate never stores the documents themselves; only the registration number and
							contact the NGO provided.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{ngoDetail.isPending && <Skeleton className="h-32 w-full" />}
						{ngoDetail.error != null && (
							<p className="text-sm text-critical">{messageFor(ngoDetail.error)}</p>
						)}
						{ngoDetail.data != null && (
							<div className="space-y-4">
								<div className="grid gap-4 sm:grid-cols-2">
									<div>
										<Label className="text-xs text-muted-foreground">NGO name</Label>
										<p className="text-sm font-medium">{ngoDetail.data.name}</p>
									</div>
									<div>
										<Label className="text-xs text-muted-foreground">Registration #</Label>
										<p className="text-sm font-medium">
											{ngoDetail.data.registrationNo === "" ? "—" : ngoDetail.data.registrationNo}
										</p>
									</div>
									<div>
										<Label className="text-xs text-muted-foreground">Contact phone</Label>
										<p className="text-sm font-medium">{ngoDetail.data.contactPhone}</p>
									</div>
									<div>
										<Label className="text-xs text-muted-foreground">Service radius</Label>
										<p className="text-sm font-medium">
											{Number(ngoDetail.data.serviceRadiusKm).toFixed(1)} km
										</p>
									</div>
									<div>
										<Label className="text-xs text-muted-foreground">Active hours</Label>
										<p className="text-sm font-medium">
											{ngoDetail.data.activeFrom} – {ngoDetail.data.activeTo}
										</p>
									</div>
									<div>
										<Label className="text-xs text-muted-foreground">Submitted</Label>
										<p className="text-sm font-medium">
											{formatDate(ngoDetail.data.verificationSubmittedAt)}
										</p>
									</div>
								</div>

								{ngoDetail.data.verificationStatus === "approved" && (
									<div className="rounded-lg bg-good/10 px-3 py-2 text-sm text-good">
										<CheckCircle2Icon className="mr-2 inline size-4" aria-hidden="true" />
										Approved on {formatDate(ngoDetail.data.verifiedAt)}.
									</div>
								)}
								{ngoDetail.data.verificationStatus === "rejected" && (
									<div className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-critical">
										<XCircleIcon className="mr-2 inline size-4" aria-hidden="true" />
										Rejected: {ngoDetail.data.rejectionReason}
									</div>
								)}

								{ngoDetail.data.verificationStatus === "pending" && (
									<div className="flex flex-wrap justify-end gap-2">
										<Button
											variant="outline"
											onClick={() => setRejectOpen(true)}
											disabled={decide.isPending}
										>
											Reject…
										</Button>
										<Button
											onClick={() => decide.mutate({ decision: "approve" })}
											disabled={decide.isPending}
										>
											<CheckCircle2Icon aria-hidden="true" />
											Approve
										</Button>
									</div>
								)}

								{decide.error != null && (
									<p className="text-sm text-critical">{messageFor(decide.error)}</p>
								)}
							</div>
						)}
					</CardContent>
				</Card>
			)}

			<Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Reject verification</DialogTitle>
						<DialogDescription>
							Give a reason. The NGO will see this message and can resubmit.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="reject-reason">Reason</Label>
						<Input
							id="reject-reason"
							value={rejectionReason}
							onChange={(event) => setRejectionReason(event.target.value)}
							placeholder="Documents were illegible"
						/>
						{fieldError(decide.error, "rejectionReason") !== "" && (
							<p className="text-xs text-critical">{fieldError(decide.error, "rejectionReason")}</p>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRejectOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={rejectionReason.trim() === "" || decide.isPending}
							onClick={() =>
								decide.mutate({
									decision: "reject",
									rejectionReason: rejectionReason.trim(),
								})
							}
						>
							Reject
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{ngoDetail.data?.verificationStatus === "approved" && (
				<Badge variant="good" className="hidden">
					Approved
				</Badge>
			)}
		</section>
	)
}
