import type { Collection } from "@smartplate/contracts/envelope"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PencilIcon, PlusIcon, Trash2Icon, UtensilsCrossedIcon } from "lucide-react"
import { type FormEvent, useState } from "react"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent } from "../components/ui/card"
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
import { ApiClientError, apiDelete, apiGet, apiPatch, apiPost, fieldError } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"

type ServingUnit = "kg" | "plate" | "piece" | "litre"

type Dish = {
	id: string
	name: string
	category: string
	servingUnit: ServingUnit
	avgServingWeightG: string | null
	sellingPrice: string
	costPerUnit: string
	shelfLifeHours: number
	isReusable: boolean
	reuseRoute: string
	createdAt: string
}

type DishPayload = {
	name: string
	category: string
	servingUnit: ServingUnit
	avgServingWeightG: number
	sellingPrice: number
	costPerUnit: number
	shelfLifeHours: number
	isReusable: boolean
	reuseRoute: string
}

type DishForm = {
	name: string
	category: string
	servingUnit: ServingUnit
	avgServingWeightG: string
	sellingPrice: string
	costPerUnit: string
	shelfLifeHours: string
	reuse: string
	reuseRoute: string
}

const SERVING_UNITS: ServingUnit[] = ["kg", "plate", "piece", "litre"]

const BLANK_FORM: DishForm = {
	name: "",
	category: "",
	servingUnit: "plate",
	avgServingWeightG: "",
	sellingPrice: "",
	costPerUnit: "",
	shelfLifeHours: "24",
	reuse: "yes",
	reuseRoute: "",
}

const rupees = new Intl.NumberFormat("en-IN", {
	style: "currency",
	currency: "INR",
	maximumFractionDigits: 0,
})

const toNumber = (value: string): number => {
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : 0
}

const formFor = (dish: Dish): DishForm => ({
	name: dish.name,
	category: dish.category,
	servingUnit: dish.servingUnit,
	avgServingWeightG: dish.avgServingWeightG == null ? "" : String(toNumber(dish.avgServingWeightG)),
	sellingPrice: String(toNumber(dish.sellingPrice)),
	costPerUnit: String(toNumber(dish.costPerUnit)),
	shelfLifeHours: String(dish.shelfLifeHours),
	reuse: dish.isReusable ? "yes" : "no",
	reuseRoute: dish.reuseRoute,
})

const payloadFor = (form: DishForm): DishPayload => ({
	name: form.name.trim(),
	category: form.category.trim(),
	servingUnit: form.servingUnit,
	avgServingWeightG: toNumber(form.avgServingWeightG),
	sellingPrice: toNumber(form.sellingPrice),
	costPerUnit: toNumber(form.costPerUnit),
	shelfLifeHours: toNumber(form.shelfLifeHours),
	isReusable: form.reuse === "yes",
	reuseRoute: form.reuse === "yes" ? form.reuseRoute.trim() : "",
})

const messageFor = (error: Error): string => {
	if (!(error instanceof ApiClientError)) return "Something went wrong. Please try again."
	if (error.code === "VALIDATION_FAILED") return "Please check the fields below."
	if (error.code === "RESOURCE_NOT_FOUND") return "That dish is no longer on your menu."
	if (error.code === "AUTH_FORBIDDEN") return "Your role cannot change the catalog."
	return error.message
}

const servingWeightLabel = (dish: Dish): string =>
	dish.avgServingWeightG == null ? "—" : `${toNumber(dish.avgServingWeightG)} g`

export const CatalogPage = () => {
	const queryClient = useQueryClient()
	const [open, setOpen] = useState(false)
	const [editing, setEditing] = useState<Dish | null>(null)
	const [archiving, setArchiving] = useState<Dish | null>(null)
	const [form, setForm] = useState<DishForm>(BLANK_FORM)

	const dishes = useQuery({
		queryKey: queryKeys.dishes(),
		queryFn: () => apiGet<Collection<Dish>>("/v1/dishes"),
	})

	const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.dishes() })

	const save = useMutation({
		mutationFn: () =>
			editing == null
				? apiPost<Dish>("/v1/dishes", payloadFor(form))
				: apiPatch<Dish>(`/v1/dishes/${editing.id}`, payloadFor(form)),
		onSuccess: () => {
			refresh()
			setOpen(false)
		},
	})

	const archive = useMutation({
		mutationFn: (dish: Dish) =>
			apiDelete<{ id: string; archived: boolean }>(`/v1/dishes/${dish.id}`),
		onSuccess: () => {
			refresh()
			setArchiving(null)
		},
	})

	const startCreate = () => {
		save.reset()
		setEditing(null)
		setForm(BLANK_FORM)
		setOpen(true)
	}

	const startEdit = (dish: Dish) => {
		save.reset()
		setEditing(dish)
		setForm(formFor(dish))
		setOpen(true)
	}

	const startArchive = (dish: Dish) => {
		archive.reset()
		setArchiving(dish)
	}

	const submit = (event: FormEvent) => {
		event.preventDefault()
		save.mutate()
	}

	const items = dishes.data?.items ?? []
	const weightError = fieldError(save.error, "avgServingWeightG")
	const nameError = fieldError(save.error, "name")

	return (
		<section className="w-full">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Catalog</h1>
					<p className="mt-1 text-muted-foreground">
						Every dish your kitchen prepares, with the shelf life and serving weight the rest of
						SmartPlate measures against.
					</p>
				</div>
				<Button onClick={startCreate}>
					<PlusIcon aria-hidden="true" />
					Add dish
				</Button>
			</header>

			<Card className="mt-8">
				<CardContent>
					{dishes.isPending && (
						<div className="space-y-3">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					)}

					{dishes.error != null && (
						<p role="alert" className="text-sm text-critical">
							{messageFor(dishes.error)}
						</p>
					)}

					{dishes.data != null && items.length === 0 && (
						<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
							<UtensilsCrossedIcon className="size-5 text-muted-foreground" aria-hidden="true" />
							<p className="text-sm font-medium">No dishes yet</p>
							<p className="text-xs text-muted-foreground">
								Add the dishes you cook most often. Leftovers, listings and every rate on the
								dashboard are measured against them.
							</p>
						</div>
					)}

					{items.length > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Dish</TableHead>
									<TableHead>Unit</TableHead>
									<TableHead className="text-right">Serving weight</TableHead>
									<TableHead className="text-right">Price</TableHead>
									<TableHead className="text-right">Cost</TableHead>
									<TableHead className="text-right">Shelf life</TableHead>
									<TableHead>Reuse</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((dish) => (
									<TableRow key={dish.id}>
										<TableCell>
											<span className="font-medium">{dish.name}</span>
											{dish.category !== "" && (
												<span className="ml-2 text-xs text-muted-foreground">{dish.category}</span>
											)}
										</TableCell>
										<TableCell>{dish.servingUnit}</TableCell>
										<TableCell className="text-right tabular">{servingWeightLabel(dish)}</TableCell>
										<TableCell className="text-right tabular">
											{rupees.format(toNumber(dish.sellingPrice))}
										</TableCell>
										<TableCell className="text-right tabular">
											{rupees.format(toNumber(dish.costPerUnit))}
										</TableCell>
										<TableCell className="text-right tabular">{dish.shelfLifeHours} h</TableCell>
										<TableCell>
											{dish.isReusable ? (
												<Badge variant="good">
													{dish.reuseRoute === "" ? "Reusable" : dish.reuseRoute}
												</Badge>
											) : (
												<Badge variant="secondary">Not reusable</Badge>
											)}
										</TableCell>
										<TableCell className="text-right">
											<div className="flex justify-end gap-1">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => startEdit(dish)}
													aria-label={`Edit ${dish.name}`}
												>
													<PencilIcon aria-hidden="true" />
													Edit
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => startArchive(dish)}
													aria-label={`Archive ${dish.name}`}
												>
													<Trash2Icon aria-hidden="true" />
													Archive
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{editing == null ? "Add dish" : `Edit ${editing.name}`}</DialogTitle>
						<DialogDescription>
							Serving weight converts this dish into kilograms, which is how waste and recovery are
							reported.
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={submit} className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="dish-name">Name</Label>
								<Input
									id="dish-name"
									required
									value={form.name}
									onChange={(e) => setForm({ ...form, name: e.target.value })}
									aria-invalid={nameError !== ""}
								/>
								{nameError !== "" && <p className="text-sm text-critical">{nameError}</p>}
							</div>

							<div className="space-y-2">
								<Label htmlFor="dish-category">Category</Label>
								<Input
									id="dish-category"
									placeholder="rice, curry, dessert…"
									value={form.category}
									onChange={(e) => setForm({ ...form, category: e.target.value })}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="dish-unit">Sold by</Label>
								<Select
									value={form.servingUnit}
									onValueChange={(value) => setForm({ ...form, servingUnit: value as ServingUnit })}
								>
									<SelectTrigger id="dish-unit">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{SERVING_UNITS.map((unit) => (
											<SelectItem key={unit} value={unit}>
												{unit}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="dish-weight">Average serving weight (g)</Label>
								<Input
									id="dish-weight"
									type="number"
									min="0"
									step="1"
									disabled={form.servingUnit === "kg"}
									value={form.avgServingWeightG}
									onChange={(e) => setForm({ ...form, avgServingWeightG: e.target.value })}
									aria-invalid={weightError !== ""}
								/>
								{weightError !== "" && <p className="text-sm text-critical">{weightError}</p>}
							</div>

							<div className="space-y-2">
								<Label htmlFor="dish-price">Selling price</Label>
								<Input
									id="dish-price"
									type="number"
									min="0"
									step="1"
									required
									value={form.sellingPrice}
									onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="dish-cost">Cost per unit</Label>
								<Input
									id="dish-cost"
									type="number"
									min="0"
									step="1"
									required
									value={form.costPerUnit}
									onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="dish-shelf-life">Shelf life (hours)</Label>
								<Input
									id="dish-shelf-life"
									type="number"
									min="1"
									step="1"
									required
									value={form.shelfLifeHours}
									onChange={(e) => setForm({ ...form, shelfLifeHours: e.target.value })}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="dish-reuse">Can be reused tomorrow</Label>
								<Select
									value={form.reuse}
									onValueChange={(value) => setForm({ ...form, reuse: value })}
								>
									<SelectTrigger id="dish-reuse">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="yes">Yes</SelectItem>
										<SelectItem value="no">No</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{form.reuse === "yes" && (
								<div className="space-y-2 sm:col-span-2">
									<Label htmlFor="dish-reuse-route">Reuse route</Label>
									<Input
										id="dish-reuse-route"
										placeholder="fried rice"
										value={form.reuseRoute}
										onChange={(e) => setForm({ ...form, reuseRoute: e.target.value })}
									/>
								</div>
							)}
						</div>

						{save.error != null && (
							<p
								role="alert"
								className="rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical"
							>
								{messageFor(save.error)}
							</p>
						)}

						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={save.isPending}>
								{save.isPending ? "Saving…" : "Save dish"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={archiving != null} onOpenChange={() => setArchiving(null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Archive {archiving?.name}?</DialogTitle>
						<DialogDescription>
							It disappears from the catalog and from every picker. Past leftovers, listings and
							dashboard history that reference it stay intact.
						</DialogDescription>
					</DialogHeader>

					{archive.error != null && (
						<p role="alert" className="rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical">
							{messageFor(archive.error)}
						</p>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setArchiving(null)}>
							Keep it
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={archive.isPending}
							onClick={() => archiving != null && archive.mutate(archiving)}
						>
							{archive.isPending ? "Archiving…" : "Archive dish"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	)
}
