import type { Collection } from "@smartplate/contracts/envelope"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	AlertTriangleIcon,
	ArrowUpDownIcon,
	BeefIcon,
	CalendarIcon,
	CircleAlertIcon,
	FlameKindlingIcon,
	IndianRupeeIcon,
	PackageIcon,
	PlusIcon,
	ReceiptTextIcon,
	RefreshCwIcon,
	TimerIcon,
} from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"
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
import { cn } from "../lib/utils"

type StockAggregate = {
	ingredientId: string
	ingredientName: string
	baseUnit: string
	qtyOnHand: number
	lotCount: number
}

type InventoryLot = {
	id: string
	ingredientId: string
	ingredientName: string
	baseUnit: string
	qtyPurchasedBase: string
	qtyRemainingBase: string
	unitCost: string
	purchaseDate: string
	expiryDate: string | null
}

type ExpiringLot = {
	lot: InventoryLot
	ingredientName: string
	daysUntilExpiry: number
}

type Supplier = {
	id: string
	name: string
	contactName: string
	contactPhone: string
}

type Ingredient = {
	id: string
	name: string
	baseUnit: string
}

type PurchaseForm = {
	ingredientId: string
	supplierId: string
	qty: string
	unit: string
	unitCost: string
	purchaseDate: string
	expiryDate: string
}

type AdjustmentFormState = {
	lotId: string
	ingredientName: string
	open: boolean
}

const ADJUSTMENT_REASONS = [
	{ value: "waste", label: "Wasted" },
	{ value: "spoil", label: "Spoiled" },
	{ value: "transfer", label: "Transferred" },
	{ value: "count_correction", label: "Count correction" },
	{ value: "use", label: "Used in prep" },
	{ value: "return", label: "Returned to supplier" },
] as const
type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]["value"]

const BLANK_PURCHASE: PurchaseForm = {
	ingredientId: "",
	supplierId: "__none__",
	qty: "",
	unit: "g",
	unitCost: "",
	purchaseDate: new Date().toISOString().slice(0, 10),
	expiryDate: "",
}

const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
const kilograms = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 })
const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" })

const toNumber = (value: string | number | null | undefined): number => {
	if (value == null) return 0
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

const fmtDate = (iso: string | null): string => {
	if (iso == null || iso === "") return "—"
	const d = new Date(iso)
	return Number.isNaN(d.getTime()) ? "—" : dayFormat.format(d)
}

const purchaseMessage = (error: Error | null): string => {
	if (error == null) return ""
	if (!(error instanceof ApiClientError)) return "Could not record the purchase."
	if (error.code === "VALIDATION_FAILED") return "Check the fields below."
	if (error.code === "AUTH_FORBIDDEN") return "Your role cannot record purchases."
	return error.message
}

const adjustmentMessage = (error: Error | null): string => {
	if (error == null) return ""
	if (!(error instanceof ApiClientError)) return "Could not record the adjustment."
	if (error.code === "VALIDATION_FAILED") return "Check the quantity below."
	if (error.code === "AUTH_FORBIDDEN") return "Your role cannot adjust stock."
	return error.message
}

const StockSkeleton = () => (
	<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{["a", "b", "c", "d", "e", "f"].map((key) => (
			<Skeleton key={key} className="h-28 w-full" />
		))}
	</div>
)

const StockEmpty = () => (
	<div className="rounded-lg border border-dashed p-10 text-center">
		<PackageIcon className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
		<p className="mt-3 font-medium">No stock yet</p>
		<p className="mt-1 text-sm text-muted-foreground">
			Record a purchase and it lands here. FEFO pulls from these lots when you record prep.
		</p>
	</div>
)

const StockLoadFailed = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
	<div
		role="alert"
		className="flex flex-col items-start gap-2 rounded-lg border border-critical/30 bg-critical/10 p-4 text-sm text-critical"
	>
		<p className="flex items-center gap-2 font-medium">
			<CircleAlertIcon className="size-4" aria-hidden="true" /> Could not load stock
		</p>
		<p className="text-critical/80">{message}</p>
		<Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
			<RefreshCwIcon aria-hidden="true" /> Try again
		</Button>
	</div>
)

const StockCard = ({ item }: { item: StockAggregate }) => (
	<Card>
		<CardHeader className="pb-2">
			<CardDescription className="flex items-center gap-1.5">
				<BeefIcon className="size-3.5" aria-hidden="true" /> {item.ingredientName}
			</CardDescription>
			<CardTitle className="font-display text-2xl tabular">
				{quantity.format(item.qtyOnHand)} {item.baseUnit}
			</CardTitle>
		</CardHeader>
		<CardContent>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
				<span className="flex items-center gap-1">
					<ReceiptTextIcon className="size-3" aria-hidden="true" />
					{item.lotCount} {item.lotCount === 1 ? "lot" : "lots"}
				</span>
				<span className="flex items-center gap-1">
					<FlameKindlingIcon className="size-3" aria-hidden="true" />
					FEFO order
				</span>
			</div>
		</CardContent>
	</Card>
)

const ExpiryBadge = ({ days }: { days: number }) => {
	if (days <= 0)
		return (
			<Badge variant="critical">
				<AlertTriangleIcon aria-hidden="true" /> Expired
			</Badge>
		)
	if (days <= 2)
		return (
			<Badge variant="critical">
				<TimerIcon aria-hidden="true" /> {days}d
			</Badge>
		)
	if (days <= 4)
		return (
			<Badge variant="warning">
				<TimerIcon aria-hidden="true" /> {days}d
			</Badge>
		)
	return (
		<Badge variant="secondary">
			<TimerIcon aria-hidden="true" /> {days}d
		</Badge>
	)
}

const ExpiringTable = ({
	lots,
	loading,
	error,
	onRetry,
	onAdjust,
}: {
	lots: ExpiringLot[]
	loading: boolean
	error: Error | null
	onRetry: () => void
	onAdjust: (lotId: string, ingredientName: string) => void
}) => {
	if (loading) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		)
	}
	if (error != null) {
		return (
			<div
				role="alert"
				className="flex flex-col items-start gap-2 rounded-lg border border-critical/30 bg-critical/10 p-4 text-sm text-critical"
			>
				<p className="flex items-center gap-2 font-medium">
					<CircleAlertIcon className="size-4" aria-hidden="true" /> Could not load expiring lots
				</p>
				<p className="text-critical/80">{error.message}</p>
				<Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
					<RefreshCwIcon aria-hidden="true" /> Try again
				</Button>
			</div>
		)
	}
	if (lots.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-8 text-center">
				<TimerIcon className="mx-auto size-6 text-good" aria-hidden="true" />
				<p className="mt-3 font-medium">Nothing expiring in the next 7 days</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Lots within a week of their expiry date show up here so you can use them first.
				</p>
			</div>
		)
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Ingredient</TableHead>
					<TableHead>Lot</TableHead>
					<TableHead className="text-right">Remaining</TableHead>
					<TableHead>Expiry</TableHead>
					<TableHead className="text-right">Window</TableHead>
					<TableHead className="text-right">Action</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{lots.map((entry) => {
					const lot = entry.lot
					return (
						<TableRow key={lot.id}>
							<TableCell className="font-medium">{entry.ingredientName}</TableCell>
							<TableCell className="font-mono text-xs text-muted-foreground">
								{lot.id.slice(0, 8)}
							</TableCell>
							<TableCell className="text-right tabular">
								{quantity.format(toNumber(lot.qtyRemainingBase))} {lot.baseUnit}
							</TableCell>
							<TableCell>
								<span className="flex items-center gap-1.5">
									<CalendarIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
									{fmtDate(lot.expiryDate)}
								</span>
							</TableCell>
							<TableCell className="text-right">
								<ExpiryBadge days={entry.daysUntilExpiry} />
							</TableCell>
							<TableCell className="text-right">
								<Button
									size="sm"
									variant="outline"
									onClick={() => onAdjust(lot.id, entry.ingredientName)}
								>
									<ArrowUpDownIcon aria-hidden="true" /> Adjust
								</Button>
							</TableCell>
						</TableRow>
					)
				})}
			</TableBody>
		</Table>
	)
}

const PurchaseDialog = ({
	ingredients,
	suppliers,
}: {
	ingredients: Ingredient[]
	suppliers: Supplier[]
}) => {
	const queryClient = useQueryClient()
	const [open, setOpen] = useState(false)
	const [form, setForm] = useState<PurchaseForm>(BLANK_PURCHASE)

	const mutation = useMutation({
		mutationFn: async (body: PurchaseForm) => {
			const idempotencyKey = crypto.randomUUID()
			const res = await fetch("/api/v1/inventory/purchases", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Idempotency-Key": idempotencyKey,
				},
				body: JSON.stringify({
					ingredientId: body.ingredientId,
					supplierId: body.supplierId === "__none__" ? null : body.supplierId || null,
					qtyPurchased: toNumber(body.qty),
					unit: body.unit,
					unitCost: toNumber(body.unitCost),
					purchaseDate: body.purchaseDate,
					expiryDate: body.expiryDate === "" ? null : body.expiryDate,
				}),
			})
			if (!res.ok) {
				const text = await res.text()
				throw new Error(text || "Could not record purchase")
			}
			return res.json()
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.inventoryStock() })
			queryClient.invalidateQueries({ queryKey: queryKeys.inventoryExpiring() })
			setOpen(false)
			setForm({
				...BLANK_PURCHASE,
				purchaseDate: new Date().toISOString().slice(0, 10),
			})
		},
	})

	const ingredientError = fieldError(mutation.error, "ingredientId")

	const submit = (e: FormEvent) => {
		e.preventDefault()
		mutation.mutate(form)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon aria-hidden="true" /> Record purchase
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Record a purchase</DialogTitle>
					<DialogDescription>
						Adds a new lot to your stock ledger. Cost and quantity feed the dashboard's recovery and
						loss numbers.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="purchase-ingredient">Ingredient</Label>
							<Select
								value={form.ingredientId}
								onValueChange={(value) => setForm({ ...form, ingredientId: value })}
							>
								<SelectTrigger id="purchase-ingredient" aria-invalid={ingredientError !== ""}>
									<SelectValue placeholder="Pick an ingredient" />
								</SelectTrigger>
								<SelectContent>
									{ingredients.length === 0 ? (
										<div className="px-3 py-2 text-sm text-muted-foreground">
											No ingredients yet — add one in Catalog.
										</div>
									) : (
										ingredients.map((i) => (
											<SelectItem key={i.id} value={i.id}>
												{i.name} <span className="text-muted-foreground">· {i.baseUnit}</span>
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
							{ingredientError !== "" && <p className="text-sm text-critical">{ingredientError}</p>}
						</div>
						<div className="space-y-2">
							<Label htmlFor="purchase-supplier">Supplier (optional)</Label>
							<Select
								value={form.supplierId}
								onValueChange={(value) => setForm({ ...form, supplierId: value })}
							>
								<SelectTrigger id="purchase-supplier">
									<SelectValue placeholder="Pick a supplier" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__none__">No supplier</SelectItem>
									{suppliers.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-3">
						<div className="space-y-2">
							<Label htmlFor="purchase-qty">Quantity</Label>
							<Input
								id="purchase-qty"
								type="number"
								min="0"
								step="0.01"
								inputMode="decimal"
								required
								value={form.qty}
								onChange={(e) => setForm({ ...form, qty: e.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="purchase-unit">Unit</Label>
							<Input
								id="purchase-unit"
								required
								value={form.unit}
								onChange={(e) => setForm({ ...form, unit: e.target.value })}
							/>
							<p className="text-xs text-muted-foreground">Use the ingredient's base unit.</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="purchase-cost">Cost / unit</Label>
							<div className="relative">
								<IndianRupeeIcon
									className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
									aria-hidden="true"
								/>
								<Input
									id="purchase-cost"
									type="number"
									min="0"
									step="0.01"
									inputMode="decimal"
									required
									className="pl-9"
									value={form.unitCost}
									onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
								/>
							</div>
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="purchase-date">Purchase date</Label>
							<Input
								id="purchase-date"
								type="date"
								required
								value={form.purchaseDate}
								onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="purchase-expiry">Expiry (optional)</Label>
							<Input
								id="purchase-expiry"
								type="date"
								value={form.expiryDate}
								onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
							/>
							<p className="text-xs text-muted-foreground">
								Leave empty if the lot does not expire.
							</p>
						</div>
					</div>
					{mutation.error != null && (
						<div
							role="alert"
							className="flex items-start gap-2 rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical"
						>
							<CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<span>{purchaseMessage(mutation.error)}</span>
						</div>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Recording…" : "Record purchase"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

const AdjustmentDialog = ({
	open,
	onOpenChange,
	lotId,
	ingredientName,
}: {
	open: boolean
	onOpenChange: (next: boolean) => void
	lotId: string
	ingredientName: string
}) => {
	const queryClient = useQueryClient()
	const [qty, setQty] = useState("")
	const [reason, setReason] = useState<AdjustmentReason>("waste")

	const mutation = useMutation({
		mutationFn: async () =>
			apiPost<{ newRemaining: number }>("/v1/inventory/adjustments", {
				lotId,
				qtyDelta: -Math.abs(toNumber(qty)),
				reason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.inventoryStock() })
			queryClient.invalidateQueries({ queryKey: queryKeys.inventoryExpiring() })
			onOpenChange(false)
			setQty("")
			setReason("waste")
		},
	})

	const submit = (e: FormEvent) => {
		e.preventDefault()
		mutation.mutate()
	}

	const qtyError = fieldError(mutation.error, "qtyDelta")

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					mutation.reset()
					setQty("")
					setReason("waste")
				}
				onOpenChange(next)
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Adjust lot</DialogTitle>
					<DialogDescription>
						Record a loss, transfer, or count correction. The qty is deducted from the lot's
						remaining balance.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4">
					<div className="rounded-lg border bg-muted/40 p-3">
						<p className="font-medium">{ingredientName}</p>
						<p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
							<ReceiptTextIcon className="size-3" aria-hidden="true" />
							Lot <span className="font-mono">{lotId.slice(0, 8)}</span>
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="adjust-qty">Quantity</Label>
						<Input
							id="adjust-qty"
							type="number"
							min="0"
							step="0.01"
							inputMode="decimal"
							required
							value={qty}
							onChange={(e) => setQty(e.target.value)}
							aria-invalid={qtyError !== ""}
						/>
						{qtyError !== "" && <p className="text-sm text-critical">{qtyError}</p>}
					</div>
					<div className="space-y-2">
						<Label htmlFor="adjust-reason">Reason</Label>
						<Select value={reason} onValueChange={(value) => setReason(value as AdjustmentReason)}>
							<SelectTrigger id="adjust-reason">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ADJUSTMENT_REASONS.map((r) => (
									<SelectItem key={r.value} value={r.value}>
										{r.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{mutation.error != null && qtyError === "" && (
						<div
							role="alert"
							className="flex items-start gap-2 rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical"
						>
							<CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<span>{adjustmentMessage(mutation.error)}</span>
						</div>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending || toNumber(qty) <= 0}>
							{mutation.isPending ? "Saving…" : "Apply adjustment"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

const SummaryStrip = ({
	stock,
	expiring,
	expiringError,
}: {
	stock: StockAggregate[]
	expiring: ExpiringLot[]
	expiringError: Error | null
}) => {
	const totalQty = stock.reduce((acc, item) => acc + item.qtyOnHand, 0)
	const expiringSoon = expiring.filter((entry) => entry.daysUntilExpiry <= 2).length
	const totalLots = stock.reduce((acc, item) => acc + item.lotCount, 0)
	const expired = expiring.filter((entry) => entry.daysUntilExpiry <= 0).length

	const tiles: Array<{ label: string; value: string; icon: ReactNode; tone: string }> = [
		{
			label: "On hand",
			value: `${kilograms.format(totalQty)} units`,
			icon: <PackageIcon className="size-4 text-primary" aria-hidden="true" />,
			tone: "text-primary",
		},
		{
			label: "Lots tracked",
			value: String(totalLots),
			icon: <ReceiptTextIcon className="size-4 text-muted-foreground" aria-hidden="true" />,
			tone: "text-foreground",
		},
		{
			label: "Expiring in 48h",
			value: String(expiringSoon),
			icon: <TimerIcon className="size-4 text-serious" aria-hidden="true" />,
			tone: expiringSoon > 0 ? "text-serious" : "text-good",
		},
		{
			label: "Already expired",
			value: String(expired),
			icon: <AlertTriangleIcon className="size-4 text-critical" aria-hidden="true" />,
			tone: expired > 0 ? "text-critical" : "text-muted-foreground",
		},
	]

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{tiles.map((tile) => (
				<Card key={tile.label}>
					<CardHeader className="pb-2">
						<div className="flex items-center gap-2">
							{tile.icon}
							<CardDescription>{tile.label}</CardDescription>
						</div>
						<CardTitle className={cn("font-display text-2xl tabular", tile.tone)}>
							{expiringError != null && tile.label !== "Lots tracked" ? "—" : tile.value}
						</CardTitle>
					</CardHeader>
				</Card>
			))}
		</div>
	)
}

export const InventoryPage = () => {
	const stockQuery = useQuery({
		queryKey: queryKeys.inventoryStock(),
		queryFn: () => apiGet<Collection<StockAggregate>>("/v1/inventory/stock"),
	})
	const expiringQuery = useQuery({
		queryKey: queryKeys.inventoryExpiring(),
		queryFn: () => apiGet<Collection<ExpiringLot>>("/v1/inventory/expiring"),
	})
	const ingredientsQuery = useQuery({
		queryKey: queryKeys.ingredients(),
		queryFn: () => apiGet<Collection<Ingredient>>("/v1/ingredients"),
		staleTime: 5 * 60_000,
	})
	const suppliersQuery = useQuery({
		queryKey: queryKeys.suppliers(),
		queryFn: () => apiGet<Collection<Supplier>>("/v1/suppliers"),
		staleTime: 5 * 60_000,
	})

	const [adjustment, setAdjustment] = useState<AdjustmentFormState | null>(null)

	const expiringSoon =
		expiringQuery.data?.items.filter((entry) => entry.daysUntilExpiry <= 2).length ?? 0
	const stock = stockQuery.data?.items ?? []
	const expiring = expiringQuery.data?.items ?? []
	const ingredients = ingredientsQuery.data?.items ?? []
	const suppliers = suppliersQuery.data?.items ?? []

	return (
		<section className="w-full">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Inventory</h1>
					<p className="mt-1 text-muted-foreground">
						Stock on hand, expiring lots, and the ingredient ledger your prep pulls from.
					</p>
				</div>
				<PurchaseDialog ingredients={ingredients} suppliers={suppliers} />
			</header>

			<div className="mt-8 space-y-6">
				<SummaryStrip stock={stock} expiring={expiring} expiringError={expiringQuery.error} />

				{expiringSoon > 0 && expiringQuery.error == null && (
					<div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
						<TimerIcon className="size-4 shrink-0 text-serious" aria-hidden="true" />
						<p className="text-sm font-medium text-serious">
							{expiringSoon} {expiringSoon === 1 ? "lot" : "lots"} expiring within 48 hours — use or
							adjust them first.
						</p>
					</div>
				)}

				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<BeefIcon className="size-4 text-primary" aria-hidden="true" />
							<CardTitle className="text-base">Stock on hand</CardTitle>
						</div>
						<CardDescription>
							{stockQuery.isPending
								? "Loading stock…"
								: `${stock.length} ingredient${stock.length === 1 ? "" : "s"} on the books`}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{stockQuery.isPending && <StockSkeleton />}
						{stockQuery.error != null && (
							<StockLoadFailed
								message={stockQuery.error.message}
								onRetry={() => stockQuery.refetch()}
							/>
						)}
						{!stockQuery.isPending && stockQuery.error == null && stock.length === 0 && (
							<StockEmpty />
						)}
						{stock.length > 0 && (
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{stock.map((item) => (
									<StockCard key={item.ingredientId} item={item} />
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<TimerIcon className="size-4 text-serious" aria-hidden="true" />
							<CardTitle className="text-base">Expiring soon</CardTitle>
						</div>
						<CardDescription>
							{expiringQuery.isPending
								? "Loading expiring lots…"
								: `${expiring.length} lot${expiring.length === 1 ? "" : "s"} within the next 7 days`}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ExpiringTable
							lots={expiring}
							loading={expiringQuery.isPending}
							error={expiringQuery.error}
							onRetry={() => expiringQuery.refetch()}
							onAdjust={(lotId, ingredientName) =>
								setAdjustment({ lotId, ingredientName, open: true })
							}
						/>
					</CardContent>
				</Card>
			</div>

			<Dialog
				open={adjustment?.open === true}
				onOpenChange={(next) =>
					setAdjustment((current) => (current == null ? current : { ...current, open: next }))
				}
			>
				{adjustment != null && (
					<AdjustmentDialog
						open={adjustment.open}
						onOpenChange={(next) =>
							setAdjustment((current) => (current == null ? current : { ...current, open: next }))
						}
						lotId={adjustment.lotId}
						ingredientName={adjustment.ingredientName}
					/>
				)}
			</Dialog>
		</section>
	)
}
