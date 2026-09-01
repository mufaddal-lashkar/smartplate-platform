import type { Collection } from "@smartplate/contracts/envelope"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangleIcon, ArrowUpDownIcon, PackageIcon, PlusIcon, TimerIcon } from "lucide-react"
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
import { type ApiClientError, apiGet, apiPost, fieldError } from "../lib/api-client"

type StockAggregate = {
	ingredientId: string
	ingredientName: string
	baseUnit: string
	totalRemaining: number
	oldestExpiry: string | null
	lotCount: number
}

type Lot = {
	id: string
	ingredientId: string
	ingredientName: string
	unit: string
	qtyRemaining: number
	unitCost: number
	purchaseDate: string
	expiryDate: string | null
}

type ExpiringLot = Lot & { daysToExpiry: number }

type Supplier = {
	id: string
	name: string
	contactName: string
	contactPhone: string
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

type AdjustmentForm = {
	lotId: string
	ingredientName: string
	qty: string
	reason: "spoil" | "waste" | "transfer" | "count_correction" | "use" | "return"
}

const BLANK_PURCHASE: PurchaseForm = {
	ingredientId: "",
	supplierId: "",
	qty: "",
	unit: "g",
	unitCost: "",
	purchaseDate: new Date().toISOString().slice(0, 10),
	expiryDate: "",
}

const ADJUSTMENT_REASONS: AdjustmentForm["reason"][] = [
	"spoil",
	"waste",
	"transfer",
	"count_correction",
	"use",
	"return",
]

const fmtDate = (iso: string | null): string => {
	if (iso == null || iso === "") return "—"
	const d = new Date(iso)
	return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10)
}

const daysFromNow = (iso: string | null): number | null => {
	if (iso == null || iso === "") return null
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return null
	return Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export const InventoryPage = () => {
	const stockQ = useQuery({
		queryKey: ["inventory", "stock"],
		queryFn: () => apiGet<Collection<StockAggregate>>("/v1/inventory/stock"),
	})
	const expiringQ = useQuery({
		queryKey: ["inventory", "expiring"],
		queryFn: () => apiGet<Collection<ExpiringLot>>("/v1/inventory/expiring"),
	})
	const ingredientsQ = useQuery({
		queryKey: ["ingredients"],
		queryFn: () =>
			apiGet<Collection<{ id: string; name: string; baseUnit: string }>>("/v1/ingredients"),
	})
	const suppliersQ = useQuery({
		queryKey: ["suppliers"],
		queryFn: () => apiGet<Collection<Supplier>>("/v1/suppliers"),
	})

	return (
		<div className="space-y-6 p-6">
			<header className="flex items-center justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl">Inventory</h1>
					<p className="text-muted-foreground text-sm">
						Stock on hand, expiring lots, and ingredient ledger.
					</p>
				</div>
				<PurchaseDialog
					ingredients={ingredientsQ.data?.items ?? []}
					suppliers={suppliersQ.data?.items ?? []}
				/>
			</header>

			<StockGrid stock={stockQ.data?.items ?? []} loading={stockQ.isLoading} />

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<TimerIcon className="size-4" /> Expiring soon
					</CardTitle>
					<CardDescription>Lots expiring within 7 days — adjust or use first.</CardDescription>
				</CardHeader>
				<CardContent>
					<ExpiringTable lots={expiringQ.data?.items ?? []} loading={expiringQ.isLoading} />
				</CardContent>
			</Card>
		</div>
	)
}

const StockGrid = ({ stock, loading }: { stock: StockAggregate[]; loading: boolean }) => {
	if (loading) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{["a", "b", "c", "d", "e", "f"].map((key) => (
					<Skeleton key={key} className="h-24" />
				))}
			</div>
		)
	}
	if (stock.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
					<PackageIcon className="size-8" />
					<p>No stock yet. Record a purchase to start tracking.</p>
				</CardContent>
			</Card>
		)
	}
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{stock.map((item) => (
				<Card key={item.ingredientId}>
					<CardHeader className="pb-2">
						<CardTitle className="text-base">{item.ingredientName}</CardTitle>
						<CardDescription>
							{item.lotCount} {item.lotCount === 1 ? "lot" : "lots"} · {item.baseUnit}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="font-semibold text-2xl">
							{item.totalRemaining.toFixed(2)} {item.baseUnit}
						</div>
						<div className="text-muted-foreground text-xs">
							Oldest expiry: {fmtDate(item.oldestExpiry)}
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	)
}

const ExpiringTable = ({ lots, loading }: { lots: ExpiringLot[]; loading: boolean }) => {
	if (loading) return <Skeleton className="h-32" />
	if (lots.length === 0) {
		return <p className="text-muted-foreground text-sm">Nothing expiring in the next 7 days.</p>
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Ingredient</TableHead>
					<TableHead>Lot</TableHead>
					<TableHead className="text-right">Remaining</TableHead>
					<TableHead>Expiry</TableHead>
					<TableHead className="text-right">Days</TableHead>
					<TableHead className="text-right">Action</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{lots.map((lot) => {
					const days = daysFromNow(lot.expiryDate)
					return (
						<TableRow key={lot.id}>
							<TableCell>{lot.ingredientName}</TableCell>
							<TableCell className="font-mono text-xs">{lot.id.slice(0, 8)}</TableCell>
							<TableCell className="text-right">
								{lot.qtyRemaining.toFixed(2)} {lot.unit}
							</TableCell>
							<TableCell>{fmtDate(lot.expiryDate)}</TableCell>
							<TableCell className="text-right">
								<Badge variant={days !== null && days <= 2 ? "critical" : "secondary"}>
									{days === null ? "—" : `${days}d`}
								</Badge>
							</TableCell>
							<TableCell className="text-right">
								<AdjustmentDialog
									lot={lot}
									trigger={
										<Button size="sm" variant="outline">
											<ArrowUpDownIcon className="size-3.5" /> Adjust
										</Button>
									}
								/>
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
	ingredients: { id: string; name: string; baseUnit: string }[]
	suppliers: Supplier[]
}) => {
	const qc = useQueryClient()
	const [open, setOpen] = useState(false)
	const [form, setForm] = useState<PurchaseForm>(BLANK_PURCHASE)
	const [error, setError] = useState<string | null>(null)

	const mutation = useMutation({
		mutationFn: async (body: PurchaseForm) => {
			const idempotencyKey = crypto.randomUUID()
			const res = await fetch("/v1/inventory/purchases", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Idempotency-Key": idempotencyKey,
				},
				body: JSON.stringify({
					ingredientId: body.ingredientId,
					supplierId: body.supplierId || null,
					qtyPurchased: Number(body.qty),
					unit: body.unit,
					unitCost: Number(body.unitCost),
					purchaseDate: body.purchaseDate,
					expiryDate: body.expiryDate || null,
				}),
			})
			if (!res.ok) {
				const text = await res.text()
				throw new Error(text || "Could not record purchase")
			}
			return res.json()
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["inventory"] })
			setOpen(false)
			setForm(BLANK_PURCHASE)
			setError(null)
		},
		onError: (err: Error) => setError(err.message),
	})

	const onSubmit = (e: FormEvent) => {
		e.preventDefault()
		setError(null)
		mutation.mutate(form)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon /> Record purchase
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form onSubmit={onSubmit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>Record a purchase</DialogTitle>
						<DialogDescription>Add a new lot to your stock ledger.</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1">
							<Label htmlFor="ingredientId">Ingredient</Label>
							<Select
								value={form.ingredientId}
								onValueChange={(value) => setForm({ ...form, ingredientId: value })}
							>
								<SelectTrigger id="ingredientId">
									<SelectValue placeholder="Pick an ingredient" />
								</SelectTrigger>
								<SelectContent>
									{ingredients.map((i) => (
										<SelectItem key={i.id} value={i.id}>
											{i.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="supplierId">Supplier (optional)</Label>
							<Select
								value={form.supplierId}
								onValueChange={(value) => setForm({ ...form, supplierId: value })}
							>
								<SelectTrigger id="supplierId">
									<SelectValue placeholder="Pick a supplier" />
								</SelectTrigger>
								<SelectContent>
									{suppliers.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="grid grid-cols-3 gap-2">
							<div className="space-y-1">
								<Label htmlFor="qty">Quantity</Label>
								<Input
									id="qty"
									type="number"
									step="0.01"
									value={form.qty}
									onChange={(e) => setForm({ ...form, qty: e.target.value })}
									required
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="unit">Unit</Label>
								<Input
									id="unit"
									value={form.unit}
									onChange={(e) => setForm({ ...form, unit: e.target.value })}
									required
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="unitCost">Cost / unit</Label>
								<Input
									id="unitCost"
									type="number"
									step="0.01"
									value={form.unitCost}
									onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
									required
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<div className="space-y-1">
								<Label htmlFor="purchaseDate">Purchase date</Label>
								<Input
									id="purchaseDate"
									type="date"
									value={form.purchaseDate}
									onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
									required
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="expiryDate">Expiry (optional)</Label>
								<Input
									id="expiryDate"
									type="date"
									value={form.expiryDate}
									onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
								/>
							</div>
						</div>
						{error != null && (
							<div className="flex items-center gap-2 text-destructive text-sm">
								<AlertTriangleIcon className="size-4" /> {error}
							</div>
						)}
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Saving…" : "Record"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

const AdjustmentDialog = ({
	lot,
	trigger,
}: {
	lot: { id: string; ingredientName: string; unit: string }
	trigger: React.ReactNode
}) => {
	const qc = useQueryClient()
	const [open, setOpen] = useState(false)
	const [form, setForm] = useState<AdjustmentForm>({
		lotId: lot.id,
		ingredientName: lot.ingredientName,
		qty: "",
		reason: "waste",
	})
	const [error, setError] = useState<string | null>(null)

	const mutation = useMutation({
		mutationFn: async (body: AdjustmentForm) => {
			return apiPost<{ newRemaining: number }>("/v1/inventory/adjustments", {
				lotId: body.lotId,
				qtyDelta: -Number(body.qty),
				reason: body.reason,
			})
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["inventory"] })
			setOpen(false)
			setError(null)
		},
		onError: (err: Error) => setError(err.message),
	})

	const onSubmit = (e: FormEvent) => {
		e.preventDefault()
		setError(null)
		mutation.mutate(form)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<form onSubmit={onSubmit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>Adjust lot</DialogTitle>
						<DialogDescription>
							Record a loss, transfer, or count correction. The qty is deducted from the lot.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="rounded border bg-muted/30 p-2 text-sm">
							<div className="font-medium">{lot.ingredientName}</div>
							<div className="text-muted-foreground text-xs">Lot {lot.id.slice(0, 8)}</div>
						</div>
						<div className="space-y-1">
							<Label htmlFor="qty">Quantity ({lot.unit})</Label>
							<Input
								id="qty"
								type="number"
								step="0.01"
								value={form.qty}
								onChange={(e) => setForm({ ...form, qty: e.target.value })}
								required
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="reason">Reason</Label>
							<Select
								value={form.reason}
								onValueChange={(value) =>
									setForm({ ...form, reason: value as AdjustmentForm["reason"] })
								}
							>
								<SelectTrigger id="reason">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ADJUSTMENT_REASONS.map((r) => (
										<SelectItem key={r} value={r}>
											{r.replace("_", " ")}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{error != null && (
							<div className="text-destructive text-sm">
								{fieldError(error as unknown as ApiClientError, "qty") || error}
							</div>
						)}
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Saving…" : "Apply"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
