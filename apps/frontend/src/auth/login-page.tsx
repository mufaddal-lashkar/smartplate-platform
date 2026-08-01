import type { MeResponse } from "@smartplate/contracts/auth"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { Link, Navigate, useNavigate } from "react-router"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { ApiClientError, apiPost, fieldError } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
import { AuthLayout } from "./auth-layout"
import { homePathFor, useSession } from "./use-session"

const messageFor = (error: Error): string => {
	if (!(error instanceof ApiClientError)) return "Something went wrong. Please try again."
	if (error.code === "AUTH_INVALID_CREDENTIALS") return "Email or password is incorrect."
	if (error.code === "RATE_LIMITED") return "Too many attempts. Try again in a few minutes."
	if (error.code === "VALIDATION_FAILED") return "Please check the fields below."
	return error.message
}

export const LoginPage = () => {
	const { session, isPending } = useSession()
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")

	const mutation = useMutation({
		mutationFn: () => apiPost<MeResponse>("/v1/auth/login", { email, password }),
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
			title="Sign in"
			subtitle="Pick up where your kitchen left off."
			footer={
				<>
					New to SmartPlate?{" "}
					<Link to="/register" className="font-medium text-primary hover:underline">
						Create an account
					</Link>
				</>
			}
		>
			<form onSubmit={submit} className="space-y-5">
				<div className="space-y-2">
					<Label htmlFor="email">Email</Label>
					<Input
						id="email"
						type="email"
						autoComplete="email"
						placeholder="you@restaurant.com"
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
						autoComplete="current-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
				</div>

				{mutation.error != null && (
					<p role="alert" className="rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical">
						{messageFor(mutation.error)}
					</p>
				)}

				<Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
					{mutation.isPending ? "Signing in…" : "Sign in"}
				</Button>
			</form>
		</AuthLayout>
	)
}
