import type { Collection } from "@smartplate/contracts/envelope"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, ChefHatIcon, ClockIcon, PlusIcon, RefreshCwIcon } from "lucide-react"
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
import { type ApiClientError, apiGet, apiPatch, apiPost, fieldError } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"

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
	serviceDate: string
	mealPeriod: "lunch" | "dinner"
	qtyPrepared: number
	qtyServed: number | null
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

const today = (): string => new Date().toISOString().slice(0, 10)

const BLANK_PREP: PrepForm = {
	dishId: "",
	serviceDate: today(),
	mealPeriod: "lunch",
	qtyPrepared: "",
	covers: "",
}

export const KitchenPage = () => {
	const [date, setDate] = useState(today())
	const prepQ = useQuery({
		queryKey: ["prep-entries", date],
		queryFn: () => apiGet<Collection<PrepEntry>>(`/v1/prep-entries?serviceDate=${date}`),
	})
	const reuseQ = useQuery({
		queryKey: ["reuse-pending"],
		queryFn: () => apiGet<Collection<ReusePending>>("/v1/leftovers/reuse-pending"),
	})
	const dishesQ = useQuery({
		queryKey: queryKeys.dishes(),
		queryFn: () => apiGet<Collection<Dish>>("/v1/dishes"),
	})

	return (
		<div className="space-y-6 p-6">
			<header className="flex items-center justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl">Kitchen</h1>
					<p className="text-muted-foreground text-sm">
						Prep entries for the day, plus reuse confirmations on held leftovers.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Input
						type="date"
						value={date}
						onChange={(e) => setDate(e.target.value)}
						className="w-40"
					/>
					<PrepDialog dishes={dishesQ.data?.items ?? []} serviceDate={date} />
				</div>
			</header>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<ChefHatIcon className="size-4" /> Prep entries
					</CardTitle>
					<CardDescription>
						Recorded prep pulls stock via FEFO. Update serves and covers as service progresses.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<PrepTable prep={prepQ.data?.items ?? []} loading={prepQ.isLoading} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<RefreshCwIcon className="size-4" /> Reuse pending
					</CardTitle>
					<CardDescription>
						Leftovers marked for reuse. Confirm the next-day qty to close the loop.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ReuseTable reuse={reuseQ.data?.items ?? []} loading={reuseQ.isLoading} />
				</CardContent>
			</Card>
		</div>
	)
}

const PrepTable = ({ prep, loading }: { prep: PrepEntry[]; loading: boolean }) => {
	const qc = useQueryClient()
	const [editing, setEditing] = useState<string | null>(null)
	const [served, setServed] = useState("")
	const [covers, setCovers] = useState("")

	const mutation = useMutation({
		mutationFn: async ({
			id,
			qtyServed: q,
			covers: c,
		}: {
			id: string
			qtyServed: number
			covers: number
		}) => {
			return apiPatch(`/v1/prep-entries/${id}`, { qtyServed: q, covers: c })
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["prep-entries"] })
			setEditing(null)
		},
	})

	if (loading) return <Skeleton className="h-32" />
	if (prep.length === 0) {
		return <p className="text-muted-foreground text-sm">No prep recorded for this date.</p>
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
					<TableHead className="text-right">Action</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{prep.map((entry) => {
					const isEditing = editing === entry.id
					return (
						<TableRow key={entry.id}>
							<TableCell className="font-medium">{entry.dishName}</TableCell>
							<TableCell>
								<Badge variant="outline">{entry.mealPeriod}</Badge>
							</TableCell>
							<TableCell className="text-right">{entry.qtyPrepared.toFixed(2)}</TableCell>
							<TableCell className="text-right">
								{isEditing ? (
									<Input
										type="number"
										step="0.01"
										value={served}
										onChange={(e) => setServed(e.target.value)}
										className="h-7 w-20 text-right"
									/>
								) : entry.qtyServed == null ? (
									"—"
								) : (
									entry.qtyServed.toFixed(2)
								)}
							</TableCell>
							<TableCell className="text-right">
								{isEditing ? (
									<Input
										type="number"
										value={covers}
										onChange={(e) => setCovers(e.target.value)}
										className="h-7 w-20 text-right"
									/>
								) : entry.covers == null ? (
									"—"
								) : (
									entry.covers
								)}
							</TableCell>
							<TableCell className="text-right">
								{isEditing ? (
									<div className="flex justify-end gap-1">
										<Button
											size="sm"
											onClick={() => {
												mutation.mutate({
													id: entry.id,
													qtyServed: Number(served),
													covers: Number(covers),
												})
											}}
											disabled={mutation.isPending}
										>
											<CheckIcon />
										</Button>
										<Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
											Cancel
										</Button>
									</div>
								) : (
									<Button
										size="sm"
										variant="outline"
										onClick={() => {
											setEditing(entry.id)
											setServed(String(entry.qtyServed ?? entry.qtyPrepared))
											setCovers(String(entry.covers ?? 0))
										}}
									>
										Update
									</Button>
								)}
							</TableCell>
						</TableRow>
					)
				})}
			</TableBody>
		</Table>
	)
}

const ReuseTable = ({ reuse, loading }: { reuse: ReusePending[]; loading: boolean }) => {
	if (loading) return <Skeleton className="h-32" />
	if (reuse.length === 0) {
		return <p className="text-muted-foreground text-sm">No leftovers awaiting reuse.</p>
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
						<TableCell className="text-right">
							{entry.leftoverQty.toFixed(2)} {entry.unit}
						</TableCell>
						<TableCell className="text-right">
							{entry.retainQty.toFixed(2)} {entry.unit}
						</TableCell>
						<TableCell>
							<Badge variant="outline" className="flex items-center gap-1">
								<ClockIcon className="size-3" /> {entry.safeUntil.slice(0, 16).replace("T", " ")}
							</Badge>
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

const PrepDialog = ({ dishes, serviceDate }: { dishes: Dish[]; serviceDate: string }) => {
	const qc = useQueryClient()
	const [open, setOpen] = useState(false)
	const [form, setForm] = useState<PrepForm>({ ...BLANK_PREP, serviceDate })
	const [error, setError] = useState<string | null>(null)

	const mutation = useMutation({
		mutationFn: async (body: PrepForm) => {
			const idempotencyKey = crypto.randomUUID()
			const res = await fetch("/v1/prep-entries", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Idempotency-Key": idempotencyKey,
				},
				body: JSON.stringify({
					dishId: body.dishId,
					serviceDate: body.serviceDate,
					mealPeriod: body.mealPeriod,
					qtyPrepared: Number(body.qtyPrepared),
					covers: Number(body.covers),
				}),
			})
			if (!res.ok) {
				const text = await res.text()
				throw new Error(text || "Could not record prep")
			}
			return res.json()
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["prep-entries"] })
			qc.invalidateQueries({ queryKey: ["inventory"] })
			setOpen(false)
			setForm({ ...BLANK_PREP, serviceDate })
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
					<PlusIcon /> New prep
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form onSubmit={onSubmit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>Record prep</DialogTitle>
						<DialogDescription>
							Stock will be drawn FEFO across the recipe ingredients.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1">
							<Label htmlFor="dishId">Dish</Label>
							<Select
								value={form.dishId}
								onValueChange={(value) => setForm({ ...form, dishId: value })}
							>
								<SelectTrigger id="dishId">
									<SelectValue placeholder="Pick a dish" />
								</SelectTrigger>
								<SelectContent>
									{dishes.map((d) => (
										<SelectItem key={d.id} value={d.id}>
											{d.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<div className="space-y-1">
								<Label htmlFor="mealPeriod">Meal period</Label>
								<Select
									value={form.mealPeriod}
									onValueChange={(value) =>
										setForm({ ...form, mealPeriod: value as PrepForm["mealPeriod"] })
									}
								>
									<SelectTrigger id="mealPeriod">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="lunch">Lunch</SelectItem>
										<SelectItem value="dinner">Dinner</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1">
								<Label htmlFor="serviceDate">Service date</Label>
								<Input
									id="serviceDate"
									type="date"
									value={form.serviceDate}
									onChange={(e) => setForm({ ...form, serviceDate: e.target.value })}
									required
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<div className="space-y-1">
								<Label htmlFor="qtyPrepared">Qty prepared</Label>
								<Input
									id="qtyPrepared"
									type="number"
									step="0.01"
									value={form.qtyPrepared}
									onChange={(e) => setForm({ ...form, qtyPrepared: e.target.value })}
									required
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="covers">Covers</Label>
								<Input
									id="covers"
									type="number"
									value={form.covers}
									onChange={(e) => setForm({ ...form, covers: e.target.value })}
									required
								/>
							</div>
						</div>
						{error != null && <div className="text-destructive text-sm">{error}</div>}
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

const ReuseDialog = ({ entry }: { entry: ReusePending }) => {
	const qc = useQueryClient()
	const [open, setOpen] = useState(false)
	const [form, setForm] = useState<ReuseForm>({
		leftoverId: entry.leftoverId,
		confirmedQty: String(entry.retainQty),
		notes: "",
	})
	const [error, setError] = useState<string | null>(null)

	const mutation = useMutation({
		mutationFn: async (body: ReuseForm) => {
			return apiPost(`/v1/leftovers/${body.leftoverId}/reuse-confirmation`, {
				confirmedReusedQty: Number(body.confirmedQty),
				notes: body.notes,
			})
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["reuse-pending"] })
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
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					Confirm reuse
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form onSubmit={onSubmit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>Confirm reuse — {entry.dishName}</DialogTitle>
						<DialogDescription>
							Confirm how much of the {entry.retainQty.toFixed(2)} {entry.unit} retained was
							actually reused.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1">
							<Label htmlFor="confirmedQty">Reused qty ({entry.unit})</Label>
							<Input
								id="confirmedQty"
								type="number"
								step="0.01"
								value={form.confirmedQty}
								onChange={(e) => setForm({ ...form, confirmedQty: e.target.value })}
								required
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="notes">Notes</Label>
							<Input
								id="notes"
								value={form.notes}
								onChange={(e) => setForm({ ...form, notes: e.target.value })}
								placeholder="e.g. Sent to shelter"
							/>
						</div>
						{error != null && (
							<div className="text-destructive text-sm">
								{fieldError(error as unknown as ApiClientError, "confirmedReusedQty") || error}
							</div>
						)}
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Saving…" : "Confirm"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
