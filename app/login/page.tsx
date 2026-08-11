"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, LogIn, Mail, KeyRound, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";

type AuthMode = "sign-in" | "magic-link" | "forgot-password";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Clear messages when switching modes
  const handleModeSwitch = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);

    try {
      const supabase = createClient();

      if (mode === "sign-in") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          setError(authError.message);
          return;
        }

        router.push("/");
        router.refresh();
      } else if (mode === "magic-link") {
        const { error: authError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (authError) {
          setError(authError.message);
        } else {
          setSuccess("Magic link sent! Check your email to sign in.");
        }
      } else if (mode === "forgot-password") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`,
        });

        if (authError) {
          setError(authError.message);
        } else {
          setSuccess("Password reset instructions sent! Check your email.");
        }
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary via-[#111c2d] to-[#00275b] p-4 font-body">
      {/* Glassmorphic Container */}
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white/10 p-8 shadow-2xl backdrop-blur-xl border border-white/10 transition-all duration-300">
        
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-action-blue to-primary shadow-lg border border-white/20">
            <LogIn className="text-white" size={28} strokeWidth={2} />
          </div>
          <h1 className="font-heading text-headline-lg font-bold text-white tracking-tight">
            {mode === "sign-in" && "Welcome Back"}
            {mode === "magic-link" && "Magic Link"}
            {mode === "forgot-password" && "Reset Password"}
          </h1>
          <p className="mt-2 text-body-md text-white/60">
            {mode === "sign-in" && "Sign in to your WIMS account"}
            {mode === "magic-link" && "Sign in securely without a password"}
            {mode === "forgot-password" && "We'll send you a link to reset it"}
          </p>
        </div>

        {/* Global Feedback Messages */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-status-error/10 border border-status-error/30 p-4 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="mt-0.5 shrink-0 text-status-error" size={20} />
            <p className="text-body-md text-status-error/90 leading-relaxed">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-status-success/10 border border-status-success/30 p-4 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="mt-0.5 shrink-0 text-status-success" size={20} />
            <p className="text-body-md text-status-success/90 leading-relaxed">{success}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          
          {/* Email Field - Used in all modes */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="font-label text-label-md uppercase tracking-wider text-white/70">
              Email Address
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail className="text-white/40" size={20} />
              </div>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-white/20 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/30 transition-all focus:border-action-blue focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-action-blue"
              />
            </div>
          </div>

          {/* Password Field - Only for sign-in */}
          {mode === "sign-in" && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="font-label text-label-md uppercase tracking-wider text-white/70">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => handleModeSwitch("forgot-password")}
                  className="text-body-sm font-medium text-action-blue hover:text-white transition-colors focus:outline-none"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <KeyRound className="text-white/40" size={20} />
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/20 bg-white/5 py-3 pl-10 pr-4 text-white placeholder:text-white/30 transition-all focus:border-action-blue focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-action-blue"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={pending}
            className="group relative mt-2 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-action-blue font-label text-label uppercase tracking-wide text-white shadow-lg transition-all hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-action-blue focus:ring-offset-2 focus:ring-offset-primary disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-100%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(100%)]">
              <div className="relative h-full w-8 bg-white/20" />
            </div>
            
            {pending ? (
              <span className="flex items-center gap-2">
                <svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                {mode === "sign-in" && "Sign In"}
                {mode === "magic-link" && <><Sparkles size={18} /> Send Magic Link</>}
                {mode === "forgot-password" && "Send Reset Instructions"}
              </span>
            )}
          </button>
        </form>

        {/* Footer Actions */}
        <div className="mt-8 flex flex-col items-center gap-4 border-t border-white/10 pt-6">
          {mode === "sign-in" ? (
            <button
              type="button"
              onClick={() => handleModeSwitch("magic-link")}
              className="flex items-center gap-2 text-body-sm font-medium text-white/60 hover:text-white transition-colors focus:outline-none"
            >
              <Sparkles size={16} />
              Sign in with Magic Link instead
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleModeSwitch("sign-in")}
              className="flex items-center gap-2 text-body-sm font-medium text-white/60 hover:text-white transition-colors focus:outline-none"
            >
              <ArrowLeft size={16} />
              Back to Password Sign In
            </button>
          )}
        </div>
        
      </div>
      
      {/* Simple Footer Brand */}
      <div className="fixed bottom-6 text-center text-body-sm text-white/30">
        &copy; {new Date().getFullYear()} Dyna-Serv WIMS. All rights reserved.
      </div>
    </div>
  );
}
