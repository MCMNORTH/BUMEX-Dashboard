"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { useFormStatus } from "react-dom";

import {
  signInAction,
  signUpAction,
  type AuthActionState,
} from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

function SubmitButton({
  label,
  icon: Icon,
}: {
  label: string;
  icon: typeof LogIn;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full rounded-2xl" disabled={pending}>
      <Icon className="size-4" />
      {pending ? "Please wait..." : label}
    </Button>
  );
}

export function AuthForm() {
  const selfSignupEnabled = process.env.NEXT_PUBLIC_ENABLE_SELF_SIGNUP !== "0";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [signInState, signInFormAction] = useActionState(signInAction, initialState);
  const [signUpState, signUpFormAction] = useActionState(signUpAction, initialState);
  const activeState = mode === "signin" ? signInState : signUpState;

  return (
    <Card className="login-panel surface-highlight relative overflow-hidden rounded-[30px] border-white/70 bg-white/82 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.16),transparent_34%)]" />
      <div className="pointer-events-none absolute -right-18 top-6 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.7),rgba(255,255,255,0))] blur-2xl" />
      <CardHeader className="relative space-y-5 p-5 sm:p-6">
        <div className="relative grid w-full grid-cols-2 rounded-[22px] border border-slate-200/80 bg-white/70 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
          <div
            aria-hidden="true"
            className={`login-tab-indicator absolute top-1.5 h-[calc(100%-12px)] rounded-[16px] bg-[linear-gradient(135deg,#1d4ed8,#38bdf8)] shadow-[0_14px_30px_rgba(29,78,216,0.28)] transition-all duration-500 ${
              mode === "signin"
                ? "left-1.5 w-[calc(50%-6px)]"
                : "left-[calc(50%+4px)] w-[calc(50%-6px)]"
            }`}
          />
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`login-tab relative z-10 rounded-[16px] px-6 py-3 text-sm font-semibold transition-all duration-300 ${
              mode === "signin"
                ? "text-white"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Sign in
          </button>
          {selfSignupEnabled ? (
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`login-tab relative z-10 rounded-[16px] px-6 py-3 text-sm font-semibold transition-all duration-300 ${
                mode === "signup"
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Create account
            </button>
          ) : (
            <div />
          )}
        </div>

        <div className="space-y-3">
          <CardTitle className="max-w-lg text-3xl leading-[1.02] tracking-[-0.06em] text-slate-900">
            {mode === "signin" ? "Secure sign in" : "Create your workspace identity"}
          </CardTitle>
          <CardDescription className="max-w-md text-[15px] leading-7 text-slate-500">
            {mode === "signin"
              ? "Enter your professional credentials to open the dashboard in a protected session."
              : "Use your company email to request access to the workspace."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="relative px-5 pb-5 sm:px-6 sm:pb-6">
        <form action={mode === "signin" ? signInFormAction : signUpFormAction} className="space-y-4">
          {mode === "signup" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="full_name">
                Full name
              </label>
              <Input
                id="full_name"
                name="full_name"
                placeholder="Full name"
                required
                className="h-11 rounded-2xl border-slate-200 bg-white/80 px-4 text-[15px] shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@bumex.mr"
              required
              className="h-11 rounded-2xl border-slate-200 bg-white/80 px-4 text-[15px] shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
            />
            <p className="text-xs tracking-[0.02em] text-slate-400">
              Allowed domains: @bumex.mr and @bumex.ma
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 rounded-[28px] transition-all duration-300 ${
                  password.length
                    ? "bg-[radial-gradient(circle_at_right,rgba(56,189,248,0.14),transparent_48%)] opacity-100"
                    : "opacity-0"
                }`}
              />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`h-11 rounded-2xl border-slate-200 bg-white/80 px-4 pr-12 text-[15px] transition-all duration-300 shadow-[0_10px_30px_rgba(15,23,42,0.04)] ${
                  password.length ? "border-sky-300/50 shadow-[0_0_0_1px_rgba(56,189,248,0.1),0_18px_40px_rgba(14,165,233,0.12)]" : ""
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-3 flex items-center justify-center rounded-full px-2 text-slate-400 transition-all duration-300 hover:scale-110 hover:text-slate-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p
              className={`text-xs transition-all duration-300 ${
                password.length ? "translate-y-0 text-sky-600 opacity-100" : "-translate-y-1 text-slate-400 opacity-80"
              }`}
            >
              {password.length
                ? `${password.length} character${password.length > 1 ? "s" : ""} entered`
                : "Use your workspace password"}
            </p>
          </div>

          {activeState.error ? (
            <div className="animate-fade-up rounded-2xl border border-danger/20 bg-red-50/90 px-4 py-3 text-sm text-red-700">
              {activeState.error}
            </div>
          ) : null}

          {activeState.success ? (
            <div className="animate-fade-up rounded-2xl border border-success/20 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700">
              {activeState.success}
            </div>
          ) : null}

          <div className="grid gap-3 pt-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <SubmitButton
              label={mode === "signin" ? "Sign in to dashboard" : "Create account"}
              icon={mode === "signin" ? LogIn : UserPlus}
            />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
