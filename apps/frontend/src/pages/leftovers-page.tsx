import type { Collection } from "@smartplate/contracts/envelope"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	CalendarIcon,
	CheckCircle2Icon,
	ChefHatIcon,
	CircleAlertIcon,
	HandHeartIcon,
	InboxIcon,
	PlusIcon,
	RefreshCwIcon,
	ShieldAlertIcon,
	SparklesIcon,
	StoreIcon,
	ThermometerIcon,
	TimerIcon,
	Trash2Icon,
	TriangleAlertIcon,
	XIcon,
} from "lucide-react"
import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select"
import { Separator } from "../components/ui/separator"
import { Skeleton } from "../components/ui/skeleton"
import { ApiClientError, apiGet, apiPost } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
import { cn } from "../lib/utils"

type LeftoverItem = {
	id: string
	dishId: string
	dishName: string
	serviceDate: string
	dishReuseRoute: string
	dishIsReusable: boolean
	qty: string
	unit: string
	storage: string
	preparedAt: string
	safeUntil: string
	status: string
}

type Suggestion = {
	leftoverId: string
	qty: number
	unit: string
	storage: string
	safeUntil: string
	suggestedRetainQty: number
	suggestedSellQty: number
	suggestedDonateQty: number
	suggestedWasteQty: number
	suggestedPricePerUnit: number
	reuseRoute: string
	confidence: string
	basis: string
	source: string
	model: string
	promptVersion: string
}

type DishOption = {
	id: string
	name: string
	servingUnit: string
	isReusable: boolean
	reuseRoute: string
}

type Draft = {
	retain: string
	sell: string
	donate: string
	waste: string
	price: string
}

type Allocation = {
	leftoverId: string
	retainQty: number
	sellQty: number
	donateQty: number
	wasteQty: number
	sellPricePerUnit: number
}

const UNITS = ["kg", "plate", "piece", "litre"]

const STORAGE_LABELS: Record<string, string> = {
	room_temp: "Room temperature",
	refrigerated: "Refrigerated",
	frozen: "Frozen",
}

const STATUS_LABELS: Record<string, string> = {
	pending_disposition: "Needs a decision",
	awaiting_reuse: "Kept for reuse",
	closed: "Decided",
}

const sourceLabel = (source: string): string => {
	if (source === "deterministic") return "Computed from your history"
	if (source === "unavailable") return "Assistant unreachable"
	if (source === "policy") return "Safety rule, not an estimate"
	return "Not a model answer"
}

const EMPTY_DRAFT: Draft = { retain: "0", sell: "0", donate: "0", waste: "0", price: "0" }

const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" })
const money = new Intl.NumberFormat("en-IN", {
	style: "currency",
	currency: "INR",
	maximumFractionDigits: 0,
})

const todayIso = (): string => {
	const now = new Date()
	const month = String(now.getMonth() + 1).padStart(2, "0")
	const day = String(now.getDate()).padStart(2, "0")
	return `${now.getFullYear()}-${month}-${day}`
}

const dayLabel = (serviceDate: string): string =>
	serviceDate === todayIso() ? "Today" : dayFormat.format(new Date(`${serviceDate}T12:00:00`))

const toNumber = (value: string): number => {
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

const hoursUntil = (iso: string): number => (new Date(iso).getTime() - Date.now()) / 3_600_000

const safeUntilLabel = (iso: string): string => {
	const hours = hoursUntil(iso)
	if (hours <= 0) return "Past safe-until"
	if (hours < 1) return `Safe for ${Math.max(1, Math.round(hours * 60))} min`
	if (hours < 48) return `Safe for ${Math.round(hours)} h`
	return `Safe for ${Math.round(hours / 24)} days`
}

const draftFrom = (suggestion: Suggestion): Draft => ({
	retain: String(suggestion.suggestedRetainQty),
	sell: String(suggestion.suggestedSellQty),
	donate: String(suggestion.suggestedDonateQty),
	waste: String(suggestion.suggestedWasteQty),
	price: String(suggestion.suggestedPricePerUnit),
})

const draftTotal = (draft: Draft): number =>
	toNumber(draft.retain) + toNumber(draft.sell) + toNumber(draft.donate) + toNumber(draft.waste)

const isBalanced = (draft: Draft, qty: number): boolean => Math.abs(draftTotal(draft) - qty) <= 0.01

const toAllocation = (leftoverId: string, draft: Draft): Allocation => ({
	leftoverId,
	retainQty: toNumber(draft.retain),
	sellQty: toNumber(draft.sell),
	donateQty: toNumber(draft.donate),
	wasteQty: toNumber(draft.waste),
	sellPricePerUnit: toNumber(draft.price),
})

const commitMessage = (error: Error): string => {
	if (!(error instanceof ApiClientError)) return "Something went wrong. Please try again."
	if (error.code === "DISPOSITION_SPLIT_MISMATCH")
		return "One split does not add up to the recorded quantity."
	if (error.code === "DISPOSITION_ALREADY_DECIDED")
		return "One of these leftovers was already allocated. Reload the day and try again."
	if (error.code === "LEFTOVER_PAST_SAFE_UNTIL")
		return "That food is past its safe-until time. Move the whole quantity to discard."
	if (error.code === "AUTH_FORBIDDEN") return "Your role cannot decide dispositions."
	if (error.code === "VALIDATION_FAILED") return "Check the quantities below."
	return error.message
}

const recordMessage = (error: Error): string => {
	if (!(error instanceof ApiClientError)) return "Something went wrong. Please try again."
	if (error.code === "AUTH_FORBIDDEN") return "Your role cannot record leftovers."
	if (error.code === "VALIDATION_FAILED") return "Check the quantity and the dish."
	return error.message
}

const allocationDetail = (error: Error | null, leftoverId: string): string => {
	if (!(error instanceof ApiClientError)) return ""
	const field = `allocations.${leftoverId}`
	return error.details.find((detail) => detail.field === field)?.message ?? ""
}

const StatusBadge = ({ status }: { status: string }) => {
	if (status === "closed")
		return (
			<Badge variant="good">
				<CheckCircle2Icon /> {STATUS_LABELS.closed}
			</Badge>
		)
	if (status === "awaiting_reuse")
		return (
			<Badge variant="secondary">
				<RefreshCwIcon /> {STATUS_LABELS.awaiting_reuse}
			</Badge>
		)
	return (
		<Badge variant="warning">
			<TimerIcon /> {STATUS_LABELS.pending_disposition}
		</Badge>
	)
}

const SplitField = ({
	id,
	label,
	hint,
	icon,
	value,
	disabled,
	onValueChange,
}: {
	id: string
	label: string
	hint: string
	icon: ReactNode
	value: string
	disabled: boolean
	onValueChange: (next: string) => void
}) => (
	<div className="space-y-2">
		<Label htmlFor={id}>
			{icon}
			{label}
		</Label>
		<Input
			id={id}
			type="number"
			min={0}
			step={0.1}
			inputMode="decimal"
			className="max-w-xs"
			disabled={disabled}
			value={value}
			onChange={(event) => onValueChange(event.target.value)}
		/>
		<p className="text-xs text-muted-foreground">{hint}</p>
	</div>
)

const RecordLeftoverDialog = ({ serviceDate }: { serviceDate: string }) => {
	const queryClient = useQueryClient()
	const [open, setOpen] = useState(false)
	const [dishId, setDishId] = useState("")
	const [qty, setQty] = useState("")
	const [unit, setUnit] = useState("kg")
	const [storage, setStorage] = useState("refrigerated")

	const dishesQuery = useQuery({
		queryKey: queryKeys.dishes(),
		queryFn: () => apiGet<Collection<DishOption>>("/v1/dishes"),
		staleTime: 300_000,
	})

	const dishes = dishesQuery.data?.items ?? []

	const mutation = useMutation({
		mutationFn: () =>
			apiPost<LeftoverItem>("/v1/leftovers", {
				dishId,
				qty: toNumber(qty),
				unit,
				storage,
				preparedAt: new Date().toISOString(),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.leftovers("") })
			queryClient.invalidateQueries({ queryKey: queryKeys.leftovers(serviceDate) })
			queryClient.invalidateQueries({ queryKey: queryKeys.leftovers(todayIso()) })
			setOpen(false)
			setDishId("")
			setQty("")
		},
	})

	const pickDish = (next: string) => {
		setDishId(next)
		const dish = dishes.find((option) => option.id === next)
		if (dish != null) setUnit(dish.servingUnit)
	}

	const submit = (event: FormEvent) => {
		event.preventDefault()
		mutation.mutate()
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon /> Record leftover
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Record a leftover</DialogTitle>
					<DialogDescription>
						Logged as prepared now, so the safe-until time is counted from this moment.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={submit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="leftover-dish">Dish</Label>
						<Select value={dishId} onValueChange={pickDish}>
							<SelectTrigger id="leftover-dish">
								<SelectValue placeholder={dishes.length === 0 ? "No dishes yet" : "Pick a dish"} />
							</SelectTrigger>
							<SelectContent>
								{dishes.map((dish) => (
									<SelectItem key={dish.id} value={dish.id}>
										{dish.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="leftover-qty">Quantity</Label>
							<Input
								id="leftover-qty"
								type="number"
								min={0}
								step={0.1}
								inputMode="decimal"
								required
								value={qty}
								onChange={(event) => setQty(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="leftover-unit">Unit</Label>
							<Select value={unit} onValueChange={setUnit}>
								<SelectTrigger id="leftover-unit">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{UNITS.map((option) => (
										<SelectItem key={option} value={option}>
											{option}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="leftover-storage">Storage</Label>
						<Select value={storage} onValueChange={setStorage}>
							<SelectTrigger id="leftover-storage">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.keys(STORAGE_LABELS).map((option) => (
									<SelectItem key={option} value={option}>
										{STORAGE_LABELS[option]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{mutation.error != null && (
						<p role="alert" className="rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical">
							{recordMessage(mutation.error)}
						</p>
					)}

					<DialogFooter>
						<Button
							type="submit"
							disabled={mutation.isPending || dishId === "" || toNumber(qty) <= 0}
						>
							{mutation.isPending ? "Recording…" : "Record leftover"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

export const LeftoversPage = () => {
	const queryClient = useQueryClient()
	const [serviceDate, setServiceDate] = useState("")
	const [selectedId, setSelectedId] = useState("")
	const [drafts, setDrafts] = useState<Record<string, Draft>>({})

	const leftoversQuery = useQuery({
		queryKey: queryKeys.leftovers(serviceDate),
		queryFn: () =>
			apiGet<Collection<LeftoverItem>>(
				serviceDate === "" ? "/v1/leftovers" : `/v1/leftovers?serviceDate=${serviceDate}`,
			),
	})

	const suggestionQuery = useQuery({
		queryKey: queryKeys.dispositionSuggestion(selectedId),
		queryFn: () => apiGet<Suggestion>(`/v1/leftovers/${selectedId}/disposition-suggestion`),
		enabled: selectedId !== "",
		retry: false,
		staleTime: 600_000,
	})

	const suggestion = suggestionQuery.data ?? null

	const items = leftoversQuery.data?.items ?? []

	useEffect(() => {
		if (suggestion == null) return
		const target = items.find((row) => row.id === suggestion.leftoverId)
		if (target == null || target.status !== "pending_disposition") return
		setDrafts((current) =>
			Object.hasOwn(current, suggestion.leftoverId)
				? current
				: { ...current, [suggestion.leftoverId]: draftFrom(suggestion) },
		)
	}, [suggestion, items])

	const commit = useMutation({
		mutationFn: () =>
			apiPost<{ listings: { id: string; channel: string }[] }>("/v1/leftovers/dispositions", {
				allocations: Object.keys(drafts).map((id) => toAllocation(id, drafts[id])),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.leftovers("") })
			queryClient.invalidateQueries({ queryKey: queryKeys.leftovers(serviceDate) })
			queryClient.invalidateQueries({ queryKey: queryKeys.listings() })
			queryClient.invalidateQueries({ queryKey: ["dashboard"] })
			setDrafts({})
			setSelectedId("")
		},
	})

	const changeDate = (next: string) => {
		setServiceDate(next)
		setSelectedId("")
		setDrafts({})
		commit.reset()
	}

	const selected = items.find((item) => item.id === selectedId) ?? null
	const selectedDecided = selected != null && selected.status !== "pending_disposition"
	const draftIds = Object.keys(drafts)
	const balancedAll = draftIds.every((id) => {
		const item = items.find((row) => row.id === id)
		return item != null && isBalanced(drafts[id], Number(item.qty))
	})

	const willSell = draftIds.some((id) => toNumber(drafts[id].sell) > 0)
	const willDonate = draftIds.some((id) => toNumber(drafts[id].donate) > 0)
	const listingParts = [willSell ? "1 B2B listing" : "", willDonate ? "1 NGO listing" : ""].filter(
		(part) => part !== "",
	)

	const selectedDraft =
		selected != null && Object.hasOwn(drafts, selected.id) ? drafts[selected.id] : EMPTY_DRAFT
	const selectedQty = selected != null ? Number(selected.qty) : 0
	const selectedTotal = draftTotal(selectedDraft)
	const remaining = Math.round((selectedQty - selectedTotal) * 1000) / 1000
	const selectedBalanced = selected != null && isBalanced(selectedDraft, selectedQty)

	const setField = (field: keyof Draft, value: string) => {
		if (selected == null || selectedDecided) return
		const id = selected.id
		setDrafts((current) => ({
			...current,
			[id]: { ...(Object.hasOwn(current, id) ? current[id] : EMPTY_DRAFT), [field]: value },
		}))
	}

	return (
		<section className="w-full pb-28">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Close of day</h1>
					<p className="mt-1 text-muted-foreground">
						Decide what to keep, sell, donate or discard — then confirm the whole day at once.
					</p>
				</div>
				<div className="flex items-end gap-3">
					<div className="space-y-2">
						<Label htmlFor="service-date">Filter by service date</Label>
						<div className="flex items-center gap-2">
							<Input
								id="service-date"
								type="date"
								className="w-44"
								value={serviceDate}
								onChange={(event) => changeDate(event.target.value)}
							/>
							{serviceDate !== "" && (
								<Button variant="ghost" size="sm" onClick={() => changeDate("")}>
									<XIcon /> Clear
								</Button>
							)}
						</div>
					</div>
					<RecordLeftoverDialog serviceDate={serviceDate} />
				</div>
			</header>

			<div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
				<Card className="lg:sticky lg:top-6">
					<CardHeader>
						<CardTitle className="text-base">
							{serviceDate === "" ? "Awaiting a decision" : `Service date ${serviceDate}`}
						</CardTitle>
						<CardDescription>
							{leftoversQuery.isPending
								? "Loading the queue…"
								: `${items.length} leftover${items.length === 1 ? "" : "s"} · ${draftIds.length} allocated`}
						</CardDescription>
					</CardHeader>
					<CardContent className="max-h-[60vh] space-y-2 overflow-y-auto">
						{leftoversQuery.isPending && (
							<>
								<Skeleton className="h-20 w-full" />
								<Skeleton className="h-20 w-full" />
								<Skeleton className="h-20 w-full" />
							</>
						)}

						{leftoversQuery.error != null && (
							<div role="alert" className="rounded-lg bg-critical/10 p-4 text-sm text-critical">
								<p className="flex items-center gap-2 font-medium">
									<CircleAlertIcon className="size-4" /> Could not load the queue
								</p>
								<p className="mt-1">{leftoversQuery.error.message}</p>
								<Button
									variant="outline"
									size="sm"
									className="mt-3"
									onClick={() => leftoversQuery.refetch()}
								>
									<RefreshCwIcon /> Try again
								</Button>
							</div>
						)}

						{!leftoversQuery.isPending && leftoversQuery.error == null && items.length === 0 && (
							<div className="rounded-lg border border-dashed p-8 text-center">
								<InboxIcon className="mx-auto size-6 text-muted-foreground" />
								<p className="mt-3 font-medium">
									{serviceDate === ""
										? "Every leftover has been decided"
										: "Nothing recorded on this date"}
								</p>
								<p className="mt-1 text-sm text-muted-foreground">
									{serviceDate === ""
										? "Record what came back from service and it lands here for a decision."
										: "Clear the filter to see everything still awaiting a decision."}
								</p>
							</div>
						)}

						{items.map((item) => {
							const draft = Object.hasOwn(drafts, item.id) ? drafts[item.id] : null
							const qty = Number(item.qty)
							const decided = item.status !== "pending_disposition"
							const detail = allocationDetail(commit.error, item.id)

							return (
								<button
									key={item.id}
									type="button"
									onClick={() => setSelectedId(item.id)}
									className={cn(
										"w-full rounded-lg border p-4 text-left transition-colors hover:bg-secondary",
										item.id === selectedId && "border-primary bg-secondary",
									)}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate font-medium">{item.dishName}</p>
											<p className="mt-0.5 text-sm text-muted-foreground">
												{quantity.format(qty)} {item.unit} · {STORAGE_LABELS[item.storage]}
											</p>
											<p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
												<CalendarIcon className="size-3" />
												{dayLabel(item.serviceDate)}
											</p>
										</div>
										<StatusBadge status={item.status} />
									</div>

									<div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
										<span
											className={cn(
												"flex items-center gap-1",
												hoursUntil(item.safeUntil) <= 0 ? "text-critical" : "text-muted-foreground",
											)}
										>
											<TimerIcon className="size-3" />
											{safeUntilLabel(item.safeUntil)}
										</span>

										{draft != null && isBalanced(draft, qty) && (
											<Badge variant="good">
												<CheckCircle2Icon /> Split balances
											</Badge>
										)}
										{draft != null && !isBalanced(draft, qty) && (
											<Badge variant="critical">
												<TriangleAlertIcon /> Off by{" "}
												{quantity.format(Math.abs(draftTotal(draft) - qty))} {item.unit}
											</Badge>
										)}
										{draft == null && !decided && (
											<span className="text-muted-foreground">Not allocated yet</span>
										)}
									</div>

									{detail !== "" && <p className="mt-2 text-xs text-critical">{detail}</p>}
								</button>
							)
						})}
					</CardContent>
				</Card>

				<Card>
					{selected == null ? (
						<CardHeader>
							<CardTitle className="text-base">Pick a leftover</CardTitle>
							<CardDescription>
								Choose one on the left and the assistant will suggest a split you can adjust.
							</CardDescription>
						</CardHeader>
					) : (
						<>
							<CardHeader>
								<CardTitle className="font-display text-xl">{selected.dishName}</CardTitle>
								<CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
									<span>
										{quantity.format(selectedQty)} {selected.unit}
									</span>
									<span className="flex items-center gap-1">
										<ThermometerIcon className="size-3.5" />
										{STORAGE_LABELS[selected.storage]}
									</span>
									<span className="flex items-center gap-1">
										<TimerIcon className="size-3.5" />
										{safeUntilLabel(selected.safeUntil)}
									</span>
								</CardDescription>
							</CardHeader>

							<CardContent className="space-y-5">
								{suggestionQuery.isPending && <Skeleton className="h-20 w-full" />}

								{suggestionQuery.error != null && (
									<div role="alert" className="rounded-lg bg-critical/10 p-3 text-sm text-critical">
										<p className="flex items-center gap-2 font-medium">
											<CircleAlertIcon className="size-4" /> No suggestion available
										</p>
										<p className="mt-1">Enter the split by hand, or try again.</p>
										<Button
											variant="outline"
											size="sm"
											className="mt-3"
											onClick={() => suggestionQuery.refetch()}
										>
											<RefreshCwIcon /> Retry suggestion
										</Button>
									</div>
								)}

								{suggestion != null &&
									suggestion.leftoverId === selected.id &&
									(suggestion.source === "policy" ? (
										<div className="rounded-lg border border-critical/40 bg-critical/10 p-4">
											<div className="flex flex-wrap items-center gap-2">
												<Badge variant="critical">
													<ShieldAlertIcon /> Food safety verdict
												</Badge>
												<Badge variant="outline">{sourceLabel(suggestion.source)}</Badge>
											</div>
											<p className="mt-3 text-sm text-critical">{suggestion.basis}</p>
											<p className="mt-2 text-sm text-muted-foreground">
												This is a shelf-life rule, not an estimate. The whole quantity is set to
												discard and it cannot be sold or donated.
											</p>
										</div>
									) : (
										<div className="rounded-lg border bg-secondary/60 p-4">
											<div className="flex flex-wrap items-center gap-2">
												<Badge variant="secondary">
													<SparklesIcon /> Suggested split
												</Badge>
												<Badge variant="outline">{suggestion.confidence} confidence</Badge>
												{suggestion.source !== "model" && (
													<Badge variant="warning">
														<TriangleAlertIcon /> {sourceLabel(suggestion.source)}
													</Badge>
												)}
											</div>
											<p className="mt-3 text-sm text-secondary-foreground">{suggestion.basis}</p>
											{!selectedDecided && (
												<Button
													variant="ghost"
													size="sm"
													className="mt-2 -ml-2"
													onClick={() =>
														setDrafts((current) => ({
															...current,
															[suggestion.leftoverId]: draftFrom(suggestion),
														}))
													}
												>
													<RefreshCwIcon /> Reset to suggestion
												</Button>
											)}
										</div>
									))}

								<div className="grid gap-4 sm:grid-cols-2">
									<SplitField
										id="split-retain"
										disabled={selectedDecided}
										label="Keep for reuse"
										icon={<ChefHatIcon className="size-4" />}
										hint={
											selected.dishIsReusable
												? selected.dishReuseRoute === ""
													? "Back into tomorrow's kitchen"
													: `Becomes ${selected.dishReuseRoute}`
												: "This dish is not marked reusable"
										}
										value={selectedDraft.retain}
										onValueChange={(next) => setField("retain", next)}
									/>
									<SplitField
										id="split-sell"
										disabled={selectedDecided}
										label="Sell to businesses"
										icon={<StoreIcon className="size-4" />}
										hint="Bundled into one B2B pickup"
										value={selectedDraft.sell}
										onValueChange={(next) => setField("sell", next)}
									/>
									<SplitField
										id="split-donate"
										disabled={selectedDecided}
										label="Donate"
										icon={<HandHeartIcon className="size-4" />}
										hint="Bundled into one NGO pickup"
										value={selectedDraft.donate}
										onValueChange={(next) => setField("donate", next)}
									/>
									<SplitField
										id="split-waste"
										disabled={selectedDecided}
										label="Discard"
										icon={<Trash2Icon className="size-4" />}
										hint="Counts against your waste rate"
										value={selectedDraft.waste}
										onValueChange={(next) => setField("waste", next)}
									/>
								</div>

								{toNumber(selectedDraft.sell) > 0 && (
									<div className="space-y-2">
										<Label htmlFor="split-price">Asking price per {selected.unit}</Label>
										<Input
											id="split-price"
											disabled={selectedDecided}
											type="number"
											min={0}
											step={1}
											inputMode="decimal"
											className="sm:w-52"
											value={selectedDraft.price}
											onChange={(event) => setField("price", event.target.value)}
										/>
										<p className="text-xs text-muted-foreground">
											{money.format(toNumber(selectedDraft.price) * toNumber(selectedDraft.sell))}{" "}
											if the whole B2B portion sells.
										</p>
									</div>
								)}

								<Separator />

								<div className="flex flex-wrap items-center justify-between gap-2">
									<p className="text-sm text-muted-foreground">
										Allocated{" "}
										<span className="font-medium text-foreground tabular-nums">
											{quantity.format(selectedTotal)}
										</span>{" "}
										of {quantity.format(selectedQty)} {selected.unit}
									</p>
									{selectedBalanced ? (
										<Badge variant="good">
											<CheckCircle2Icon /> Balances
										</Badge>
									) : (
										<Badge variant="critical">
											<TriangleAlertIcon />
											{remaining > 0
												? `${quantity.format(remaining)} ${selected.unit} unallocated`
												: `${quantity.format(Math.abs(remaining))} ${selected.unit} over`}
										</Badge>
									)}
								</div>
							</CardContent>

							{selected.status !== "pending_disposition" && (
								<CardFooter>
									<p className="text-sm text-muted-foreground">
										This leftover was already decided, so it is not part of the next confirm.
									</p>
								</CardFooter>
							)}
						</>
					)}
				</Card>
			</div>

			<Card className="sticky bottom-6 mt-6 py-4">
				<CardContent className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="font-medium">
							{draftIds.length === 0
								? "Nothing allocated yet"
								: `${draftIds.length} leftover${draftIds.length === 1 ? "" : "s"} allocated`}
						</p>
						<p className="mt-0.5 text-sm text-muted-foreground">
							{listingParts.length === 0
								? "Sell or donate a quantity to create a pickup."
								: `Will create ${listingParts.join(" and ")}.`}
						</p>
						{commit.error != null && draftIds.length > 0 && (
							<p role="alert" className="mt-2 flex items-center gap-2 text-sm text-critical">
								<CircleAlertIcon className="size-4" /> {commitMessage(commit.error)}
							</p>
						)}
						{commit.isSuccess && draftIds.length === 0 && (
							<p className="mt-2 flex items-center gap-2 text-sm text-good">
								<CheckCircle2Icon className="size-4" /> Day closed. The listings are live.
							</p>
						)}
					</div>

					<Button
						size="lg"
						disabled={draftIds.length === 0 || !balancedAll || commit.isPending}
						onClick={() => commit.mutate()}
					>
						{commit.isPending ? "Confirming…" : "Confirm all"}
					</Button>
				</CardContent>
			</Card>
		</section>
	)
}
