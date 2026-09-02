import type { Collection } from "@smartplate/contracts/envelope"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	MailIcon,
	PencilIcon,
	PlusIcon,
	ShieldCheckIcon,
	UserMinusIcon,
	UsersIcon,
} from "lucide-react"
import { type FormEvent, useState } from "react"
import { useSession } from "../auth/use-session"
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

type Member = {
	id: string
	email: string
	name: string
	role: "owner" | "staff" | "ngo_admin" | "ngo_volunteer"
	invitedByUserId: string | null
	archivedAt: string | null
	createdAt: string
}

type MemberForm = {
	email: string
	name: string
	role: Member["role"]
}

const BLANK_FORM: MemberForm = { email: "", name: "", role: "staff" }

const ROLE_LABELS: Record<Member["role"], string> = {
	owner: "Owner",
	staff: "Staff",
	ngo_admin: "NGO admin",
	ngo_volunteer: "Volunteer",
}

const isOwner = (role: Member["role"]): boolean => role === "owner"

const messageFor = (error: Error): string => {
	if (!(error instanceof ApiClientError)) return "Something went wrong. Please try again."
	if (error.code === "VALIDATION_FAILED") return "Please check the fields below."
	if (error.code === "AUTH_FORBIDDEN") return "You do not have permission to manage team members."
	if (error.code === "RESOURCE_NOT_FOUND") return "That member is no longer on your team."
	if (error.code === "EMAIL_TAKEN") return "That email is already registered on SmartPlate."
	return error.message
}

const formatDate = (value: string | null): string => {
	if (value == null) return "—"
	const parsed = new Date(value)
	if (Number.isNaN(parsed.valueOf())) return "—"
	return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export const TeamPage = () => {
	const queryClient = useQueryClient()
	const { session } = useSession()
	const [open, setOpen] = useState(false)
	const [editing, setEditing] = useState<Member | null>(null)
	const [archiving, setArchiving] = useState<Member | null>(null)
	const [form, setForm] = useState<MemberForm>(BLANK_FORM)

	const isNgo = session?.tenant.type === "ngo"
	const roleOptions: Member["role"][] = isNgo ? ["ngo_admin", "ngo_volunteer"] : ["owner", "staff"]
	const defaultRole: Member["role"] = isNgo ? "ngo_volunteer" : "staff"

	const members = useQuery({
		queryKey: queryKeys.team(),
		queryFn: () => apiGet<Collection<Member>>("/v1/users"),
	})

	const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.team() })

	const save = useMutation({
		mutationFn: () => {
			const payload = { ...form, email: form.email.trim().toLowerCase(), name: form.name.trim() }
			return editing == null
				? apiPost<Member>("/v1/users", payload)
				: apiPatch<Member>(`/v1/users/${editing.id}`, { name: payload.name, role: payload.role })
		},
		onSuccess: () => {
			refresh()
			setOpen(false)
		},
	})

	const archive = useMutation({
		mutationFn: (member: Member) =>
			apiDelete<{ id: string; archived: boolean }>(`/v1/users/${member.id}`, { archived: true }),
		onSuccess: () => {
			refresh()
			setArchiving(null)
		},
	})

	const startCreate = () => {
		save.reset()
		setEditing(null)
		setForm({ ...BLANK_FORM, role: defaultRole })
		setOpen(true)
	}

	const startEdit = (member: Member) => {
		save.reset()
		setEditing(member)
		setForm({ email: member.email, name: member.name, role: member.role })
		setOpen(true)
	}

	const startArchive = (member: Member) => {
		archive.reset()
		setArchiving(member)
	}

	const submit = (event: FormEvent) => {
		event.preventDefault()
		save.mutate()
	}

	const items = members.data?.items ?? []
	const isSelf = (member: Member): boolean => session?.user.id === member.id

	return (
		<section className="w-full">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Team</h1>
					<p className="mt-1 text-muted-foreground">
						Everyone with access to your workspace. Owners manage access; staff do the day-to-day.
					</p>
				</div>
				<Button onClick={startCreate}>
					<PlusIcon aria-hidden="true" />
					Invite member
				</Button>
			</header>

			<Card className="mt-8">
				<CardHeader>
					<CardTitle className="text-base">Members</CardTitle>
					<CardDescription>
						{isNgo
							? "NGO admins can submit verification and manage settings; volunteers coordinate pickups."
							: "Owners manage the team, the catalog and the tenant profile. Staff run day-to-day operations."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{members.isPending && (
						<div className="space-y-3">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					)}

					{members.error != null && (
						<p role="alert" className="text-sm text-critical">
							{messageFor(members.error)}
						</p>
					)}

					{members.data != null && items.length === 0 && (
						<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
							<UsersIcon className="size-5 text-muted-foreground" aria-hidden="true" />
							<p className="text-sm font-medium">No teammates yet</p>
							<p className="text-xs text-muted-foreground">
								Invite the people who will run this workspace with you.
							</p>
						</div>
					)}

					{items.length > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Joined</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((member) => (
									<TableRow key={member.id}>
										<TableCell>
											<span className="font-medium">{member.name}</span>
											{isSelf(member) && (
												<Badge variant="secondary" className="ml-2">
													You
												</Badge>
											)}
										</TableCell>
										<TableCell>
											<span className="inline-flex items-center gap-1 text-muted-foreground">
												<MailIcon className="size-3" aria-hidden="true" />
												{member.email}
											</span>
										</TableCell>
										<TableCell>
											<Badge variant={isOwner(member.role) ? "good" : "secondary"}>
												<ShieldCheckIcon className="mr-1 size-3" aria-hidden="true" />
												{ROLE_LABELS[member.role]}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDate(member.createdAt)}
										</TableCell>
										<TableCell className="text-right">
											<div className="flex justify-end gap-2">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => startEdit(member)}
													disabled={isSelf(member)}
												>
													<PencilIcon aria-hidden="true" />
													Edit
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => startArchive(member)}
													disabled={isSelf(member) || isOwner(member.role)}
												>
													<UserMinusIcon aria-hidden="true" />
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

			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!next) save.reset()
					setOpen(next)
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{editing == null ? "Invite a teammate" : "Edit teammate"}</DialogTitle>
						<DialogDescription>
							{editing == null
								? "They will receive an email with a one-time link to set their password."
								: "Change their display name or role. They will not be notified."}
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={submit} className="space-y-4">
						{editing == null && (
							<div className="space-y-2">
								<Label htmlFor="member-email">Email</Label>
								<Input
									id="member-email"
									type="email"
									required
									autoComplete="email"
									value={form.email}
									onChange={(event) => setForm({ ...form, email: event.target.value })}
								/>
								{fieldError(save.error, "email") !== "" && (
									<p className="text-xs text-critical">{fieldError(save.error, "email")}</p>
								)}
							</div>
						)}
						<div className="space-y-2">
							<Label htmlFor="member-name">Name</Label>
							<Input
								id="member-name"
								required
								minLength={2}
								maxLength={120}
								value={form.name}
								onChange={(event) => setForm({ ...form, name: event.target.value })}
							/>
							{fieldError(save.error, "name") !== "" && (
								<p className="text-xs text-critical">{fieldError(save.error, "name")}</p>
							)}
						</div>
						<div className="space-y-2">
							<Label htmlFor="member-role">Role</Label>
							<Select
								value={form.role}
								onValueChange={(value) => setForm({ ...form, role: value as Member["role"] })}
							>
								<SelectTrigger id="member-role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{roleOptions.map((role) => (
										<SelectItem key={role} value={role}>
											{ROLE_LABELS[role]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{save.error != null && fieldError(save.error, "email") === "" && (
							<p className="text-sm text-critical">{messageFor(save.error)}</p>
						)}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={save.isPending}>
								{editing == null ? "Send invite" : "Save changes"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={archiving != null} onOpenChange={(next) => !next && setArchiving(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Archive teammate?</DialogTitle>
						<DialogDescription>
							{archiving?.name} will lose access immediately. You can unarchive them later.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setArchiving(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={archive.isPending}
							onClick={() => archiving && archive.mutate(archiving)}
						>
							Archive
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	)
}
