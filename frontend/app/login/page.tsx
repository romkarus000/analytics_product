"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Не удалось войти. Проверьте данные.");
        return;
      }

      localStorage.setItem("access_token", payload.tokens.access_token);
      localStorage.setItem("refresh_token", payload.tokens.refresh_token);
      router.push("/projects");
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Вход в кабинет</h1>
        <p>Используйте email и пароль, чтобы войти в систему.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            Пароль
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Входим..." : "Войти"}
          </button>
        </form>
        <div className="auth-links">
          <a href="/register">Создать аккаунт</a>
          <a href="/forgot-password">Забыли пароль?</a>
        </div>
      </div>
    </main>
  );
}
