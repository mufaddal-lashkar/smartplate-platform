import type { MeResponse } from "@smartplate/contracts/auth"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { Link, Navigate, useNavigate } from "react-router"
import { ApiClientError, apiPost, fieldError } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
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
		<main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
			<h1 className="text-xl font-semibold tracking-tight">Sign in to SmartPlate</h1>
			<p className="mt-1 text-sm text-muted-foreground">Recover more, waste less.</p>

			<form onSubmit={submit} className="mt-8 space-y-4">
				<div className="space-y-1">
					<label htmlFor="email" className="text-sm font-medium">
						Email
					</label>
					<input
						id="email"
						type="email"
						autoComplete="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
					/>
					{fieldError(mutation.error, "email") !== "" && (
						<p className="text-sm text-critical">{fieldError(mutation.error, "email")}</p>
					)}
				</div>

				<div className="space-y-1">
					<label htmlFor="password" className="text-sm font-medium">
						Password
					</label>
					<input
						id="password"
						type="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
					/>
				</div>

				{mutation.error != null && (
					<p role="alert" className="text-sm text-critical">
						{messageFor(mutation.error)}
					</p>
				)}

				<button
					type="submit"
					disabled={mutation.isPending}
					className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
				>
					{mutation.isPending ? "Signing in…" : "Sign in"}
				</button>
			</form>

			<p className="mt-6 text-sm text-muted-foreground">
				New here?{" "}
				<Link to="/register" className="font-medium text-accent underline">
					Create an account
				</Link>
			</p>
		</main>
	)
}
