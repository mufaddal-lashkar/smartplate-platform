import type { MeResponse, TenantTypeValue } from "@smartplate/contracts/auth"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { Link, Navigate, useNavigate } from "react-router"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { ApiClientError, apiPost, fieldError } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
import { cn } from "../lib/utils"
import { AuthLayout } from "./auth-layout"
import { homePathFor, useSession } from "./use-session"

const messageFor = (error: Error): string => {
	if (!(error instanceof ApiClientError)) return "Something went wrong. Please try again."
	if (error.code === "RATE_LIMITED") return "Too many attempts. Try again in a few minutes."
	if (error.code === "VALIDATION_FAILED") return "Please check the fields below."
	return error.message
}

const TENANT_CHOICES: { value: TenantTypeValue; title: string; blurb: string }[] = [
	{ value: "restaurant", title: "Restaurant", blurb: "Cut waste, recover cost" },
	{ value: "ngo", title: "NGO", blurb: "Collect surplus nearby" },
]

export const RegisterPage = () => {
	const { session, isPending } = useSession()
	const navigate = useNavigate()
	const queryClient = useQueryClient()

	const [tenantType, setTenantType] = useState<TenantTypeValue>("restaurant")
	const [tenantName, setTenantName] = useState("")
	const [name, setName] = useState("")
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")

	const mutation = useMutation({
		mutationFn: () =>
			apiPost<MeResponse>("/v1/auth/register", { tenantType, tenantName, name, email, password }),
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.session(), data)
			navigate(homePathFor(data), { replace: true })
		},
	})

	if (!isPending && session != null) return <Navigate to={homePathFor(session)} replace />

	const submit = (event: FormEvent) => {
		event.preventDefault()
		mutation.mutate()
	}

	return (
		<AuthLayout
			title="Create your account"
			subtitle="Two minutes to set up. No card needed."
			footer={
				<>
					Already have an account?{" "}
					<Link to="/login" className="font-medium text-primary hover:underline">
						Sign in
					</Link>
				</>
			}
		>
			<form onSubmit={submit} className="space-y-5">
				<fieldset className="space-y-2">
					<legend className="text-sm font-medium">I am registering as</legend>
					<div className="grid grid-cols-2 gap-3 pt-1">
						{TENANT_CHOICES.map((choice) => (
							<button
								key={choice.value}
								type="button"
								onClick={() => setTenantType(choice.value)}
								aria-pressed={tenantType === choice.value}
								className={cn(
									"rounded-lg border p-3 text-left transition-colors",
									"focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
									tenantType === choice.value ? "border-primary bg-secondary" : "hover:bg-muted",
								)}
							>
								<span className="block text-sm font-medium">{choice.title}</span>
								<span className="block text-xs text-muted-foreground">{choice.blurb}</span>
							</button>
						))}
					</div>
				</fieldset>

				<div className="space-y-2">
					<Label htmlFor="tenantName">
						{tenantType === "restaurant" ? "Restaurant name" : "Organisation name"}
					</Label>
					<Input
						id="tenantName"
						required
						value={tenantName}
						onChange={(e) => setTenantName(e.target.value)}
						aria-invalid={fieldError(mutation.error, "tenantName") !== ""}
					/>
					{fieldError(mutation.error, "tenantName") !== "" && (
						<p className="text-sm text-critical">{fieldError(mutation.error, "tenantName")}</p>
					)}
				</div>

				<div className="space-y-2">
					<Label htmlFor="name">Your name</Label>
					<Input
						id="name"
						required
						value={name}
						onChange={(e) => setName(e.target.value)}
						aria-invalid={fieldError(mutation.error, "name") !== ""}
					/>
					{fieldError(mutation.error, "name") !== "" && (
						<p className="text-sm text-critical">{fieldError(mutation.error, "name")}</p>
					)}
				</div>

				<div className="space-y-2">
					<Label htmlFor="email">Email</Label>
					<Input
						id="email"
						type="email"
						autoComplete="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						aria-invalid={fieldError(mutation.error, "email") !== ""}
					/>
					{fieldError(mutation.error, "email") !== "" && (
						<p className="text-sm text-critical">{fieldError(mutation.error, "email")}</p>
					)}
				</div>

				<div className="space-y-2">
					<Label htmlFor="password">Password</Label>
					<Input
						id="password"
						type="password"
						autoComplete="new-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						aria-invalid={fieldError(mutation.error, "password") !== ""}
					/>
					<p className="text-xs text-muted-foreground">At least 8 characters.</p>
					{fieldError(mutation.error, "password") !== "" && (
						<p className="text-sm text-critical">{fieldError(mutation.error, "password")}</p>
					)}
				</div>

				{mutation.error != null && (
					<p role="alert" className="rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical">
						{messageFor(mutation.error)}
					</p>
				)}

				<Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
					{mutation.isPending ? "Creating account…" : "Create account"}
				</Button>
			</form>
		</AuthLayout>
	)
}
