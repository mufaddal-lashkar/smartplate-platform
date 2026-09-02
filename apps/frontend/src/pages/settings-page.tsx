import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BellIcon, BuildingIcon, CheckCircle2Icon, LoaderIcon, StoreIcon } from "lucide-react"
import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { useSession } from "../auth/use-session"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Separator } from "../components/ui/separator"
import { Skeleton } from "../components/ui/skeleton"
import { ApiClientError, apiGet, apiPatch, fieldError } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"

type Tenant = {
	id: string
	name: string
	type: "restaurant" | "ngo"
	verified: boolean
}

type Restaurant = {
	id: string
	tenantId: string
	name: string
	addressLine: string
	city: string
	state: string
	pinCode: string
	cuisineType: string
	gstNumber: string
	contactPhone: string
	logoUrl: string
	browseRadiusKm: string
	latitude: string
	longitude: string
}

type Ngo = {
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

type PreferenceItem = {
	topic: string
	radiusKm: number | null
	activeFrom: string
	activeTo: string
	quietHoursEnabled: boolean
}

type Preferences = {
	preferences: PreferenceItem[]
}

type NotificationTopic = {
	key: string
	label: string
	defaultRadiusKm: number | null
}

const RESTAURANT_TOPICS: NotificationTopic[] = [
	{ key: "marketplace.new_listing", label: "New surplus listing near you", defaultRadiusKm: 5 },
	{ key: "leftover.expiring", label: "Leftover expiring in 2 hours", defaultRadiusKm: null },
	{ key: "pickup.eta", label: "NGO on the way for pickup", defaultRadiusKm: null },
]

const NGO_TOPICS: NotificationTopic[] = [
	{ key: "claim.confirmed", label: "Your claim is confirmed", defaultRadiusKm: null },
	{ key: "pickup.window", label: "Pickup window starting in 30 min", defaultRadiusKm: null },
	{ key: "reliability.update", label: "Reliability score update", defaultRadiusKm: null },
]

const messageFor = (error: Error): string => {
	if (!(error instanceof ApiClientError)) return "Something went wrong. Please try again."
	if (error.code === "AUTH_FORBIDDEN") return "You do not have permission to change settings."
	if (error.code === "VALIDATION_FAILED") return "Please check the fields below."
	return error.message
}

const toNumber = (value: string): number => {
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
	<div className="grid items-center gap-3 sm:grid-cols-3 sm:gap-4">
		<Label className="sm:text-right">{label}</Label>
		<div className="sm:col-span-2">{children}</div>
	</div>
)

const TenantSection = () => {
	const queryClient = useQueryClient()
	const tenant = useQuery({
		queryKey: queryKeys.tenant(),
		queryFn: () => apiGet<Tenant>("/v1/tenant"),
	})

	const [name, setName] = useState("")

	useEffect(() => {
		if (tenant.data != null) setName(tenant.data.name)
	}, [tenant.data])

	const save = useMutation({
		mutationFn: () => apiPatch<Tenant>("/v1/tenant", { name: name.trim() }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.tenant() })
			queryClient.invalidateQueries({ queryKey: queryKeys.session() })
		},
	})

	if (tenant.isPending) return <Skeleton className="h-32 w-full" />
	if (tenant.error != null) {
		return <p className="text-sm text-critical">{messageFor(tenant.error)}</p>
	}
	if (tenant.data == null) return null

	return (
		<form
			className="space-y-4"
			onSubmit={(event: FormEvent) => {
				event.preventDefault()
				save.mutate()
			}}
		>
			<Row label="Tenant name">
				<Input
					value={name}
					minLength={2}
					maxLength={120}
					onChange={(event) => setName(event.target.value)}
				/>
			</Row>
			<Row label="Status">
				{tenant.data.verified ? (
					<Badge variant="good">
						<CheckCircle2Icon className="mr-1 size-3" aria-hidden="true" />
						Verified
					</Badge>
				) : (
					<Badge variant="warning">Unverified</Badge>
				)}
			</Row>
			{save.error != null && <p className="text-sm text-critical">{messageFor(save.error)}</p>}
			<div className="flex justify-end">
				<Button type="submit" disabled={save.isPending}>
					{save.isPending && <LoaderIcon className="size-3 animate-spin" aria-hidden="true" />}
					Save tenant name
				</Button>
			</div>
		</form>
	)
}

const RestaurantSection = () => {
	const queryClient = useQueryClient()
	const restaurant = useQuery({
		queryKey: queryKeys.restaurant(),
		queryFn: () => apiGet<Restaurant>("/v1/restaurant"),
	})

	const [form, setForm] = useState<Partial<Restaurant>>({})

	useEffect(() => {
		if (restaurant.data != null) setForm(restaurant.data)
	}, [restaurant.data])

	const save = useMutation({
		mutationFn: () =>
			apiPatch<Restaurant>("/v1/restaurant", {
				name: form.name?.trim() ?? "",
				addressLine: form.addressLine ?? "",
				city: form.city ?? "",
				state: form.state ?? "",
				pinCode: form.pinCode ?? "",
				cuisineType: form.cuisineType ?? "",
				contactPhone: form.contactPhone ?? "",
				logoUrl: form.logoUrl ?? "",
				browseRadiusKm: toNumber(form.browseRadiusKm ?? "0").toString(),
				latitude: toNumber(form.latitude ?? "0").toString(),
				longitude: toNumber(form.longitude ?? "0").toString(),
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.restaurant() }),
	})

	if (restaurant.isPending) return <Skeleton className="h-48 w-full" />
	if (restaurant.error != null) {
		return <p className="text-sm text-critical">{messageFor(restaurant.error)}</p>
	}
	if (restaurant.data == null) return null

	return (
		<form
			className="space-y-4"
			onSubmit={(event: FormEvent) => {
				event.preventDefault()
				save.mutate()
			}}
		>
			<Row label="Display name">
				<Input
					value={form.name ?? ""}
					onChange={(event) => setForm({ ...form, name: event.target.value })}
				/>
				{fieldError(save.error, "name") !== "" && (
					<p className="mt-1 text-xs text-critical">{fieldError(save.error, "name")}</p>
				)}
			</Row>
			<div className="grid gap-4 sm:grid-cols-2">
				<Row label="Cuisine">
					<Input
						value={form.cuisineType ?? ""}
						onChange={(event) => setForm({ ...form, cuisineType: event.target.value })}
					/>
				</Row>
				<Row label="Phone">
					<Input
						value={form.contactPhone ?? ""}
						onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
					/>
				</Row>
			</div>
			<Row label="Address">
				<Input
					value={form.addressLine ?? ""}
					onChange={(event) => setForm({ ...form, addressLine: event.target.value })}
				/>
			</Row>
			<div className="grid gap-4 sm:grid-cols-3">
				<Row label="City">
					<Input
						value={form.city ?? ""}
						onChange={(event) => setForm({ ...form, city: event.target.value })}
					/>
				</Row>
				<Row label="State">
					<Input
						value={form.state ?? ""}
						onChange={(event) => setForm({ ...form, state: event.target.value })}
					/>
				</Row>
				<Row label="PIN">
					<Input
						value={form.pinCode ?? ""}
						onChange={(event) => setForm({ ...form, pinCode: event.target.value })}
					/>
				</Row>
			</div>
			<div className="grid gap-4 sm:grid-cols-3">
				<Row label="Browse radius (km)">
					<Input
						type="number"
						min="0"
						step="0.1"
						value={form.browseRadiusKm ?? ""}
						onChange={(event) => setForm({ ...form, browseRadiusKm: event.target.value })}
					/>
				</Row>
				<Row label="Latitude">
					<Input
						type="number"
						step="0.000001"
						value={form.latitude ?? ""}
						onChange={(event) => setForm({ ...form, latitude: event.target.value })}
					/>
				</Row>
				<Row label="Longitude">
					<Input
						type="number"
						step="0.000001"
						value={form.longitude ?? ""}
						onChange={(event) => setForm({ ...form, longitude: event.target.value })}
					/>
				</Row>
			</div>
			{save.error != null && <p className="text-sm text-critical">{messageFor(save.error)}</p>}
			<div className="flex justify-end">
				<Button type="submit" disabled={save.isPending}>
					Save profile
				</Button>
			</div>
		</form>
	)
}

const NgoSection = () => {
	const queryClient = useQueryClient()
	const ngo = useQuery({
		queryKey: queryKeys.ngo(),
		queryFn: () => apiGet<Ngo>("/v1/ngo"),
	})

	const [form, setForm] = useState<Partial<Ngo>>({})

	useEffect(() => {
		if (ngo.data != null) setForm(ngo.data)
	}, [ngo.data])

	const save = useMutation({
		mutationFn: () =>
			apiPatch<Ngo>("/v1/ngo", {
				name: form.name?.trim() ?? "",
				contactPhone: form.contactPhone ?? "",
				activeFrom: form.activeFrom ?? "00:00",
				activeTo: form.activeTo ?? "23:59",
				serviceRadiusKm: toNumber(form.serviceRadiusKm ?? "0").toString(),
				latitude: toNumber(form.latitude ?? "0").toString(),
				longitude: toNumber(form.longitude ?? "0").toString(),
			}),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ngo() }),
	})

	if (ngo.isPending) return <Skeleton className="h-48 w-full" />
	if (ngo.error != null) {
		return <p className="text-sm text-critical">{messageFor(ngo.error)}</p>
	}
	if (ngo.data == null) return null

	return (
		<form
			className="space-y-4"
			onSubmit={(event: FormEvent) => {
				event.preventDefault()
				save.mutate()
			}}
		>
			<Row label="Display name">
				<Input
					value={form.name ?? ""}
					onChange={(event) => setForm({ ...form, name: event.target.value })}
				/>
			</Row>
			<Row label="Contact phone">
				<Input
					value={form.contactPhone ?? ""}
					onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
				/>
			</Row>
			<div className="grid gap-4 sm:grid-cols-3">
				<Row label="Active from">
					<Input
						type="time"
						value={form.activeFrom ?? ""}
						onChange={(event) => setForm({ ...form, activeFrom: event.target.value })}
					/>
				</Row>
				<Row label="Active to">
					<Input
						type="time"
						value={form.activeTo ?? ""}
						onChange={(event) => setForm({ ...form, activeTo: event.target.value })}
					/>
				</Row>
				<Row label="Service radius (km)">
					<Input
						type="number"
						min="0"
						step="0.1"
						value={form.serviceRadiusKm ?? ""}
						onChange={(event) => setForm({ ...form, serviceRadiusKm: event.target.value })}
					/>
				</Row>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<Row label="Latitude">
					<Input
						type="number"
						step="0.000001"
						value={form.latitude ?? ""}
						onChange={(event) => setForm({ ...form, latitude: event.target.value })}
					/>
				</Row>
				<Row label="Longitude">
					<Input
						type="number"
						step="0.000001"
						value={form.longitude ?? ""}
						onChange={(event) => setForm({ ...form, longitude: event.target.value })}
					/>
				</Row>
			</div>
			{save.error != null && <p className="text-sm text-critical">{messageFor(save.error)}</p>}
			<div className="flex justify-end">
				<Button type="submit" disabled={save.isPending}>
					Save profile
				</Button>
			</div>
		</form>
	)
}

const NgoVerificationSection = () => {
	const queryClient = useQueryClient()
	const ngo = useQuery({
		queryKey: queryKeys.ngo(),
		queryFn: () => apiGet<Ngo>("/v1/ngo"),
	})

	const [form, setForm] = useState({
		registrationNo: "",
		contactName: "",
		contactPhone: "",
		notes: "",
	})

	const submit = useMutation({
		mutationFn: () =>
			apiPatch<Ngo>("/v1/ngo/verification", {
				registrationNo: form.registrationNo.trim(),
				contactName: form.contactName.trim(),
				contactPhone: form.contactPhone.trim(),
				notes: form.notes.trim(),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.ngo() })
			setForm({ registrationNo: "", contactName: "", contactPhone: "", notes: "" })
		},
	})

	if (ngo.isPending) return <Skeleton className="h-32 w-full" />
	if (ngo.error != null) {
		return <p className="text-sm text-critical">{messageFor(ngo.error)}</p>
	}
	if (ngo.data == null) return null

	const verified = ngo.data.verificationStatus === "approved"
	const pending = ngo.data.verificationStatus === "pending"
	const rejected = ngo.data.verificationStatus === "rejected"

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<span className="text-sm text-muted-foreground">Current status</span>
				{verified && (
					<Badge variant="good">
						<CheckCircle2Icon className="mr-1 size-3" aria-hidden="true" />
						Approved
					</Badge>
				)}
				{pending && <Badge variant="warning">Pending review</Badge>}
				{rejected && <Badge variant="critical">Rejected</Badge>}
			</div>

			{verified && (
				<p className="text-sm text-muted-foreground">You are verified. Nothing more to do here.</p>
			)}

			{!verified && (
				<form
					className="space-y-4"
					onSubmit={(event: FormEvent) => {
						event.preventDefault()
						submit.mutate()
					}}
				>
					<Row label="Registration number">
						<Input
							value={form.registrationNo}
							required
							minLength={2}
							maxLength={80}
							onChange={(event) => setForm({ ...form, registrationNo: event.target.value })}
						/>
					</Row>
					<div className="grid gap-4 sm:grid-cols-2">
						<Row label="Contact name">
							<Input
								value={form.contactName}
								required
								minLength={2}
								maxLength={120}
								onChange={(event) => setForm({ ...form, contactName: event.target.value })}
							/>
						</Row>
						<Row label="Contact phone">
							<Input
								value={form.contactPhone}
								required
								maxLength={40}
								onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
							/>
						</Row>
					</div>
					<Row label="Notes (optional)">
						<Input
							value={form.notes}
							maxLength={1000}
							onChange={(event) => setForm({ ...form, notes: event.target.value })}
						/>
					</Row>
					{rejected && ngo.data.rejectionReason !== "" && (
						<p className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-critical">
							Previous rejection: {ngo.data.rejectionReason}
						</p>
					)}
					{submit.error != null && (
						<p className="text-sm text-critical">{messageFor(submit.error)}</p>
					)}
					<div className="flex justify-end">
						<Button type="submit" disabled={submit.isPending}>
							{pending ? "Resubmit for review" : "Submit for review"}
						</Button>
					</div>
				</form>
			)}
		</div>
	)
}

const NotificationsSection = () => {
	const queryClient = useQueryClient()
	const prefs = useQuery({
		queryKey: queryKeys.notificationPreferences(),
		queryFn: () => apiGet<Preferences>("/v1/notification-preferences"),
	})

	const { session } = useSession()
	const topics = session?.tenant.type === "ngo" ? NGO_TOPICS : RESTAURANT_TOPICS

	const [rows, setRows] = useState<Record<string, PreferenceItem>>({})

	useEffect(() => {
		if (prefs.data != null) {
			const next: Record<string, PreferenceItem> = {}
			for (const topic of topics) {
				const existing = prefs.data.preferences.find((p) => p.topic === topic.key)
				if (existing != null) {
					next[topic.key] = existing
				} else {
					next[topic.key] = {
						topic: topic.key,
						radiusKm: topic.defaultRadiusKm,
						activeFrom: "00:00",
						activeTo: "23:59",
						quietHoursEnabled: false,
					}
				}
			}
			setRows(next)
		}
	}, [prefs.data, topics])

	const save = useMutation({
		mutationFn: () =>
			apiPatch<Preferences>("/v1/notification-preferences", {
				preferences: Object.values(rows),
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.notificationPreferences() }),
	})

	if (prefs.isPending) return <Skeleton className="h-32 w-full" />
	if (prefs.error != null) {
		return <p className="text-sm text-critical">{messageFor(prefs.error)}</p>
	}

	const update = (key: string, patch: Partial<PreferenceItem>) => {
		const current = rows[key]
		if (current == null) return
		setRows({ ...rows, [key]: { ...current, ...patch } })
	}

	return (
		<form
			className="space-y-6"
			onSubmit={(event: FormEvent) => {
				event.preventDefault()
				save.mutate()
			}}
		>
			{topics.map((topic) => {
				const row = rows[topic.key]
				if (row == null) return null
				return (
					<div key={topic.key} className="rounded-lg border border-border p-4">
						<p className="font-medium">{topic.label}</p>
						<p className="text-xs text-muted-foreground">{topic.key}</p>
						<div className="mt-3 grid gap-3 sm:grid-cols-4">
							<div className="space-y-1">
								<Label className="text-xs">Radius (km)</Label>
								<Input
									type="number"
									min="0"
									max="500"
									step="0.1"
									value={row.radiusKm == null ? "" : String(row.radiusKm)}
									onChange={(event) => {
										const value = event.target.value
										update(topic.key, {
											radiusKm: value === "" ? null : toNumber(value),
										})
									}}
								/>
							</div>
							<div className="space-y-1">
								<Label className="text-xs">Active from</Label>
								<Input
									type="time"
									value={row.activeFrom}
									onChange={(event) => update(topic.key, { activeFrom: event.target.value })}
								/>
							</div>
							<div className="space-y-1">
								<Label className="text-xs">Active to</Label>
								<Input
									type="time"
									value={row.activeTo}
									onChange={(event) => update(topic.key, { activeTo: event.target.value })}
								/>
							</div>
							<div className="space-y-1">
								<Label className="text-xs">Quiet hours</Label>
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={row.quietHoursEnabled}
										onChange={(event) =>
											update(topic.key, { quietHoursEnabled: event.target.checked })
										}
									/>
									No notifications between active window
								</label>
							</div>
						</div>
					</div>
				)
			})}
			{save.error != null && <p className="text-sm text-critical">{messageFor(save.error)}</p>}
			<div className="flex justify-end">
				<Button type="submit" disabled={save.isPending}>
					Save notification preferences
				</Button>
			</div>
		</form>
	)
}

export const SettingsPage = () => {
	const { session } = useSession()
	const isNgo = session?.tenant.type === "ngo"
	const isOwner = session?.user.role === "owner" || session?.user.role === "ngo_admin"

	if (!isOwner) {
		return (
			<section className="w-full">
				<header>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
					<p className="mt-1 text-muted-foreground">Only the workspace owner can change these.</p>
				</header>
			</section>
		)
	}

	return (
		<section className="w-full space-y-8">
			<header>
				<h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
				<p className="mt-1 text-muted-foreground">
					Your workspace, your profile, and how SmartPlate notifies you.
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<BuildingIcon className="size-4" aria-hidden="true" />
						Workspace
					</CardTitle>
					<CardDescription>The shared name on every report and listing.</CardDescription>
				</CardHeader>
				<CardContent>
					<TenantSection />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<StoreIcon className="size-4" aria-hidden="true" />
						{isNgo ? "Operations" : "Restaurant profile"}
					</CardTitle>
					<CardDescription>
						{isNgo
							? "Your pickup hours, service radius and contact details."
							: "Your address, cuisine, browse radius and where the map drops the pin."}
					</CardDescription>
				</CardHeader>
				<CardContent>{isNgo ? <NgoSection /> : <RestaurantSection />}</CardContent>
			</Card>

			{isNgo && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<CheckCircle2Icon className="size-4" aria-hidden="true" />
							Verification
						</CardTitle>
						<CardDescription>
							SmartPlate reviews your registration before listing you in the marketplace.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<NgoVerificationSection />
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<BellIcon className="size-4" aria-hidden="true" />
						Notifications
					</CardTitle>
					<CardDescription>
						How SmartPlate reaches you. Radius filters only apply to location-aware topics.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Separator className="mb-4" />
					<NotificationsSection />
				</CardContent>
			</Card>
		</section>
	)
}
