import type { Collection } from "@smartplate/contracts/envelope"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	CalendarIcon,
	CheckIcon,
	ChefHatIcon,
	CircleAlertIcon,
	ClockIcon,
	InboxIcon,
	PlusIcon,
	RefreshCwIcon,
	TimerIcon,
	UtensilsCrossedIcon,
} from "lucide-react"
import { type FormEvent, useState } from "react"
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
import { ApiClientError, apiGet, apiPatch, apiPost, fieldError } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
import { cn } from "../lib/utils"

type Dish = {
	id: string
	name: string
	servingUnit: string
}

type PrepEntry = {
	id: string
	dishId: string
	dishName: string
	dishUnit: string
	dishAvgServingWeightG: string | null
	serviceDate: string
	mealPeriod: "lunch" | "dinner"
	qtyPrepared: string
	qtyServed: string | null
	covers: number | null
	preparedAt: string
}

type ReusePending = {
	leftoverId: string
	leftoverQty: number
	unit: string
	retainQty: number
	dishName: string
	dishId: string
	safeUntil: string
	preparedAt: string
}

type PrepForm = {
	dishId: string
	serviceDate: string
	mealPeriod: "lunch" | "dinner"
	qtyPrepared: string
	covers: string
}

type ReuseForm = {
	leftoverId: string
	confirmedQty: string
	notes: string
}

const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
const timestamp = new Intl.DateTimeFormat("en-IN", {
	day: "2-digit",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
})

const toNumber = (value: string | number | null | undefined): number => {
	if (value == null) return 0
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

const toIsoDate = (d: Date): string => {
	const yyyy = d.getFullYear()
	const mm = String(d.getMonth() + 1).padStart(2, "0")
	const dd = String(d.getDate()).padStart(2, "0")
	return `${yyyy}-${mm}-${dd}`
}

const today = (): string => toIsoDate(new Date())

const BLANK_PREP: PrepForm = {
	dishId: "",
	serviceDate: today(),
	mealPeriod: "lunch",
	qtyPrepared: "",
	covers: "",
}

const hoursUntil = (iso: string): number => (new Date(iso).getTime() - Date.now()) / 3_600_000

const safeUntilLabel = (iso: string): string => {
	const hours = hoursUntil(iso)
	if (hours <= 0) return "Past safe-until"
	if (hours < 1) return `Safe for ${Math.max(1, Math.round(hours * 60))} min`
	if (hours < 48) return `Safe for ${Math.round(hours)} h`
	return `Safe for ${Math.round(hours / 24)} days`
}

const prepMessage = (error: Error | null): string => {
	if (error == null) return ""
	if (!(error instanceof ApiClientError)) return "Could not record the prep entry."
	if (error.code === "INSUFFICIENT_STOCK")
		return "One of the recipe ingredients does not have enough stock on hand."
	if (error.code === "VALIDATION_FAILED") return "Check the fields below."
	if (error.code === "AUTH_FORBIDDEN") return "Your role cannot record prep."
	return error.message
}

const reuseMessage = (error: Error | null): string => {
	if (error == null) return ""
	if (!(error instanceof ApiClientError)) return "Could not record the reuse confirmation."
	if (error.code === "REUSE_EXCEEDS_RETAIN")
		return "Confirmed qty is more than the retain qty held for reuse."
	if (error.code === "VALIDATION_FAILED") return "Check the qty below."
	if (error.code === "AUTH_FORBIDDEN") return "Your role cannot confirm reuse."
	return error.message
}

const PrepTableSkeleton = () => (
	<div className="space-y-2">
		<Skeleton className="h-10 w-full" />
		<Skeleton className="h-10 w-full" />
		<Skeleton className="h-10 w-full" />
	</div>
)

const ServingEfficiency = ({ entry }: { entry: PrepEntry }) => {
	const prepared = toNumber(entry.qtyPrepared)
	const served = toNumber(entry.qtyServed)
	if (prepared <= 0) return <span className="text-muted-foreground">—</span>
	const pct = Math.min(100, Math.round((served / prepared) * 100))
	return (
		<div className="flex items-center justify-end gap-2">
			<div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
				<div
					className={cn(
						"h-full rounded-full",
						pct >= 80 ? "bg-good" : pct >= 50 ? "bg-warning" : "bg-critical",
					)}
					style={{ width: `${pct}%` }}
				/>
			</div>
			<span className="w-10 text-right text-xs tabular text-muted-foreground">{pct}%</span>
		</div>
	)
}

const PrepTable = ({
	prep,
	loading,
	error,
	onRetry,
	onUpdate,
}: {
	prep: PrepEntry[]
	loading: boolean
	error: Error | null
	onRetry: () => void
	onUpdate: (entry: PrepEntry) => void
}) => {
	if (loading) return <PrepTableSkeleton />
	if (error != null) {
		return (
			<div
				role="alert"
				className="flex flex-col items-start gap-2 rounded-lg border border-critical/30 bg-critical/10 p-4 text-sm text-critical"
			>
				<p className="flex items-center gap-2 font-medium">
					<CircleAlertIcon className="size-4" aria-hidden="true" /> Could not load prep entries
				</p>
				<p className="text-critical/80">{error.message}</p>
				<Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
					<RefreshCwIcon aria-hidden="true" /> Try again
				</Button>
			</div>
		)
	}
	if (prep.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-8 text-center">
				<UtensilsCrossedIcon className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
				<p className="mt-3 font-medium">No prep recorded for this date</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Start a new prep entry and it will pull stock FEFO across the recipe ingredients.
				</p>
			</div>
		)
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Dish</TableHead>
					<TableHead>Period</TableHead>
					<TableHead className="text-right">Prepared</TableHead>
					<TableHead className="text-right">Served</TableHead>
					<TableHead className="text-right">Covers</TableHead>
					<TableHead className="text-right">Efficiency</TableHead>
					<TableHead className="text-right">Action</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{prep.map((entry) => (
					<TableRow key={entry.id}>
						<TableCell className="font-medium">{entry.dishName}</TableCell>
						<TableCell>
							<Badge
								variant={entry.mealPeriod === "lunch" ? "secondary" : "outline"}
								className="capitalize"
							>
								{entry.mealPeriod}
							</Badge>
						</TableCell>
						<TableCell className="text-right tabular">
							{quantity.format(toNumber(entry.qtyPrepared))} {entry.dishUnit}
						</TableCell>
						<TableCell className="text-right tabular">
							{entry.qtyServed == null ? (
								<span className="text-muted-foreground">—</span>
							) : (
								`${quantity.format(toNumber(entry.qtyServed))} ${entry.dishUnit}`
							)}
						</TableCell>
						<TableCell className="text-right tabular">
							{entry.covers == null ? (
								<span className="text-muted-foreground">—</span>
							) : (
								entry.covers
							)}
						</TableCell>
						<TableCell>
							<ServingEfficiency entry={entry} />
						</TableCell>
						<TableCell className="text-right">
							<Button size="sm" variant="outline" onClick={() => onUpdate(entry)}>
								Update
							</Button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}

const ReuseTable = ({
	reuse,
	loading,
	error,
	onRetry,
}: {
	reuse: ReusePending[]
	loading: boolean
	error: Error | null
	onRetry: () => void
}) => {
	if (loading) {
		return (
			<div className="space-y-2">
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
					<CircleAlertIcon className="size-4" aria-hidden="true" /> Could not load reuse queue
				</p>
				<p className="text-critical/80">{error.message}</p>
				<Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
					<RefreshCwIcon aria-hidden="true" /> Try again
				</Button>
			</div>
		)
	}
	if (reuse.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-8 text-center">
				<InboxIcon className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
				<p className="mt-3 font-medium">No leftovers awaiting reuse</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Leftovers kept for reuse after a close of day will show up here for next-day confirmation.
				</p>
			</div>
		)
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Dish</TableHead>
					<TableHead className="text-right">Leftover</TableHead>
					<TableHead className="text-right">Retain</TableHead>
					<TableHead>Safe until</TableHead>
					<TableHead className="text-right">Action</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{reuse.map((entry) => (
					<TableRow key={entry.leftoverId}>
						<TableCell className="font-medium">{entry.dishName}</TableCell>
						<TableCell className="text-right tabular">
							{quantity.format(entry.leftoverQty)} {entry.unit}
						</TableCell>
						<TableCell className="text-right tabular">
							{quantity.format(entry.retainQty)} {entry.unit}
						</TableCell>
						<TableCell>
							<SafeUntilBadge iso={entry.safeUntil} />
						</TableCell>
						<TableCell className="text-right">
							<ReuseDialog entry={entry} />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}

const SafeUntilBadge = ({ iso }: { iso: string }) => {
	const hours = hoursUntil(iso)
	if (hours <= 0) {
		return (
			<Badge variant="critical">
				<ClockIcon aria-hidden="true" /> Past safe-until
			</Badge>
		)
	}
	if (hours < 12) {
		return (
			<Badge variant="warning">
				<ClockIcon aria-hidden="true" /> {safeUntilLabel(iso)}
			</Badge>
		)
	}
	return (
		<Badge variant="secondary">
			<ClockIcon aria-hidden="true" /> {safeUntilLabel(iso)}
		</Badge>
	)
}

const PrepDialog = ({ dishes, serviceDate }: { dishes: Dish[]; serviceDate: string }) => {
	const queryClient = useQueryClient()
	const [open, setOpen] = useState(false)
	const [form, setForm] = useState<PrepForm>({ ...BLANK_PREP, serviceDate })

	const mutation = useMutation({
		mutationFn: async (body: PrepForm) => {
			const idempotencyKey = crypto.randomUUID()
			const res = await fetch("/api/v1/prep-entries", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Idempotency-Key": idempotencyKey,
				},
				body: JSON.stringify({
					dishId: body.dishId,
					serviceDate: body.serviceDate,
					mealPeriod: body.mealPeriod,
					qtyPrepared: toNumber(body.qtyPrepared),
					covers: toNumber(body.covers),
				}),
			})
			if (!res.ok) {
				const text = await res.text()
				throw new Error(text || "Could not record prep")
			}
			return res.json()
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.prepEntries(serviceDate) })
			queryClient.invalidateQueries({ queryKey: queryKeys.prepEntries("") })
			queryClient.invalidateQueries({ queryKey: queryKeys.inventoryStock() })
			queryClient.invalidateQueries({ queryKey: queryKeys.inventoryExpiring() })
			setOpen(false)
			setForm({ ...BLANK_PREP, serviceDate })
		},
	})

	const dishError = fieldError(mutation.error, "dishId")
	const qtyError = fieldError(mutation.error, "qtyPrepared")

	const submit = (e: FormEvent) => {
		e.preventDefault()
		mutation.mutate(form)
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (next) setForm({ ...BLANK_PREP, serviceDate })
				mutation.reset()
				setOpen(next)
			}}
		>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon aria-hidden="true" /> New prep
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Record prep</DialogTitle>
					<DialogDescription>
						Stock is drawn FEFO across the dish's recipe ingredients. Insufficient stock is rejected
						before saving.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="prep-dish">Dish</Label>
						<Select
							value={form.dishId}
							onValueChange={(value) => setForm({ ...form, dishId: value })}
						>
							<SelectTrigger id="prep-dish" aria-invalid={dishError !== ""}>
								<SelectValue placeholder={dishes.length === 0 ? "No dishes yet" : "Pick a dish"} />
							</SelectTrigger>
							<SelectContent>
								{dishes.length === 0 ? (
									<div className="px-3 py-2 text-sm text-muted-foreground">
										Add a dish in Catalog first.
									</div>
								) : (
									dishes.map((d) => (
										<SelectItem key={d.id} value={d.id}>
											{d.name} <span className="text-muted-foreground">· {d.servingUnit}</span>
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
						{dishError !== "" && <p className="text-sm text-critical">{dishError}</p>}
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="prep-period">Meal period</Label>
							<Select
								value={form.mealPeriod}
								onValueChange={(value) =>
									setForm({ ...form, mealPeriod: value as PrepForm["mealPeriod"] })
								}
							>
								<SelectTrigger id="prep-period">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="lunch">Lunch</SelectItem>
									<SelectItem value="dinner">Dinner</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="prep-date">Service date</Label>
							<Input
								id="prep-date"
								type="date"
								required
								value={form.serviceDate}
								onChange={(e) => setForm({ ...form, serviceDate: e.target.value })}
							/>
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="prep-qty">Qty prepared</Label>
							<Input
								id="prep-qty"
								type="number"
								min="0"
								step="0.01"
								inputMode="decimal"
								required
								value={form.qtyPrepared}
								onChange={(e) => setForm({ ...form, qtyPrepared: e.target.value })}
								aria-invalid={qtyError !== ""}
							/>
							{qtyError !== "" && <p className="text-sm text-critical">{qtyError}</p>}
						</div>
						<div className="space-y-2">
							<Label htmlFor="prep-covers">Covers</Label>
							<Input
								id="prep-covers"
								type="number"
								min="0"
								step="1"
								inputMode="numeric"
								required
								value={form.covers}
								onChange={(e) => setForm({ ...form, covers: e.target.value })}
							/>
						</div>
					</div>
					{mutation.error != null && dishError === "" && qtyError === "" && (
						<div
							role="alert"
							className="flex items-start gap-2 rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical"
						>
							<CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<span>{prepMessage(mutation.error)}</span>
						</div>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={mutation.isPending || form.dishId === "" || toNumber(form.qtyPrepared) <= 0}
						>
							{mutation.isPending ? "Recording…" : "Record prep"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

const UpdatePrepDialog = ({
	entry,
	open,
	onOpenChange,
}: {
	entry: PrepEntry
	open: boolean
	onOpenChange: (next: boolean) => void
}) => {
	const queryClient = useQueryClient()
	const initialServed = entry.qtyServed ?? entry.qtyPrepared
	const initialCovers = entry.covers == null ? "0" : String(entry.covers)
	const [served, setServed] = useState(initialServed)
	const [covers, setCovers] = useState(initialCovers)

	const mutation = useMutation({
		mutationFn: () =>
			apiPatch(`/v1/prep-entries/${entry.id}`, {
				qtyServed: toNumber(served),
				covers: toNumber(covers),
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["prep-entries"] })
			onOpenChange(false)
		},
	})

	const submit = (e: FormEvent) => {
		e.preventDefault()
		mutation.mutate()
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Update {entry.dishName}</DialogTitle>
					<DialogDescription>
						Update the qty served and cover count for the{" "}
						<span className="font-medium capitalize">{entry.mealPeriod}</span> service.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4">
					<div className="rounded-lg border bg-muted/40 p-3 text-sm">
						<p className="font-medium">
							{quantity.format(toNumber(entry.qtyPrepared))} {entry.dishUnit} prepared
						</p>
						<p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
							<CalendarIcon className="size-3" aria-hidden="true" />
							{entry.serviceDate}
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="update-served">Qty served ({entry.dishUnit})</Label>
							<Input
								id="update-served"
								type="number"
								min="0"
								step="0.01"
								inputMode="decimal"
								required
								value={served}
								onChange={(e) => setServed(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="update-covers">Covers</Label>
							<Input
								id="update-covers"
								type="number"
								min="0"
								step="1"
								inputMode="numeric"
								required
								value={covers}
								onChange={(e) => setCovers(e.target.value)}
							/>
						</div>
					</div>
					{mutation.error != null && (
						<div
							role="alert"
							className="flex items-start gap-2 rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical"
						>
							<CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<span>{prepMessage(mutation.error)}</span>
						</div>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Saving…" : "Save update"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

const ReuseDialog = ({ entry }: { entry: ReusePending }) => {
	const queryClient = useQueryClient()
	const [open, setOpen] = useState(false)
	const [form, setForm] = useState<ReuseForm>({
		leftoverId: entry.leftoverId,
		confirmedQty: String(entry.retainQty),
		notes: "",
	})

	const mutation = useMutation({
		mutationFn: (body: ReuseForm) =>
			apiPost(`/v1/leftovers/${body.leftoverId}/reuse-confirmation`, {
				confirmedReusedQty: toNumber(body.confirmedQty),
				notes: body.notes,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.reusePending() })
			setOpen(false)
		},
	})

	const submit = (e: FormEvent) => {
		e.preventDefault()
		mutation.mutate(form)
	}

	const qtyError = fieldError(mutation.error, "confirmedReusedQty")

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (next) {
					setForm({
						leftoverId: entry.leftoverId,
						confirmedQty: String(entry.retainQty),
						notes: "",
					})
					mutation.reset()
				}
				setOpen(next)
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<CheckIcon aria-hidden="true" /> Confirm reuse
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Confirm reuse — {entry.dishName}</DialogTitle>
					<DialogDescription>
						Confirm how much of the {quantity.format(entry.retainQty)} {entry.unit} retained was
						actually reused. Anything unconfirmed stays on the books.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4">
					<div className="rounded-lg border bg-muted/40 p-3 text-sm">
						<div className="flex items-center gap-2 text-muted-foreground">
							<TimerIcon className="size-3.5" aria-hidden="true" />
							<span>Prepared {timestamp.format(new Date(entry.preparedAt))}</span>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="reuse-qty">Reused qty ({entry.unit})</Label>
						<Input
							id="reuse-qty"
							type="number"
							min="0"
							max={entry.retainQty}
							step="0.01"
							inputMode="decimal"
							required
							value={form.confirmedQty}
							onChange={(e) => setForm({ ...form, confirmedQty: e.target.value })}
							aria-invalid={qtyError !== ""}
						/>
						{qtyError !== "" && <p className="text-sm text-critical">{qtyError}</p>}
					</div>
					<div className="space-y-2">
						<Label htmlFor="reuse-notes">Notes</Label>
						<Input
							id="reuse-notes"
							value={form.notes}
							onChange={(e) => setForm({ ...form, notes: e.target.value })}
							placeholder="e.g. Sent to shelter kitchen"
						/>
					</div>
					{mutation.error != null && qtyError === "" && (
						<div
							role="alert"
							className="flex items-start gap-2 rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical"
						>
							<CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
							<span>{reuseMessage(mutation.error)}</span>
						</div>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending || toNumber(form.confirmedQty) <= 0}>
							{mutation.isPending ? "Saving…" : "Confirm reuse"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

const SummaryStrip = ({ prep, reuse }: { prep: PrepEntry[]; reuse: ReusePending[] }) => {
	const totalPrepared = prep.reduce((acc, e) => acc + toNumber(e.qtyPrepared), 0)
	const totalServed = prep.reduce((acc, e) => acc + toNumber(e.qtyServed), 0)
	const efficiency =
		totalPrepared > 0 ? Math.min(100, Math.round((totalServed / totalPrepared) * 100)) : 0
	const totalCovers = prep.reduce((acc, e) => acc + (e.covers ?? 0), 0)
	const retain = reuse.reduce((acc, e) => acc + e.retainQty, 0)

	const tiles: Array<{ label: string; value: string; sublabel: string; tone: string }> = [
		{
			label: "Prepared",
			value: quantity.format(totalPrepared),
			sublabel: `${prep.length} prep ${prep.length === 1 ? "entry" : "entries"}`,
			tone: "text-foreground",
		},
		{
			label: "Served",
			value: quantity.format(totalServed),
			sublabel: `${efficiency}% of prepared`,
			tone: efficiency >= 80 ? "text-good" : efficiency >= 50 ? "text-serious" : "text-critical",
		},
		{
			label: "Covers",
			value: String(totalCovers),
			sublabel: "across the day",
			tone: "text-foreground",
		},
		{
			label: "Held for reuse",
			value: quantity.format(retain),
			sublabel: `${reuse.length} awaiting confirmation`,
			tone: "text-primary",
		},
	]

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{tiles.map((tile) => (
				<Card key={tile.label}>
					<CardHeader className="pb-2">
						<CardDescription>{tile.label}</CardDescription>
						<CardTitle className={cn("font-display text-2xl tabular", tile.tone)}>
							{tile.value}
						</CardTitle>
						<p className="text-xs text-muted-foreground">{tile.sublabel}</p>
					</CardHeader>
				</Card>
			))}
		</div>
	)
}

export const KitchenPage = () => {
	const [date, setDate] = useState<string>(today())
	const [updating, setUpdating] = useState<PrepEntry | null>(null)

	const prepQuery = useQuery({
		queryKey: queryKeys.prepEntries(date),
		queryFn: () => apiGet<Collection<PrepEntry>>(`/v1/prep-entries?serviceDate=${date}`),
	})
	const reuseQuery = useQuery({
		queryKey: queryKeys.reusePending(),
		queryFn: () => apiGet<Collection<ReusePending>>("/v1/leftovers/reuse-pending"),
	})
	const dishesQuery = useQuery({
		queryKey: queryKeys.dishes(),
		queryFn: () => apiGet<Collection<Dish>>("/v1/dishes"),
		staleTime: 5 * 60_000,
	})

	const prep = prepQuery.data?.items ?? []
	const reuse = reuseQuery.data?.items ?? []
	const dishes = dishesQuery.data?.items ?? []

	const expiringSoon = reuse.filter((entry) => hoursUntil(entry.safeUntil) < 12).length

	return (
		<section className="w-full">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Kitchen</h1>
					<p className="mt-1 text-muted-foreground">
						Prep entries for the day, plus reuse confirmations on held leftovers.
					</p>
				</div>
				<div className="flex items-end gap-3">
					<div className="space-y-2">
						<Label htmlFor="kitchen-date">Service date</Label>
						<Input
							id="kitchen-date"
							type="date"
							className="w-44"
							value={date}
							onChange={(e) => setDate(e.target.value)}
						/>
					</div>
					<PrepDialog dishes={dishes} serviceDate={date} />
				</div>
			</header>

			<div className="mt-8 space-y-6">
				<SummaryStrip prep={prep} reuse={reuse} />

				{expiringSoon > 0 && (
					<div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
						<TimerIcon className="size-4 shrink-0 text-serious" aria-hidden="true" />
						<p className="text-sm font-medium text-serious">
							{expiringSoon} leftover{expiringSoon === 1 ? "" : "s"} on the reuse queue will pass
							their safe-until within 12 hours.
						</p>
					</div>
				)}

				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<ChefHatIcon className="size-4 text-primary" aria-hidden="true" />
							<CardTitle className="text-base">Prep entries</CardTitle>
						</div>
						<CardDescription>
							{prepQuery.isPending
								? "Loading prep entries…"
								: `${prep.length} prep ${prep.length === 1 ? "entry" : "entries"} · ${timestamp.format(new Date(`${date}T12:00:00`))}`}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<PrepTable
							prep={prep}
							loading={prepQuery.isPending}
							error={prepQuery.error}
							onRetry={() => prepQuery.refetch()}
							onUpdate={(entry) => setUpdating(entry)}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<RefreshCwIcon className="size-4 text-serious" aria-hidden="true" />
							<CardTitle className="text-base">Reuse pending</CardTitle>
						</div>
						<CardDescription>
							{reuseQuery.isPending
								? "Loading reuse queue…"
								: `${reuse.length} leftover${reuse.length === 1 ? "" : "s"} awaiting confirmation`}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ReuseTable
							reuse={reuse}
							loading={reuseQuery.isPending}
							error={reuseQuery.error}
							onRetry={() => reuseQuery.refetch()}
						/>
					</CardContent>
				</Card>
			</div>

			<Dialog
				open={updating != null}
				onOpenChange={(next) => {
					if (!next) setUpdating(null)
				}}
			>
				{updating != null && (
					<UpdatePrepDialog
						entry={updating}
						open
						onOpenChange={(next) => {
							if (!next) setUpdating(null)
						}}
					/>
				)}
			</Dialog>
		</section>
	)
}
