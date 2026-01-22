import HealthCard from "../components/HealthCard";

const steps = [
  "Загрузка таблиц",
  "Маппинг",
  "Валидация",
  "Импорт",
  "Метрики и дашборды",
  "AI-инсайты",
  "Telegram-алерты"
];

export default function HomePage() {
  return (
    <main className="card">
      <span className="badge">Module 0 · Каркас MVP</span>
      <h1>Единая аналитика для онлайн-школ</h1>
      <p>
        Этот каркас включает базовую инфраструктуру, healthcheck и задел для
        авторизации. Следующие модули добавят бизнес-логику загрузки данных и
        аналитики.
      </p>
      <div className="hero-actions">
        <a className="primary-button" href="/login">
          Войти
        </a>
      </div>
      <div className="grid">
        {steps.map((step) => (
          <div key={step} className="card">
            <strong>{step}</strong>
            <p>Статус: в очереди.</p>
          </div>
        ))}
      </div>
      <HealthCard />
    </main>
  );
}
