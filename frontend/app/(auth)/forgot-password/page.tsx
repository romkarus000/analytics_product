"use client";

import { FormEvent, useState } from "react";
import { API_BASE } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Не удалось отправить инструкцию.");
        return;
      }

      setMessage(payload.message ?? "Проверьте почту для дальнейших инструкций.");
    } catch (err) {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Восстановление пароля</h1>
        <p>Мы отправим ссылку для сброса пароля на ваш email.</p>
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
          {error ? <p className="error">{error}</p> : null}
          {message ? <p className="success">{message}</p> : null}
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Отправляем..." : "Отправить ссылку"}
          </button>
        </form>
        <div className="auth-links">
          <a href="/login">Вернуться к логину</a>
        </div>
      </div>
    </main>
  );
}
