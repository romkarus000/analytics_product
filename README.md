# Analytics Product MVP — Module 0 (Scaffold)

Базовый каркас для продукта “Единая аналитика для онлайн-школ”. Включает фронтенд, бэкенд, инфраструктуру и healthcheck.

## Стек

- Frontend: Next.js (App Router, TypeScript)
- Backend: FastAPI + SQLAlchemy 2 + Alembic
- DB: PostgreSQL
- Очереди/фоновые задачи: Redis

## Локальный запуск

### 1) Конфигурация окружения

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

### 2) Docker Compose

```bash
docker compose up --build
```

Сервисы:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Healthcheck: http://localhost:8000/health

### 3) Миграции Alembic

```bash
cd backend
alembic upgrade head
```

## Тесты

```bash
cd backend
pytest
```

Интеграционный тест помечен как `integration` и требует `DATABASE_URL`.

## Структура

```
backend/
  app/
    api/
    core/
    db/
    models/
    schemas/
    services/
  alembic/
frontend/
  app/
  components/
```

## Заметки по модульности

Module 0 — инфраструктурная основа. Бизнес-модули (загрузка таблиц, маппинг, валидация, импорт, метрики, AI-инсайты, Telegram-алерты) будут добавляться поэтапно.
