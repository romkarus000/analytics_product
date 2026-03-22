# Analytics Product MVP

Минимальный каркас монорепозитория для MVP AI-native аналитической платформы.

На текущем шаге добавлена только инфраструктурная основа:
- каталоги `frontend`, `backend`, `infra`, `docs`, `dbt`, `cube`;
- шаблон переменных окружения;
- `docker-compose.yml` только с PostgreSQL;
- базовые правила форматирования и игнорирования файлов.

Бизнес-логика, FastAPI, Next.js, ClickHouse, Redis, Cube runtime и AI-компоненты на этом шаге **не настраиваются**.

## Структура репозитория

```text
.
├── backend/
├── cube/
├── dbt/
├── docs/
├── frontend/
├── infra/
├── .editorconfig
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

## Быстрый старт

### 1. Подготовить переменные окружения

```bash
cp .env.example .env
```

При необходимости измените значения в `.env`.

### 2. Запустить PostgreSQL

```bash
docker compose up -d
```

### 3. Проверить статус контейнера

```bash
docker compose ps
```

### 4. Проверить доступность PostgreSQL

```bash
docker compose exec postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Ожидаемый результат: статус `accepting connections`.

## Что входит в текущий шаг

- Подготовка монорепозитория для дальнейшей пошаговой разработки.
- Минимальная локальная инфраструктура только для PostgreSQL.

## Что не входит в текущий шаг

- Инициализация backend-приложения.
- Инициализация frontend-приложения.
- Любая бизнес-логика, API, UI и аналитические пайплайны.
