import { useQuery } from "@tanstack/react-query"
import { BuildingIcon, CheckCircle2Icon, SearchIcon, StoreIcon, XCircleIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { Skeleton } from "../components/ui/skeleton"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table"
import { ApiClientError, apiGet } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
import { cn } from "../lib/utils"

type AdminTenant = {
	id: string
	name: string
	type: "restaurant" | "ngo"
	createdAt: string
	verifiedAt: string | null
	verificationStatus: "pending" | "approved" | "rejected" | "n/a"
	userCount: number
}

type AdminAnalytics = {
	totalTenants: number
	totalRestaurants: number
	totalNgos: number
	totalUsers: number
	totalKgDiverted: string
	totalCarbonAvoidedKg: string
}

const formatDate = (value: string | null): string => {
	if (value == null) return "—"
	const parsed = new Date(value)
	if (Number.isNaN(parsed.valueOf())) return "—"
	return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const statusVariant = (status: AdminTenant["verificationStatus"]) => {
	if (status === "approved") return "good" as const
	if (status === "rejected") return "critical" as const
	if (status === "pending") return "warning" as const
	return "secondary" as const
}

const messageFor = (error: Error): string => {
	if (error instanceof ApiClientError) return error.message
	return "Something went wrong."
}

export const AdminTenantsPage = () => {
	const tenants = useQuery({
		queryKey: queryKeys.adminTenants(),
		queryFn: () => apiGet<AdminTenant[]>("/v1/admin/tenants"),
	})

	const analytics = useQuery({
		queryKey: queryKeys.adminAnalytics(),
		queryFn: () => apiGet<AdminAnalytics>("/v1/admin/analytics"),
	})

	const [filter, setFilter] = useState("")

	const all = tenants.data ?? []
	const filtered =
		filter === ""
			? all
			: all.filter(
					(t) =>
						t.name.toLowerCase().includes(filter.toLowerCase()) ||
						t.id.toLowerCase().includes(filter.toLowerCase()),
				)

	return (
		<section className="w-full space-y-8">
			<header>
				<h1 className="font-display text-2xl font-semibold tracking-tight">Tenants</h1>
				<p className="mt-1 text-muted-foreground">
					Every restaurant and NGO on SmartPlate, with their verification status.
				</p>
			</header>

			{analytics.data != null && (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<Card>
						<CardHeader>
							<CardDescription>Total tenants</CardDescription>
							<CardTitle className="font-display text-2xl">{analytics.data.totalTenants}</CardTitle>
						</CardHeader>
						<CardContent className="text-xs text-muted-foreground">
							{analytics.data.totalRestaurants} restaurants, {analytics.data.totalNgos} NGOs
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardDescription>Total users</CardDescription>
							<CardTitle className="font-display text-2xl">{analytics.data.totalUsers}</CardTitle>
						</CardHeader>
						<CardContent className="text-xs text-muted-foreground">
							Across every workspace
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardDescription>Kg diverted from waste</CardDescription>
							<CardTitle className="font-display text-2xl">
								{Number(analytics.data.totalKgDiverted).toFixed(1)}
							</CardTitle>
						</CardHeader>
						<CardContent className="text-xs text-muted-foreground">
							From sold and donated listings
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardDescription>Carbon avoided (kg CO₂e)</CardDescription>
							<CardTitle className="font-display text-2xl">
								{Number(analytics.data.totalCarbonAvoidedKg).toFixed(1)}
							</CardTitle>
						</CardHeader>
						<CardContent className="text-xs text-muted-foreground">
							Emission factors per kg food
						</CardContent>
					</Card>
				</div>
			)}

			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<CardTitle className="text-base">Directory</CardTitle>
							<CardDescription>
								Click into a tenant to view their profile and verification history.
							</CardDescription>
						</div>
						<div className="relative w-full sm:w-64">
							<SearchIcon
								className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								placeholder="Filter by name or id"
								value={filter}
								onChange={(event) => setFilter(event.target.value)}
								className="pl-9"
							/>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{tenants.isPending && (
						<div className="space-y-3">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					)}
					{tenants.error != null && (
						<p className="text-sm text-critical">{messageFor(tenants.error)}</p>
					)}
					{tenants.data != null && filtered.length === 0 && (
						<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
							<BuildingIcon className="size-5 text-muted-foreground" aria-hidden="true" />
							<p className="text-sm font-medium">No tenants match your filter</p>
						</div>
					)}
					{filtered.length > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Type</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Created</TableHead>
									<TableHead>Verified</TableHead>
									<TableHead className="text-right">Users</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filtered.map((tenant) => (
									<TableRow key={tenant.id}>
										<TableCell>
											<Button variant="link" asChild className="h-auto p-0 font-medium">
												<Link to={`/admin/verification?focus=${tenant.id}`}>{tenant.name}</Link>
											</Button>
										</TableCell>
										<TableCell>
											<Badge
												variant="secondary"
												className={cn(tenant.type === "ngo" && "bg-info/10 text-info")}
											>
												{tenant.type === "ngo" ? (
													<BuildingIcon className="mr-1 size-3" aria-hidden="true" />
												) : (
													<StoreIcon className="mr-1 size-3" aria-hidden="true" />
												)}
												{tenant.type}
											</Badge>
										</TableCell>
										<TableCell>
											<Badge variant={statusVariant(tenant.verificationStatus)}>
												{tenant.verificationStatus === "approved" ? (
													<CheckCircle2Icon className="mr-1 size-3" aria-hidden="true" />
												) : tenant.verificationStatus === "rejected" ? (
													<XCircleIcon className="mr-1 size-3" aria-hidden="true" />
												) : null}
												{tenant.verificationStatus === "n/a" ? "n/a" : tenant.verificationStatus}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDate(tenant.createdAt)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDate(tenant.verifiedAt)}
										</TableCell>
										<TableCell className="text-right tabular">{tenant.userCount}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</section>
	)
}
